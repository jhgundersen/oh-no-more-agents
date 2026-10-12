import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const phases = [0, 3, 20, 45, 60]

function sample(spec, phase, dir, state) {
  return { special: spec.id, state, heightMode: spec.height, heightTick: phase,
    heightTicks: 60, heightUp: phase % 2 === 0, anim: phase, timer: phase % 15,
    dir, x: 25, y: 20, id: 1, heightFromX: 24, heightFromY: 12,
    heightToX: 30, heightToY: 30 }
}

function draw(img, w, pal, spec, phase, dir, state) {
  const fn = state === "height" ? D.drawAgentHeightGear : D.drawAgentTrick
  fn(img.ctx, w, pal, sample(spec, phase, dir, state), 100, 80, dir, spec.robe, spec.hair)
}

test("special devices at res 1 and unspecified res match the pre-detail bytes", () => {
  const hash = createHash("sha256"), w = S.generate(3, 0, 99)
  for (const name of Object.keys(THEMES)) {
    const theme = themeOf(name), pal = P.build(theme.theme, 3)
    for (const res of [undefined, 1]) for (const spec of S.SPECIALS)
      for (const dir of [1, -1]) for (const phase of phases) for (const state of ["height", "trick"]) {
        w.res = res; w.specialSpec = spec
        const img = canvas(240, 180, theme.background)
        draw(img, w, pal, spec, phase, dir, state)
        hash.update(img.buf)
      }
  }
  assert.equal(hash.digest("hex"), "2895e0209f861361f452602416f1ddcd30fc89c440c1c17be0052d497a53b765")
})

// Compare the coarse pass on a res-2 canvas with the fine pass on that same
// canvas. Upscaling a res-1 raster would conceal half-pixel differences.
for (const state of ["height", "trick"]) {
  const table = state === "height" ? D.GEAR_FINE : D.TRICK_FINE
  for (const [id, fn] of Object.entries(table || {})) {
    test(`${state} ${id} draws at both resolutions and adds fine pixels`, () => {
      // logchute is retained in the drawing catalogue without a current hero.
      const spec = S.SPECIALS.find(s => (state === "height" ? s.height : s.act) === id)
        || (id === "logchute" && { id, height: id, robe: "#8a4b22", hair: "#c8843f" })
      assert.ok(spec, "detailed item must have a drawing sample")
      const w = S.generate(3, 0, 99), theme = themeOf("tokyo-night")
      const pal = P.build(theme.theme, 3)
      w.specialSpec = spec
      for (const dir of [1, -1]) for (const phase of phases) {
        for (const res of [1, 2]) {
          w.res = res
          const img = canvas(240 * res, 180 * res, theme.background)
          img.ctx.setTransform(res, 0, 0, res, 0, 0)
          draw(img, w, pal, spec, phase, dir, state)
        }
        const coarse = canvas(480, 360, theme.background), fine = canvas(480, 360, theme.background)
        coarse.ctx.setTransform(2, 0, 0, 2, 0, 0)
        fine.ctx.setTransform(2, 0, 0, 2, 0, 0)
        w.res = 1; draw(coarse, w, pal, spec, phase, dir, state)
        w.res = 2; draw(fine, w, pal, spec, phase, dir, state)
        assert.equal(fine.ctx.globalAlpha, coarse.ctx.globalAlpha, "preserve the body's fade")
        assert.equal(fine.ctx.fillStyle, coarse.ctx.fillStyle, "preserve the device's canvas state")
        const emptySlab = state === "trick" && id === "slab" && phase % 15 === 0
        if (emptySlab) assert.deepEqual(fine.buf, coarse.buf, "zero-length slab has no detail")
        else assert.notDeepEqual(fine.buf, coarse.buf, `missing visible detail at phase ${phase}, dir ${dir}`)

        // The overlay must fit inside the existing device and use hard
        // half-pixel rectangles, including both phases of moving parts.
        const mask = canvas(480, 360, "#000000")
        mask.ctx.setTransform(2, 0, 0, 2, 0, 0)
        const fill = mask.ctx.fillRect.bind(mask.ctx)
        let marks = 0
        mask.ctx.fillRect = (x, y, width, height) => {
          for (const n of [x, y, width, height]) assert.equal(n * 2, Math.round(n * 2), "half-pixel grid")
          marks++; fill(x, y, width, height)
        }
        const ag = sample(spec, phase, dir, state)
        const fr = state === "height"
          ? { C: w.k.CELL, hm: spec.height, hp: phase / 60, hc: spec.hair }
          : { C: w.k.CELL, tsp: spec, reach: ag.timer / 14, tx: 100 + (dir > 0 ? 8 : 0), mid: 88 }
        fn(mask.ctx, w, pal, ag, 100, 80, dir, spec.robe, spec.hair, fr)
        assert.equal(marks > 0, !emptySlab)
        const shape = canvas(480, 360, "#000000")
        shape.ctx.setTransform(2, 0, 0, 2, 0, 0)
        w.res = 1; draw(shape, w, pal, spec, phase, dir, state)
        for (let i = 0; i < mask.buf.length; i += 3) {
          if (mask.buf[i] || mask.buf[i + 1] || mask.buf[i + 2])
            assert.ok(shape.buf[i] || shape.buf[i + 1] || shape.buf[i + 2],
              `outside silhouette at ${i / 3 % 480},${Math.floor(i / 1440)} phase ${phase}, dir ${dir}`)
        }
      }
    })
  }
}
