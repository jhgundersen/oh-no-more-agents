import test from "node:test"
import assert from "node:assert/strict"
import { load, canvas } from "../tools/render.js"

// The red team's guard on patrol at page resolution: an eight-beat march, and
// now and then a glance back, a yawn or a scratch. Drawn only.
const D = load("Draw.js")
const guard = over => Object.assign({ id: 7, kind: "gun", state: "walk", x: 20, y: 30, dir: 1, anim: 0 }, over)
const world = over => Object.assign({ res: 2, ticks: 0 }, over)

test("the march rises as the legs pass, settles as a boot lands, and lifts one boot at a time", () => {
  assert.equal(D.GUARD_GAIT.length, 8)
  for (const [stride, rise, back, front] of D.GUARD_GAIT) {
    for (const n of [stride, back, front]) assert.ok(Number.isInteger(n * 2), "half-pixel grid")
    assert.ok(rise === 0 || rise === 1, "a whole-pixel rise keeps the body on its grid")
    if (stride === -1) assert.equal(rise, 0, "legs widest: weight down")
    if (back || front) assert.equal(rise, 1, "a boot is up only as the legs pass")
    assert.ok(!(back && front))
  }
  const m = D.enemyMotion(world(), guard({ anim: 4 }))
  assert.ok(m.fine && m.lift.length === 2)
})

test("only a walking guard at page resolution marches and fools about", () => {
  assert.ok(D.guardGait(world(), guard()))
  for (const [w, en] of [[world({ res: 1 }), guard()], [world({ reducedMotion: true }), guard()], [world({ submerged: true }), guard()],
    [world(), guard({ boss: true })], [world(), guard({ kind: "sniper" })], [world(), guard({ state: "aim" })], [world(), guard({ throttled: 5 })]]) {
    assert.equal(D.guardGait(w, en), null)
    for (let t = 0; t < 600; t++) assert.equal(D.guardGag(Object.assign(w, { ticks: t }), en), null)
  }
})

test("gags are brief, rare, every kind turns up, and drawing them writes nothing", () => {
  const kinds = new Set(), en = guard(), frozen = JSON.stringify(en)
  let on = 0
  const T = 6000, img = canvas(64, 64)
  for (let t = 0; t < T; t++) {
    const g = D.guardGag(world({ ticks: t }), en)
    if (!g) continue
    on++; kinds.add(g.kind); assert.ok(g.t < D.GUARD_GAG_TICKS[g.kind])
    D.GUARD_GAG_DRAW[g.kind](img.ctx, 20, 20, 1, g.t)
  }
  assert.equal(kinds.size, D.GUARD_GAGS.length)
  assert.ok(on / T < 0.1, `busy ${(on / T * 100).toFixed(1)}% of the time`)
  assert.equal(JSON.stringify(en), frozen)
})
