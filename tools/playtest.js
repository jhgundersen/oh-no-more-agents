#!/usr/bin/env node
// Play-test a range of levels headlessly, several colonies each, and report
// per level what a person watching would notice: how many got home, which
// runs hung, ran out the clock or were ended by the stall cutoffs, who was
// left stranded or written off as looping, and how often the dreamer, the 429
// queue and the AGI turned up.
//
//   npm run playtest -- 1-20              six colonies a level
//   npm run playtest -- 1-20 --seeds 12
//   npm run playtest -- 5,9,14 --json     machine-readable
//
// Colonies come from simcheck's colonySeed with a salt per run, so a report is
// repeatable and a run can be replayed: generate(level, 0, colonySeed(level, 0,
// salt)). Levels run in parallel on worker threads.

import os from "node:os"
import path from "node:path"
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads"
import { fileURLToPath } from "node:url"
import { loadSim, colonySeed } from "./simcheck.js"

const CAP = 6000   // ticks; past the level clock and the nuke, so only a real hang reaches it

// One colony, played out. Everything is read off the world; nothing is changed.
export function playtestRun(S, level, salt) {
  const w = S.generate(level, 0, colonySeed(level, 0, salt))
  let longestQueue = 0
  while (!w.done && w.ticks < CAP) {
    S.step(w)
    for (const ag of w.agents) if (ag.queueFor > longestQueue) longestQueue = ag.queueFor
  }
  const left = w.agents.filter(a => !a.gone && a.state !== "saved")
  return {
    level, salt, biome: w.biome,
    saved: w.saved, lost: w.lost, total: w.toRelease, ticks: w.ticks,
    hung: !w.done,
    nuked: !!w.nuking,
    // Ended by a stall cutoff rather than by everybody being settled.
    stalled: w.done && !w.nuking && left.length > 0,
    stranded: left.length,
    condemned: w.agents.filter(a => a.condemned).length,
    queuedAtEnd: left.filter(a => a.queueFor > 0).length,
    dreams: w.hallucinations || 0,
    dreamsReached: w.agents.filter(a => a.wokeAt !== undefined).length,
    limited: w.rateLimited || 0,
    longestQueue,
    agi: w.agiId >= 0 ? (w.agiHome ? "home" : w.agiLost ? "lost" : "open") : "",
    ducked: w.ducked || 0
  }
}

export function summarise(runs) {
  const by = new Map()
  for (const r of runs) {
    if (!by.has(r.level)) by.set(r.level, [])
    by.get(r.level).push(r)
  }
  const rows = []
  for (const [level, rs] of [...by].sort((a, b) => a[0] - b[0])) {
    const saved = rs.reduce((n, r) => n + r.saved, 0), total = rs.reduce((n, r) => n + r.total, 0)
    rows.push({
      level, biome: rs[0].biome, runs: rs.length,
      home: Math.round(100 * saved / total),
      worst: Math.min(...rs.map(r => Math.round(100 * r.saved / r.total))),
      hung: rs.filter(r => r.hung).length,
      nuked: rs.filter(r => r.nuked).length,
      stalled: rs.filter(r => r.stalled).length,
      nobody: rs.filter(r => r.saved === 0).length,
      stranded: rs.reduce((n, r) => n + r.stranded, 0),
      condemned: rs.reduce((n, r) => n + r.condemned, 0),
      queuedAtEnd: rs.reduce((n, r) => n + r.queuedAtEnd, 0),
      dreams: rs.reduce((n, r) => n + r.dreams, 0),
      limited: rs.filter(r => r.limited > 0).length,
      agi: rs.filter(r => r.agi).map(r => r.agi[0]).join("")
    })
  }
  return rows
}

