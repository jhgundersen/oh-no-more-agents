import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"

// Merge conflicts: two walkers nose to nose in a tunnel their own height.
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), O = loadCore("Outcome.js")

// A tunnel along row 29 with its ceiling at row 25, home to the east.
function tunnel() {
  const w = S.generate(1, 0, 3), k = w.k
  w.terrain.fill(k.EMPTY)
  for (let x = 0; x < k.COLS; x++) { w.terrain[30 * k.COLS + x] = k.DIRT; w.terrain[25 * k.COLS + x] = k.DIRT }
  w.pits = []; w.hazards = []; w.enemies = []; w.lifts = []
  w.exit = { x: 90, y: 25, w: 6, h: 5 }
  w.conflictRng = () => 0
  const east = Object.assign(S.spawn(w), { x: 40.2, y: 29, dir: 1, state: "walk" })
  const west = Object.assign(S.spawn(w), { x: 41.0, y: 29, dir: -1, state: "walk" })
  w.agents = [east, west]
  return { w, east, west }
}

test("nose to nose in a tunnel: both hold, the one walking away from home yields, then both carry on", () => {
  const { w, east, west } = tunnel()
  S.stepConflicts(w)
  assert.equal(east.conflictFor, S.CONFLICT_HOLD)
  assert.equal(west.conflictFor, S.CONFLICT_HOLD + S.CONFLICT_YIELD, "west is walking away from home")
  assert.equal(east.conflictSide, -west.conflictSide)
  const xs = [east.x, west.x]
  for (let t = 0; t < S.CONFLICT_HOLD - 1; t++) { w.ticks++; S.agentActs(w, east); S.agentActs(w, west) }
  assert.deepEqual([east.x, west.x], xs, "nobody moves during the beat")
  for (let t = 0; t < S.CONFLICT_YIELD + 2; t++) { w.ticks++; S.agentActs(w, east); S.agentActs(w, west) }
  assert.equal(east.conflictFor, 0); assert.equal(west.conflictFor, 0)
  assert.equal(west.dir, -1, "rebasing costs a wait, not a turn")
  assert.equal(w.conflicts, 1)
  assert.match(w.feed.at(-1).text, /MERGE CONFLICT · .* REBASED/)
})

test("only in a tunnel, only for ordinary walkers facing each other, rarely, and never twice in a row", () => {
  const open = tunnel(); for (let x = 0; x < open.w.k.COLS; x++) open.w.terrain[25 * open.w.k.COLS + x] = open.w.k.EMPTY
  S.stepConflicts(open.w); assert.equal(open.east.conflictFor, 0, "open air: they just pass")
  const away = tunnel(); away.west.dir = 1; away.west.x = 41
  S.stepConflicts(away.w); assert.equal(away.east.conflictFor, 0, "same direction")
  const hero = tunnel(); hero.west.special = "wraith"
  S.stepConflicts(hero.w); assert.equal(hero.east.conflictFor, 0, "heroes have their own ways")
  const coin = tunnel(); coin.w.conflictRng = () => 0.99
  S.stepConflicts(coin.w); assert.equal(coin.east.conflictFor, 0, "the coin said no")
  assert.ok(coin.w.nextConflictAt > coin.w.ticks, "and that spends the chance for a while")
})

test("a fall ends the beat at once", () => {
  const { w, east } = tunnel()
  S.stepConflicts(w)
  east.state = "fall"
  assert.equal(S.conflicted(w, east), false); assert.equal(east.conflictFor, 0)
})

test("played levels end with nobody still in a conflict", () => {
  let seen = 0
  for (let level = 1; level <= 30; level++) {
    const w = S.generate(level, 0, level * 613)
    w.conflictRng = () => 0
    while (!w.done && w.ticks < 6000) S.step(w)
    assert.ok(w.done, `level ${level} hung`)
    assert.ok(w.agents.every(a => !(a.conflictFor > 0) || a.gone || a.state === "saved"))
    seen += w.conflicts
  }
  assert.ok(seen >= 2, `conflicts happen (${seen})`)
})

test("the bubbles, the commit line and the outcome", () => {
  const w = { ...S.generate(1, 0, 3), ticks: 100 }
  assert.equal(D.quipFor(w, { conflictAt: 95, conflictSide: 1 }).text, "<<<<<<<")
  assert.equal(D.quipFor(w, { conflictAt: 95, conflictSide: -1 }).text, ">>>>>>>")
  assert.ok(D.quipFor(w, { conflictAt: 95, conflictSide: 1 }).lift > 0, "the two bubbles stack instead of overlapping")
  assert.ok(!D.quipFor(w, { conflictAt: 95, conflictSide: -1 }).lift)
  assert.equal(D.quipFor(w, { conflictAt: 70, rebasedAt: 99 }).text, "REBASED")
  for (const ch of "<>=") assert.ok(D.TRANSITION_GLYPHS[ch])
  assert.match(D.commitLine({ ...w, saved: 5, toRelease: 10, lost: 0, conflicts: 2, hallucinations: 0, hazardKills: 0, brollyLandings: 0, eventLog: [] }), /2 MERGE CONFLICTS/)
  assert.ok(O.EVENT_LINES.conflict.length >= 3)
})
