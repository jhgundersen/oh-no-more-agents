import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const phases = [0, 77, 240]

// The per-biome half of backdrops.test.js, sharded so the biomes run in two
// processes: this file was the critical path of `npm run coverage`.
export const BIOME_COUNT = S.BIOMES.length

export function sample(level, name = "tokyo-night") {
  const w = S.generate(level, 0, 99), theme = themeOf(name)
  return { w, theme, pal: P.build(theme.theme, level) }
}

export function image(w, background, scale) {
  const img = canvas(w.k.COLS * w.k.CELL * scale, w.k.ROWS * w.k.CELL * scale, background)
  img.ctx.setTransform(scale, 0, 0, scale, 0, 0)
  return img
}

export function ambience(ctx, w, pal) {
  D.drawAmbience(ctx, w, pal)
  if (w.biome === "Trench") D.drawWaterLife(ctx, w, pal)
}

export function biomeTests(from, to) {
for (let level = from; level <= to; level++) {
  const biome = S.generate(level, 0, 99).biome
  for (const [kind, draw] of [["backdrop", D.drawBackdrop], ["ambience", ambience]]) {
    test(`${biome} ${kind} draws at res 1 and 2 and adds fine pixels`, () => {
      assert.equal(typeof D.BACKDROP_FINE[biome], "function")
      assert.equal(typeof D.AMBIENCE_FINE[biome], "function")
      for (const name of Object.keys(THEMES)) for (const ticks of phases) {
        const { w, theme, pal } = sample(level, name)
        w.ticks = ticks
        for (const res of [1, 2]) {
          w.res = res
          assert.doesNotThrow(() => draw(image(w, theme.background, res).ctx, w, pal))
        }
        // Hold the canvas scale at 2 for BOTH passes; only the detail guard
        // changes. Comparing resized rasters would confound rounding/motion.
        const coarse = image(w, theme.background, 2), fine = image(w, theme.background, 2)
        w.res = 1; draw(coarse.ctx, w, pal)
        w.res = 2; draw(fine.ctx, w, pal)
        assert.notDeepEqual(fine.buf, coarse.buf, `missing visible ${kind}, ${name}, tick ${ticks}`)
        assert.equal(fine.ctx.globalAlpha, coarse.ctx.globalAlpha, "preserve canvas alpha")
        assert.equal(fine.ctx.fillStyle, coarse.ctx.fillStyle, "preserve canvas colour")
      }
    })
  }

  test(`${biome} fine wall uses dark half-pixels within the existing silhouette`, () => {
    // A second layout exercises more seeded dimensions and broken arches.
    for (const lv of [level, level + S.BIOMES.length]) {
      const { w, pal } = sample(lv)
      const mask = image(w, "#000000", 2), coarse = image(w, "#000000", 2)
      const fill = mask.ctx.fillRect.bind(mask.ctx)
      let marks = 0
      mask.ctx.fillRect = (x, y, width, height) => {
        for (const n of [x, y, width, height]) assert.equal(n * 2, Math.round(n * 2), "hard half-pixel grid")
        assert.ok(width > 0 && height > 0, "positive rectangles")
        assert.ok([pal.back, pal.backDim, pal.backLit].includes(mask.ctx.fillStyle), "quiet wall palette")
        assert.ok(mask.ctx.globalAlpha <= 0.4, "subtle wall strength")
        marks++; fill(x, y, width, height)
      }
      D.drawBackdropFine(mask.ctx, w, pal)
      assert.ok(marks > 0, "visible fine wall marks")
      w.res = 1; D.drawBackdrop(coarse.ctx, w, pal)
      for (let i = 0; i < mask.buf.length; i += 3) {
        if (!(mask.buf[i] || mask.buf[i + 1] || mask.buf[i + 2])) continue
        const y = Math.floor(i / 3 / mask.W) / 2
        if (biome === "Skyscraper") assert.ok(y >= w.k.SKY * w.k.CELL, "office joints stay below skyline")
        else assert.ok(coarse.buf[i] || coarse.buf[i + 1] || coarse.buf[i + 2], "inside coarse backdrop")
      }
    }
  })
}
}
