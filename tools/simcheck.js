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
//   node tools/simcheck.js heights         every special survives a lethal drop
//   node tools/simcheck.js biomes [levels] outcome broken down per biome
//   node tools/simcheck.js hazards [levels] kills per placement, per fixture
//   node tools/simcheck.js spread [levels] [colonies]
//
// It loads Sim.js the way a browser does — as text, with the top-level
// declarations exported — so it needs no changes to the game files.
//
// Every command is also exported, takes its sizes as arguments and an `out`
// to print through, and returns what it found, so test/simcheck.test.js can
// run the quick ones (heights, the ladder checks) on every `npm test` and the
// slow ones on a level or two.

import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadCore } from "./load-core.js"

export function loadSim() { return loadCore("Sim.js") }

// The colony is random per playthrough in the game, which is the point of it —
// but a harness that reports a different number every run reports nothing. Every
// command below pins the seed, and this is the formula the colony used back when
// it was derived from the level, so the published baselines still mean what they
// said. `salt` samples a different colony without giving up repeatability.
export function colonySeed(level, attempt, salt) {
  return level * 7919 + 13 + attempt * 104729 + (salt || 0) * 15485863
}

// One attempt, played to completion or to a hard tick cap that would expose a
// hang.
export function play(S, level, attempt, salt) {
  const w = S.generate(level, attempt, colonySeed(level, attempt, salt))
  let t = 0
  while (!w.done && t < 6000) { S.step(w); t++ }
  return { w, ticks: t, hung: !w.done }
}

// The game itself has no pass mark any more — every agent counts and the page
// moves on either way. Tuning still needs a line to measure against, so the
// line lives here: a fixed share of the colony, the same on every level. That
// is a better yardstick than the number the world used to roll, which varied
// 65-80% per level and put its own noise into every comparison. It sits at the
// old average, so the baselines in AGENTS.md remain comparable.
const CLEAR_SHARE = 0.7
export function clearBar(w) { return Math.max(1, Math.ceil(w.toRelease * CLEAR_SHARE)) }

// The page's own rule: up to three attempts at a level before moving on.
export function playLevel(S, level, onAttempt, salt) {
  let r
  for (let a = 0; a < 3; a++) {
    r = play(S, level, a, salt)
    if (onAttempt) onAttempt(r)
    if (r.w.saved >= clearBar(r.w)) return { cleared: true, last: r }
  }
  return { cleared: false, last: r }
}

const pct = (a, b) => Math.round(100 * a / b)

export function cmdPlay(S, levels, out = console.log) {
  const t = { cleared: 0, attempts: 0, saved: 0, released: 0, ticks: 0, hangs: 0 }
  for (let lv = 1; lv <= levels; lv++) {
    const res = playLevel(S, lv, r => {
      t.attempts++; t.saved += r.w.saved; t.released += r.w.released; t.ticks += r.ticks
      if (r.hung) { t.hangs++; out(`HANG on level ${lv}`) }
    })
    if (res.cleared) t.cleared++
  }
  out(`levels ${levels}  cleared ${t.cleared} (${pct(t.cleared, levels)}%)`)
  out(`attempts ${t.attempts}  home ${t.saved}/${t.released} (${pct(t.saved, t.released)}%)`)
  out(`avg attempt ${(t.ticks / t.attempts / 30).toFixed(0)}s  hangs ${t.hangs}`)
  return { ok: t.hangs === 0, ...t }
}

export function cmdBiomes(S, levels, out = console.log) {
  const st = {}
  for (let lv = 1; lv <= levels; lv++) {
    let biome = null, saved = 0, released = 0
    const res = playLevel(S, lv, r => { biome = r.w.biome; saved += r.w.saved; released += r.w.released })
    const v = st[biome] = st[biome] || { n: 0, c: 0, s: 0, r: 0 }
    v.n++; v.s += saved; v.r += released
    if (res.cleared) v.c++
  }
  out("biome        levels  cleared  home")
  for (const b of S.BIOMES) {
    const v = st[b]
    if (v) out(`  ${b.padEnd(10)} ${String(v.n).padStart(5)} ${String(pct(v.c, v.n) + "%").padStart(7)} ${String(pct(v.s, v.r) + "%").padStart(6)}`)
  }
  return { ok: true, biomes: st }
}

