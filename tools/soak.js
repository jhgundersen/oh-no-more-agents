#!/usr/bin/env node
// A long watch, the way a tab left open for an afternoon is watched: the page
// served from public/, headless Chromium, the fastest speed, levels running
// into each other on their own, sound on, storage on and every write to the
// counter refused. Every 30 s it collects garbage and samples the JS heap, DOM
// nodes, event listeners, canvases, localStorage, live audio nodes and the
// frame time; at the end it judges the curve.
//
//   npm run soak -- --minutes 20           (runs through the test lock)
//   npm run soak -- --minutes 2 --json
//
// Fails on page errors or console errors, on growth that does not level off
// (the late samples well above the early ones in heap, nodes, listeners,
// storage or canvases), on audio nodes piling up, and on frame time creeping.

import path from "node:path"
import { fileURLToPath } from "node:url"
import { serve, browser } from "./phone.js"

const sleep = ms => new Promise(r => setTimeout(r, ms))

export function parseArgs(argv) {
  const at = name => { const i = argv.indexOf(name); return i >= 0 ? Number(argv[i + 1]) : undefined }
  return { minutes: at("--minutes") || 20, every: at("--every") || 30, json: argv.includes("--json") }
}

// Before the page's own scripts: count live audio nodes (created and not yet
// ended) and every frame's interval, so the samples can read them.
const PROBE = `(() => {
  window.__soak = { audio: 0, made: 0, frames: [] }
  const AC = window.AudioContext || window.webkitAudioContext
  if (AC) for (const kind of ["createOscillator", "createBufferSource"]) {
    const make = AC.prototype[kind]
    AC.prototype[kind] = function () {
      const n = make.apply(this, arguments)
      __soak.audio++; __soak.made++
      n.addEventListener("ended", () => { __soak.audio-- })
      return n
    }
  }
  let last = 0
  const frame = t => { if (last) { __soak.frames.push(t - last); if (__soak.frames.length > 240) __soak.frames.shift() } last = t; requestAnimationFrame(frame) }
  requestAnimationFrame(frame)
})()`

const READ = `(() => {
  const f = [...__soak.frames].sort((a, b) => a - b), w = window.AgentWorld && AgentWorld()
  let storage = 0
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); storage += k.length + (localStorage.getItem(k) || "").length } } catch (e) {}
  return { canvases: document.querySelectorAll("canvas").length, storage, audio: __soak.audio, made: __soak.made,
    frameMs: f.length ? +f[Math.floor(f.length / 2)].toFixed(1) : 0, frameP95: f.length ? +f[Math.floor(f.length * 0.95)].toFixed(1) : 0,
    level: w ? w.level : 0, feed: w ? w.feed.length : 0, particles: w ? w.particles.length : 0 }
})()`

export async function sample(b) {
  await b.cmd("HeapProfiler.collectGarbage")
  const m = Object.fromEntries(((await b.cmd("Performance.getMetrics")).metrics || []).map(x => [x.name, x.value]))
  const page = (await b.cmd("Runtime.evaluate", { expression: READ, returnByValue: true })).result.value
  return { heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(2), nodes: m.Nodes, listeners: m.JSEventListeners, ...page }
}

const median = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }

// Growth that keeps going: the last third's median against the second
// third's, so the start-up climb (fonts, first level, caches) is not counted.
// Each measure gets an allowance for ordinary wobble.
export const LIMITS = {
  heapMB: { ratio: 1.25, abs: 3 }, nodes: { ratio: 1.15, abs: 200 }, listeners: { ratio: 1.15, abs: 30 },
  storage: { ratio: 1.5, abs: 20000 }, canvases: { ratio: 1, abs: 0 }
}
export function judge(samples, errors) {
  const problems = []
  for (const e of errors) problems.push("page error: " + e)
  if (samples.length >= 6) {
    const third = Math.floor(samples.length / 3)
    const mid = samples.slice(third, 2 * third), late = samples.slice(2 * third)
    for (const [k, lim] of Object.entries(LIMITS)) {
      const a = median(mid.map(s => s[k])), z = median(late.map(s => s[k]))
      if (z > a * lim.ratio && z - a > lim.abs) problems.push(`${k} keeps growing: ${a} -> ${z}`)
    }
    const fa = median(mid.map(s => s.frameMs)), fz = median(late.map(s => s.frameMs))
    if (fz > fa * 1.3 && fz - fa > 3) problems.push(`frame time creeps: ${fa} ms -> ${fz} ms`)
  }
  const audio = Math.max(0, ...samples.map(s => s.audio))
  if (audio > 120) problems.push(`audio nodes pile up: ${audio} live`)
  return problems
}

