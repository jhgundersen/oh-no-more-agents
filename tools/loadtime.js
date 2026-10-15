#!/usr/bin/env node
// How heavy the page is to open, the way a phone on a poor connection opens
// it. Two parts:
//
//   transfer   each script and the page as the server sends them (br/gzip),
//              read straight off the wire, next to the raw size on disk
//   load       headless Chromium, cold cache, CPU throttled 4x, on each network
//              profile: time to the first frame of the board, script
//              parse/compile/evaluate time per file (from a trace), and the
//              main-thread long tasks while loading
//
//   npm run loadtime                       production, fast3g and fast4g
//   npm run loadtime -- --local            public/ served here, br like Cloudflare
//   npm run loadtime -- --local --dist     the shipped copy (tools/ship.js)
//   npm run loadtime -- --runs 3 --json
//
// Production is read-only: every non-GET to /api/* is failed in the browser
// before it leaves. "Fast 3G" is DevTools' old preset, renamed "Slow 4G" in
// newer DevTools (562.5 ms, 1.44 Mbps down); "Fast 4G" is 165 ms, 9 Mbps.

import fs from "node:fs"
import path from "node:path"
import https from "node:https"
import { fileURLToPath } from "node:url"
import { serve, browser } from "./phone.js"

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public")
const PROD = "https://oh-no-more-agents.com/"
const DIST = path.join(ROOT, "..", "dist")
const sleep = ms => new Promise(r => setTimeout(r, ms))

export const NETWORKS = {
  fast3g: { latency: 562.5, downloadThroughput: 1.6e6 * 0.9 / 8, uploadThroughput: 750e3 * 0.9 / 8 },
  fast4g: { latency: 165, downloadThroughput: 9e6 * 0.9 / 8, uploadThroughput: 1.5e6 * 0.9 / 8 },
  none: null
}

export function parseArgs(argv) {
  const opt = (name, d) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : d }
  return {
    local: argv.includes("--local"), dist: argv.includes("--dist"), json: argv.includes("--json"),
    runs: Number(opt("--runs", 1)), cpu: Number(opt("--cpu", 4)),
    networks: String(opt("--net", "fast3g,fast4g")).split(",").filter(n => n in NETWORKS)
  }
}

// The scripts the page loads, in order, as index.html names them.
export function pageScripts(html) {
  return [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1])
}

// Bytes as sent: no decoding, so a br body is counted as br.
function wireSize(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "accept-encoding": "br, gzip" } }, res => {
      let n = 0
      res.on("data", d => { n += d.length })
      res.on("end", () => resolve({ bytes: n, encoding: res.headers["content-encoding"] || "none" }))
    }).on("error", reject)
  })
}

export async function transfer(base) {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
  const rows = [{ file: "index.html", url: base }]
  for (const src of pageScripts(html)) rows.push({ file: src.split("?")[0], url: base + src })
  const out = []
  for (const r of rows) {
    const raw = fs.statSync(path.join(ROOT, r.file)).size
    const wire = await wireSize(r.url)
    out.push({ file: r.file, raw, wire: wire.bytes, encoding: wire.encoding })
  }
  return out
}

// Injected before anything else on the page: the moment the board first has a
// world drawn on it, and every long task from the start.
const PROBE = `(() => {
  window.__load = { longTasks: [] }
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) __load.longTasks.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ type: "longtask", buffered: true }) } catch (e) {}
  const look = () => {
    const w = window.AgentWorld && window.AgentWorld()
    if (w && w.agents) { __load.firstFrame = performance.now(); return }
    requestAnimationFrame(look)
  }
  requestAnimationFrame(look)
})()`

// Per script file, from the trace: compile on the main thread (what blocks
// the page), compile off it (V8 streaming parse while the bytes arrive), and
// evaluation.
export function scriptCost(events) {
  const main = new Set(events.filter(e => e.ph === "M" && e.name === "thread_name" && e.args && e.args.name === "CrRendererMain").map(e => e.pid + ":" + e.tid))
  const by = {}
  const add = (url, key, ms) => {
    if (!url) return
    const file = url.split("?")[0].split("/").pop()
    by[file] = by[file] || { compile: 0, background: 0, evaluate: 0 }
    by[file][key] += ms
  }
  for (const e of events) {
    if (e.ph !== "X" || !e.dur) continue
    const d = e.args && (e.args.data || e.args)
    const ms = e.dur / 1000, onMain = main.has(e.pid + ":" + e.tid)
    if (e.name === "v8.compile" || e.name === "V8.CompileCode" || e.name === "v8.parseOnBackground")
      add(d && (d.url || d.fileName), onMain ? "compile" : "background", ms)
    else if (e.name === "EvaluateScript") add(d && d.url, "evaluate", ms)
  }
  for (const f in by) for (const k in by[f]) by[f][k] = Math.round(by[f][k])
  return by
}