// DIRT, ROCK and ORE must be one material to everything that makes a decision:
// solidity asks only whether a cell is empty, and every skill asks only whether
// it is steel. That is what makes the strata and the biome skins free. Play
// each level twice — once as built, once with all three flattened — and the two
// must agree on every observable.
export function inertRun(S, lv, a, flatten) {
  const w = S.generate(lv, a, colonySeed(lv, a))
  if (flatten) for (let i = 0; i < w.terrain.length; i++)
    if (w.terrain[i] === S.ROCK || w.terrain[i] === S.ORE) w.terrain[i] = S.DIRT
  let n = 0
  while (!w.done && n < 6000) { S.step(w); n++ }
  let sum = 0
  for (let i = 0; i < w.terrain.length; i++) {
    const t = w.terrain[i]
    sum = (sum * 31 + (t === S.ROCK || t === S.ORE ? S.DIRT : t)) >>> 0
  }
  return [w.saved, w.lost, w.released, n, sum].join(" ")
}

export function cmdInert(S, levels = 150, out = console.log) {
  let checked = 0, bad = 0
  for (let lv = 1; lv <= levels; lv++) for (let a = 0; a < 2; a++) {
    checked++
    if (inertRun(S, lv, a, false) === inertRun(S, lv, a, true)) continue
    bad++
    if (bad < 4) out(`  differs on level ${lv}.${a}`)
  }
  out(`${checked} paired runs, ${bad} differed`)
  out(bad === 0 ? "MATERIALS ARE INERT" : "MATERIALS LEAK INTO BEHAVIOUR")
  return { ok: bad === 0, checked, bad }
}

// Standing still is a decision about walking, not a suspension of gravity.
// Blockers, camped snipers, lit fuses and planted charges all have to come down
// when the floor under them is taken away.
function digUnder(S, w, x, y) {
  for (let d = 0; d < 14; d++) for (let i = -2; i <= 2; i++) {
    const yy = y + d, xx = x + i
    if (yy < S.ROWS - 2 && w.terrain[yy * S.COLS + xx] !== S.STEEL) w.terrain[yy * S.COLS + xx] = S.EMPTY
  }
}

function findSubject(S, w, kind) {
  for (let t = 0; !w.done && t < 4000; t++) {
    S.step(w)
    if (kind === "mine") { if (w.mines.length) return w.mines[0] }
    else {
      const a = w.agents.find(a => !a.gone && a.state === kind)
      if (a) return a
    }
  }
  return null
}

function subjectY(kind, w, subject, y0) {
  if (kind === "mine") return w.mines.includes(subject) ? subject.y : y0 + 99
  return subject.gone ? y0 + 99 : Math.floor(subject.y)
}

export function gravityOf(S, kind, maxLevels = 400, sample = 12) {
  let tested = 0, fell = 0
  for (let lv = 1; lv <= maxLevels && tested < sample; lv++) {
    const w = S.generate(lv, 0, colonySeed(lv, 0))
    const subject = findSubject(S, w, kind)
    if (!subject) continue
    tested++
    const y0 = kind === "mine" ? subject.y : Math.floor(subject.y)
    const x0 = kind === "mine" ? subject.x : Math.floor(subject.x)
    digUnder(S, w, x0, y0 + 1)
    for (let k = 0; k < 40; k++) S.step(w)
    if (subjectY(kind, w, subject, y0) > y0) fell++
  }
  return { tested, fell }
}

// The same rule for the one thing on the board that is not held up by the
// floor. A ladder leans on a wall face, and a wall face is exactly the sort
// of thing a basher, a digger or a charge takes away — leaving, if nothing
// caught it, a ladder standing in mid air that the whole colony would queue
// up to climb.
export function ladderFalls(S, maxLevels = 200, sample = 10) {
  let hung = 0, gone = 0
  for (let lv = 1; lv <= maxLevels && hung < sample; lv++) {
    const w = S.generate(lv, 0, colonySeed(lv, 0))
    w.special = "ladder"; w.specialSpec = S.specialSpec("ladder"); w.specialAt = 1
    for (let t = 0; !w.done && t < 4000 && w.ladders.length === 0; t++) S.step(w)
    if (!w.ladders.length) continue
    hung++
    const lad = w.ladders[0]
    for (let y = lad.top + 1; y <= lad.bottom; y++) w.terrain[y * S.COLS + lad.x] = S.EMPTY
    S.step(w)
    if (!w.ladders.includes(lad)) gone++
  }
  return { hung, gone }
}

// A ladder can be posted up a wall whose approach is tucked beneath an
// overhang. Ordinary climbers correctly bump their heads there; the ladder's
// route must carry the whole colony through it, and back down it, or the
// visible rungs promise a path the simulation refuses to use.
function ladderUnderOverhang(S) {
  const w = S.generate(1, 0, colonySeed(1, 0))
  const x = 20, bottom = 30, top = 19
  for (let y = top - 4; y <= bottom + 1; y++)
    for (let xx = x - 2; xx <= x + 2; xx++) w.terrain[y * S.COLS + xx] = S.EMPTY
  for (let y = top + 1; y <= bottom; y++) w.terrain[y * S.COLS + x + 1] = S.DIRT
  w.terrain[(bottom - S.AGENT_H) * S.COLS + x] = S.DIRT
  w.ladders = [{ x: x + 1, side: 1, bottom, top, t: 14 }]
  return { w, x, bottom, top }
}

