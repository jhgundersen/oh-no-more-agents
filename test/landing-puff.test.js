import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { load, canvas, themeOf } from "../tools/render.js"

// A real drop kicks up dust at the feet (Draw's drawLandingPuffs), page only,
// on the same threshold as the knees' squash; Frost's long drops keep powder.
const S = load("Sim.js"), D = load("Draw.js"), P = load("Palette.js")
const hash = x => createHash("sha256").update(x).digest("hex")

function landing(level) {
  const w = S.generate(level, 0, 3); w.res = 2
  let ag = null
  for (let n = 0; n < 3000 && !ag; n++) { S.step(w); ag = w.agents.find(a => !a.gone && a.landedAt === w.ticks && a.landedFrom > 3) }
  assert.ok(ag, "a real landing")
  w.agents = [ag]
  return { w, ag, pal: P.build(themeOf("tokyo-night").theme, level) }
}
function marks(fn) {
  const ctx = canvas(800, 496).ctx, calls = []
  ctx.fillStyle = "#123456"; ctx.globalAlpha = 1
  ctx.fillRect = (...r) => { assert.ok(r.every(n => Number.isInteger(n * 2))); calls.push([...r, ctx.fillStyle, ctx.globalAlpha]) }
  fn(ctx)
  assert.equal(ctx.globalAlpha, 1); assert.equal(ctx.fillStyle, "#123456")
  return calls
}

test("a real landing puffs dust out from the feet for a few ticks, in open air", () => {
  const { w, ag, pal } = landing(8), at = age => { w.ticks = ag.landedAt + age; return marks(ctx => D.drawLandingPuffs(ctx, w, pal)) }
  const first = at(0), later = at(5)
  assert.ok(first.length >= 2 && first.every(c => c[4] === D.LANDING_DUST))
  for (const [x, y, wd, h] of first) for (let yy = y; yy < y + h; yy += 0.5) for (let xx = x; xx < x + wd; xx += 0.5) assert.ok(D.mechanismAir(w, xx, yy))
  assert.ok(later.length > 0 && later[0][5] < first[0][5], "settling")
  assert.ok(Math.max(...later.map(c => Math.abs(c[0] - ag.x * 4))) > Math.max(...first.map(c => Math.abs(c[0] - ag.x * 4))), "rolling outward")
  assert.equal(at(D.LANDING_PUFF).length, 0)
  ag.landedFrom = 2; assert.equal(at(0).length, 0, "a step down is not a landing")
  ag.landedFrom = 8; w.res = 1; assert.equal(at(0).length, 0, "page only")
})

test("landing dust is read-only and RNG-free", () => {
  const random = Math.random
  try {
    const { w, ag, pal } = landing(5)
    Math.random = () => { throw Error("draw RNG") }
    for (let age = 0; age < 9; age++) {
      w.ticks = ag.landedAt + age
      const before = hash(JSON.stringify(w)), a = marks(ctx => D.drawLandingPuffs(ctx, w, pal))
      assert.deepEqual(marks(ctx => D.drawLandingPuffs(ctx, w, pal)), a)
      assert.equal(hash(JSON.stringify(w)), before)
    }
  } finally { Math.random = random }
})
