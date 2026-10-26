import test from "node:test"
import assert from "node:assert/strict"
import { load } from "../tools/render.js"

// The page walk (Draw's AGENT_GAIT): the body is lowest when the legs are
// widest and highest when they cross, and only a swinging foot leaves the
// floor. It had been the other way round, which reads as a shuffle.
const D = load("Draw.js")

test("the page walk is low at contact, high at passing, and lifts only the swinging foot", () => {
  const gait = D.AGENT_GAIT
  assert.equal(gait.length, 8)
  for (const [lead, drop, back, front] of gait) {
    for (const n of [lead, drop, back, front]) assert.ok(Number.isInteger(n * 2), "half-pixel grid")
    if (lead === -1) assert.ok(drop >= 0, "legs widest: weight down")
    if (lead > 0) assert.ok(drop < 0, "legs crossing: body up")
    if (back || front) assert.ok(lead >= 0, "a foot is off the floor only while swinging through")
    assert.ok(!(back && front), "never both feet")
  }
  const drops = gait.map(g => g[1])
  assert.ok(Math.max(...drops) - Math.min(...drops) === 1, "a one-pixel bob")
  assert.ok(gait.slice(0, 4).some(g => g[2]) && gait.slice(4).some(g => g[3]), "the two steps swing different feet")
})

test("a floating umbrella leans downwind in a gust, a pixel and a half at most", () => {
  const ag = { id: 3 }, w = { ticks: 100, reducedMotion: true }
  assert.equal(D.pageFloatSway(w, ag), 0)
  for (const [wind, lean] of [[0.2, 0.5], [0.5, 1.5], [1, 1.5], [-0.5, -1.5]]) {
    w.wind = wind
    assert.equal(D.pageFloatSway(w, ag), lean, `wind ${wind}`)
  }
  w.reducedMotion = false; w.wind = 0
  for (let t = 0; t < 200; t++) { w.ticks = t; const s = D.pageFloatSway(w, ag); assert.ok(Math.abs(s) <= 1 && Number.isInteger(s * 2)) }
})