function listen(b, errors) {
  b.onEvent = e => {
    if (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") errors.push(e.params.args.map(a => a.value || a.description).join(" "))
    if (e.method !== "Fetch.requestPaused") return
    const id = { requestId: e.params.requestId }
    if (e.params.request.method !== "GET") b.cmd("Fetch.failRequest", { ...id, errorReason: "BlockedByClient" })
    else b.cmd("Fetch.continueRequest", id)
  }
}

// The page at its fastest speed, the counter refused, the probe in place.
async function openPage(b, base) {
  await b.cmd("Fetch.enable", { patterns: [{ urlPattern: "*/api/*" }] })
  await b.cmd("Performance.enable")
  await b.cmd("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await b.cmd("Page.addScriptToEvaluateOnNewDocument", { source: PROBE })
  await b.cmd("Page.navigate", { url: base }); await sleep(1000)
  await b.cmd("Runtime.evaluate", { expression: `localStorage.setItem("oh-no-more-agents", JSON.stringify({ version: 1, level: 1, speedIndex: 2 }))` })
  await b.cmd("Page.navigate", { url: base }); await sleep(1500)
}

// Sound on, by a real click: a gesture is what lets an AudioContext run.
async function soundOn(b) {
  const r = (await b.cmd("Runtime.evaluate", { expression: `(() => { const r = document.getElementById("sfx").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`, returnByValue: true })).result.value
  for (const type of ["mousePressed", "mouseReleased"]) await b.cmd("Input.dispatchMouseEvent", { type, x: r[0], y: r[1], button: "left", clickCount: 1 })
}

export function line(s) {
  return `soak ${String(s.t).padStart(5)} s  level ${s.level}  heap ${s.heapMB} MB  nodes ${s.nodes}  listeners ${s.listeners}  canvases ${s.canvases}  storage ${s.storage}  audio ${s.audio} (${s.made} made)  frame ${s.frameMs}/${s.frameP95} ms`
}

export async function soak({ minutes, every, log = console.error }) {
  const server = await serve(), b = await browser(), errors = [], samples = []
  listen(b, errors)
  try {
    await openPage(b, `http://127.0.0.1:${server.address().port}/`)
    await soundOn(b)
    const end = Date.now() + minutes * 60000
    while (Date.now() < end) {
      await sleep(Math.min(every * 1000, Math.max(0, end - Date.now())))
      const s = { t: (samples.length + 1) * every, ...(await sample(b)) }
      samples.push(s)
      log(line(s))
    }
    const all = [...b.errors, ...errors]
    return { samples, errors: all, problems: judge(samples, all) }
  } finally { await b.close(); server.close() }
}

export function verdict(r, minutes) {
  if (r.problems.length) return "soak FAILED:\n  " + r.problems.join("\n  ")
  const first = r.samples[0], last = r.samples[r.samples.length - 1]
  return `soak passed: ${r.samples.length} samples over ${minutes} min, levels ${first ? first.level : "-"}-${last ? last.level : "-"}`
}

async function main(argv) {
  const opts = parseArgs(argv), r = await soak(opts)
  if (opts.json) console.log(JSON.stringify(r, null, 1))
  console.log(verdict(r, opts.minutes))
  process.exitCode = r.problems.length ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
