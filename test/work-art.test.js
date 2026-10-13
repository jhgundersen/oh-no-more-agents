import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const theme = themeOf("tokyo-night")
const fresh = (res = 2, wet = false) => {
  const w = S.generate(1, 0, 99)
  w.res = res; w.ticks = 80; w.submerged = wet
  return w
}
const agent = (state, timer, dir = 1) => ({ id: 5, x: 10, y: 15, dir, state, timer, anim: 0, liftIx: -1 })

function toolPixels(w, pal, ag) {
  const res = w.res || 1, img = canvas(80 * res, 80 * res, "#000000")
  img.ctx.setTransform(res, 0, 0, res, 0, 0)
  img.ctx.fillStyle = "#abcdef"; img.ctx.globalAlpha = 0.7
  const before = JSON.stringify({ w, ag })
  const fill = img.ctx.fillRect.bind(img.ctx), marks = []
  const save = img.ctx.save.bind(img.ctx), restore = img.ctx.restore.bind(img.ctx)
  let depth = 0
  img.ctx.save = () => { depth++; save() }
  img.ctx.restore = () => { depth--; restore() }
  img.ctx.fillRect = (...r) => {
    assert.ok(r.every(Number.isFinite), "finite rectangles")
    assert.ok(r.every(n => Number.isInteger(n * 2)), "half-pixel grid")
    marks.push({ r, color: img.ctx.fillStyle }); fill(...r)
  }
  if (ag.state === "build") D.drawWorkingBuilder(img.ctx, w, pal, ag, 36, 48, ag.dir, pal.robe)
  else D.drawWorkTools(img.ctx, w, pal, ag, 36, 48, ag.dir)
  assert.equal(JSON.stringify({ w, ag }), before, "world and agent are read-only")
  assert.equal(depth, 0, "balanced context saves")
  assert.equal(img.ctx.fillStyle, "#abcdef"); assert.equal(img.ctx.globalAlpha, 0.7)
  // A sentinel also detects a leaked transform or an unbalanced save.
  const clean = canvas(80 * res, 80 * res, "#000000")
  clean.ctx.setTransform(res, 0, 0, res, 0, 0)
  clean.ctx.fillStyle = "#abcdef"; clean.ctx.globalAlpha = 0.7
  img.ctx.fillRect(1, 1, 2, 2); clean.ctx.fillRect(1, 1, 2, 2)
  for (let y = 0; y < 5 * res; y++) {
    assert.deepEqual(img.buf.slice(y * img.W * 3, y * img.W * 3 + 5 * res * 3),
      clean.buf.slice(y * clean.W * 3, y * clean.W * 3 + 5 * res * 3))
  }
  return { img, marks: marks.slice(0, -1) }
}

for (const state of ["bash", "dig", "build"]) {
  test(`${state}: tools are bounded, palette-based, pure and restore context at either resolution`, () => {
    for (const res of [undefined, 1, 2]) for (const wet of [false, true])
      for (const dir of [-1, 1]) for (const timer of [undefined, 0, 1, 2, 3, 4, 5, 6]) {
        const w = fresh(res, wet), pal = P.build(theme.theme, 1)
        w.res = res
        const { marks } = toolPixels(w, pal, agent(state, timer, dir))
        assert.equal(marks.length > 0, res === 2, "only page detail changes")
        for (const { r: [x, y, width, height], color } of marks) {
          assert.ok(x >= 20 && x + width <= 58 && y >= 48 && y + height <= 68, "local sprite budget")
          assert.ok(Object.values(pal).includes(color), "uses palette roles")
        }
      }
    for (const name of Object.keys(THEMES)) {
      const w = fresh(), pal = P.build(themeOf(name).theme, 1)
      assert.ok(toolPixels(w, pal, agent(state, 4)).marks.length > 0)
    }
  })

  test(`${state}: stroke phases are visible, mirrored, deterministic and reach the complete sprite`, () => {
    const w = fresh(), pal = P.build(theme.theme, 1)
    const phases = state === "build" ? [0, 2, 4] : [0, 4]
    const images = phases.map(t => toolPixels(w, pal, agent(state, t)).img)
    assert.equal(new Set(images.map(i => Buffer.from(i.buf).toString("base64"))).size, phases.length)
    for (const timer of phases) {
      const right = toolPixels(w, pal, agent(state, timer, 1)).img
      const left = toolPixels(w, pal, agent(state, timer, -1)).img
      // The sprite's mirror axis is ox + SPRITE_W/2 = 40 art pixels.
      for (let y = 96; y < 136; y++) for (let x = 40; x < 120; x++) {
        assert.deepEqual(right.buf.slice((y * 160 + x) * 3, (y * 160 + x) * 3 + 3),
          left.buf.slice((y * 160 + 159 - x) * 3, (y * 160 + 159 - x) * 3 + 3))
      }
      for (const wet of [false, true]) for (const res of [undefined, 1, 2]) {
        const world = fresh(res, wet), ag = agent(state, timer)
        world.res = res
        const before = JSON.stringify({ world, ag }), scale = res || 1
        const a = canvas(80 * scale, 80 * scale, theme.background), b = canvas(80 * scale, 80 * scale, theme.background)
        a.ctx.setTransform(scale, 0, 0, scale, 0, 0); b.ctx.setTransform(scale, 0, 0, scale, 0, 0)
        D.drawAgent(a.ctx, world, pal, ag, {})
        const random = Math.random
        try {
          Math.random = () => { throw new Error("drawing must not consume RNG") }
          D.drawAgent(b.ctx, world, pal, ag, {})
        } finally { Math.random = random }
        assert.deepEqual(a.buf, b.buf)
        assert.equal(JSON.stringify({ world, ag }), before)
        const blank = canvas(80 * scale, 80 * scale, theme.background)
        assert.notDeepEqual(a.buf, blank.buf)
      }
    }
  })
}

test("unknown actions are a no-op and a zero-length tool handle is finite", () => {
  const w = fresh(), pal = P.build(theme.theme, 1)
  assert.equal(toolPixels(w, pal, agent("walk", 0)).marks.length, 0)
  const img = canvas(80, 80, "#000000")
  D.drawWorkHandle(img.ctx, pal, 36, 48, 1, 8, 9, 8, 9)
  assert.ok(img.buf.some(n => n > 0))
})
