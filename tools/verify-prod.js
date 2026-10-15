#!/usr/bin/env node
// After a deploy: is production what we shipped, and does it behave? Read-only
// by construction — every browser this opens fails every non-GET to /api/*
// before it leaves, and each check uses a throwaway profile, so nothing can
// reach the rescue counter whatever the check does on the page.
//
//   npm run verify                                  production, every check
//   npm run verify -- --previous a5cbb381           also: an open tab of that build reloads into this one
//   npm run verify -- --local                       public/ served here (no shipped-file checks)
//   npm run verify -- --json
//
// Checks: the shipped files are dist/ byte for byte (brotli, no comment
// lines), the build agrees on page, repo and API, the share card and icons
// serve as immutable PNGs; level 20 (The Cloud) at desktop and phone size;
// a ?daily link with ?full; Next during a standup moves on exactly one level;
// the patch notes open, hold and give back keyboard focus. Any page error
// fails the run.

import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import https from "node:https"
import http from "node:http"
import { fileURLToPath } from "node:url"
import { serve, browser } from "./phone.js"

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const PROD = "https://oh-no-more-agents.com/"
const sleep = ms => new Promise(r => setTimeout(r, ms))

export function parseArgs(argv) {
  const at = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined }
  return { local: argv.includes("--local"), json: argv.includes("--json"), previous: at("--previous") || null, base: at("--base") || null }
}

