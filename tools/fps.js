#!/usr/bin/env node
// Frame rate on the real page: serves public/ locally, opens each level in
// headless Chromium at page resolution, and times requestAnimationFrame for a
// while. The game ticks on its own interval and draws each tick, so a level
// whose drawing is too heavy shows up here as frames that arrive late.
//
//   npm run fps -- 8 9 10           ten seconds a level at the default speed
//   npm run fps -- 8 --seconds 5 --speed 2
//   npm run fps -- 8 9 --json
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
  return { levels: levels.length ? levels.map(Number) : [8, 9, 10, 12, 18], seconds: opt("--seconds", 10),
    speed: opt("--speed", 1), json: argv.includes("--json") }
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
  const gaps = []; let last = 0, busy = 0
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) busy += e.duration }).observe({ entryTypes: ["longtask"] }) } catch (e) {}
  const end = performance.now() + ${ms}
  const frame = t => { if (last) gaps.push(t - last); last = t; if (t < end) requestAnimationFrame(frame); else done({ gaps, busy }) }
  requestAnimationFrame(frame)
})`

async function taskSeconds(b) {
  const m = await b.cmd("Performance.getMetrics")
  return (m.metrics || []).find(x => x.name === "TaskDuration")?.value || 0
}

export async function measure(b, base, level, seconds, speed) {
  await b.cmd("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await b.cmd("Page.navigate", { url: base })
  await sleep(800)
  await b.cmd("Runtime.evaluate", { expression: `localStorage.setItem("oh-no-more-agents", JSON.stringify({ version: 1, level: ${level}, speedIndex: ${speed} }))` })
  await b.cmd("Page.navigate", { url: base })
  await sleep(2500)                 // past the intro, into the level
  await b.cmd("Performance.enable")
  const before = await taskSeconds(b)
  const r = (await b.cmd("Runtime.evaluate", { expression: PROBE(seconds * 1000), awaitPromise: true, returnByValue: true })).result.value
  // Share of the wall clock the renderer's main thread spent working: the
  // headroom left before frames start to drop.
  const cpu = Math.round(100 * (await taskSeconds(b) - before) / seconds)
  return { level, ...summarise(r.gaps, r.busy, seconds), cpu }
}

async function main(argv) {
  const opts = parseArgs(argv)
  const server = await serve(), b = await browser(), rows = []
  const base = `http://127.0.0.1:${server.address().port}/`
  try { for (const level of opts.levels) rows.push(await measure(b, base, level, opts.seconds, opts.speed)) }
  finally { await b.close(); server.close() }
  if (opts.json) { console.log(JSON.stringify(rows, null, 1)); return }
  console.log("level  fps  p5  worst  long  cpu")
  for (const r of rows) console.log(`${String(r.level).padStart(5)} ${String(r.fps).padStart(4)} ${String(r.p5).padStart(3)} ${String(r.worstMs + "ms").padStart(6)} ${String(r.busy + "%").padStart(5)} ${String(r.cpu + "%").padStart(4)}`)
  if (b.errors.length) console.log("page errors:\n  " + b.errors.join("\n  "))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
