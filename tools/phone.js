#!/usr/bin/env node
// The page on a phone: serves public/ locally, opens it in headless Chromium
// with touch emulation at 390×844 portrait and 844×390 landscape (and the
// desktop for comparison), saves a screenshot of each and reports what a thumb
// would run into — controls under 44px, a page that scrolls sideways, a page
// taller than the screen while playing, a board that starts below the fold.
//
//   npm run phone                 screenshots into ./shots/phone-*.png
//   npm run phone -- --out DIR
//   npm run phone -- --json
//
// Needs `chromium` on the PATH. The counter API is not served, so the page
// shows "worldwide: connecting…" — that is expected.

import fs from "node:fs"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import zlib from "node:zlib"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public")
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".json": "application/json" }
export const VIEWS = [
  { name: "portrait", width: 390, height: 844, mobile: true },
  { name: "landscape", width: 844, height: 390, mobile: true },
  { name: "desktop", width: 1280, height: 900, mobile: false }
]
const TARGET = 44
const CMD_TIMEOUT = 10000      // active time a CDP command may take before it fails

// root: another copy of the page (tools/ship.js's dist/). brotli: compress
// text as Cloudflare does on the fly (about quality 5), for load timings.
export function serve({ root = ROOT, brotli = false } = {}) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0])
    const file = path.join(root, url === "/" ? "index.html" : url)
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return }
    const type = TYPES[path.extname(file)] || "application/octet-stream"
    if (brotli && /text|javascript|json|svg/.test(type) && /\bbr\b/.test(req.headers["accept-encoding"] || "")) {
      const body = zlib.brotliCompressSync(fs.readFileSync(file), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } })
      res.writeHead(200, { "content-type": type, "content-encoding": "br" })
      res.end(body)
      return
    }
    res.writeHead(200, { "content-type": type })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server)))
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Chromium reserves a large virtual address cage. Under the test runner's
// address-space cap, launch it through the user manager with a stricter *real*
// memory budget instead; Node and the test workers keep their existing limits.
export function cappedAddressSpace() {
  try {
    const m = fs.readFileSync("/proc/self/limits", "utf8").match(/Max address space\s+(\d+)/)
    return !!m && Number(m[1]) < 16 * 1024 ** 3
  } catch { return false }
}
function launchBrowser(args, profile) {
  const unit = cappedAddressSpace() ? "agents-browser-" + path.basename(profile) : null
  const command = unit ? "systemd-run" : "chromium"
  const argv = unit ? ["--user", "--quiet", "--wait", "--pipe", "--collect", "--service-type=exec", "--unit=" + unit,
    "--property=MemoryMax=512M", "--property=TasksMax=256", "--property=RuntimeMaxSec=300", "chromium", ...args] : args
  const proc = spawn(command, argv, { stdio: "ignore" })
  proc.on("error", e => { proc.launchError = e.message })
  return { proc, unit }
}
async function browserTargets(port, proc) {
  var spent = 0, last = Date.now()
  for (let i = 0; i < 60 && spent < 10000; i++) {
    spent += Math.min(600, Date.now() - last); last = Date.now()
    if (proc.launchError || proc.exitCode !== null || proc.signalCode) throw Error("Headless browser exited at startup: " + (proc.launchError || proc.signalCode || proc.exitCode))
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(400) })).json()
      if (tabs.some(t => t.type === "page")) return tabs
    } catch { /* not listening yet */ }
    await sleep(150)
  }
  throw Error("Headless browser did not start within the bounded discovery window")
}
// Count active time: a serialized test runner may be SIGSTOPped while another
// full suite owns the host. That pause must not turn a healthy browser into a timeout.
function browserTimer(ms, expire) {
  var spent = 0, last = Date.now()
  const timer = setInterval(() => {
    spent += Math.min(500, Date.now() - last); last = Date.now()
    if (spent >= ms) { clearInterval(timer); expire() }
  }, 250)
  return () => clearInterval(timer)
}
function browserSocket(url) {
  const ws = new WebSocket(url)
  return new Promise((resolve, reject) => {
    const cancel = browserTimer(5000, () => { ws.close(); reject(Error("Headless browser connection timed out")) })
    ws.onopen = () => { cancel(); resolve(ws) }
    ws.onerror = () => { cancel(); reject(Error("Headless browser connection failed")) }
  })
}
function stopBrowserUnit(unit) {
  return new Promise(resolve => {
    const stop = spawn("systemctl", ["--user", "stop", unit], { stdio: "ignore" })
    const timer = setTimeout(() => { stop.kill(); resolve() }, 3000)
    stop.on("exit", () => { clearTimeout(timer); resolve() }); stop.on("error", () => { clearTimeout(timer); resolve() })
  })
}
async function closeBrowser(proc, unit, profile) {
  if (unit) await stopBrowserUnit(unit)
  else proc.kill()
  if (proc.exitCode === null && !proc.signalCode) await new Promise(resolve => {
    const timer = setTimeout(resolve, 3000)
    proc.once("exit", () => { clearTimeout(timer); resolve() })
  })
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) } catch { /* temporary profile; no user data */ }
}

