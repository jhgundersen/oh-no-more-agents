import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

// Drips: water falling from ceiling cracks in the wet biomes, and the
// umbrella a walker puts up under one. Draw-only, page resolution only.

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const theme = themeOf("tokyo-night"), pal = P.build(theme.theme, 8)

function levelIn(biome) {
  for (let lv = 1; lv < 200; lv++) { const w = S.generate(lv, 0, 3); if (w.biome === biome) return w }
}

test("drips only in the wet biomes, only at page resolution, from the terrain alone", () => {
  for (let lv = 1; lv <= 40; lv++) {
    const w = S.generate(lv, 0, 3)
    w.res = 1
    assert.deepEqual(D.dripSpots(w), [], "none on the panel")
    w.res = 2
    const spots = D.dripSpots(w)
    if (!D.DRIP_BIOMES[w.biome]) { assert.deepEqual(spots, []); continue }
    const other = S.generate(lv, 0, 9); other.res = 2
    assert.deepEqual(spots, D.dripSpots(other), "the colony does not move the cracks")
    for (const d of spots) {
      const C = w.k.COLS
      assert.ok(w.terrain[(d.top - 1) * C + d.x], "under solid ceiling")
      for (let y = d.top; y < d.floor; y++) assert.equal(w.terrain[y * C + d.x], 0, "open fall")
      assert.ok(w.terrain[d.floor * C + d.x], "onto a floor")
    }
  }
})

test("a walker under a drop puts its umbrella up for the drop and its splash", () => {
  // A crack with no other within reach of the "beside it" check below.
  let w, d
  for (let lv = 1; lv < 400 && !d; lv++) {
    w = S.generate(lv, 0, 3); w.res = 2
    const spots = D.dripSpots(w)
    d = spots.find(s => spots.every(o => o === s || Math.abs(o.x - s.x) > 6))
  }
  const ag = { id: 1, x: d.x + 0.5, y: d.floor - 1, state: "walk", gone: false, dir: 1 }
  w.agents = [ag]
  const up = []
  for (let t = 0; t < d.period; t++) { w.ticks = t; up.push(D.dripOver(w, ag)) }
  const share = up.filter(Boolean).length / up.length
  assert.ok(share > 0.1 && share < 0.6, `up some of the time (${share})`)
  ag.x += 4
  for (let t = 0; t < d.period; t++) { w.ticks = t; assert.equal(D.dripOver(w, ag), false, "not when beside it") }
  ag.x -= 4; ag.state = "climb"
  w.ticks = up.indexOf(true); assert.equal(D.dripOver(w, ag), false, "walkers only")
})

test("drawing drips is read-only, deterministic and on the half-pixel grid", () => {
  const w = levelIn("Cavern"); w.res = 2
  while (w.ticks < 200) S.step(w)
  const random = Math.random
  Math.random = () => { throw Error("drips must not consume RNG") }
  try {
    for (let t = 200; t < 340; t += 3) {
      w.ticks = t
      const img = canvas(400 * 2, 248 * 2, theme.background)
      img.ctx.setTransform(2, 0, 0, 2, 0, 0)
      const rect = img.ctx.fillRect.bind(img.ctx)
      img.ctx.fillRect = (x, y, width, height) => {
        for (const n of [x, y, width, height]) assert.equal(n * 2, Math.round(n * 2), "half-pixel grid")
        rect(x, y, width, height)
      }
      const before = JSON.stringify(w)
      D.drawDrips(img.ctx, w, pal)
      assert.equal(JSON.stringify(w), before)
      assert.equal(img.ctx.globalAlpha, 1)
    }
  } finally { Math.random = random }
})
