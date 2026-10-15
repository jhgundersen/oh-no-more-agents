import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { colonySeed } from "../tools/simcheck.js"

// The title card's forecast (Outcome.forecastLines): two lines read off the
// fresh world, the same for the same level, short enough for the card.
const S = loadCore("Sim.js"), O = loadCore("Outcome.js")

test("every biome gets two short, deterministic lines that do not touch the world", () => {
  for (let level = 1; level <= 20; level++) {
    const w = S.generate(level, 0, colonySeed(level, 0, 1)), before = JSON.stringify(w)
    const lines = O.forecastLines(w)
    assert.equal(lines.length, 2)
    assert.match(lines[0], /^FORECAST: [A-Z0-9 ,]+$/)
    assert.match(lines[1], /^\d0% CHANCE OF [A-Z ,]+ · (UMBRELLAS: \d+|NO UMBRELLAS\. GOOD LUCK)$/)
    assert.ok(lines.every(l => l.length <= 56), lines.join(" | "))
    assert.deepEqual(O.forecastLines(w), lines, "same level, same forecast")
    assert.equal(JSON.stringify(w), before, "read-only")
  }
})

test("conditions follow the level: rarest first, two at most, and a quiet level gets clear skies", () => {
  const w = S.generate(1, 0, 3)
  Object.assign(w, { enemyRoster: ["guard"], mission: {}, lifts: [{}], events: [{}], hazards: [{}], pits: [{}] })
  assert.deepEqual(O.forecastConditions(w), ["HOSTILE CONTRACTORS", "A MEETING AT 3"])
  Object.assign(w, { enemyRoster: [], mission: null, lifts: [], events: [], hazards: [], pits: [] })
  assert.deepEqual(O.forecastConditions(w), ["CLEAR SKIES, ALLEGEDLY"])
  w.skills.floater = 0
  assert.match(O.forecastLines(w)[1], /NO UMBRELLAS\. GOOD LUCK$/)
})
