import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { levelWith } from "./levels.js"

// The Rooftops' lines: strung across a crossing at head height, ridden on an
// agent's own (closed) umbrella hooked over them.

const S = loadCore("Sim.js")
const ROOF = levelWith(S, "Rooftops", (w) => w.ziplines.length > 0)

test("lines are the Rooftops', and only span crossings, lip to lip on one floor", () => {
  let found = 0
  for (let lv = 1; lv <= 340; lv++) {
    const w = S.generate(lv, 0, 5)
    if (w.biome !== "Rooftops") { assert.equal(w.ziplines.length, 0, `level ${lv}`); continue }
    for (const z of w.ziplines) {
      found++
      const p = w.pits.find(p => p.crossing && p.floorY - 1 === z.ay)
      assert.ok(p, "over a crossing")
      assert.equal(z.ly, z.ay, "level, lip to lip")
      const lo = Math.min(z.ax, z.lx), hi = Math.max(z.ax, z.lx)
      assert.ok(lo < p.x0 && hi > p.x1, "spans the whole pit")
      assert.ok(S.solid(w, z.ax, z.ay + 1) && S.solid(w, z.lx, z.ly + 1), "ground at both ends")
      assert.ok(S.zipClear(w, z))
    }
  }
  assert.ok(found > 0)
})

function underLine() {
  const w = S.generate(ROOF, 0, 3), z = w.ziplines[0]
  const ag = S.spawn(w)
  ag.state = "walk"; ag.x = z.ax + 0.5; ag.y = z.ay; ag.dir = z.dir
  w.agents = [ag]
  return { w, z, ag }
}

test("a walker under the near end rides across and walks on the same way, toolbar untouched", () => {
  const { w, z, ag } = underLine()
  const tools = JSON.stringify(w.skills)
  S.stepZiplines(w)
  assert.equal(ag.state, "zip")
  assert.equal(z.riders, 1)
  let t = 0, prev = ag.zipS
  while (ag.state === "zip" && t++ < 400) {
    w.ticks++; S.stepZiplines(w)
    if (ag.state === "zip") { assert.ok(ag.zipS > prev, "always onward"); prev = ag.zipS }
  }
  assert.equal(ag.state, "walk")
  assert.equal(ag.dir, z.dir)
  assert.ok(Math.abs(ag.x - (z.lx + 0.5)) < 0.01, "let go over the far end")
  assert.equal(JSON.stringify(w.skills), tools)
})

test("nobody boards against the line's way, a special never does, and riders are spaced", () => {
  const { w, z, ag } = underLine()
  ag.dir = -z.dir
  S.stepZiplines(w)
  assert.equal(ag.state, "walk")
  ag.dir = z.dir; ag.special = true
  S.stepZiplines(w)
  assert.equal(ag.state, "walk")
  ag.special = false
  const b = S.spawn(w)
  Object.assign(b, { state: "walk", x: z.ax + 0.5, y: z.ay, dir: z.dir })
  w.agents.push(b)
  S.stepZiplines(w)
  assert.equal([ag, b].filter(a => a.state === "zip").length, 1, "one at a time at the top")
})
