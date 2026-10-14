import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { frame } from "../tools/render.js"

// A smoke test, not a balance test: `npm run sim` owns the numbers. This plays
// three levels of every biome to the end and draws it on the way, so a missing
// function or a thrown exception anywhere in the core files fails `npm test`
// rather than waiting for somebody to run the sim. It is also what gives the
// CRAP report (`npm run crap`) coverage to work from.

const S = loadCore("Sim.js")
const D = loadCore("Draw.js")
const P = loadCore("Palette.js")

// Sharded by pass so the three run in parallel: `node --test` isolates files,
// not tests, and this was one of the files on the critical path of
// `npm run coverage`. play.test.js, play-2 and play-3 each call this.
export function playPass(pass) {
  const from = (pass - 1) * S.BIOMES.length + 1
  for (let level = from; level < from + S.BIOMES.length; level++) {
    test(`level ${level} (${S.BIOMES[(level - 1) % S.BIOMES.length]}) plays to the end and draws`, () => {
      const w = S.generate(level, 0, level * 7919 + 13)
      let t = 0
      while (!w.done && t < 6000) { S.step(w); t++ }
      assert.ok(w.done, "level hung")
      assert.ok(w.saved + w.lost <= w.released)
      // Both resolutions: res 1 is the Omarchy panel, res 2 the page, and the
      // half-pixel detail only runs at 2.
      for (const ticks of [0, 300]) for (const res of [1, 2]) {
        const { img } = frame(S, D, P, { level, ticks, res })
        assert.ok(img)
      }
    })
  }
}
