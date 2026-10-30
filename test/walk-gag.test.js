import test from "node:test"
import assert from "node:assert/strict"
import { load } from "../tools/render.js"

// Now and then one agent does something daft mid-walk: a pure function of the
// tick and id, rare, and only when it has nothing better to do.
const D = load("Draw.js")
const walker = over => Object.assign({ id: 5, x: 20, y: 30, dir: 1, state: "walk", anim: 0, still: 0 }, over)
const world = over => Object.assign({ res: 2, level: 4, exit: { x: 80, y: 10, w: 4, h: 5 }, ticks: 0 }, over)

test("gags are brief, rare and cycle through every kind", () => {
  const kinds = new Set()
  let on = 0
  const T = 6000
  for (let t = 0; t < T; t++) {
    const g = D.walkGag(world({ ticks: t }), walker())
    if (!g) continue
    on++; kinds.add(g.kind)
    assert.ok(g.t < D.WALK_GAG_TICKS[g.kind])
  }
  assert.equal(kinds.size, D.WALK_GAGS.length)
  assert.ok(on / T < 0.08, `busy ${(on / T * 100).toFixed(1)}% of the time`)
})

test("nothing better to do: not on the panel, idle, at the door, carrying, or in reduced motion", () => {
  const busy = t => { for (let n = 0; n < 2000; n++) if (D.walkGag(world({ ticks: n }), walker(t))) return true; return false }
  assert.ok(busy({}))
  for (let n = 0; n < 2000; n++) {
    assert.equal(D.walkGag(world({ ticks: n, res: 1 }), walker()), null)
    assert.equal(D.walkGag(world({ ticks: n, reducedMotion: true }), walker()), null)
    assert.equal(D.walkGag(world({ ticks: n }), walker({ state: "fall" })), null)
    assert.equal(D.walkGag(world({ ticks: n }), walker({ still: 40 })), null, "stuck agents idle instead")
    assert.equal(D.walkGag(world({ ticks: n, exit: { x: 24, y: 26, w: 4, h: 5 } }), walker()), null, "the door stretch wins")
    const g = D.walkGag(world({ ticks: n }), walker({ ownBrolly: true }))
    if (g) assert.equal(g.kind, "sneeze", "an umbrella in hand only sneezes")
  }
})

test("the hat tip lifts the hat, and the trip and sneeze move the head", () => {
  assert.equal(D.walkGagHat({ kind: "hat", t: 10 }), 1.5)
  assert.equal(D.walkGagHat({ kind: "trip", t: 10 }), 0)
  assert.deepEqual(D.walkGagHead({ kind: "trip", t: 2 }), { x: 1, y: 1 })
  assert.ok(D.walkGagHead({ kind: "sneeze", t: 2 }).x < 0 && D.walkGagHead({ kind: "sneeze", t: 10 }).x > 0)
  assert.equal(D.walkGagHead({ kind: "hat", t: 2 }), null)
})