// A browser that cannot write to the counter: the block is in place before
// the first navigation, and every refused request is counted.
export async function readOnly() {
  const b = await browser()
  b.blocked = 0
  b.consoleErrors = []
  b.handlers = []
  b.onEvent = e => {
    if (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") b.consoleErrors.push(e.params.args.map(a => a.value || a.description).join(" "))
    if (e.method === "Fetch.requestPaused") {
      const id = { requestId: e.params.requestId }
      if (e.params.request.method !== "GET" && /\/api\//.test(e.params.request.url)) { b.blocked++; b.cmd("Fetch.failRequest", { ...id, errorReason: "BlockedByClient" }); return }
      for (const h of b.handlers) if (h(e)) return
      b.cmd("Fetch.continueRequest", id)
    }
  }
  await b.cmd("Fetch.enable", { patterns: [{ urlPattern: "*/api/*" }, { urlPattern: "*", resourceType: "Document", requestStage: "Response" }] })
  b.ev = async x => (await b.cmd("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result.value
  b.open = async url => {
    await b.cmd("Page.navigate", { url })
    for (let i = 0; i < 60 && !(await b.ev(`!!(window.AgentWorld && AgentWorld())`)); i++) await sleep(100)
  }
  return b
}

// Document responses at the Response stage pass straight through unless a
// handler (the open-tab check) wants them.
function passDocuments(b) {
  b.handlers.push(e => { if (e.params.resourceType === "Document" && e.params.responseStatusCode) { b.cmd("Fetch.continueRequest", { requestId: e.params.requestId }); return true } return false })
}

function get(url) {
  return new Promise((res, rej) => (url.startsWith("https:") ? https : http).get(url, { headers: { "accept-encoding": "br, gzip" } }, r => {
    const parts = []
    r.on("data", d => parts.push(d))
    r.on("end", () => {
      let body = Buffer.concat(parts)
      const enc = r.headers["content-encoding"]
      if (enc === "br") body = zlib.brotliDecompressSync(body); else if (enc === "gzip") body = zlib.gunzipSync(body)
      res({ status: r.statusCode, enc, type: r.headers["content-type"], cache: r.headers["cache-control"], body })
    })
  }).on("error", rej))
}

// The deploy itself: shipped files, build, stamps, images. Each part small,
// because only a real deploy exercises them.
export async function shipped(base) {
  const index = (await get(base)).body.toString()
  const build = /name="build" content="([^"]+)"/.exec(index)[1]
  const srcs = [...index.matchAll(/<script src="([^"]+)"/g)].map(m => m[1])
  const out = [...await buildAgrees(base, build), ...stampsMatch(srcs), ...await filesShipped(base, srcs), ...await imagesServed(base)]
  return { build, problems: out }
}

async function buildAgrees(base, build) {
  const repo = /BUILD = "([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, "src/version.js"), "utf8"))[1]
  const api = JSON.parse((await get(base + "api/stats")).body).build
  return build === repo && repo === api ? [] : [`build disagrees: page ${build}, repo ${repo}, api ${api}`]
}

function stampsMatch(srcs) {
  const local = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8")
  return JSON.stringify(srcs) === JSON.stringify([...local.matchAll(/<script src="([^"]+)"/g)].map(m => m[1])) ? [] : ["script stamps differ from public/index.html"]
}

export async function filesShipped(base, srcs) {
  const out = []
  for (const src of srcs) {
    const r = await get(base + src), file = src.split("?")[0]
    if (r.enc !== "br") out.push(`${file} not brotli`)
    if (Buffer.compare(r.body, fs.readFileSync(path.join(ROOT, "dist", file))) !== 0) out.push(`${file} differs from dist/`)
  }
  return out
}

function imageOk(r) { return r.status === 200 && r.type === "image/png" && /immutable/.test(r.cache || "") }

export async function imagesServed(base) {
  const out = []
  for (const f of ["share-1.png", "favicon-1-16.png", "favicon-1-32.png", "apple-touch-icon-1.png"]) {
    const r = await get(base + f)
    if (!imageOk(r)) out.push(`${f}: ${r.status} ${r.type} ${r.cache}`)
  }
  return out
}

// A tab still showing the previous build reloads itself into this one between levels.
export async function openTab(base, previous) {
  const b = await readOnly(), out = [], state = { loads: 0 }
  b.handlers.push(e => stagePrevious(b, e, previous, state))
  try {
    await b.open(base)
    if ((await b.ev(`document.querySelector("meta[name=build]").content`)) !== previous) out.push("could not stage the previous build")
    await b.ev(`(() => { const w = AgentWorld(); w.done = true; w.doneTicks = 0 })()`)
    for (let i = 0; i < 120 && state.loads < 2; i++) await sleep(250)
    await sleep(1500)
    const now = await b.ev(`document.querySelector("meta[name=build]").content`)
    if (state.loads < 2 || now === previous) out.push(`open tab did not reload (loads ${state.loads}, build ${now})`)
    out.push(...pageProblems(b))
  } finally { await b.close() }
  return out
}

// The first page load is served with the previous build's stamp; later ones pass.
function stagePrevious(b, e, previous, state) {
  if (e.params.resourceType !== "Document" || !e.params.responseStatusCode) return false
  if (state.loads++ > 0) { b.cmd("Fetch.continueRequest", { requestId: e.params.requestId }); return true }
  b.cmd("Fetch.getResponseBody", { requestId: e.params.requestId }).then(body => {
    const html = (body.base64Encoded ? Buffer.from(body.body, "base64").toString() : body.body).replace(/name="build" content="[^"]+"/, `name="build" content="${previous}"`)
    b.cmd("Fetch.fulfillRequest", { requestId: e.params.requestId, responseCode: 200, responseHeaders: [{ name: "content-type", value: "text/html" }], body: Buffer.from(html).toString("base64") })
  })
  return true
}

function pageProblems(b) { return [...b.errors.map(e => "page error: " + e), ...b.consoleErrors.map(e => "console: " + e)] }

// The behaviours: level 20, a daily link with ?full, Next during a standup,
// the patch notes by keyboard. One function each.
export async function behaviours(base) {
  const b = await readOnly()
  passDocuments(b)
  try {
    const out = [...await cloudLevel(b, base), ...await dailyFull(b, base), ...await standupNext(b, base), ...await newsKeyboard(b), ...pageProblems(b)]
    return { problems: out, blocked: b.blocked }
  } finally { await b.close() }
}

async function cloudLevel(b, base) {
  const out = []
  for (const [w, h, mobile] of [[1280, 900, false], [390, 844, true]]) {
    await b.cmd("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile })
    await b.open(base + "?level=20&seed=3")
    const s = await b.ev(`({ biome: AgentWorld().biome, lift: !!AgentWorld().updraftLift, stops: document.querySelectorAll("#tour .tour-stop").length })`)
    if (s.biome !== "The Cloud" || !s.lift || s.stops !== 20) out.push(`level 20 at ${w}px: ${JSON.stringify(s)}`)
  }
  await b.cmd("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  return out
}

async function dailyFull(b, base) {
  await b.open(base + "?daily=2026-10-15&full=1")
  const d = await b.ev(`(() => { const want = AgentShare.daily("2026-10-15"), w = AgentWorld(); return { ok: w.level === want.level && w.colonySeed === want.seed && w.daily === "2026-10-15", faux: document.getElementById("stage").classList.contains("faux") } })()`)
  return [...(d.ok ? [] : ["?daily link did not open its colony"]), ...(d.faux ? [] : ["?daily&full=1 is not fullscreen"])]
}

const FINISH = `(() => { const w = AgentWorld(); w.agents.forEach(a => { a.state = "saved"; a.gone = false }); w.saved = w.agents.length; w.released = w.toRelease; w.done = true; w.doneTicks = 9999 })()`
async function finishLevel(b, last) {
  for (let k = 0; k < 40 && (await b.ev(`AgentWorld().agents.length`)) < 2; k++) await sleep(100)
  const before = await b.ev(`AgentWorld().level`)
  await b.ev(FINISH)
  if (!last) for (let k = 0; k < 40 && (await b.ev(`AgentWorld().level`)) === before; k++) await sleep(100)
}

async function standupNext(b, base) {
  await b.open(base + "?level=3&seed=42")
  for (let i = 0; i < 5; i++) await finishLevel(b, i === 4)
  await sleep(400)
  const during = await b.ev(`AgentWorld().level`)
  await press(b, "n", "KeyN", 78)
  await sleep(600)
  const after = await b.ev(`({ level: AgentWorld().level, ticks: AgentWorld().ticks })`)
  return after.level === during + 1 && after.ticks > 0 ? [] : [`Next during a standup: ${during} -> ${after.level}, ticks ${after.ticks}`]
}

async function press(b, key, code, vk, text) {
  for (const type of ["keyDown", "keyUp"]) await b.cmd("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: vk, text: type === "keyDown" ? text : undefined })
}

const NEWS_STATE = `(() => { const n = document.getElementById("news"); return { open: n.tagName === "DIALOG" ? n.open : !n.hidden, inside: n.contains(document.activeElement), back: document.activeElement && document.activeElement.id } })()`
async function newsKeyboard(b) {
  const out = []
  await b.ev(`document.getElementById("news-open").focus()`)
  await press(b, "Enter", "Enter", 13, "\r"); await sleep(200)
  const open = await b.ev(NEWS_STATE)
  await press(b, "Tab", "Tab", 9); await sleep(100)
  const held = await b.ev(NEWS_STATE)
  await press(b, "Escape", "Escape", 27); await sleep(200)
  const shut = await b.ev(NEWS_STATE)
  if (!open.open || !open.inside) out.push("patch notes: focus did not move into the dialog")
  if (!held.inside) out.push("patch notes: Tab left the dialog")
  if (shut.open || shut.back !== "news-open") out.push(`patch notes: Esc did not close and give focus back (${JSON.stringify(shut)})`)
  return out
}

export async function verify(opts) {
  let server = null, base = opts.base || PROD
  if (opts.local) { server = await serve(); base = `http://127.0.0.1:${server.address().port}/` }
  const report = { base, problems: [] }
  try {
    if (!opts.local) {
      const s = await shipped(base)
      report.build = s.build; report.problems.push(...s.problems)
      if (opts.previous) report.problems.push(...await openTab(base, opts.previous))
    }
    const r = await behaviours(base)
    report.blocked = r.blocked; report.problems.push(...r.problems)
  } finally { if (server) server.close() }
  return report
}

export function summary(r) {
  return r.problems.length ? "verify FAILED:\n  " + r.problems.join("\n  ")
    : `verify passed: ${r.base}${r.build ? " build " + r.build : ""} (${r.blocked} counter writes refused)`
}

async function main(argv) {
  const opts = parseArgs(argv), r = await verify(opts)
  if (opts.json) console.log(JSON.stringify(r, null, 1))
  console.log(summary(r))
  process.exitCode = r.problems.length ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
