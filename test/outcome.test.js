import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"

// The end-of-level line: a whole colony home earns a completion line, a nuke
// a nuke line, anything else a partial one — unless one of the level's own
// facts is told instead, which is most of the time. Every branch must hand
// back a non-empty string, never undefined.
const O = loadCore("Outcome.js")
const base = { saved: 0, toRelease: 10, nuking: false, lastUsed: {}, hazardKills: 0, bombsUsed: 0, rescues: 0,
  pits: [], lost: 0, enemyRoster: [], eventMechs: {}, carrierHome: false }

const cases = {
  "everyone home": { saved: 10 },
  "nuked": { saved: 3, nuking: true },
  "partial": { saved: 6 },
  "busy level": { saved: 7, hazardKills: 2, bombsUsed: 1, rescues: 1, lost: 2, pits: [{}],
    lastUsed: { builder: 1, digger: 1, miner: 1, floater: 1, blocker: 1, bomber: 1 },
    enemyRoster: ["operator", "sniper"], eventMechs: { spill: true, collapse: true }, carrierHome: true }
}

for (const [name, over] of Object.entries(cases)) {
  test(`outcome line: ${name}`, () => {
    for (let i = 0; i < 200; i++) {
      const line = O.outcomeLine(Object.assign({}, base, over))
      assert.equal(typeof line, "string")
      assert.ok(line.length > 0)
    }
  })
}
