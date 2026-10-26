import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { load, canvas, themeOf } from "../tools/render.js"

// Lost, and clocked in (Draw's drawLostAndFound): static where a lost agent
// was, a "404" wisp, its own umbrella floating off; and a grey-to-green badge
// on the newest agent out of the hatch. Page only, draw only.
const S = load("Sim.js"), D = load("Draw.js"), P = load("Palette.js")
const hash = x => createHash("sha256").update(x).digest("hex")

function lost(brolly) {
  const w = S.generate(17, 0, 3)
  for (let i = 0; i < 300; i++) S.step(w)
  w.res = 2
  const ag = w.agents.find(a => !a.gone)
  open: for (let y = 20; y < 60; y++) for (let x = 8; x < 92; x++) {
    let clear = true
    for (let dy = 0; dy < 14 && clear; dy++) for (let dx = -4; dx <= 4; dx++) if (w.terrain[(y - dy) * 100 + x + dx]) { clear = false; break }
    if (clear) { ag.x = x + 0.5; ag.y = y; break open }
  }
  Object.assign(ag, { gone: true, state: "dead", diedAt: w.ticks, diedBy: "splat", ownBrolly: brolly, floater: brolly })
  w.agents = [ag]; w.lastReleaseAt = -1; w.wind = 0
  return { w, ag, pal: P.build(themeOf("tokyo-night").theme, 17) }
}
function marks(fn) {
  const ctx = canvas(800, 496).ctx, calls = []
  ctx.fillStyle = "#123456"; ctx.globalAlpha = 1
  ctx.fillRect = (...r) => { assert.ok(calls.length < 800); assert.ok(r.every(n => Number.isInteger(n * 2)), "half-pixel grid"); calls.push([...r, ctx.fillStyle, ctx.globalAlpha]) }
  fn(ctx)
  assert.equal(ctx.globalAlpha, 1); assert.equal(ctx.fillStyle, "#123456")
  return calls
}
const at = ({ w, ag, pal }, age) => { w.ticks = ag.diedAt + age; return marks(ctx => D.drawLostAndFound(ctx, w, pal)) }

test("the signal goes first: static where the agent was, then a 404 wisp that rises and fades", () => {
  const s = lost(false)
  const glow = calls => calls.filter(c => c[4] === D.LOST_GLOW)
  assert.ok(glow(at(s, 0)).length > 4)
  assert.ok(glow(at(s, D.LOST_STATIC - 1))[0][5] < glow(at(s, 0))[0][5], "static fades")
  assert.equal(at(s, D.LOST_STATIC).length, 0, "a beat of nothing before the wisp")
  const early = glow(at(s, 20)), late = glow(at(s, 40))
  assert.ok(early.length > 6, "404 in glyphs")
  assert.ok(Math.min(...late.map(c => c[1])) < Math.min(...early.map(c => c[1])), "rising")
  assert.equal(at(s, D.LOST_WISP[1]).length, 0)
  s.w.reducedMotion = true
  assert.equal(at(s, 0).length, 0, "no static under reduced motion")
  assert.deepEqual(glow(at(s, 20)).map(c => c[1]), glow(at(s, 40)).map(c => c[1]), "a still wisp")
})

test("its own umbrella floats up and away, and only if it had one", () => {
  const s = lost(true), colour = D.brollyColour(s.w, s.pal, s.ag)
  const brolly = age => at(s, age).filter(c => c[4] === colour)
  const a = brolly(5), b = brolly(40)
  assert.ok(a.length > 0 && b.length > 0)
  assert.ok(Math.min(...b.map(c => c[1])) < Math.min(...a.map(c => c[1])) - 8, "rising")
  assert.notEqual(Math.min(...b.map(c => c[0])), Math.min(...a.map(c => c[0])), "drifting")
  assert.equal(brolly(D.LOST_DRIFT).length, 0)
  const none = lost(false), plain = D.brollyColour(none.w, none.pal, none.ag)
  assert.equal(at(none, 5).filter(c => c[4] === plain && c[2] > 6).length, 0, "no umbrella to let go of")
})

test("the newest agent out of the hatch clocks in: grey, then green, then gone", () => {
  const w = S.generate(3, 0, 3); w.res = 2
  while (!(w.lastReleaseAt >= 0)) S.step(w)
  const pal = P.build(themeOf("tokyo-night").theme, 3)
  const badge = age => { w.ticks = w.lastReleaseAt + age; return marks(ctx => D.drawLostAndFound(ctx, w, pal)) }
  assert.ok(badge(1).some(c => c[4] === D.ARRIVAL_OFFLINE))
  assert.ok(badge(8).some(c => c[4] === D.ARRIVAL_ONLINE))
  assert.equal(badge(D.CLOCK_IN).length, 0)
  w.res = 1; assert.equal(badge(8).length, 0)
})

test("lost-and-found paint is read-only and RNG-free", () => {
  const random = Math.random
  try {
    const scenes = [lost(true), lost(false)]
    Math.random = () => { throw Error("draw RNG") }
    for (const s of scenes) for (const age of [0, 3, 11, 20, 45, 80]) {
      s.w.ticks = s.ag.diedAt + age
      const before = hash(JSON.stringify(s.w)), a = marks(ctx => D.drawLostAndFound(ctx, s.w, s.pal))
      assert.deepEqual(marks(ctx => D.drawLostAndFound(ctx, s.w, s.pal)), a)
      assert.equal(hash(JSON.stringify(s.w)), before)
    }
  } finally { Math.random = random }
})
