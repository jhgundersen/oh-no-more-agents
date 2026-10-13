import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { themeOf } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")

function recorder() {
  const calls = []
  return {
    calls, globalAlpha: 1, fillStyle: "#000",
    fillRect(x, y, w, h) { calls.push({ x, y, w, h, a: this.globalAlpha, c: this.fillStyle }) }
  }
}
function shooter(res, shotFor) {
  const w = S.generate(6, 0, 1); w.res = res
  const ag = S.spawn(w)
  Object.assign(ag, { x: 20.5, y: 40, dir: 1, state: "walk", shotFor, shotTo: 40, shotY: 38 })
  w.agents = [ag]
  return { w, ag, pal: P.build(themeOf("tokyo-night").theme, 6) }
}

// The round flies for three ticks, then the far end sparks: whatever the
// tick, every rectangle sits on the half-pixel grid and alpha comes back to 1.
test("a sidearm shot at res 2 flies, then sparks at the far end", () => {
  for (let shotFor = 8; shotFor >= 1; shotFor--) {
    const { w, ag, pal } = shooter(2, shotFor), ctx = recorder()
    D.drawAgentSidearm(ctx, w, pal, ag)
    assert.equal(ctx.globalAlpha, 1)
    for (const c of ctx.calls) for (const n of [c.x, c.y, c.w, c.h]) assert.equal(n * 2, Math.round(n * 2))
    const far = ctx.calls.filter(c => c.x >= 40 * 4 - 8)
    if (8 - shotFor >= D.SHOT_FLIGHT) assert.ok(far.length > 0, `spark at shotFor ${shotFor}`)
  }
})

test("res 1 keeps the dotted line and no half pixels", () => {
  const { w, ag, pal } = shooter(1, 6), ctx = recorder()
  D.drawAgentSidearm(ctx, w, pal, ag)
  for (const c of ctx.calls) for (const n of [c.x, c.y, c.w, c.h]) assert.equal(n, Math.round(n))
})

test("the umbrella shield draws at both resolutions, side-on and overhead", () => {
  for (const res of [1, 2]) for (const dir of [1, -1, 0]) for (const left of [24, 20, 1]) {
    const { w, ag, pal } = shooter(res, 0)
    Object.assign(ag, { brollyFor: left, brollyDir: dir })
    const ctx = recorder()
    D.drawUmbrella(ctx, w, pal, ag, 80, 140, "walk")
    assert.ok(ctx.calls.length >= 3, `res ${res} dir ${dir}`)
    assert.equal(ctx.globalAlpha, 1)
    for (const c of ctx.calls) for (const n of [c.x, c.y, c.w, c.h])
      assert.equal(n * res, Math.round(n * res), "pixel grid")
    if (dir) {
      const front = ctx.calls.filter(c => (c.x - 84) * dir > 4 && c.c !== pal.umbrellaStem)
      assert.ok(front.length > 0, "canopy sits toward the shooter")
    }
  }
})

test("the report card's battle line counts guards down and umbrella saves", () => {
  assert.equal(D.battleLine({ enemiesKilled: 0 }), "")
  assert.equal(D.battleLine({ enemiesKilled: 1, umbrellaSaves: 0 }), "1 GUARD DOWN")
  assert.equal(D.battleLine({ enemiesKilled: 2, umbrellaSaves: 1 }), "2 GUARDS DOWN · 1 UMBRELLA SAVE")
  assert.equal(D.battleLine({ enemiesKilled: 0, umbrellaSaves: 3 }), "3 UMBRELLA SAVES")
})

test("the MVP is the agent who did most in the fight, and only if somebody did", () => {
  assert.equal(D.mvpLine({ agents: [{ id: 3 }, { id: 4 }] }), "")
  assert.equal(D.mvpLine({ agents: [{ id: 3, saves: 1 }, { id: 7, downed: 1 }] }), "MVP AGENT 007 · 1 DOWN")
  assert.equal(D.mvpLine({ agents: [{ id: 12, saves: 2, downed: 1 }] }), "MVP AGENT 012 · 1 DOWN · 2 SAVES")
  assert.equal(D.mvpLine({ agents: [{ id: 1, special: true, downed: 5 }, { id: 2, saves: 1 }] }), "MVP AGENT 002 · 1 SAVE")
})
