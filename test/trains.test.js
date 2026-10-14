import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { levelWith } from "./levels.js"

// The Subway's train: on one floor of the route, between a platform past
// where the colony comes in and one short of where it leaves.

const S = loadCore("Sim.js")
const SUB = levelWith(S, "Subway", (w) => w.trains.length > 0)

test("trains are the Subway's, one per level at most, on a corridor floor, pointing the floor's way", () => {
  let found = 0
  for (let lv = 1; lv <= 360; lv++) {
    const w = S.generate(lv, 0, 5)
    if (w.biome !== "Subway") { assert.equal(w.trains.length, 0, `level ${lv}`); continue }
    assert.ok(w.trains.length <= 1)
    for (const tr of w.trains) {
      found++
      const c = w.corridors.find(c => c.floorY - 1 === tr.y)
      assert.ok(c, "on a corridor floor")
      assert.equal(tr.dir, c.dir)
      assert.ok((tr.bx - tr.ax) * tr.dir >= 12, "a real distance, the floor's way")
      assert.ok(S.solid(w, tr.ax, tr.y + 1) && S.solid(w, tr.bx, tr.y + 1))
    }
  }
  assert.ok(found > 0)
})

test("a walker at the platform rides to the far one and walks on the same way", () => {
  const w = S.generate(SUB, 0, 3), tr = w.trains[0]
  const ag = S.spawn(w)
  Object.assign(ag, { state: "walk", x: tr.ax + 0.5, y: tr.y, dir: tr.dir })
  w.agents = [ag]
  let t = 0
  while (ag.state !== "train" && t++ < 5) { w.ticks++; S.stepTrains(w) }
  assert.equal(ag.state, "train")
  while (ag.state === "train" && t++ < 2000) { w.ticks++; S.stepTrains(w) }
  assert.equal(ag.state, "walk")
  assert.equal(ag.x, tr.bx + 0.5)
  assert.equal(ag.dir, tr.dir)
  assert.ok(tr.trips >= 1)
})

test("nobody boards going the other way, or a special, or past the last few cells", () => {
  const w = S.generate(SUB, 0, 3), tr = w.trains[0]
  const back = S.spawn(w), hero = S.spawn(w), late = S.spawn(w)
  Object.assign(back, { state: "walk", x: tr.ax + 0.5, y: tr.y, dir: -tr.dir })
  Object.assign(hero, { state: "walk", x: tr.ax + 0.5, y: tr.y, dir: tr.dir, special: true })
  Object.assign(late, { state: "walk", x: tr.bx - tr.dir + 0.5, y: tr.y, dir: tr.dir })
  w.agents = [back, hero, late]
  tr.x = tr.bx - tr.dir
  S.stepTrains(w)
  assert.deepEqual([back.state, hero.state, late.state], ["walk", "walk", "walk"])
})

test("the train speeds up out of a station and stops exactly at the next", () => {
  const tr = { x: 10, v: 0 }
  let n = 0, top = 0
  while (!S.trainMove(tr, 40) && n++ < 500) top = Math.max(top, tr.v)
  assert.equal(tr.x, 40)
  assert.equal(tr.v, 0)
  assert.ok(top <= S.TRAIN_SPEED + 1e-9 && top > S.TRAIN_SPEED / 2)
})
