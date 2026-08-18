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

// The colony is random per playthrough in the game, which is the point of it —
// but a harness that reports a different number every run reports nothing. Every
// command below pins the seed, and this is the formula the colony used back when
// it was derived from the level, so the published baselines still mean what they
// said. `salt` samples a different colony without giving up repeatability.
function colonySeed(level, attempt, salt) {
  return level * 7919 + 13 + attempt * 104729 + (salt || 0) * 15485863
}

// One attempt, played to completion or to a hard tick cap that would expose a
// hang.
function play(S, level, attempt, salt) {
  const w = S.generate(level, attempt, colonySeed(level, attempt, salt))
  let t = 0
  while (!w.done && t < 6000) { S.step(w); t++ }
  return { w, ticks: t, hung: !w.done }
}

// The page's own rule: up to three attempts at a level before moving on.
function playLevel(S, level, onAttempt, salt) {
  for (let a = 0; a < 3; a++) {
    const r = play(S, level, a, salt)
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
        const w = S.generate(lv, a, colonySeed(lv, a))
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
      const w = S.generate(lv, 0, colonySeed(lv, 0))
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

  // The same rule for the one thing on the board that is not held up by the
  // floor. A ladder leans on a wall face, and a wall face is exactly the sort
  // of thing a basher, a digger or a charge takes away — leaving, if nothing
  // caught it, a ladder standing in mid air that the whole colony would queue
  // up to climb.
  let hung = 0, gone = 0
  for (let lv = 1; lv <= 200 && hung < 10; lv++) {
    const w = S.generate(lv, 0, colonySeed(lv, 0))
    w.special = "ladder"; w.specialSpec = S.specialSpec("ladder"); w.specialAt = 1
    let t = 0
    while (!w.done && t < 4000 && w.ladders.length === 0) { S.step(w); t++ }
    if (!w.ladders.length) continue
    hung++
    const lad = w.ladders[0]
    for (let y = lad.top + 1; y <= lad.bottom; y++) w.terrain[y * S.COLS + lad.x] = S.EMPTY
    S.step(w)
    if (!w.ladders.includes(lad)) gone++
  }
  console.log(`  ladder ${gone}/${hung} came down when the wall went`)
  if (hung && gone < hung) process.exitCode = 1

  // A ladder can be posted up a wall whose approach is tucked beneath an
  // overhang. Ordinary climbers correctly bump their heads there; the ladder's
  // route must carry the whole colony through it or the visible rungs promise
  // a path the simulation refuses to use.
  const w = S.generate(1, 0, colonySeed(1, 0))
  const x = 20, bottom = 30, top = 19
  for (let y = top - 4; y <= bottom + 1; y++)
    for (let xx = x - 2; xx <= x + 2; xx++) w.terrain[y * S.COLS + xx] = S.EMPTY
  for (let y = top + 1; y <= bottom; y++) w.terrain[y * S.COLS + x + 1] = S.DIRT
  w.terrain[(bottom - S.AGENT_H) * S.COLS + x] = S.DIRT
  w.ladders = [{ x: x + 1, side: 1, bottom, top, t: 14 }]
  const climber = { x: x + 0.5, y: bottom, dir: 1, state: "climb", anim: 0 }
  S.stepClimb(w, climber)
  const through = climber.state === "climb" && climber.y < bottom
  console.log(`  ladder overhang ${through ? "climb continued" : "blocked the climb"}`)
  if (!through) process.exitCode = 1

  const descender = { x: x + 1.5, y: top, dir: -1, state: "walk", anim: 0 }
  S.edgeAhead(w, descender, descender.x - S.WALK_SPEED)
  let downTicks = 0
  while (descender.state === "climb" && downTicks++ < 100) S.stepClimb(w, descender)
  const descended = descender.state === "walk" && descender.y === bottom
    && descender.x === x + 0.5 && descender.dir === -1
  console.log(`  ladder descent ${descended ? "reached the bottom" : "failed"}`)
  if (!descended) process.exitCode = 1
}

// How much does the colony matter? Play each level with several different
// colonies on the same ground and report how far apart they land. Before the
// colony was seeded per playthrough this command could only have printed zeros.
function cmdSpread(S, levels, colonies) {
  let widthSum = 0, flips = 0, counted = 0
  for (let lv = 1; lv <= levels; lv++) {
    const runs = []
    for (let c = 0; c < colonies; c++) {
      const r = play(S, lv, 0, c)
      runs.push({ saved: r.w.saved, target: r.w.target, ticks: r.ticks })
    }
    const saved = runs.map(r => r.saved)
    const lo = Math.min(...saved), hi = Math.max(...saved)
    const cleared = runs.filter(r => r.saved >= r.target).length
    const secs = runs.map(r => Math.round(r.ticks / 30))
    widthSum += hi - lo
    counted++
    if (cleared > 0 && cleared < colonies) flips++
    if (lv <= 12) console.log(
      `level ${String(lv).padStart(3)}  home ${String(lo).padStart(2)}-${String(hi).padEnd(2)} of ${runs[0].target}` +
      `   ${Math.min(...secs)}-${Math.max(...secs)}s   cleared by ${cleared}/${colonies}`)
  }
  console.log(`\n${counted} levels x ${colonies} colonies`)
  console.log(`average spread in agents home: ${(widthSum / counted).toFixed(1)}`)
  console.log(`levels where the colony decided it: ${flips} (${Math.round(100 * flips / counted)}%)`)
}

const cmd = process.argv[2] || "play"
const arg = Number(process.argv[3])
const S = loadSim()
if (cmd === "play") cmdPlay(S, arg || 200)
else if (cmd === "biomes") cmdBiomes(S, arg || 210)
else if (cmd === "inert") cmdInert(S)
else if (cmd === "gravity") cmdGravity(S)
else if (cmd === "spread") cmdSpread(S, arg || 60, Number(process.argv[4]) || 8)
else { console.error("usage: simcheck.js play|biomes|inert|gravity|spread [levels] [colonies]"); process.exit(2) }
