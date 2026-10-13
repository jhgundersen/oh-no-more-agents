import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"

// The wall sniper (Long Context): picks the nearest agent in reach and in
// line, follows it while it winds up, drops it if it gets behind something,
// fires once, and reloads for a long while.

const S = loadCore("Sim.js")

function withSniper() {
  for (let lv = 1; lv < 600; lv++) {
    const w = S.generate(lv, 0, 3)
    const h = w.hazards.find(h => h.kind === "sniper")
    if (h) return { w, h, spec: S.hazardSpec("sniper") }
  }
  throw new Error("no sniper")
}

function inSight(w, h) {
  const sx = (h.zx0 + h.zx1) / 2, sy = Math.round((h.zy0 + h.zy1) / 2)
  for (let x = Math.round(sx) + 6; x < Math.round(sx) + 30; x++)
    for (let y = sy - 3; y <= sy + 3; y++)
      if (S.solid(w, x, y + 1) && !S.solid(w, x, y) && !S.solid(w, x, y - 1)
          && S.lineClear(w, Math.round(sx), sy, x, y - 1)) return { x: x + 0.5, y }
  for (let x = Math.round(sx) - 6; x > Math.round(sx) - 30; x--)
    for (let y = sy - 3; y <= sy + 3; y++)
      if (S.solid(w, x, y + 1) && !S.solid(w, x, y) && !S.solid(w, x, y - 1)
          && S.lineClear(w, Math.round(sx), sy, x, y - 1)) return { x: x + 0.5, y }
  return null
}

test("the sniper acquires, winds up, fires once and reloads", () => {
  const { w, h, spec } = withSniper()
  const spot = inSight(w, h)
  assert.ok(spot, "somewhere it can see")
  const ag = S.spawn(w)
  Object.assign(ag, { x: spot.x, y: spot.y, state: "walk", dir: 1 })
  w.agents = [ag]
  w.skills.floater = 0
  h.phase = "idle"; h.t = 0
  const phases = []
  for (let t = 0; t < spec.charge + spec.fire + spec.rest + 10; t++) {
    S.stepSniper(w, h, spec)
    h.t++
    if (phases[phases.length - 1] !== h.phase) phases.push(h.phase)
  }
  assert.deepEqual(phases.slice(0, 4), ["charge", "fire", "rest", "idle"])
  assert.ok(ag.gone, "the shot lands")
  assert.equal(S.sniperTarget(w, h), null, "nobody targeted after")
})

test("a target that steps out of the line is dropped", () => {
  const { w, h, spec } = withSniper()
  const spot = inSight(w, h)
  const ag = S.spawn(w)
  Object.assign(ag, { x: spot.x, y: spot.y, state: "walk", dir: 1 })
  w.agents = [ag]
  h.phase = "idle"; h.t = 0
  S.stepSniper(w, h, spec)
  assert.equal(h.phase, "charge")
  assert.equal(S.sniperTarget(w, h), ag)
  ag.state = "saved"
  assert.equal(S.sniperTarget(w, h), null)
  S.stepSniper(w, h, spec)
  assert.equal(h.phase, "idle")
  assert.equal(h.targetId, undefined)
})
