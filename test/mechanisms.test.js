import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { levelWith } from "./levels.js"
import { canvas, themeOf } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const SHIP = levelWith(S, "Spaceship", (w) => w.pads.length > 0)
const RUINS = levelWith(S, "Ruins", (w) => !!w.boulder)
const theme = themeOf("tokyo-night")
function picture(w, draw) {
  const res = w.res || 1, img = canvas(400 * res, 248 * res, theme.background)
  img.ctx.setTransform(res, 0, 0, res, 0, 0)
  draw(img.ctx, P.build(theme.theme, w.level))
  assert.equal(img.ctx.globalAlpha, 1, "effect must restore the caller's opacity")
  return Buffer.from(img.buf)
}
function blank(w) { return picture(w, () => {}) }

// Renderer contracts, rather than whole-frame hashes: drawing must not change
// gameplay, floor holes must stay empty, and one tick of motion follows the force.
test("conveyor surface and return run travel opposite ways; drums follow belt direction", () => {
  const w = S.generate(8, 0, 3), pal = P.build(theme.theme, 8)
  for (const res of [1, 2]) for (const dir of [-1, 1]) {
    w.res = res
    const images = []
    for (const ticks of [0, 2]) {
      w.ticks = ticks
      images.push(picture(w, ctx => D.drawBeltTreads(ctx, w, pal, 40, 80, Math.floor(ticks * D.BELT_DRIFT) * dir)))
    }
    // Away from the ends, the top run is translated exactly one art pixel.
    const pixel = (img, x, y) => img.subarray((y * 400 * res + x) * 3, (y * 400 * res + x) * 3 + 3)
    for (const j of [1, 2]) {
      assert.deepEqual(pixel(images[1], (40 + j) * res, 80 * res), pixel(images[0], (40 + j - dir) * res, 80 * res))
      assert.deepEqual(pixel(images[1], (40 + j) * res, 82 * res), pixel(images[0], (40 + j + dir) * res, 82 * res))
    }
    w.ticks = 2
    const forward = picture(w, ctx => D.drawBeltDrum(ctx, w, pal, 40, 80, -1, dir))
    const reverse = picture(w, ctx => D.drawBeltDrum(ctx, w, pal, 40, 80, -1, -dir))
    assert.notDeepEqual(forward, reverse)
  }
})

test("no conveyor is drawn when its entire floor is removed", () => {
  const w = S.generate(8, 0, 3)
  for (const b of w.belts) for (let x = b.x0; x < b.x1; x++) w.terrain[(b.y + 1) * S.COLS + x] = S.EMPTY
  for (const res of [1, 2]) {
    w.res = res
    assert.deepEqual(picture(w, (ctx, pal) => D.drawBelts(ctx, w, pal)), blank(w))
  }
})

test("wind and updraft wisps clip every pixel to open air at both resolutions", () => {
  for (const res of [1, 2]) {
    const w = S.generate(12, 0, 3); w.res = res
    w.terrain.fill(S.ROCK)
    assert.deepEqual(picture(w, (ctx, pal) => D.drawUpdrafts(ctx, w, pal)), blank(w))
    for (const wind of [-1, 1]) {
      w.wind = wind
      assert.deepEqual(picture(w, (ctx, pal) => D.drawGust(ctx, w, pal)), blank(w))
    }
    // Only one cell is open: all tails, heads and curls must stay inside it.
    w.terrain[20 * S.COLS + 10] = S.EMPTY
    const marks = []
    picture(w, (ctx, pal) => {
      const fill = ctx.fillRect.bind(ctx)
      ctx.fillRect = (x, y, width, height) => { marks.push([x, y, width, height]); fill(x, y, width, height) }
      ctx.save()
      D.drawSandStreak(ctx, w, pal, 41, 81, 1, 10, 1, 1)
      D.drawSandStreak(ctx, w, pal, 42, 81, -1, 10, 1, 0)
      D.drawDraftWisp(ctx, w, pal, 41, 82, 1)
      ctx.restore()
    })
    assert.ok(marks.length)
    for (const [x, y, width, height] of marks) {
      assert.ok(x >= 40 && x + width <= 44 && y >= 80 && y + height <= 84, `escaped open cell: ${[x, y, width, height]}`)
    }
  }
})

test("fresh pads have lamps but no phantom beam; arrivals follow the actual traveller", () => {
  const w = S.generate(SHIP, 0, 3), p = w.pads[0], ag = S.spawn(w)
  for (const res of [1, 2]) {
    w.res = res
    const fresh = picture(w, (ctx, pal) => D.drawPadPair(ctx, w, pal, p))
    const plates = picture(w, (ctx, pal) => {
      D.drawPad(ctx, w, pal, p.ax, p.ay, 1); D.drawPad(ctx, w, pal, p.bx, p.by, 1)
    })
    assert.deepEqual(fresh, plates)
    ag.x = p.ax + 0.5; ag.y = p.ay; ag.state = "walk"; w.agents = [ag]
    S.stepPads(w)
    assert.equal(p.who, ag.id)
    const state = JSON.stringify(w)
    for (const age of [0, 2, 5, 9, 10, 23, 24]) {
      w.ticks = p.usedAt + age
      picture(w, (ctx, pal) => D.drawPadPair(ctx, w, pal, p))
      picture(w, (ctx, pal) => assert.equal(D.drawBeamArrival(ctx, w, ag), age < 10))
    }
    w.ticks = p.usedAt
    assert.equal(JSON.stringify(w), state, "rendering must not write world or agent state")
    picture(w, (ctx, pal) => assert.equal(D.drawBeamArrival(ctx, w, { ...ag, id: -99 }), false))
    p.usedAt = -10; w.ticks = 0
  }
})

test("mechanisms animate at res 1 and res 2 without writing simulation state", () => {
  for (const res of [1, 2]) {
    const w = S.generate(RUINS, 0, 3); w.res = res
    const b = w.boulder
    for (const state of ["rest", "wake", "roll", "done"]) {
      b.state = state; b.wokeAt = 0; b.endedAt = 0
      for (const ticks of [0, 4, 10, 18, 23, 25]) {
        w.ticks = ticks; b.spin = ticks * 0.267
        const before = JSON.stringify(w)
        picture(w, (ctx, pal) => D.drawBoulder(ctx, w, pal, b))
        assert.equal(JSON.stringify(w), before)
      }
    }
    const rope = fn => picture(w, (ctx, pal) => fn(ctx, w, pal, 50, 120, 36, 11))
    w.ticks = 0; const chain = rope(D.drawChain), vine = rope(D.drawVine)
    w.ticks = 36
    assert.notDeepEqual(rope(D.drawChain), chain)
    assert.notDeepEqual(rope(D.drawVine), vine)
    const f = { x: 20, y: 20, dir: 1, thawedAt: -1 }
    picture(w, (ctx, pal) => D.drawFrozen(ctx, w, pal, f))
    f.thawedAt = 0
    for (const ticks of [0, 4, 10, 18, 26, 30, 31]) {
      w.ticks = ticks
      const img = picture(w, (ctx, pal) => D.drawFrozen(ctx, w, pal, f))
      assert.equal(img.equals(blank(w)), ticks >= D.FROZEN_FX)
    }
  }
})
