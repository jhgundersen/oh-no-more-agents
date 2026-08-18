#!/usr/bin/env node
//
// Headless checks for the simulation. `npm run check` only runs node --check
// over these files, which passes a file with a missing function perfectly
// happily — deleting biomeSkin() once passed every syntax check and killed the
// entire sim on the first generate(). This is the check that would have caught
// it, and it is how nearly every real bug in this game has been found.
//
//   node tools/simcheck.js play [levels]   play levels the way the page plays
//                                          them and report the outcome
//   node tools/simcheck.js inert           prove the earth materials do not
//                                          affect behaviour
//   node tools/simcheck.js gravity         prove planted things fall when the
//                                          ground under them is removed
//   node tools/simcheck.js biomes [levels] outcome broken down per biome
//
// It loads Sim.js the way a browser does — as text, with the top-level
// declarations exported — so it needs no changes to the game files.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AGENTS = path.join(HERE, "..", "public", "agents")

function loadSim() {
  const src = fs.readFileSync(path.join(AGENTS, "Sim.js"), "utf8")
  const fns = [...src.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)].map(m => m[1])
  const consts = [...src.matchAll(/^var\s+([A-Z][A-Z0-9_]*)\s*=/gm)].map(m => m[1])
  const names = [...new Set([...fns, ...consts])]
  const mod = { exports: {} }
  new Function("module", "exports", src + "\nmodule.exports={" + names.join(",") + "}")(mod, mod.exports)
  return mod.exports
}

// One attempt, played to completion or to a hard tick cap that would expose a
// hang.
function play(S, level, attempt) {
  const w = S.generate(level, attempt)
  let t = 0
  while (!w.done && t < 6000) { S.step(w); t++ }
  return { w, ticks: t, hung: !w.done }
}

// The page's own rule: up to three attempts at a level before moving on.
function playLevel(S, level, onAttempt) {
  for (let a = 0; a < 3; a++) {
    const r = play(S, level, a)
    if (onAttempt) onAttempt(r)
    if (r.w.saved >= r.w.target) return { cleared: true, last: r }
    if (a === 2) return { cleared: false, last: r }
  }
}

function cmdPlay(S, levels) {
  let cleared = 0, attempts = 0, saved = 0, released = 0, ticks = 0, hangs = 0
  for (let lv = 1; lv <= levels; lv++) {
    const out = playLevel(S, lv, r => {
      attempts++; saved += r.w.saved; released += r.w.released; ticks += r.ticks
      if (r.hung) { hangs++; console.log(`HANG on level ${lv}`) }
    })
    if (out.cleared) cleared++
  }
  console.log(`levels ${levels}  cleared ${cleared} (${Math.round(100 * cleared / levels)}%)`)
  console.log(`attempts ${attempts}  home ${saved}/${released} (${Math.round(100 * saved / released)}%)`)
  console.log(`avg attempt ${(ticks / attempts / 30).toFixed(0)}s  hangs ${hangs}`)
  if (hangs) process.exitCode = 1
}

function cmdBiomes(S, levels) {
  const st = {}
  for (let lv = 1; lv <= levels; lv++) {
    let biome = null, saved = 0, released = 0
    const out = playLevel(S, lv, r => { biome = r.w.biome; saved += r.w.saved; released += r.w.released })
    st[biome] = st[biome] || { n: 0, c: 0, s: 0, r: 0 }
    st[biome].n++; if (out.cleared) st[biome].c++
    st[biome].s += saved; st[biome].r += released
  }
  console.log("biome        levels  cleared  home")
  for (const b of S.BIOMES) {
    const v = st[b]; if (!v) continue
    console.log(`  ${b.padEnd(10)} ${String(v.n).padStart(5)} ${String(Math.round(100 * v.c / v.n) + "%").padStart(7)} ${String(Math.round(100 * v.s / v.r) + "%").padStart(6)}`)
  }
}

// DIRT, ROCK and ORE must be one material to everything that makes a decision:
// solidity asks only whether a cell is empty, and every skill asks only whether
// it is steel. That is what makes the strata and the biome skins free. Play
// each level twice — once as built, once with all three flattened — and the two
// must agree on every observable.
function cmdInert(S) {
  let checked = 0, bad = 0
  for (let lv = 1; lv <= 150; lv++) {
    for (let a = 0; a < 2; a++) {
      const run = flatten => {
        const w = S.generate(lv, a)
        if (flatten) for (let i = 0; i < w.terrain.length; i++) {
          const t = w.terrain[i]
          if (t === S.ROCK || t === S.ORE) w.terrain[i] = S.DIRT
        }
        let n = 0
        while (!w.done && n < 6000) { S.step(w); n++ }
        let sum = 0
        for (let i = 0; i < w.terrain.length; i++) {
          const t = w.terrain[i]
          sum = (sum * 31 + (t === S.ROCK || t === S.ORE ? S.DIRT : t)) >>> 0
        }
        return [w.saved, w.lost, w.released, w.target, n, sum].join(" ")
      }
      checked++
      if (run(false) !== run(true)) { bad++; if (bad < 4) console.log(`  differs on level ${lv}.${a}`) }
    }
  }
  console.log(`${checked} paired runs, ${bad} differed`)
  console.log(bad === 0 ? "MATERIALS ARE INERT" : "MATERIALS LEAK INTO BEHAVIOUR")
  if (bad) process.exitCode = 1
}

// Standing still is a decision about walking, not a suspension of gravity.
// Blockers, camped snipers, lit fuses and planted charges all have to come down
// when the floor under them is taken away.
function cmdGravity(S) {
  const dig = (w, x, y) => {
    for (let d = 0; d < 14; d++) for (let i = -2; i <= 2; i++) {
      const yy = y + d, xx = x + i
      if (yy < S.ROWS - 2 && w.terrain[yy * S.COLS + xx] !== S.STEEL) w.terrain[yy * S.COLS + xx] = S.EMPTY
    }
  }
  for (const kind of ["block", "camp", "bomb", "mine"]) {
    let tested = 0, fell = 0
    for (let lv = 1; lv <= 400 && tested < 12; lv++) {
      const w = S.generate(lv, 0)
      let t = 0, subject = null
      while (!w.done && t < 4000) {
        S.step(w); t++
        if (kind === "mine") { if (w.mines.length) { subject = w.mines[0]; break } }
        else { const a = w.agents.find(a => !a.gone && a.state === kind); if (a) { subject = a; break } }
      }
      if (!subject) continue
      tested++
      const y0 = kind === "mine" ? subject.y : Math.floor(subject.y)
      const x0 = kind === "mine" ? subject.x : Math.floor(subject.x)
      dig(w, x0, y0 + 1)
      for (let k = 0; k < 40; k++) S.step(w)
      const y1 = kind === "mine"
        ? (w.mines.includes(subject) ? subject.y : y0 + 99)
        : (subject.gone ? y0 + 99 : Math.floor(subject.y))
      if (y1 > y0) fell++
    }
    // A few legitimately stay put: they are standing on steel, which nothing
    // removes.
    console.log(`  ${kind.padEnd(6)} ${fell}/${tested} came down when the floor went`)
  }
}

const cmd = process.argv[2] || "play"
const arg = Number(process.argv[3])
const S = loadSim()
if (cmd === "play") cmdPlay(S, arg || 200)
else if (cmd === "biomes") cmdBiomes(S, arg || 210)
else if (cmd === "inert") cmdInert(S)
else if (cmd === "gravity") cmdGravity(S)
else { console.error("usage: simcheck.js play|biomes|inert|gravity [levels]"); process.exit(2) }