export async function browser() {
  const port = 9300 + Math.floor(Math.random() * 500), profile = fs.mkdtempSync(path.join(os.tmpdir(), "phone-"))
  const { proc, unit } = launchBrowser(["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--mute-audio", "--hide-scrollbars", "about:blank"], profile)
  let ws
  try {
    const tabs = await browserTargets(port, proc)
    ws = await browserSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl)
  } catch (e) { await closeBrowser(proc, unit, profile); throw e }
  let id = 0, closed = false
  const pending = new Map(), errors = [], api = { errors, onEvent: null }
  ws.onmessage = m => {
    const d = JSON.parse(m.data), p = pending.get(d.id)
    if (p) { p.cancel(); pending.delete(d.id); p.resolve(d.result || {}) }
    if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.text)
    if (d.method && api.onEvent) api.onEvent(d)
  }
  ws.onclose = () => {
    closed = true
    for (const p of pending.values()) { p.cancel(); p.reject(Error("Headless browser closed during a command")) }
    pending.clear()
  }
  api.cmd = (method, params = {}) => new Promise((resolve, reject) => {
    if (closed) { reject(Error("Headless browser is gone: " + method)); return }
    const i = ++id, cancel = browserTimer(CMD_TIMEOUT, () => { pending.delete(i); reject(Error("Headless browser command timed out: " + method)) })
    pending.set(i, { resolve, reject, cancel }); ws.send(JSON.stringify({ id: i, method, params }))
  })
  api.close = async () => { ws.close(); await closeBrowser(proc, unit, profile) }
  try { await api.cmd("Runtime.enable"); await api.cmd("Page.enable") }
  catch (e) { await api.close(); throw e }
  return api
}

// Everything measured inside the page, in CSS pixels.
const MEASURE = `(() => {
  const r = el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y + scrollY, w: b.width, h: b.height } }
  const small = [...document.querySelectorAll("#stage button, #stage [role=button]")]
    .filter(b => b.offsetParent).map(b => ({ id: b.id, ...r(b) }))
    .filter(b => b.w < ${TARGET} || b.h < ${TARGET})
  const board = r(document.getElementById("board")), stage = r(document.getElementById("stage"))
  return {
    viewport: { w: innerWidth, h: innerHeight },
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    board, stage, small,
    pause: r(document.getElementById("c-pause")), speed: r(document.getElementById("speed")),
    hoverOnly: [...document.styleSheets].flatMap(s => { try { return [...s.cssRules] } catch { return [] } })
      .filter(x => /:hover/.test(x.selectorText || "") && /display|visibility|opacity/.test(x.cssText)).map(x => x.selectorText)
  }
})()`

export function judge(m, view) {
  const notes = []
  if (m.scrollWidth > m.viewport.w + 1) notes.push(`scrolls sideways: ${m.scrollWidth}px in ${m.viewport.w}px`)
  if (view.mobile) {
    for (const b of m.small) notes.push(`small target #${b.id || "?"}: ${Math.round(b.w)}×${Math.round(b.h)}`)
    if (m.board.y + m.board.h > m.viewport.h) notes.push(`board ends below the fold (${Math.round(m.board.y + m.board.h)} > ${m.viewport.h})`)
    // The game is everything in #stage; it should all be on the first screen.
    if (m.stage.y + m.stage.h > m.viewport.h + 1) notes.push(`game runs below the fold: stage to ${Math.round(m.stage.y + m.stage.h)} of ${m.viewport.h}`)
  }
  for (const s of m.hoverOnly) notes.push(`hover-only UI: ${s}`)
  return notes
}

// One view: size, touch, load, measure, screenshot.
export async function capture(b, view, url, out) {
  const touch = view.mobile
  await b.cmd("Emulation.setDeviceMetricsOverride", { width: view.width, height: view.height, deviceScaleFactor: touch ? 3 : 1, mobile: touch })
  await b.cmd("Emulation.setTouchEmulationEnabled", { enabled: touch, maxTouchPoints: touch ? 5 : 1 })
  await b.cmd("Page.navigate", { url })
  await sleep(2500)
  const m = (await b.cmd("Runtime.evaluate", { expression: MEASURE, returnByValue: true })).result.value
  const shot = await b.cmd("Page.captureScreenshot", { format: "png" })
  const file = path.join(out, `phone-${view.name}.png`)
  fs.writeFileSync(file, Buffer.from(shot.data, "base64"))
  return { view: view.name, file, notes: judge(m, view), metrics: m }
}

export function parseArgs(argv) {
  const oi = argv.indexOf("--out")
  return { out: oi >= 0 ? argv[oi + 1] : "shots", json: argv.includes("--json") }
}

// The printed report, and whether the command should fail.
export function print(report, errors, opts, out) {
  if (opts.json) { out(JSON.stringify({ report, errors }, null, 1)); return true }
  for (const r of report) out(`${r.view.padEnd(10)} ${r.file}\n  ${r.notes.length ? r.notes.join("\n  ") : "fine"}`)
  if (errors.length) out("page errors:\n  " + errors.join("\n  "))
  return !errors.length && !report.some(r => r.notes.some(n => /sideways|hover-only/.test(n)))
}

async function main(argv) {
  const opts = parseArgs(argv)
  fs.mkdirSync(opts.out, { recursive: true })
  const server = await serve(), b = await browser(), report = []
  const url = `http://127.0.0.1:${server.address().port}/?phone-check`
  try { for (const view of VIEWS) report.push(await capture(b, view, url, opts.out)) }
  finally { await b.close(); server.close() }
  if (!print(report, b.errors, opts, console.log)) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