export function ladderOverhang(S) {
  const { w, x, bottom, top } = ladderUnderOverhang(S)
  const climber = { x: x + 0.5, y: bottom, dir: 1, state: "climb", anim: 0 }
  S.stepClimb(w, climber)
  const through = climber.state === "climb" && climber.y < bottom

  const descender = { x: x + 1.5, y: top, dir: -1, state: "walk", anim: 0 }
  S.edgeAhead(w, descender, descender.x - S.WALK_SPEED)
  for (let n = 0; descender.state === "climb" && n < 100; n++) S.stepClimb(w, descender)
  const descended = descender.state === "walk" && descender.y === bottom
    && descender.x === x + 0.5 && descender.dir === -1
  return { through, descended }
}

export function cmdGravity(S, maxLevels = 400, out = console.log) {
  for (const kind of ["block", "camp", "bomb", "mine"]) {
    const g = gravityOf(S, kind, maxLevels)
    // A few legitimately stay put: they are standing on steel, which nothing
    // removes.
    out(`  ${kind.padEnd(6)} ${g.fell}/${g.tested} came down when the floor went`)
  }
  const lad = ladderFalls(S, Math.min(maxLevels, 200))
  out(`  ladder ${lad.gone}/${lad.hung} came down when the wall went`)
  const o = ladderOverhang(S)
  out(`  ladder overhang ${o.through ? "climb continued" : "blocked the climb"}`)
  out(`  ladder descent ${o.descended ? "reached the bottom" : "failed"}`)
  return { ok: (!lad.hung || lad.gone === lad.hung) && o.through && o.descended, ladder: lad, overhang: o }
}

// Every special is barred from the floater budget, so every one carries a
// signature answer to a lethal height. Exercise the same bare shaft with the
// whole catalogue: this catches a missing mapping, a shared device, and a move
// that starts theatrically but never reaches its landing.
function bareShaft(S) {
  const w = S.generate(1, 0, colonySeed(1, 0))
  const x = 20, top = 20, bottom = 42
  for (let y = top - 10; y <= bottom; y++)
    for (let xx = x - 2; xx <= x + 3; xx++) w.terrain[y * S.COLS + xx] = S.EMPTY
  for (let xx = x - 2; xx <= x + 3; xx++) w.terrain[(bottom + 1) * S.COLS + xx] = S.DIRT
  return { w, x, top, bottom }
}

export function specialDescends(S, spec) {
  const { w, x, top, bottom } = bareShaft(S)
  const ag = { special: spec.id, x: x + 0.5, y: top, dir: 1, state: "walk",
    anim: 0, turns: 0, floater: false, fall: 0, timer: 0 }
  S.specialAtEdge(w, ag, ag.x + S.WALK_SPEED, bottom - top, -1)
  // A cushion is laid first and stepped on after: the first tick must hold.
  const held = spec.height !== "cushion" || ag.state !== "height"
    ? true
    : (S.stepSpecialHeight(w, ag), ag.y === top)
  for (let n = 0; (ag.state === "height" || ag.state === "rappel") && n < 500; n++) {
    if (ag.state === "height") S.stepSpecialHeight(w, ag)
    else S.stepRappel(w, ag)
  }
  return { safe: ag.state === "walk" && ag.y === bottom && held, ag }
}

const UPWARD = new Set(["recoil", "balloon", "helicopter", "ghost", "gunwing", "tractor", "chain", "jetpack"])

export function specialAscends(S, spec) {
  const w = S.generate(1, 0, colonySeed(1, 0))
  for (let y = 5; y < 46; y++) for (let x = 5; x < 36; x++) w.terrain[y * S.COLS + x] = S.EMPTY
  for (let x = 5; x < 36; x++) w.terrain[43 * S.COLS + x] = S.DIRT
  for (let x = 26; x < 31; x++) w.terrain[26 * S.COLS + x] = S.DIRT
  const ag = { special: spec.id, x: 20.5, y: 42, dir: 1, state: "walk", anim: 0, timer: 0, still: 0, turns: 0 }
  const started = S.startSpecialAscent(w, ag)
  for (let n = 0; ag.state === "height" && n < 500; n++) S.stepSpecialHeight(w, ag)
  return started && ag.state === "walk" && ag.y === 25
}

