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

export function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0])
    const file = path.join(ROOT, url === "/" ? "index.html" : url)
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server)))
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

export async function browser() {
  const port = 9300 + Math.floor(Math.random() * 500)
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "phone-"))
  const proc = spawn("chromium", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--mute-audio", "--hide-scrollbars", "about:blank"], { stdio: "ignore" })
  let tabs
  for (let i = 0; i < 60 && !tabs; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json() } catch { await sleep(150) } }
  const ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl)
  await new Promise(r => { ws.onopen = r })
  let id = 0
  const pending = new Map(), errors = []
  ws.onmessage = m => {
    const d = JSON.parse(m.data)
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result || {}); pending.delete(d.id) }
    if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.text)
  }
  const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
  await cmd("Runtime.enable"); await cmd("Page.enable")
  return { cmd, errors, close() { ws.close(); proc.kill(); fs.rmSync(profile, { recursive: true, force: true }) } }
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
  finally { b.close(); server.close() }
  if (!print(report, b.errors, opts, console.log)) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
