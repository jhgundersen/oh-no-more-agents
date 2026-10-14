import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"
import { biomeTests, BIOME_COUNT, sample, image, ambience } from "./backdrops-biomes.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const phases = [0, 77, 240]

// Golden recorded from the committed renderer before this detail pass.
// These recipes have no simulation particles, so they need no Math.random.
test("all back walls and ambience retain their res-1 and unspecified-res bytes", () => {
  const hash = createHash("sha256")
  for (const name of Object.keys(THEMES)) for (let level = 1; level <= 12; level++)
    for (const res of [undefined, 1]) for (const ticks of phases) {
      const { w, theme, pal } = sample(level, name)
      w.res = res; w.ticks = ticks
      const img = image(w, theme.background, 1)
      D.drawBackdrop(img.ctx, w, pal)
      D.drawAmbience(img.ctx, w, pal)
      D.drawWaterLife(img.ctx, w, pal)
      hash.update(img.buf)
    }
  assert.equal(hash.digest("hex"), "30c620a9549b6a868a88941a6ed0ca1eab4970b80b81607587a83b508f3a078b")
})

biomeTests(1, Math.ceil(BIOME_COUNT / 2))   // the rest in backdrops-2.test.js

test("fine motes stay on half-pixels and never paint solid ground", () => {
  for (let level = 1; level <= S.BIOMES.length; level++) {
    const { w, pal } = sample(level)
    w.res = 2
    const img = image(w, "#000000", 2), fill = img.ctx.fillRect.bind(img.ctx)
    const fields = D.AMBIENCE[w.biome] || D.AMBIENCE_FINE_ONLY[w.biome] || [{ size: 1, col: "bubble" }]
    let marks = 0
    img.ctx.fillRect = (x, y, width, height) => {
      for (const n of [x, y, width, height]) assert.equal(n * 2, Math.round(n * 2))
      assert.ok(width > 0 && height > 0)
      for (let yy = y; yy < y + height; yy += 0.5) for (let xx = x; xx < x + width; xx += 0.5)
        assert.equal(w.terrain[Math.floor(yy / w.k.CELL) * w.k.COLS + Math.floor(xx / w.k.CELL)], w.k.EMPTY)
      marks++; fill(x, y, width, height)
    }
    // Entirely open water/air, including both leaf curls and all blink fields.
    w.terrain.fill(w.k.EMPTY)
    for (const ticks of [0, 12]) for (const spec of fields) {
      w.ticks = ticks; img.ctx.fillStyle = pal[spec.col]
      D.AMBIENCE_FINE[w.biome](img.ctx, w, pal, 20.5, 40.5, spec, 0)
    }
    assert.ok(marks > 0)
    // Block the neighbour of a half-pixel anchor at a cell boundary. Then
    // block all cells and prove that nothing is emitted, even at the edges.
    w.terrain[10 * w.k.COLS + 6] = w.k.ROCK
    for (const spec of fields) D.AMBIENCE_FINE[w.biome](img.ctx, w, pal, 23.5, 40.5, spec, 0)
    w.terrain.fill(w.k.ROCK)
    const count = marks
    for (const spec of fields) for (const [x, y] of [[20.5, 40.5], [-0.5, 0], [399.5, 247.5]])
      D.AMBIENCE_FINE[w.biome](img.ctx, w, pal, x, y, spec, 0)
    assert.equal(marks, count, "no weather through rock or world edges")
  }
})

test("an unknown biome has no fine wall and preserves canvas state", () => {
  const { w, theme, pal } = sample(1)
  w.biome = "Uncharted"; w.res = 2
  const img = image(w, theme.background, 2), bytes = img.buf.slice()
  const colour = img.ctx.fillStyle
  D.drawBackdrop(img.ctx, w, pal)
  assert.deepEqual(img.buf, bytes)
  assert.equal(img.ctx.fillStyle, colour)
  assert.equal(img.ctx.globalAlpha, 1)
})
