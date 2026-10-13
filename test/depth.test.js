import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js")

// The depth pass shades solid ground by its distance from open air. A cell
// touching air (including diagonally) is the surface and stays unshaded; the
// count grows by one per cell inward and stops at the deepest shade.
test("terrain depth counts cells from the nearest open air", () => {
  const w = S.generate(1, 0, 7), k = w.k, T = w.terrain
  const d = D.terrainDepth(w)
  const max = D.DEPTH_SHADE.length - 1
  for (let y = 0; y < k.ROWS; y++) for (let x = 0; x < k.COLS; x++) {
    const n = y * k.COLS + x
    if (T[n] === k.EMPTY) { assert.equal(d[n], 0); continue }
    let near = max
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy
      if ((dx || dy) && xx >= 0 && yy >= 0 && xx < k.COLS && yy < k.ROWS) near = Math.min(near, d[yy * k.COLS + xx])
    }
    assert.equal(d[n], Math.min(max, near + 1), `cell ${x},${y}`)
  }
})

test("depth shading starts below the surface and only darkens inward", () => {
  assert.equal(D.DEPTH_SHADE[0], 0)
  assert.equal(D.DEPTH_SHADE[1], 0)
  for (let i = 2; i < D.DEPTH_SHADE.length; i++) assert.ok(D.DEPTH_SHADE[i] > D.DEPTH_SHADE[i - 1])
})