// Cold cache, throttled CPU and network, POSTs to the API refused.
async function prepare(b, network, cpu) {
  await b.cmd("Fetch.enable", { patterns: [{ urlPattern: "*/api/*" }] })
  await b.cmd("Network.enable")
  await b.cmd("Network.setCacheDisabled", { cacheDisabled: true })
  await b.cmd("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
  await b.cmd("Emulation.setCPUThrottlingRate", { rate: cpu })
  if (NETWORKS[network]) await b.cmd("Network.emulateNetworkConditions", { offline: false, ...NETWORKS[network] })
  await b.cmd("Page.addScriptToEvaluateOnNewDocument", { source: PROBE })
}

function listen(b, events, traced) {
  b.onEvent = e => {
    if (e.method === "Tracing.dataCollected") events.push(...e.params.value)
    else if (e.method === "Tracing.tracingComplete") traced()
    else if (e.method === "Fetch.requestPaused") {
      const id = { requestId: e.params.requestId }
      if (e.params.request.method !== "GET") b.cmd("Fetch.failRequest", { ...id, errorReason: "BlockedByClient" })
      else b.cmd("Fetch.continueRequest", id)
    }
  }
}

const READ = `window.__load && __load.firstFrame ? { firstFrame: Math.round(__load.firstFrame), longTasks: __load.longTasks,
  fcp: Math.round((performance.getEntriesByName("first-contentful-paint")[0] || {}).startTime || 0),
  dcl: Math.round(performance.getEntriesByType("navigation")[0].domContentLoadedEventEnd) } : null`

async function firstFrame(b) {
  for (let i = 0; i < 300; i++) {
    await sleep(100)
    const r = (await b.cmd("Runtime.evaluate", { expression: READ, returnByValue: true })).result.value
    if (r) return r
  }
  return null
}

export function result(network, r, events, errors) {
  if (!r) return { network, error: "no first frame in 30 s", errors }
  const upTo = r.longTasks.filter(t => t[0] <= r.firstFrame)
  return {
    network, firstFrame: r.firstFrame, fcp: r.fcp, dcl: r.dcl,
    longTasks: upTo.length, longest: Math.max(0, ...upTo.map(t => t[1])), blocked: upTo.reduce((n, t) => n + Math.max(0, t[1] - 50), 0),
    scripts: scriptCost(events), errors
  }
}

export async function loadOnce(base, network, cpu) {
  const b = await browser(), events = []
  let traced = null
  const done = new Promise(r => { traced = r })
  listen(b, events, traced)
  try {
    await prepare(b, network, cpu)
    await b.cmd("Tracing.start", { categories: "devtools.timeline,v8,disabled-by-default-v8.compile", transferMode: "ReportEvents" })
    await b.cmd("Page.navigate", { url: base })
    const r = await firstFrame(b)
    await sleep(500)
    await b.cmd("Tracing.end")
    await Promise.race([done, sleep(5000)])
    return result(network, r, events, b.errors)
  } finally { await b.close() }
}

const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

export function summariseRuns(runs) {
  const ok = runs.filter(r => !r.error)
  if (!ok.length) return runs[0]
  const pick = k => median(ok.map(r => r[k]))
  const mid = ok.find(r => r.firstFrame === pick("firstFrame")) || ok[0]
  return { network: ok[0].network, runs: ok.length, firstFrame: pick("firstFrame"), fcp: pick("fcp"), dcl: pick("dcl"),
    longTasks: pick("longTasks"), longest: pick("longest"), blocked: pick("blocked"), scripts: mid.scripts, errors: ok.flatMap(r => r.errors) }
}

const kb = n => (n / 1024).toFixed(1).padStart(7) + " KB"

export function print(report, out) {
  if (report.transfer) {
    out("file                 raw         wire  enc")
    for (const r of report.transfer) out(`${r.file.padEnd(18)} ${kb(r.raw)} ${kb(r.wire)}  ${r.encoding}`)
    const raw = report.transfer.reduce((n, r) => n + r.raw, 0), wire = report.transfer.reduce((n, r) => n + r.wire, 0)
    out(`${"total".padEnd(18)} ${kb(raw)} ${kb(wire)}\n`)
  }
  for (const l of report.load) {
    if (l.error) { out(`${l.network}: ${l.error}`); continue }
    out(`${l.network} (cpu ×${report.cpu}, ${l.runs} run${l.runs > 1 ? "s" : ""}): first frame ${l.firstFrame} ms, fcp ${l.fcp} ms, DOMContentLoaded ${l.dcl} ms; ` +
      `${l.longTasks} long tasks before it (longest ${l.longest} ms, ${l.blocked} ms blocking)`)
    const heavy = Object.entries(l.scripts).filter(([f, c]) => f && c.compile + c.background + c.evaluate >= 5).sort((a, b) => (b[1].compile + b[1].evaluate) - (a[1].compile + a[1].evaluate))
    for (const [f, c] of heavy) out(`    ${f.padEnd(14)} main-thread compile ${String(c.compile).padStart(4)} ms   evaluate ${String(c.evaluate).padStart(4)} ms   streamed ${String(c.background).padStart(5)} ms`)
    if (l.errors.length) out("    page errors: " + l.errors.join("; "))
  }
}

// The whole measurement for parsed options: the report print() takes.
export async function run(opts) {
  let server = null, base = PROD
  if (opts.local) { server = await serve({ root: opts.dist ? DIST : undefined, brotli: true }); base = `http://127.0.0.1:${server.address().port}/` }
  const report = { base, cpu: opts.cpu, load: [] }
  try {
    if (!opts.local) report.transfer = await transfer(base)
    for (const net of opts.networks) {
      const runs = []
      for (let i = 0; i < opts.runs; i++) runs.push(await loadOnce(base, net, opts.cpu))
      report.load.push(summariseRuns(runs))
    }
  } finally { if (server) server.close() }
  return report
}

async function main(argv) {
  const opts = parseArgs(argv), report = await run(opts)
  if (opts.json) console.log(JSON.stringify(report, null, 1))
  else print(report, console.log)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
