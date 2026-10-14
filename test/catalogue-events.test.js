import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"
import { levelWith } from "./levels.js"

// The event half of catalogue.test.js, split off to run in parallel with it.
// The whole catalogue, reached on purpose. Which events, creatures and heroes
// the played sample in play.test.js meets depends on which biome each level
// number is — and that changes whenever a biome is added. These go through
// every one directly, so nothing in the catalogue is covered by luck.

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const theme = themeOf("tokyo-night")

function playOut(w, limit = 8000) {
  while (!w.done && w.ticks < limit) S.step(w)
  assert.ok(w.saved + w.lost <= w.released, "counts add up")
}

function draw(w, level) {
  for (const res of [1, 2]) {
    w.res = res
    const img = canvas(400 * res, 248 * res, theme.background)
    const pal = P.build(theme.theme, level)
    D.drawTerrain(img.ctx, w, pal); D.drawActors(img.ctx, w, pal, {})
  }
}

for (const ev of S.EVENTS) {
  test(`event ${ev.id} (${ev.biome}) fires and the level plays on`, () => {
    const level = levelWith(S, ev.biome)
    const w = S.generate(level, 0, 3)
    for (let t = 0; t < 250; t++) S.step(w)
    S.fireEvent(w, ev)
    assert.ok(w.eventLog.includes(ev.id))
    for (let t = 0; t < 60; t++) S.step(w)
    draw(w, level)
    playOut(w)
  })
}
