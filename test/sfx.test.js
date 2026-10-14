import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import vm from "node:vm"

// public/agents/sfx.js against a stand-in AudioContext: what plays when the
// world changes, and that nothing plays while it is off.
function load() {
  const played = []
  class Node { connect() {} start() {} stop() {} }
  class Param { setValueAtTime() {} exponentialRampToValueAtTime() {} }
  class Ctx {
    constructor() { this.state = "running"; this.currentTime = 0; this.sampleRate = 8000; this.destination = {} }
    createGain() { const n = new Node(); n.gain = new Param(); return n }
    createOscillator() { const n = new Node(); n.frequency = new Param(); played.push("osc"); return n }
    createBuffer(c, len) { return { getChannelData: () => new Float32Array(len) } }
    createBufferSource() { played.push("noise"); return new Node() }
    createBiquadFilter() { const n = new Node(); n.frequency = {}; return n }
    resume() {}
  }
  let clock = 0
  const sandbox = { window: { AudioContext: Ctx }, performance: { now: () => (clock += 1000) }, Math }
  vm.runInNewContext(fs.readFileSync(new URL("../public/agents/sfx.js", import.meta.url), "utf8"), sandbox)
  return { sfx: sandbox.window.AgentSfx, played }
}

function world() {
  return { agents: [], enemies: [], blasts: [], trains: [], saved: 0, lost: 0, done: false, toRelease: 10, lastEvent: "" }
}

test("off by default: observing changes plays nothing", () => {
  const { sfx, played } = load()
  const w = world()
  sfx.observe(w); w.saved = 3; sfx.observe(w)
  assert.equal(played.length, 0)
  assert.equal(sfx.isOn(), false)
})

test("on: each change plays its sound, and a new world resets the memory", () => {
  const { sfx, played } = load()
  sfx.setOn(true)
  const w = world()
  sfx.observe(w)
  const steps = [
    () => { w.saved++ },                                                  // home
    () => { w.lost++ },                                                   // down
    () => { w.blasts.push({}) },                                          // boom
    () => { w.umbrellaSaves = 1 },                                        // tink
    () => { w.agents.push({ floater: true, state: "fall", fall: 3 }) },   // pop
    () => { w.trains.push({ phase: "wait" }) },                           // chime
    () => { w.agents.push({ state: "zip" }) },                            // zing
    () => { w.lastEvent = "thrown out" },                                 // whoosh
    () => { w.enemies.push({ state: "brawl" }) },                         // scuffle
    () => { w.done = true; w.saved = 9 }                                  // fanfare
  ]
  for (const change of steps) {
    const before = played.length
    change(); sfx.observe(w)
    assert.ok(played.length > before, change.toString())
  }
  const before = played.length
  sfx.observe(world())                                                    // next level
  assert.equal(played.length, before, "no sound for the difference between two levels")
})

test("named events: a boss hit, backup and a mission each have a cue; an ordinary tick has none", () => {
  for (const event of ["boss hit", "backup", "mission complete"]) {
    const { sfx, played } = load()
    sfx.setOn(true)
    const w = world()
    sfx.observe(w)
    sfx.observe(w)
    assert.equal(played.length, 0, "quiet tick")
    w.lastEvent = event; sfx.observe(w)
    assert.ok(played.length > 0, event)
  }
})
