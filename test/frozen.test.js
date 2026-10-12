import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

// The Ice Cave's frozen colleagues: in walls, on Ice Cave levels only, and
// out and walking — counted in the colony — once the wall around them opens.

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")

test("frozen colleagues are an Ice Cave thing, and stand in solid wall", () => {
  let found = 0
  for (let lv = 1; lv <= 120; lv++) {
    const w = S.generate(lv, 0, 5)
    if (w.biome !== "Ice Cave") { assert.equal(w.frozen.length, 0, `level ${lv}`); continue }
    for (const f of w.frozen) { found++; assert.ok(S.frozenEncased(w, f)) }
  }
  assert.ok(found > 0)
})

function iced() {
  for (let lv = 6; ; lv += 12) {
    const w = S.generate(lv, 0, 5)
    if (w.frozen.length) return { w, f: w.frozen[0] }
  }
}

test("nothing happens while the wall holds", () => {
  const { w, f } = iced()
  const n = w.agents.length
  S.stepFrozen(w)
  assert.equal(f.thawedAt, -1)
  assert.equal(w.agents.length, n)
})

test("opening the wall at the head frees them, feet and all", () => {
  const { w, f } = iced()
  const total = w.toRelease, released = w.released
  w.terrain[(f.y - 3) * S.COLS + f.x] = S.EMPTY
  S.stepFrozen(w)
  assert.equal(f.thawedAt, w.ticks)
  const ag = w.agents[w.agents.length - 1]
  assert.equal(ag.state, "walk")
  assert.equal(ag.y, f.y)
  assert.ok(!S.solid(w, f.x, f.y), "the ice at their feet melted")
  assert.equal(w.toRelease, total + 1)
  assert.equal(w.released, released + 1)
})

test("frozen and thawing both draw", () => {
  const theme = themeOf("tokyo-night")
  const pal = P.build(theme.theme, 1)
  const { w, f } = iced()
  for (const res of [1, 2]) for (const thawedAt of [-1, 0]) {
    w.res = res
    w.ticks = 5
    f.thawedAt = thawedAt
    const img = canvas(400 * res, 248 * res, theme.background)
    img.ctx.setTransform(res, 0, 0, res, 0, 0)
    const blank = Buffer.from(img.buf).toString("base64")
    D.drawFrozen(img.ctx, w, pal, f)
    assert.notEqual(Buffer.from(img.buf).toString("base64"), blank)
  }
})
