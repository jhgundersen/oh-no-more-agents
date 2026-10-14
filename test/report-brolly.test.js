import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"

// The report card's umbrella line: landings under an umbrella, and how many
// Cloud Provider handed out.

const S = loadCore("Sim.js"), D = loadCore("Draw.js")

test("the umbrella line counts landings and hand-outs, and is empty when nobody floated", () => {
  assert.equal(D.brollyLine({}), "")
  assert.equal(D.brollyLine({ brollyLandings: 1 }), "1 UMBRELLA LANDING")
  assert.equal(D.brollyLine({ brollyLandings: 8, provisioned: 4 }), "8 UMBRELLA LANDINGS · 4 HANDED OUT")
})

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
