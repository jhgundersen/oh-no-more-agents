import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { load, canvas, themeOf } from "../tools/render.js"

// Skill flourishes (Draw's drawSkillFlourishes and blockerShake): chips off a
// basher's and a digger's cut, a builder's tamp, a floater's umbrella snapping
// open, a blocker shaking its head. Page only, draw only, off under reduced
// motion.
const S = load("Sim.js"), D = load("Draw.js"), P = load("Palette.js")
const hash = x => createHash("sha256").update(x).digest("hex")

function doing(state, levels) {
  for (const level of levels) {
    const w = S.generate(level, 0, 3); w.res = 2
    for (let n = 0; n < 2500 && !w.done; n++) {
      S.step(w)
      const ag = w.agents.find(a => !a.gone && a.state === state && !a.special)
      if (ag) return { w, ag, pal: P.build(themeOf("tokyo-night").theme, level) }
    }
  }
  throw Error("nobody " + state)
}
function marks(fn) {
  const ctx = canvas(800, 496).ctx, calls = []
  ctx.fillStyle = "#123456"; ctx.globalAlpha = 1
  ctx.fillRect = (...r) => { assert.ok(calls.length < 500); assert.ok(r.every(n => Number.isInteger(n * 2)), "half-pixel grid"); calls.push([...r, ctx.fillStyle, ctx.globalAlpha]) }
  fn(ctx)
  assert.equal(ctx.globalAlpha, 1); assert.equal(ctx.fillStyle, "#123456")
  return calls
}
const inAir = (w, [x, y, wd, h]) => { for (let yy = y; yy < y + h; yy += 0.5) for (let xx = x; xx < x + wd; xx += 0.5) if (!D.mechanismAir(w, xx, yy)) return false; return true }

for (const [state, levels] of [["bash", [1, 3, 5]], ["dig", [2, 4, 6]]]) test(`${state}: clods fly off the cut in the material's colours and fade by the next stroke`, () => {
  const { w, ag, pal } = doing(state, levels)
  w.agents = [ag]
  const at = t => { ag.timer = t; return marks(ctx => D.drawSkillFlourishes(ctx, w, pal)) }
  let seen = 0
  for (let t = 0; t < D.CHIP_TICKS; t++) for (const c of at(t)) { seen++; assert.ok(inAir(w, c)); assert.ok(c[5] <= 1 - t / D.CHIP_TICKS + 1e-9) }
  assert.ok(seen >= 8, `${state} throws clods`)
  assert.equal(at(D.CHIP_TICKS).length, 0)
  w.reducedMotion = true; assert.equal(at(2).length, 0); w.reducedMotion = false
  w.res = 1; assert.equal(at(2).length, 0)
})

test("a builder tamps each brick as it goes down", () => {
  const { w, ag, pal } = doing("build", [6, 8, 10, 12])
  w.agents = [ag]
  const at = t => { ag.timer = t; return marks(ctx => D.drawSkillFlourishes(ctx, w, pal)) }
  assert.ok(at(0).some(c => c[4] === pal.skin), "the palm on the brick")
  assert.ok(at(1).some(c => c[4] === D.LANDING_DUST), "mortar dust")
  assert.equal(at(3).length, 0)
})

test("an umbrella snapping fully open throws a ring of air off its rim", () => {
  const { w, ag, pal } = doing("walk", [17])
  Object.assign(ag, { state: "fall", floater: true }); w.agents = [ag]
  const at = fall => { ag.fall = fall; return marks(ctx => D.drawSkillFlourishes(ctx, w, pal)) }
  assert.equal(at(2.5).length, 0, "still opening")
  assert.ok(at(2.9).length > 0 && at(3.2).length > 0)
  assert.equal(at(3.5).length, 0, "and gone")
})

test("a blocker shakes its head at whoever walks up to it, and only then", () => {
  const { w, ag } = doing("block", [4, 6, 8, 10, 12])
  const walker = w.agents.find(a => a !== ag && !a.gone) || S.spawn(w)
  Object.assign(walker, { state: "walk", gone: false, y: ag.y, x: ag.x - 2, dir: 1 })
  w.agents = [ag, walker]
  const shakes = () => { const xs = new Set(); for (let t = 0; t < 16; t++) { w.ticks = t; xs.add(D.blockerShake(w, ag)) } return xs }
  assert.ok(shakes().size >= 3, "side to side")
  assert.equal(D.traitHeadOffset(w, ag).x, D.blockerShake(w, ag), "the head is what moves")
  walker.dir = -1; assert.deepEqual([...shakes()], [0], "walking away")
  walker.dir = 1; w.reducedMotion = true; assert.deepEqual([...shakes()], [0])
})

test("flourishes are read-only and RNG-free", () => {
  const random = Math.random
  try {
    const scenes = [doing("bash", [1]), doing("dig", [2]), doing("build", [6])]
    Math.random = () => { throw Error("draw RNG") }
    for (const { w, pal } of scenes) for (let t = 0; t < 8; t++) {
      w.ticks += 1
      const before = hash(JSON.stringify(w)), a = marks(ctx => D.drawSkillFlourishes(ctx, w, pal))
      assert.deepEqual(marks(ctx => D.drawSkillFlourishes(ctx, w, pal)), a)
      assert.equal(hash(JSON.stringify(w)), before)
    }
  } finally { Math.random = random }
})
