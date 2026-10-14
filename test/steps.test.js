import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"

// A step costs every agent a climber. The exit floor has no chasm to skip it
// by, so it gets one only if the way down has had none.

const S = loadCore("Sim.js")

test("the exit floor has no step when an earlier floor already has one", () => {
  let both = 0
  for (let lv = 1; lv <= 400; lv++) {
    const w = S.generate(lv, 0, 1), cs = w.corridors
    const earlier = cs.slice(0, w.exitCorridor).some(c => c.hasStep)
    if (earlier) both++
    assert.ok(!(earlier && cs[w.exitCorridor].hasStep), `level ${lv}`)
  }
  assert.ok(both > 20, "the rule has levels to apply to")
})

test("level 228 — two steps once, a quay and no climbers left — now gets its colony home", () => {
  for (const seed of [1, 733]) {
    const w = S.generate(228, 0, seed)
    while (!w.done && w.ticks < 9000) S.step(w)
    assert.ok(w.saved >= w.toRelease * 0.8, `${w.saved}/${w.toRelease}`)
  }
})
