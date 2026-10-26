import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { load, canvas, themeOf } from "../tools/render.js"

// Logged off (Draw's drawArrivals): each arrival brightens the door, and the
// agent's status badge goes from green to grey as it fades through.
const S = load("Sim.js"), D = load("Draw.js"), P = load("Palette.js")
const hash = x => createHash("sha256").update(x).digest("hex")

function arriving(level = 3) {
  const w = S.generate(level, 0, 3)
  while (!w.agents.some(a => a.state === "saved" && !a.gone) && w.ticks < 4000) S.step(w)
  w.res = 2
  return { w, ag: w.agents.find(a => a.state === "saved" && !a.gone), pal: P.build(themeOf("tokyo-night").theme, level) }
}
function marks(fn) {
  const ctx = canvas(800, 496).ctx, calls = []
  ctx.fillStyle = "#123456"; ctx.globalAlpha = 1
  ctx.fillRect = (...r) => {
    assert.ok(calls.length < 400, "bounded paint")
    assert.ok(r.every(n => Number.isInteger(n * 2)), "half-pixel grid")
    calls.push([...r, ctx.fillStyle, ctx.globalAlpha])
  }
  fn(ctx)
  assert.equal(ctx.globalAlpha, 1); assert.equal(ctx.fillStyle, "#123456")
  return calls
}
const badge = (calls, colour) => calls.filter(c => c[4] === colour)

test("the status badge is green as an agent arrives and grey as it logs off", () => {
  const { w, ag, pal } = arriving()
  w.agents = [ag]
  ag.fade = 0
  const online = marks(ctx => D.drawArrivals(ctx, w, pal))
  assert.equal(badge(online, D.ARRIVAL_ONLINE).length, 1)
  assert.equal(badge(online, D.ARRIVAL_OFFLINE).length, 0)
  ag.fade = 10
  const off = marks(ctx => D.drawArrivals(ctx, w, pal))
  assert.equal(badge(off, D.ARRIVAL_ONLINE).length, 0)
  assert.equal(badge(off, D.ARRIVAL_OFFLINE).length, 1)
  assert.ok(badge(off, D.ARRIVAL_OFFLINE)[0][5] < 1, "fading with the agent")
  ag.gone = true
  assert.equal(marks(ctx => D.drawArrivals(ctx, w, pal)).length, 0)
})

test("the door brightens for the first ticks of each arrival, and only on the page", () => {
  const { w, ag, pal } = arriving()
  w.agents = [ag]
  const door = fade => { ag.fade = fade; return marks(ctx => D.drawArrivals(ctx, w, pal)).filter(c => c[4] === pal.exitLight || c[4] === pal.exitGlow).length }
  assert.ok(door(0) > 0); assert.ok(door(5) > 0); assert.equal(door(D.ARRIVAL_FLASH), 0)
  for (const res of [undefined, 1, 3]) { w.res = res; ag.fade = 0; assert.equal(marks(ctx => D.drawArrivals(ctx, w, pal)).length, 0) }
})

test("arrival paint is read-only and RNG-free", () => {
  const random = Math.random
  try {
    const { w, ag, pal } = arriving(9)
    Math.random = () => { throw Error("draw RNG") }
    for (let fade = 0; fade <= 14; fade++) {
      ag.fade = fade
      const before = hash(JSON.stringify(w)), a = marks(ctx => D.drawArrivals(ctx, w, pal))
      assert.deepEqual(marks(ctx => D.drawArrivals(ctx, w, pal)), a)
      assert.equal(hash(JSON.stringify(w)), before)
    }
  } finally { Math.random = random }
})
