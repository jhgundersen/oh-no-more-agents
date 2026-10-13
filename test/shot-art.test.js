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
