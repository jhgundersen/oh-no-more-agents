#!/usr/bin/env node
// Frame rate on the real page: serves public/ locally, opens each level in
// headless Chromium at page resolution, and times requestAnimationFrame for a
// while. The game ticks on its own interval and draws each tick, so a level
// whose drawing is too heavy shows up here as frames that arrive late.
//
//   npm run fps -- 8 9 10           ten seconds a level at the default speed
//   npm run fps -- 8 --seconds 5 --speed 2
//   npm run fps -- 8 9 --json
//   npm run fps -- 324 --seed 3 --from-tick 450 --seconds 10 --speed 2
//   npm run fps -- 324 --root /tmp/before/public --seed 3 --from-tick 450
//
// Reports per level: median fps, the 5th-percentile fps (the stutter), the
// longest frame, how much of each second went to tasks over 50ms (long), and
// how much of it the main thread was busy at all (cpu) — the headroom. Needs
// `chromium` on the PATH. Software rendering in headless is slower than a real
// browser with a GPU, so treat it as a ceiling on trouble.

import path from "node:path"
import { fileURLToPath } from "node:url"
import { serve, browser } from "./phone.js"

const sleep = ms => new Promise(r => setTimeout(r, ms))

export function parseArgs(argv) {
  const opt = (name, d) => { const i = argv.indexOf(name); return i >= 0 ? Number(argv[i + 1]) : d }
  const levels = argv.filter((a, i) => /^\d+$/.test(a) && !/^--/.test(argv[i - 1] || ""))
  const out = { levels: levels.length ? levels.map(Number) : [8, 9, 10, 12, 18], seconds: opt("--seconds", 10),
    speed: opt("--speed", 1), json: argv.includes("--json") }
  for (const [flag, key] of [["--seed", "seed"], ["--from-tick", "fromTick"]])
    if (argv.includes(flag)) out[key] = opt(flag)
  if (argv.includes("--root")) out.root = path.resolve(argv[argv.indexOf("--root") + 1])
  return out
}

// Frame intervals in ms -> the numbers worth printing.
export function summarise(intervals, busyMs, seconds) {
  const sorted = [...intervals].sort((a, b) => a - b)
  const at = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  return {
    frames: intervals.length,
    fps: intervals.length ? Math.round(1000 / at(0.5)) : 0,
    p5: intervals.length ? Math.round(1000 / at(0.95)) : 0,
    worstMs: intervals.length ? Math.round(sorted[sorted.length - 1]) : 0,
    busy: Math.round(100 * busyMs / (seconds * 1000))
  }
}

// Started in the page: collect rAF intervals and long tasks for `ms`.
const PROBE = ms => `new Promise(done => {
  const gaps = []; let last = 0, busy = 0, maxCast = 0
  const start = AgentWorld(); const startLevel = start.level, startTick = start.ticks
  let observer
  try { observer = new PerformanceObserver(l => { for (const e of l.getEntries()) busy += e.duration }); observer.observe({ entryTypes: ["longtask"] }) } catch (e) {}
  const end = performance.now() + ${ms}
  const frame = t => {
    const w = AgentWorld(); let cast = 0
    for (const a of w.agents) if (!a.gone && a.state !== "saved") cast++
    for (const e of w.enemies) if (!e.gone) cast++
    maxCast = Math.max(maxCast, cast)
    if (last) gaps.push(t - last); last = t; if (t < end) requestAnimationFrame(frame); else { if (observer) observer.disconnect(); done({ gaps, busy, startLevel, startTick, endLevel: w.level, endTick: w.ticks, maxCast }) } }
  requestAnimationFrame(frame)
})`

async function taskSeconds(b) {
  const m = await b.cmd("Performance.getMetrics")
  return (m.metrics || []).find(x => x.name === "TaskDuration")?.value || 0
}

export async function measure(b, base, level, seconds, speed, options = {}) {
  await b.cmd("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await b.cmd("Page.navigate", { url: base })
  await sleep(800)
  await b.cmd("Runtime.evaluate", { expression: `localStorage.setItem("oh-no-more-agents", JSON.stringify({ version: 1, level: ${level}, speedIndex: ${speed} }))` })
  const url = new URL(base)
  url.search = new URLSearchParams({ level, seed: options.seed ?? 3, season: "none" }).toString()
  await b.cmd("Page.navigate", { url: url.href })
  await sleep(2500)                 // past the intro, into the level
  if (options.fromTick) await waitForTick(b, level, options.fromTick)
  await b.cmd("Performance.enable")
  const before = await taskSeconds(b)
  const r = await collectFrames(b, seconds)
  // Share of the wall clock the renderer's main thread spent working: the
  // headroom left before frames start to drop.
  const cpu = Math.round(100 * (await taskSeconds(b) - before) / seconds)
  return { level, ...summarise(r.gaps, r.busy, seconds), cpu, seed: options.seed ?? 3,
    startLevel: r.startLevel, startTick: r.startTick, endLevel: r.endLevel, endTick: r.endTick, maxCast: r.maxCast }
}

// CDP commands have a ten-second deadline. Collect bounded four-second
// windows on the same live run so the default ten-second probe cannot hang.
export async function collectFrames(b, seconds) {
  if (!(seconds > 0 && Number.isFinite(seconds))) throw Error("FPS seconds must be positive and finite")
  const rows=[]
  for (let left=seconds*1000;left>0;left-=4000) {
    const r=await b.cmd("Runtime.evaluate", { expression:PROBE(Math.min(left,4000)),awaitPromise:true,returnByValue:true })
    if (r.exceptionDetails || !r.result?.value) throw Error("FPS page probe failed")
    rows.push(r.result.value)
  }
  return {gaps:rows.flatMap(r=>r.gaps),busy:rows.reduce((n,r)=>n+r.busy,0),
    startLevel:rows[0].startLevel,startTick:rows[0].startTick,
    endLevel:rows.at(-1).endLevel,endTick:rows.at(-1).endTick,maxCast:Math.max(...rows.map(r=>r.maxCast))}
}

// Observe the normal page clock; never fast-forward or mutate AgentWorld.
async function waitForTick(b, level, tick) {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    const w = (await b.cmd("Runtime.evaluate", { expression: "({level:AgentWorld().level,tick:AgentWorld().ticks,done:AgentWorld().done})", returnByValue: true })).result.value
    if (w.level !== level || w.done) throw Error("FPS warm-up left level " + level + " before tick " + tick)
    if (w.tick >= tick) return
    await sleep(100)
  }
  throw Error("FPS warm-up timed out at level " + level)
}

function serveRoot(opts) { return serve(opts.root ? { root: opts.root } : {}) }

async function main(argv) {
  const opts = parseArgs(argv)
  const server = await serveRoot(opts), b = await browser(), rows = []
  const base = `http://127.0.0.1:${server.address().port}/`
  try { for (const level of opts.levels) rows.push(await measure(b, base, level, opts.seconds, opts.speed, opts)) }
  finally { await b.close(); server.close() }
  if (b.errors.length) throw Error("page errors: " + b.errors.join("\n"))
  if (opts.json) { console.log(JSON.stringify(rows, null, 1)); return }
  console.log("level  fps  p5  worst  long  cpu")
  for (const r of rows) console.log(`${String(r.level).padStart(5)} ${String(r.fps).padStart(4)} ${String(r.p5).padStart(3)} ${String(r.worstMs + "ms").padStart(6)} ${String(r.busy + "%").padStart(5)} ${String(r.cpu + "%").padStart(4)}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
