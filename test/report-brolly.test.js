import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"

// Umbrella landings: Sim counts them (the report card no longer prints them,
// but the count is the world's record of the umbrella doing its job).

const S = loadCore("Sim.js")

test("Sim counts each umbrella landing once, as it lands", () => {
  const w = S.generate(126, 0, 126 * 7919 + 13)
  let landings = 0, floating = new Set()
  while (!w.done) {
    S.step(w)
    for (const a of w.agents) {
      if (a.state === "fall" && a.floater) floating.add(a.id)
      else if (floating.has(a.id) && a.state === "walk") { floating.delete(a.id); landings++ }
    }
  }
  assert.ok(w.brollyLandings > 0)
  assert.equal(w.brollyLandings, landings)
})