export function cmdHeights(S, out = console.log) {
  const modes = new Set()
  let passed = 0, ascended = 0
  for (const spec of S.SPECIALS) {
    const r = specialDescends(S, spec)
    modes.add(spec.height)
    if (r.safe) passed++
    else out(`  ${spec.name}: ${r.ag.state} at ${r.ag.x.toFixed(1)},${r.ag.y.toFixed(1)}`)
  }
  out(`  ${passed}/${S.SPECIALS.length} specials reached safe ground`)
  out(`  ${modes.size}/${S.SPECIALS.length} distinct height devices`)
  const upward = S.SPECIALS.filter(s => UPWARD.has(s.height))
  for (const spec of upward) {
    if (specialAscends(S, spec)) ascended++
    else out(`  ${spec.name}: upward move failed`)
  }
  out(`  ${ascended}/${UPWARD.size} powered devices reached the upper ledge`)
  const n = S.SPECIALS.length
  return { ok: passed === n && modes.size === n && ascended === UPWARD.size, passed, distinct: modes.size, ascended }
}

// How much does the colony matter? Play each level with several different
// colonies on the same ground and report how far apart they land. Before the
// colony was seeded per playthrough this command could only have printed zeros.
export function spreadOf(S, lv, colonies) {
  const runs = []
  for (let c = 0; c < colonies; c++) {
    const r = play(S, lv, 0, c)
    runs.push({ saved: r.w.saved, bar: clearBar(r.w), total: r.w.toRelease, secs: Math.round(r.ticks / 30) })
  }
  const saved = runs.map(r => r.saved), secs = runs.map(r => r.secs)
  return {
    lo: Math.min(...saved), hi: Math.max(...saved), total: runs[0].total,
    fast: Math.min(...secs), slow: Math.max(...secs),
    cleared: runs.filter(r => r.saved >= r.bar).length
  }
}

export function cmdSpread(S, levels, colonies, out = console.log) {
  let widthSum = 0, flips = 0
  for (let lv = 1; lv <= levels; lv++) {
    const s = spreadOf(S, lv, colonies)
    widthSum += s.hi - s.lo
    if (s.cleared > 0 && s.cleared < colonies) flips++
    if (lv <= 12) out(
      `level ${String(lv).padStart(3)}  home ${String(s.lo).padStart(2)}-${String(s.hi).padEnd(2)} of ${s.total}` +
      `   ${s.fast}-${s.slow}s   cleared by ${s.cleared}/${colonies}`)
  }
  out(`\n${levels} levels x ${colonies} colonies`)
  out(`average spread in agents home: ${(widthSum / levels).toFixed(1)}`)
  out(`levels where the colony decided it: ${flips} (${pct(flips, levels)}%)`)
  return { ok: true, spread: widthSum / levels, flips }
}

// How deadly each fixture is where it lands: placements over the catalogue
// with three colonies each, and the agents it killed. The average sits around
// 0.5. A kind far above it is either tuned wrong or (more often) one level
// where it landed somewhere the queue cannot avoid — read the level before
// changing the spec. A kind at zero is scenery the colony has learned to time.
export function hazardTally(S, levels) {
  const placed = {}, kills = {}
  for (let lv = 1; lv <= levels; lv++) for (let salt = 0; salt < 3; salt++) {
    for (const h of play(S, lv, 0, salt).w.hazards) {
      placed[h.kind] = (placed[h.kind] || 0) + 1
      kills[h.kind] = (kills[h.kind] || 0) + (h.kills || 0)
    }
  }
  return Object.keys(placed).map(k => [k, placed[k], kills[k], kills[k] / placed[k]]).sort((a, b) => b[3] - a[3])
}

export function cmdHazards(S, levels, out = console.log) {
  let p = 0, k = 0
  const rows = hazardTally(S, levels)
  for (const [kind, n, d, per] of rows) {
    p += n; k += d
    out(`  ${kind.padEnd(11)} placed ${String(n).padStart(4)}  kills ${String(d).padStart(4)}  ${per.toFixed(2)}`)
  }
  out(`  all         placed ${String(p).padStart(4)}  kills ${String(k).padStart(4)}  ${(k / Math.max(1, p)).toFixed(2)}`)
  return { ok: true, rows }
}

const COMMANDS = {
  play: (S, a) => cmdPlay(S, a[0] || 200),
  biomes: (S, a) => cmdBiomes(S, a[0] || 210),
  inert: (S) => cmdInert(S),
  gravity: (S) => cmdGravity(S),
  heights: (S) => cmdHeights(S),
  hazards: (S, a) => cmdHazards(S, a[0] || 440),
  spread: (S, a) => cmdSpread(S, a[0] || 60, a[1] || 8)
}

function main(argv) {
  const run = COMMANDS[argv[0] || "play"]
  if (!run) {
    console.error("usage: simcheck.js play|biomes|inert|gravity|heights|hazards|spread [levels] [colonies]")
    process.exit(2)
  }
  if (!run(loadSim(), argv.slice(1).map(Number)).ok) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
