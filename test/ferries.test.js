import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { levelWith } from "./levels.js"

// The Harbour's ferry: the Subway's train over a water crossing.
const S = loadCore("Sim.js")
const HAR = levelWith(S, "Harbour", (w) => w.trains.some(t => t.boat))

test("ferries are the Harbour's, over its crossings, with the water up to the quay", () => {
  let found = 0
  for (let lv = 1; lv <= 380; lv++) {
    const w = S.generate(lv, 0, 5)
    const boats = w.trains.filter(t => t.boat)
    if (w.biome !== "Harbour") { assert.equal(boats.length, 0, `level ${lv}`); continue }
    for (const p of w.pits) { assert.equal(p.liquid, "water"); assert.equal(p.surfaceY, p.floorY + 1) }
    for (const f of boats) {
      found++
      const p = w.pits[f.pit]
      assert.ok(p.crossing)
      assert.ok(Math.min(f.ax, f.bx) < p.x0 && Math.max(f.ax, f.bx) > p.x1, "quay to quay across the water")
    }
  }
  assert.ok(found > 0)
})

test("a walker at the near quay is carried across and put ashore walking on", () => {
  const w = S.generate(HAR, 0, 3), f = w.trains.find(t => t.boat)
  const ag = S.spawn(w)
  Object.assign(ag, { state: "walk", x: f.ax + 0.5, y: f.y, dir: f.dir })
  w.agents = [ag]
  let t = 0
  while (ag.state !== "walk" || t < 3) { w.ticks++; S.stepTrains(w); if (++t > 2000) break }
  assert.equal(ag.state, "walk")
  assert.equal(ag.x, f.bx + 0.5)
  assert.equal(ag.dir, f.dir)
})
