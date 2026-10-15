import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"

// The office radio: now and then the ticker narrates what is on screen.
const S = loadCore("Sim.js"), D = loadCore("Draw.js")

function play(level, seed) {
  const w = S.generate(level, 0, seed)
  while (!w.done && w.ticks < 6000) S.step(w)
  return w
}

test("each line at most once a level, far apart, the same for the same run, and changing nothing", () => {
  let heard = 0
  for (let level = 1; level <= 40; level++) {
    const w = play(level, level * 31)
    const lines = w.feed.filter(f => f.text.startsWith("ON AIR"))
    heard += Object.keys(w.radioUsed).length
    for (let i = 1; i < lines.length; i++) assert.ok(lines[i].t - lines[i - 1].t >= S.RADIO_GAP, "far apart")
    for (const f of lines) {
      assert.ok(f.text.length <= 72, f.text)
      for (const ch of f.text) assert.ok(D.TRANSITION_GLYPHS[ch], `glyph ${ch} in ${f.text}`)
    }
    const again = play(level, level * 31)
    assert.deepEqual(again.feed.map(f => f.text), w.feed.map(f => f.text), "a replay hears the same broadcast")
    const quiet = S.generate(level, 0, level * 31); quiet.radioUsed = null
    while (!quiet.done && quiet.ticks < 6000) S.step(quiet)
    assert.deepEqual([quiet.saved, quiet.lost, quiet.ticks], [w.saved, w.lost, w.ticks], "the radio changes nothing")
  }
  assert.ok(heard >= 20, `heard ${heard}`)
})

test("what it notices: the last one in, a long meeting, a pacer — and not over a fresh note", () => {
  const w = S.generate(1, 0, 3)
  w.agents = [Object.assign(S.spawn(w), { x: 40, y: 20, state: "walk", idle: 500 })]
  w.released = w.toRelease; w.saved = 0; w.ticks = 900
  assert.equal(S.radioWorth(w).kind, "pacer")
  w.radioUsed.pacer = true
  w.saved = 3
  assert.equal(S.radioWorth(w).kind, "last")
  w.feed.push({ t: 890, text: "SOMETHING JUST HAPPENED" })
  S.stepRadio(w)
  assert.ok(!w.feed.some(f => f.text.startsWith("ON AIR")), "quiet while a note is fresh")
  w.ticks = 1080
  S.stepRadio(w)
  assert.match(w.feed.at(-1).text, /^ON AIR: AGENT \d{3} IS (THE LAST ONE IN|LAST OUT)/)
  assert.equal(S.radioLine({ level: 3 }, "half", ""), "ON AIR: HALF HOME ALREADY. SUSPICIOUSLY EFFICIENT.")
})
