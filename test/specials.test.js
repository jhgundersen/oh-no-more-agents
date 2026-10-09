import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"

const S = loadCore("Sim.js")

test("backoff falls in four drops with growing waits", () => {
  assert.equal(S.backoffCurve(0), 0)
  assert.equal(S.backoffCurve(1), 1)
  let last = 0, holds = 0, wasHolding = false
  for (let i = 1; i <= 1100; i++) {
    const v = S.backoffCurve(i / 1100)
    assert.ok(v >= last, "never rises back up")
    const holding = v === last
    if (holding && !wasHolding) holds++
    wasHolding = holding
    last = v
  }
  assert.equal(holds, 3)
})

test("Rate Limiter freezes a fixture and the colony stops treating it as lethal", () => {
  // Level 17 with this colony meets a hazard at about tick 300.
  const w = S.generate(17, 0, 134636)
  let t = 0
  while (!w.hazards.some(h => h.throttled > 0) && t++ < 2000) S.step(w)
  const h = w.hazards.find(h => h.throttled > 0)
  assert.ok(h, "the special throttled something")
  const phase = h.phase
  const mid = S.hazardMid(h)
  assert.equal(S.hazardZoneAt(w, Math.round(mid.x), Math.round(mid.y), true), null)
  for (let i = 0; i < 50; i++) S.step(w)
  assert.equal(h.phase, phase, "frozen in place")
  while (h.throttled > 0) S.step(w)
  assert.equal(h.phase, "rest", "comes back through rest, not mid-shot")
})
