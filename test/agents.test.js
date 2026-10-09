import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

// The agent in every state it can be in, with every overlay a state can carry
// (plate, spark, signal, net, wounds, infection, a model-collapse copy), dry
// and under water, at the panel's res and the page's, as an ordinary agent and
// as each special. Nothing may throw and every pose must put something down.
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const STATES = ["walk", "fall", "climb", "height", "rappel", "webup", "slide", "stunned", "block", "build",
  "bash", "dig", "swim", "saved", "bomb", "camp", "ride", "trick", "ceil", "wait"]

for (const submerged of [false, true]) {
  test(`every agent pose draws${submerged ? " under water" : ""}`, () => {
    const theme = themeOf("tokyo-night")
    for (const res of [1, 2]) for (const spec of [null, ...S.SPECIALS]) {
      const w = S.generate(3, 0, 99)
      w.res = res; w.ticks = 77; w.submerged = submerged; w.specialSpec = spec
      const pal = P.build(theme.theme, 3)
      for (const state of STATES) for (const v of [0, 1]) {
        const img = canvas(80 * res, 80 * res, theme.background)
        img.ctx.setTransform(res, 0, 0, res, 0, 0)
        const blank = Buffer.from(img.buf).toString("base64")
        D.drawAgent(img.ctx, w, pal, {
          id: 5, x: 10, y: 15, dir: v ? -1 : 1, state, anim: 3 + v * 5, special: spec ? spec.id : null,
          floater: v === 1, fall: 6, heightMode: spec ? spec.height : "cushion", heightTick: 10 + v * 20, heightTicks: 40,
          heightFromX: 9, heightFromY: 5, heightToX: 13, heightToY: 19, fade: v * 6, fuse: 30 + v * 30, stunFor: 9,
          ropeY: 7, specialX: 14, specialY: 10, timer: 5 + v * 6, shotFor: v * 6, shotTo: 20, shotY: 13,
          shieldFor: v * 30, shieldHeld: v * 300, blockFor: v * 4, throttleFor: v * 10, netFor: v * 8, netX: 14, netY: 16,
          wounds: v, infected: v * 5, modelGen: v, landedAt: 74, landedFrom: v * 8, stoodDownAt: 70, liftIx: -1
        }, { labels: v === 1 })
        if (state !== "saved") assert.notEqual(Buffer.from(img.buf).toString("base64"), blank, `${state} res ${res} ${spec ? spec.id : ""}`)
      }
    }
  })
}
