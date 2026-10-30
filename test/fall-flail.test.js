import test from "node:test"
import assert from "node:assert/strict"
import { load } from "../tools/render.js"

// A real drop with nothing to hold: windmilling arms on their own sides,
// pedalling legs, and the hat coming up off the head past a few cells.
const D = load("Draw.js")
const w = { res: 2 }
const faller = over => Object.assign({ id: 2, state: "fall", fall: 10, anim: 0 }, over)

test("the arms windmill opposite each other and stay on their own sides", () => {
  for (let anim = 0; anim < 16; anim++) {
    const { front, back } = D.fallWindmill(faller({ anim }))
    for (const n of [...front, ...back]) assert.ok(Number.isInteger(n * 2), "half-pixel grid")
    assert.ok(front[0] >= 6 && back[0] + back[2] <= 2, "a shoulder each")
    assert.ok(front[1] !== back[1] || front[3] !== back[3] || front[2] > 2, "never the same pose on both sides, except out")
  }
  const ups = [0, 2, 4, 6].map(anim => D.fallWindmill(faller({ anim })).front[1])
  assert.ok(Math.max(...ups) - Math.min(...ups) >= 4, "round from overhead to the hip")
})

test("the hat lifts only off an unprotected long drop at page resolution", () => {
  assert.equal(D.fallHatLift(w, faller({ fall: 2 })), 0)
  assert.ok(D.fallHatLift(w, faller({ fall: 7 })) >= 1)
  assert.ok(D.fallHatLift(w, faller({ fall: 40 })) <= 2.5)
  assert.equal(D.fallHatLift(w, faller({ floater: true })), 0, "an umbrella keeps it on")
  assert.equal(D.fallHatLift({ res: 1 }, faller()), 0, "the panel keeps its sprite")
  assert.equal(D.fallHatLift(w, faller({ special: "hero" })), 0)
  assert.equal(D.fallHatLift(w, faller({ state: "walk" })), 0)
})
