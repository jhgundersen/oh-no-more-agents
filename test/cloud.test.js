import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { frame, themeOf } from "../tools/render.js"

// The Cloud, the twentieth biome: soft banks, rain, lightning that an
// umbrella does not stop, updrafts that hold up an umbrella and nobody else,
// and an ON-PREM door.
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const CLOUD = [20, 40, 60, 80, 100]

test("The Cloud is the twentieth biome, on the end: levels 1-19 keep theirs", () => {
  assert.equal(S.BIOMES.length, 20)
  assert.equal(S.BIOMES[19], "The Cloud")
  for (const level of CLOUD) assert.equal(S.generate(level, 0, 1).biome, "The Cloud")
  assert.deepEqual([1, 9, 19].map(l => S.generate(l, 0, 1).biome), ["Cavern", "Skyscraper", "Harbour"])
})

test("banks are soft with a silver lining; updrafts stand in the air at a fixed pitch", () => {
  const w = S.generate(20, 0, 1), k = w.k
  let lining = 0, top = 0
  for (let y = k.SKY; y < k.ROWS - 2; y++) for (let x = 3; x < k.COLS - 3; x++) {
    const c = w.terrain[y * k.COLS + x]
    if (c === k.EMPTY || c === k.STEEL) continue
    if (w.terrain[(y - 1) * k.COLS + x] === k.EMPTY) { top++; if (c === k.ORE) lining++ }
  }
  assert.equal(lining, top, "every exposed top is ORE")
  assert.ok(w.updraftLift)
  const cols = [...w.updraft].map((v, x) => v ? x : -1).filter(x => x >= 0)
  assert.ok(cols.length >= 8 && cols.length <= 14, String(cols.length))
})

test("an updraft holds up an open umbrella and does nothing for anyone without one", () => {
  const w = S.generate(20, 0, 1), x = w.updraft.indexOf(1)
  const floater = Object.assign(S.spawn(w), { x: x + 0.5, y: 20, floater: true, state: "fall" })
  const plain = Object.assign(S.spawn(w), { x: x + 0.5, y: 20, floater: false, state: "fall", fall: 3 })
  const outside = Object.assign(S.spawn(w), { x: x + 6.5, y: 20, floater: true, state: "fall" })
  const fl = S.descentSpeed(w, floater, x), pl = S.descentSpeed(w, plain, x), out = S.descentSpeed(w, outside, x + 6)
  assert.ok(fl < out, "lifted in the column")
  assert.ok(Math.abs(fl - S.FLOAT_SPEED * S.CLOUD_LIFT) < 1e-9)
  assert.ok(!plain.drafted && pl > fl, "no help without an umbrella")
})

test("lightning winds up, strikes and kills whoever is under it, umbrella or not", () => {
  let w = null
  for (const level of CLOUD) {
    const c = S.generate(level, 0, 1)
    if (c.hazards.some(h => h.kind === "lightning")) { w = c; break }
  }
  assert.ok(w, "a stormy Cloud level")
  const h = w.hazards.find(h => h.kind === "lightning")
  assert.equal(S.hazardSpec("lightning").weather, true)
  const ag = Object.assign(S.spawn(w), { x: h.zx0 + 1.5, y: h.zy1, state: "fall", floater: true, fall: 4 })
  w.agents = [ag]
  let phases = new Set()
  for (let i = 0; i < 400 && ag.state !== "dead"; i++) {
    S.stepHazard(w); phases.add(h.phase)
    Object.assign(ag, ag.state !== "dead" ? { x: h.zx0 + 1.5, y: h.zy1, state: "fall", floater: true } : {})
  }
  assert.ok(phases.has("charge") && phases.has("fire"))
  assert.equal(ag.state, "dead", "umbrellas are not lightning rods")
})

test("the ticker: lost in the cloud, and gone serverless; the card's door says ON-PREM", () => {
  const lines = new Set()
  for (const level of CLOUD) for (const seed of [1, 2, 3]) {
    const w = S.generate(level, 0, seed)
    while (!w.done && w.ticks < 4000) { S.step(w); for (const f of w.feed) lines.add(f.text) }
  }
  const all = [...lines]
  assert.ok(all.some(t => /^YOUR FILES ARE IN THE CLOUD\. SO IS [A-Z0-9 ]+\.$/.test(t)), "lost")
  assert.ok(all.some(t => /^[A-Z0-9 ]+ HAS GONE SERVERLESS$/.test(t)), "lifted")
  assert.equal(typeof D.drawExitCloud, "function")
})

test("drawn at both resolutions without error, with a Cloud tint of its own", () => {
  for (const res of [1, 2]) {
    const r = frame(S, D, P, { level: 20, seed: 4242, ticks: 220, res, theme: "tokyo-night" })
    assert.equal(r.world.biome, "The Cloud")
  }
  const theme = themeOf("tokyo-night").theme
  assert.notEqual(P.build(theme, 20).dirt, P.build(theme, 1).dirt)
  assert.equal(P.build(theme, 21).dirt, P.build(theme, 1).dirt, "level 21 is a Cavern again")
})
