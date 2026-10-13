import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const theme = themeOf("tokyo-night")
const agent = (state, dir = 1) => ({ id: 5, x: 10.25, y: 15, dir, state,
  anim: 0, fuse: 149, fall: 2.2, floater: true, liftIx: -1 })
function world(res, wet = false) {
  const w = S.generate(1, 0, 99)
  w.res = res; w.submerged = wet; w.ticks = 400
  return w
}

// Test the new entry points, not whole-frame fingerprints. Sentinel rectangles
// catch transform leaks; the recording canvas tracks fill/alpha and save depth.
function detail(w, pal, ag, draw) {
  const r = w.res || 1, img = canvas(100 * r, 100 * r, theme.background)
  img.ctx.setTransform(r, 0, 0, r, 0, 0)
  img.ctx.fillStyle = "#abcdef"; img.ctx.globalAlpha = 0.7
  const before = JSON.stringify({ w, ag }), marks = []
  const fill = img.ctx.fillRect.bind(img.ctx), save = img.ctx.save.bind(img.ctx), restore = img.ctx.restore.bind(img.ctx)
  let depth = 0
  img.ctx.save = () => { depth++; save() }
  img.ctx.restore = () => { depth--; restore(); assert.ok(depth >= 0) }
  img.ctx.fillRect = (...rect) => {
    assert.ok(rect.every(Number.isFinite), "finite rectangles")
    assert.ok(rect.every(n => Number.isInteger(n * 2)), "half-pixel grid")
    marks.push({ rect, color: img.ctx.fillStyle }); fill(...rect)
  }
  draw(img.ctx, w, pal, ag, 36, 48, ag.dir, pal.robe)
  assert.equal(JSON.stringify({ w, ag }), before, "read-only world and agent")
  assert.equal(depth, 0); assert.equal(img.ctx.fillStyle, "#abcdef"); assert.equal(img.ctx.globalAlpha, 0.7)
  const clean = canvas(100 * r, 100 * r, theme.background)
  clean.ctx.setTransform(r, 0, 0, r, 0, 0); clean.ctx.fillStyle = "#abcdef"; clean.ctx.globalAlpha = 0.7
  img.ctx.fillRect(1, 1, 2, 2); clean.ctx.fillRect(1, 1, 2, 2)
  for (let y = 0; y < 5 * r; y++) assert.deepEqual(img.buf.slice(y * img.W * 3, y * img.W * 3 + 5 * r * 3), clean.buf.slice(y * clean.W * 3, y * clean.W * 3 + 5 * r * 3))
  return { img, marks: marks.slice(0, -1) }
}

for (const state of ["climb", "bomb", "fall"]) {
  test(`${state}: page skill detail is bounded, pure, palette-based and restores ctx`, () => {
    for (const name of Object.keys(THEMES)) for (const res of [undefined, 1, 2])
      for (const wet of [false, true]) for (const dir of [-1, 1]) for (const phase of [0, 4, 8, 12]) {
        const w = world(res, wet), pal = P.build(themeOf(name).theme, 1), ag = agent(state, dir)
        ag.anim = phase; ag.fuse = phase + 1
        const { marks } = detail(w, pal, ag, D.drawSkillDetail)
        assert.equal(marks.length > 0, res === 2)
        for (const { rect: [x, y, width, height], color } of marks) {
          assert.ok(x >= 28 && x + width <= 53 && y >= 48 && y + height <= 64, "local sprite budget")
          assert.ok(Object.values(pal).includes(color), "palette roles")
        }
      }
  })
}

test("climbing plants palms on the face and alternates its reach, pull and raised boot", () => {
  const w = world(2), pal = P.build(theme.theme, 1)
  for (const dir of [-1, 1]) {
    const frames = [], hands = [], knees = []
    for (const anim of [0, 4, 8, 12]) {
      const ag = agent("climb", dir); ag.anim = anim
      const c = D.climbContacts(w, ag, 36, dir), face = (Math.floor(ag.x) + dir + (dir < 0 ? 1 : 0)) * w.k.CELL
      assert.equal(dir > 0 ? 36 + c.x : 44 - c.x, face)
      hands.push(c.hand); knees.push(c.knee)
      frames.push(Buffer.from(detail(w, pal, ag, D.drawClimbingPose).img.buf).toString("base64"))
    }
    assert.ok(new Set(hands).size > 1); assert.ok(new Set(knees).size > 1)
    assert.equal(new Set(frames).size, 4)
    const down = agent("climb", dir); down.climbDown = true
    detail(w, pal, down, D.drawClimbingPose)
  }
})