// What needs looking at, worst first: anything that can be a soft-lock, then
// whole colonies lost, then levels that are simply hard.
export function problems(rows) {
  const out = []
  for (const r of rows) {
    if (r.hung) out.push({ score: 100, text: `level ${r.level}: ${r.hung} run(s) hung past ${CAP} ticks` })
    if (r.queuedAtEnd) out.push({ score: 90, text: `level ${r.level}: ${r.queuedAtEnd} agent(s) still in a 429 queue at the end` })
    if (r.nobody) out.push({ score: 60, text: `level ${r.level}: nobody home in ${r.nobody}/${r.runs} runs` })
    if (r.nuked) out.push({ score: 40 + r.nuked, text: `level ${r.level}: ran out the clock in ${r.nuked}/${r.runs} runs` })
    if (r.stalled) out.push({ score: 30 + r.stalled, text: `level ${r.level}: ended by the stall cutoff in ${r.stalled}/${r.runs} runs (${r.stranded} stranded)` })
    if (r.condemned >= r.runs * 2) out.push({ score: 20 + r.condemned / r.runs, text: `level ${r.level}: ${r.condemned} agents written off as looping` })
    if (r.home < 70) out.push({ score: 10 + (70 - r.home) / 10, text: `level ${r.level}: ${r.home}% home` })
  }
  return out.sort((a, b) => b.score - a.score)
}

export function parseLevels(spec) {
  const out = []
  for (const part of String(spec || "1-20").split(",")) {
    const [a, b] = part.split("-").map(Number)
    for (let lv = a; lv <= (b || a); lv++) out.push(lv)
  }
  return out
}

export function parseArgs(argv) {
  const si = argv.indexOf("--seeds")
  return {
    levels: parseLevels(argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--seeds")),
    seeds: si >= 0 ? Number(argv[si + 1]) : 6,
    json: argv.includes("--json")
  }
}

function table(rows, out) {
  const pad = (v, n) => String(v).padStart(n)
  out("level biome          runs home worst hung nuke stall nobody strand loop 429q dream 429 agi")
  for (const r of rows)
    out(`${pad(r.level, 5)} ${r.biome.padEnd(14)} ${pad(r.runs, 4)} ${pad(r.home + "%", 4)} ${pad(r.worst + "%", 5)}` +
      ` ${pad(r.hung, 4)} ${pad(r.nuked, 4)} ${pad(r.stalled, 5)} ${pad(r.nobody, 6)} ${pad(r.stranded, 6)} ${pad(r.condemned, 4)}` +
      ` ${pad(r.queuedAtEnd, 4)} ${pad(r.dreams, 5)} ${pad(r.limited, 3)} ${r.agi || "-"}`)
}

// Every (level, salt) pair, spread over worker threads.
export async function runAll(levels, seeds, threads = os.availableParallelism() - 1) {
  const jobs = []
  for (const level of levels) for (let salt = 1; salt <= seeds; salt++) jobs.push({ level, salt })
  const n = Math.max(1, Math.min(jobs.length, threads)), runs = []
  await Promise.all(Array.from({ length: n }, (_, i) => new Promise((resolve, reject) => {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: jobs.filter((_, j) => j % n === i) })
    worker.on("message", r => runs.push(...r))
    worker.on("error", reject)
    worker.on("exit", resolve)
  })))
  return runs
}

// The printed report, and whether it should fail the command.
export function report(runs, opts, out, seconds) {
  const rows = summarise(runs), found = problems(rows)
  if (opts.json) out(JSON.stringify({ rows, problems: found, runs }, null, 1))
  else {
    table(rows, out)
    const all = runs.reduce((n, r) => n + r.saved, 0), of = runs.reduce((n, r) => n + r.total, 0)
    out(`\n${runs.length} runs, ${Math.round(100 * all / of)}% home, ${seconds.toFixed(1)} s`)
    out(found.length ? "\nworth a look:\n  " + found.map(p => p.text).join("\n  ") : "\nnothing worth a look")
  }
  return rows.every(r => !r.hung && !r.queuedAtEnd)
}

async function main(argv) {
  const opts = parseArgs(argv), started = Date.now()
  const runs = await runAll(opts.levels, opts.seeds)
  if (!report(runs, opts, console.log, (Date.now() - started) / 1000)) process.exitCode = 1
}

if (!isMainThread) {
  const S = loadSim()
  parentPort.postMessage(workerData.map(j => playtestRun(S, j.level, j.salt)))
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
}
