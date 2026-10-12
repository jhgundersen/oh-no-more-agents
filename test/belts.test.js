import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

// The Factory's conveyors: on Factory levels only, carrying a walker faster
// one way and slower the other, and only while there is floor under them.

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")

test("belts are a Factory thing", () => {
  let factory = 0
  for (let lv = 1; lv <= 96; lv++) {
    const w = S.generate(lv, 0, 5)
    if (w.biome === "Factory") factory += w.belts.length
    else assert.equal(w.belts.length, 0, `level ${lv} (${w.biome})`)
  }
  assert.ok(factory > 0)
})

function onBelt(dir) {
  const w = S.generate(8, 0, 3), b = w.belts[0]
  const ag = S.spawn(w)
  ag.x = (b.x0 + b.x1) / 2
  ag.y = b.y
  ag.dir = dir * b.dir
  return { w, b, ag }
}

test("with the belt is faster, against it slower", () => {
  const plain = onBelt(1)
  const off = S.walkStep(plain.ag, Object.assign({}, plain.w, { beltAt: null }))
  assert.ok(S.walkStep(onBelt(1).ag, plain.w) > off * 1.4)
  assert.ok(S.walkStep(onBelt(-1).ag, plain.w) < off * 0.6)
})

test("a belt with its floor gone carries nobody", () => {
  const { w, b, ag } = onBelt(1)
  w.terrain[(b.y + 1) * S.COLS + Math.floor(ag.x)] = S.EMPTY
  assert.equal(S.beltUnder(w, ag), 0)
})

test("belts draw at both resolutions", () => {
  const theme = themeOf("tokyo-night")
  const pal = P.build(theme.theme, 1)
  const w = S.generate(8, 0, 3)
  for (const res of [1, 2]) {
    w.res = res
    const img = canvas(400 * res, 248 * res, theme.background)
    img.ctx.setTransform(res, 0, 0, res, 0, 0)
    const blank = Buffer.from(img.buf).toString("base64")
    D.drawBelts(img.ctx, w, pal)
    assert.notEqual(Buffer.from(img.buf).toString("base64"), blank)
  }
})
