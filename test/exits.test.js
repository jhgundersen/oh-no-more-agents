import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")

test("exit frames at res 1 and unspecified res match the pre-detail pixels", () => {
  // Captured before changing Draw.js: all twelve generated exits in all five
  // themes, including the absent w.res used by the QML host (120 rasters).
  // The twelve biomes it was pinned on: levels 1–12 are the same biomes and the
  // same layouts whatever is appended to BIOMES later.
  const hash = createHash("sha256")
  for (let level = 1; level <= 12; level++) {
    const w = S.generate(level, 0, 3)
    for (const name of Object.keys(THEMES)) for (const res of [undefined, 1]) {
      w.res = res
      const theme = themeOf(name), img = canvas(400, 248, theme.background)
      D.drawExitBack(img.ctx, w, P.build(theme.theme, level))
      hash.update(img.buf)
    }
  }
  assert.equal(hash.digest("hex"), "3751fa33d57102a143446b775b52d01ac95b13214fd579a3dcaffaf4443ac6f1")
})

for (let level = 1; level <= S.BIOMES.length; level++) {
  const biome = S.BIOMES[level - 1]
  test(`${biome} exit draws at both resolutions and adds fine pixels inside its frame`, () => {
    assert.equal(typeof D.EXIT_FINE[biome], "function", "every biome has a fine drawing")
    const w = S.generate(level, 0, 3), e = w.exit, C = w.k.CELL
    for (const name of Object.keys(THEMES)) {
      const theme = themeOf(name), pal = P.build(theme.theme, level)
      for (const res of [1, 2]) {
        w.res = res
        const img = canvas(400 * res, 248 * res, "#000000")
        img.ctx.setTransform(res, 0, 0, res, 0, 0)
        assert.doesNotThrow(() => D.drawExitBack(img.ctx, w, pal))
        assert.ok(img.buf.some(n => n !== 0), "exit drew nothing")
      }

      // Coarse art rasterised at 2x supplies the actual silhouette. Compare
      // with the fine pass at that same canvas size, rather than an upscaled
      // PNG with unrelated shimmer pixels mixed into it.
      const coarse = canvas(800, 496, "#000000"), fine = canvas(800, 496, "#000000")
      coarse.ctx.setTransform(2, 0, 0, 2, 0, 0)
      fine.ctx.setTransform(2, 0, 0, 2, 0, 0)
      w.res = 1
      D.drawExitBack(coarse.ctx, w, pal)
      w.res = 2
      D.drawExitBack(fine.ctx, w, pal)
      assert.notDeepEqual(fine.buf, coarse.buf, "res 2 must add visible detail")

      const marks = canvas(800, 496, "#000000")
      marks.ctx.setTransform(2, 0, 0, 2, 0, 0)
      const fill = marks.ctx.fillRect.bind(marks.ctx)
      let rectangles = 0
      marks.ctx.fillRect = (x, y, width, height) => {
        for (const n of [x, y, width, height]) assert.equal(n * 2, Math.round(n * 2), "half-pixel grid")
        assert.equal(marks.ctx.globalAlpha, 1, "opaque detail")
        assert.ok(Object.values(pal).includes(marks.ctx.fillStyle), "existing palette")
        rectangles++
        fill(x, y, width, height)
      }
      D.EXIT_FINE[biome](marks.ctx, pal, e.x * C, e.y * C, e.w * C, e.h * C)
      assert.ok(rectangles > 0, "missing fine rectangles")
      for (let i = 0; i < marks.buf.length; i += 3) {
        if (!(marks.buf[i] || marks.buf[i + 1] || marks.buf[i + 2])) continue
        assert.ok(coarse.buf[i] || coarse.buf[i + 1] || coarse.buf[i + 2],
          `${name}: fine pixel outside silhouette at ${i / 3 % 800},${Math.floor(i / 2400)}`)
      }
    }
  })
}

test("unknown biome retains the Cavern fine-frame fallback", () => {
  const w = S.generate(1, 0, 3), theme = themeOf("tokyo-night"), pal = P.build(theme.theme, 1)
  const known = canvas(800, 496), unknown = canvas(800, 496)
  known.ctx.setTransform(2, 0, 0, 2, 0, 0)
  unknown.ctx.setTransform(2, 0, 0, 2, 0, 0)
  w.res = 2
  D.drawExitBack(known.ctx, w, pal)
  w.biome = "unknown"
  D.drawExitBack(unknown.ctx, w, pal)
  assert.deepEqual(unknown.buf, known.buf)
})
