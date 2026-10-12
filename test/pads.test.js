import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

// The Spaceship's transporters: a pair per Spaceship level, always beaming one
// corridor down, recharging between uses.

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")

test("pads are a Spaceship thing, and always send downstream", () => {
  let found = 0
  for (let lv = 1; lv <= 120; lv++) {
    const w = S.generate(lv, 0, 5)
    if (w.biome !== "Spaceship") { assert.equal(w.pads.length, 0, `level ${lv}`); continue }
    for (const p of w.pads) { found++; assert.ok(p.by > p.ay, `level ${lv}: the far pad is below`) }
  }
  assert.ok(found > 0)
})

function onPad() {
  const w = S.generate(19, 0, 3), p = w.pads[0]
  const ag = S.spawn(w)
  ag.state = "walk"; ag.x = p.ax + 0.5; ag.y = p.ay
  w.agents = [ag]
  return { w, p, ag }
}

test("a walker on the pad is beamed to its partner, then it recharges", () => {
  const { w, p, ag } = onPad()
  S.stepPads(w)
  assert.equal(Math.floor(ag.x), p.bx)
  assert.equal(ag.y, p.by)
  assert.equal(ag.dir, p.dir)
  const next = S.spawn(w)
  next.state = "walk"; next.x = p.ax + 0.5; next.y = p.ay
  w.agents.push(next)
  S.stepPads(w)
  assert.equal(Math.floor(next.x), p.ax, "still recharging")
})

test("a pad with its floor gone sends nobody", () => {
  const { w, p, ag } = onPad()
  w.terrain[(p.ay + 1) * S.COLS + p.ax] = S.EMPTY
  S.stepPads(w)
  assert.equal(Math.floor(ag.x), p.ax)
})

test("pads and beams draw", () => {
  const theme = themeOf("tokyo-night")
  const pal = P.build(theme.theme, 1)
  const { w, p } = onPad()
  for (const res of [1, 2]) for (const since of [3, 100]) {
    w.res = res; w.ticks = 200; p.usedAt = 200 - since
    const img = canvas(400 * res, 248 * res, theme.background)
    img.ctx.setTransform(res, 0, 0, res, 0, 0)
    const blank = Buffer.from(img.buf).toString("base64")
    D.drawPadPair(img.ctx, w, pal, p)
    assert.notEqual(Buffer.from(img.buf).toString("base64"), blank)
  }
})
