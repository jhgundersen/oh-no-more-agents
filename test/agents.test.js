import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
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

test("a digger stops on the last layer over a fatal drop unless an umbrella is going", () => {
  const w = S.generate(11, 0, 3), x = 50, foot = 20
  for (let y = foot + 2; y < S.ROWS; y++) w.terrain[y * S.COLS + x] = S.EMPTY
  w.terrain[(foot + 1) * S.COLS + x] = S.DIRT
  const ag = S.spawn(w)
  // Nothing under the hole at all: no umbrella lands you on a floor that is
  // not there (level 110's colony followed a dug shaft out of the world).
  w.skills.floater = 1
  assert.ok(S.digOpensDeath(w, ag, x, foot), "bottomless: stop, umbrellas or not")
  w.terrain[(foot + 40) * S.COLS + x] = S.DIRT                // a floor, far below
  w.skills.floater = 0
  assert.ok(S.digOpensDeath(w, ag, x, foot), "no umbrellas: stop")
  w.skills.floater = 1
  assert.ok(!S.digOpensDeath(w, ag, x, foot), "an umbrella on the toolbar: go on")
  w.skills.floater = 0
  w.terrain[(foot + 6) * S.COLS + x] = S.DIRT
  assert.ok(!S.digOpensDeath(w, ag, x, foot), "a short drop: go on")
})

test("a block with the floor a step higher behind it is a block, not a wall to the exit", () => {
  // Built after level 569 as it was: a three-cell block under a low roof, and
  // beyond it the floor one step up all the way along. It used to measure as
  // wall to the far end — too deep to blast — and the colony paced in front of
  // it until the loop rule bombed it. Built by hand so later changes to
  // generation cannot move it.
  const w = S.generate(1, 0, 3), C = S.COLS
  const put = (x, y, v) => { w.terrain[y * C + x] = v }
  for (let y = 40; y < 58; y++) for (let x = 60; x < 96; x++) put(x, y, S.EMPTY)
  for (let x = 60; x < 96; x++) { put(x, 53, S.ROCK); put(x, 47, S.ROCK) }   // floor, low roof
  for (let x = 77; x < 96; x++) put(x, 52, S.ROCK)                            // a step up
  for (let x = 77; x < 80; x++) for (let y = 50; y < 52; y++) put(x, y, S.ROCK) // the block
  const ag = S.spawn(w)
  ag.x = 76.5; ag.y = 52; ag.dir = 1
  assert.equal(S.obstructionAhead(w, ag), 3)
})

// Pin the panel pixels from before the fine-pose pass, including the absent
// w.res used by QML. Varied limbs, umbrella, countdown and height transforms
// keep this a byte check of the actual coarse output, not just the res guard.
const FINE_STATES = ["climb", "webup", "build", "dig", "fall", "bomb", "rappel", "height",
  "slide", "stunned", "ceil", "swim"]
const FINE_PHASES = [0, 3, 8, 15]
const HEIGHT_MODES = ["jetpack", "cushion", "helicopter"]

function fineSample(state, dir, phase, mode) {
  return {
    id: 5, x: 10, y: 15, dir, state, anim: phase, timer: phase,
    floater: phase > 3, fall: 6, heightMode: mode, heightTick: phase + 5, heightTicks: 40,
    heightFromX: 9, heightFromY: 5, heightToX: 13, heightToY: 19,
    fuse: phase * 4 + 15, stunFor: phase, ropeY: 7, specialX: 14, specialY: 10, liftIx: -1
  }
}

test("new fine poses leave res 1 and unspecified res byte-identical", () => {
  const hash = createHash("sha256"), w = S.generate(8, 0, 3)
  const theme = themeOf("tokyo-night"), pal = P.build(theme.theme, 8)
  w.ticks = 77
  for (const res of [undefined, 1]) for (const state of FINE_STATES)
    for (const dir of [1, -1]) for (const phase of FINE_PHASES) for (const mode of HEIGHT_MODES) {
      w.res = res; w.submerged = state === "swim"
      const img = canvas(80, 80, theme.background)
      D.drawAgent(img.ctx, w, pal, fineSample(state, dir, phase, mode), {})
      hash.update(img.buf)
    }
  assert.equal(hash.digest("hex"), "3a7f5b4793a2b2c030da0d28417789877a11c421c9b8eb5d90cd71060f9fd3a6")
})

for (const state of FINE_STATES) {
  test(`${state} fine detail draws at both resolutions inside the coarse silhouette`, () => {
    const w = S.generate(8, 0, 3), theme = themeOf("tokyo-night"), pal = P.build(theme.theme, 8)
    w.ticks = 77; w.submerged = state === "swim"
    for (const res of [1, 2]) for (const dir of [1, -1]) for (const phase of FINE_PHASES)
      for (const mode of HEIGHT_MODES) {
        w.res = res
        const img = canvas(80 * res, 80 * res, theme.background)
        img.ctx.setTransform(res, 0, 0, res, 0, 0)
        const ag = fineSample(state, dir, phase, mode)
        ag.swimUp = phase === 3
        assert.doesNotThrow(() => D.drawAgent(img.ctx, w, pal, ag, {}))
      }

    // Draw the fine marks alone onto a black mask and ask whether each pixel
    // already belonged to the res-1 figure, rasterised at res 2. This also
    // catches a misplaced toe or cuff even when the complete sprite looks OK.
    for (const dir of [1, -1]) for (const phase of FINE_PHASES) for (const mode of ["jetpack", "cushion"]) {
      const ag = fineSample(state, dir, phase, mode)
      ag.floater = false; ag.swimUp = phase === 3
      const coarse = canvas(160, 160, "#000000"), fine = canvas(160, 160, "#000000")
      coarse.ctx.setTransform(2, 0, 0, 2, 0, 0); fine.ctx.setTransform(2, 0, 0, 2, 0, 0)
      const fill = fine.ctx.fillRect.bind(fine.ctx)
      fine.ctx.fillRect = (x, y, width, height) => {
        for (const n of [x, y, width, height]) assert.equal(n * 2, Math.round(n * 2), "half-pixel grid")
        assert.equal(fine.ctx.globalAlpha, 1, "opaque detail")
        fill(x, y, width, height)
      }
      // Full height spins are checked above; use an unrotated tucked frame
      // here so both masks share sprite coordinates.
      ag.heightTick = 0
      // Bombers now have a distinct braced/crouched page silhouette. Test
      // tailoring against that pose; all other fine marks keep the panel mask.
      w.res = state === "bomb" ? 2 : 1
      D.drawAgent(coarse.ctx, w, pal, ag, {})
      if (state === "swim") D.drawFineSwim(fine.ctx, pal, ag, 36, 48, dir)
      else {
        const drop = state === "bomb" ? D.bombCrouch(ag) : (state === "slide" ? 4 : (state === "dig" ? 2 : 0))
        const lead = [0, 1, 0, -1][(phase >> 2) % 4]
        D.drawAgentFine(fine.ctx, pal, ag, 36, 48, dir, drop, lead, 0, pal.robe)
      }
      let marks = 0
      for (let i = 0; i < fine.buf.length; i += 3) {
        if (!(fine.buf[i] || fine.buf[i + 1] || fine.buf[i + 2])) continue
        marks++
        assert.ok(coarse.buf[i] || coarse.buf[i + 1] || coarse.buf[i + 2],
          `${state} dir ${dir} phase ${phase} ${mode}: fine pixel outside silhouette at ${i / 3 % 160},${Math.floor(i / 480)}`)
      }
      assert.ok(marks > 0, `${state}: missing fine pass`)
    }
  })
}
