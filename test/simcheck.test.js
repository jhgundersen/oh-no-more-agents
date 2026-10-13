import test from "node:test"
import assert from "node:assert/strict"
import * as C from "../tools/simcheck.js"

// The simulation's own regression checks (tools/simcheck.js), run small: the
// cheap ones in full on every `npm test`, the long playthroughs on a level or
// two so the harness itself is known to work.

const S = C.loadSim()
const quiet = () => {}

test("every special survives a lethal drop on its own device, all distinct; the powered ones climb", () => {
  const r = C.cmdHeights(S, quiet)
  assert.ok(r.ok, JSON.stringify(r))
  assert.equal(r.passed, S.SPECIALS.length)
})

test("a ladder under an overhang carries the colony through it, both ways", () => {
  assert.deepEqual(C.ladderOverhang(S), { through: true, descended: true })
})

test("a blocker and a planted charge come down when the floor goes", () => {
  for (const kind of ["block", "mine"]) {
    const g = C.gravityOf(S, kind, 60, 2)
    assert.ok(g.tested > 0, kind)
    assert.equal(g.fell, g.tested, kind)
  }
})

test("a ladder comes down when its wall goes", () => {
  const l = C.ladderFalls(S, 60, 2)
  assert.ok(l.hung > 0)
  assert.equal(l.gone, l.hung)
})

test("earth materials are inert on a sample", () => {
  assert.ok(C.cmdInert(S, 2, quiet).ok)
})

test("the playthrough harnesses run and report", () => {
  const lines = []
  const out = (s) => lines.push(s)
  assert.ok(C.cmdPlay(S, 2, out).ok)
  assert.ok(C.cmdBiomes(S, 2, out).ok)
  assert.ok(C.cmdSpread(S, 1, 2, out).ok)
  assert.ok(C.cmdHazards(S, 1, out).ok)
  assert.ok(C.cmdGravity(S, 20, out).ok !== undefined)
  assert.ok(lines.some(l => /hangs 0/.test(l)))
  assert.equal(C.clearBar({ toRelease: 10 }), 7)
})
