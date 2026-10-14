import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"

// A walker whose floor is taken out from under it falls. advanceWalk only
// looks ahead, so before stepWalk checked its own footing it turned on the
// spot in mid-air until the still rule bombed it (level 284).

const S = loadCore("Sim.js")

function walkerOnBoard() {
  const w = S.generate(284, 0, 2001)
  while (!w.agents.some(a => a.state === "walk")) S.step(w)
  return [w, w.agents.find(a => a.state === "walk")]
}

test("a walker with no floor under it starts to fall", () => {
  const [w, ag] = walkerOnBoard()
  const x = Math.floor(ag.x), below = Math.floor(ag.y) + 1
  for (let dx = -1; dx <= 1; dx++) w.terrain[below * S.COLS + x + dx] = 0
  S.stepWalk(w, ag)
  assert.equal(ag.state, "fall")
})

test("it opens an umbrella for a fall that would kill it, when the colony has one", () => {
  const [w, ag] = walkerOnBoard()
  const x = Math.floor(ag.x)
  for (let y = Math.floor(ag.y) + 1; y < S.ROWS - 2; y++) w.terrain[y * S.COLS + x] = 0
  ag.floater = false
  const umbrellas = w.skills.floater
  S.stepWalk(w, ag)
  assert.equal(ag.state, "fall")
  assert.ok(ag.floater)
  assert.equal(w.skills.floater, umbrellas - 1)
})

// A floor dug out later in the same tick is noticed on the next one, so the
// rule is: never unsupported for two ticks running.
test("nobody walks in mid-air during real play", () => {
  for (const lv of [2, 3, 5, 284]) {
    const w = S.generate(lv, 0, lv * 31 + 7), air = new Set()
    while (!w.done && w.ticks < 6000) {
      S.step(w)
      for (const a of w.agents) {
        const now = !a.gone && a.state === "walk" && !S.solid(w, Math.floor(a.x), Math.floor(a.y) + 1)
        if (now) assert.ok(!air.has(a.id), `level ${lv} tick ${w.ticks} agent ${a.id}`)
        if (now) air.add(a.id); else air.delete(a.id)
      }
    }
  }
})