test("blocker has separated planted boots and palms out, and retains all fidgets", () => {
  const w = world(2), pal = P.build(theme.theme, 1)
  for (const dir of [-1, 1]) {
    const ag = agent("block", dir), { marks } = detail(w, pal, ag, D.drawBracedBlocker)
    assert.equal(marks.filter(m => m.color === pal.skin).length, 2, "two palms")
    const shoes = marks.filter(m => m.color === pal.eye)
    assert.equal(shoes.length, 2)
    assert.ok(Math.abs(shoes[0].rect[0] - shoes[1].rect[0]) >= 6, "wide stance")
    for (const pose of ["", "tap", "watch", "fold"]) for (const phase of [0, 8]) {
      detail(w, pal, ag, (ctx, w, pal, ag, ox, oy, dir, robe) => D.drawBracedBlocker(ctx, w, pal, ag, ox, oy, dir, robe, { kind: "block", pose, phase }))
    }
  }
})

test("bomb fuse shortens, its last second tucks down, and countdown stays accurate", () => {
  const w = world(2), pal = P.build(theme.theme, 1), ag = agent("bomb"), frames = [], countdowns = []
  for (const fuse of [149, 39, 24, 9]) {
    ag.fuse = fuse
    frames.push(Buffer.from(detail(w, pal, ag, D.drawSkillDetail).img.buf).toString("base64"))
    detail(w, pal, ag, D.drawBombPose)
    const img = canvas(160, 160, theme.background); img.ctx.fillText = text => countdowns.push(text)
    D.drawAgent(img.ctx, w, pal, ag, {})
  }
  assert.equal(new Set(frames).size, 4)
  assert.deepEqual(countdowns, ["5", "2", "1", "1"])
  assert.deepEqual([149, 39, 24, 9].map(fuse => D.bombCrouch({ fuse })), [0, 0, 1, 2])
})

test("umbrella opens from a narrow crown, then sways with a stem joined to its grip", () => {
  const w = world(2), pal = P.build(theme.theme, 1), ag = agent("fall")
  const draw = (ctx, w, pal, ag, ox, oy) => D.drawFloatingUmbrella(ctx, w, pal, ag, ox, oy, 0, pal.umbrella)
  const widths = []
  for (const fall of [2.01, 2.4, 2.7, 3.1]) {
    ag.fall = fall
    const { marks } = detail(w, pal, ag, draw)
    widths.push(Math.max(...marks.filter(m => m.color === pal.umbrellaRim).map(m => m.rect[2])))
  }
  assert.ok(widths.every((width, i) => i === 0 || width > widths[i - 1]))
  const frames = [400, 416, 432].map(ticks => {
    w.ticks = ticks
    return Buffer.from(detail(w, pal, ag, draw).img.buf).toString("base64")
  })
  assert.ok(new Set(frames).size > 1)
  for (const fall of [0, 2]) { ag.fall = fall; assert.equal(detail(w, pal, ag, D.drawSkillDetail).marks.length, 0) }
  ag.fall = 3; ag.floater = false
  assert.equal(detail(w, pal, ag, D.drawSkillDetail).marks.length, 0)
})

test("complete skills draw at both resolutions without state writes or RNG", () => {
  const pal = P.build(theme.theme, 1)
  for (const res of [undefined, 1, 2]) for (const wet of [false, true])
    for (const dir of [-1, 1]) for (const state of ["climb", "block", "bomb", "fall"]) {
      const w = world(res, wet), ag = agent(state, dir), before = JSON.stringify({ w, ag }), r = res || 1
      const a = canvas(80 * r, 80 * r, theme.background), b = canvas(80 * r, 80 * r, theme.background)
      a.ctx.setTransform(r, 0, 0, r, 0, 0); b.ctx.setTransform(r, 0, 0, r, 0, 0)
      D.drawAgent(a.ctx, w, pal, ag, {})
      const random = Math.random
      try { Math.random = () => { throw new Error("drawing consumes RNG") }; D.drawAgent(b.ctx, w, pal, ag, {}) }
      finally { Math.random = random }
      assert.deepEqual(a.buf, b.buf); assert.notDeepEqual(a.buf, canvas(80 * r, 80 * r, theme.background).buf)
      assert.equal(JSON.stringify({ w, ag }), before)
    }
})

test("unrelated skill details are a no-op", () => {
  const w = world(2), pal = P.build(theme.theme, 1)
  assert.equal(detail(w, pal, agent("walk"), D.drawSkillDetail).marks.length, 0)
})
