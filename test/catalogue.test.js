import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"
import { levelWith } from "./levels.js"

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

for (const spec of S.SPECIALS) {
  test(`${spec.name} plays a level to the end`, () => {
    for (const level of [5, 16]) {
      const w = S.generate(level, 0, 3)
      w.special = spec.id; w.specialSpec = S.specialSpec(spec.id)
      w.specialAt = 1
      for (let t = 0; t < 400; t++) S.step(w)
      draw(w, level)
      playOut(w)
    }
  })
}

test("a Jungle pit with something in it draws through its whole rise", () => {
  const level = levelWith(S, "Jungle", (w) => w.pits.some((p) => p.croc))
  const w = S.generate(level, 0, 3)
  for (let t = 0; t < 1200; t += 40) {
    for (let k = 0; k < 40; k++) S.step(w)
    draw(w, level)
  }
})

test("an ascending tower plays to the end", () => {
  // Only the Skyscraper is ever played upward (see the note above
  // `w.ascending` in generate).
  playOut(S.generate(levelWith(S, "Skyscraper", (w) => w.ascending), 0, 3), 12000)
})

test("the crocodile crosses a wide pool through its whole cycle, and stays out of a narrow one", () => {
  const w = S.generate(levelWith(S, "Jungle"), 0, 3), pal = P.build(theme.theme, 5)
  for (const res of [1, 2]) for (let t = 0; t < D.CROC_CYCLE; t += 3) {
    w.res = res; w.ticks = t
    const img = canvas(400 * res, 248 * res, theme.background)
    D.drawCroc(img.ctx, w, pal, { seed: 1 }, 40, D.CROC_LEN + 40, 120)
    if (t % 30 === 0) {
      const narrow = canvas(400, 248, theme.background), blank = Buffer.from(narrow.buf).toString("base64")
      D.drawCroc(narrow.ctx, w, pal, { seed: 1 }, 40, D.CROC_LEN, 120)
      assert.equal(Buffer.from(narrow.buf).toString("base64"), blank, "no room, no crocodile")
    }
  }
})

test("a colleague under the exit climbs or builds out, whatever is left", () => {
  const level = levelWith(S, "Skyscraper", (w) => w.ascending)
  for (const skills of [{ climber: 5, builder: 5 }, { climber: 0, builder: 5 }, { climber: 0, builder: 0 }]) {
    const w = S.generate(level, 0, 3)
    for (let t = 0; t < 300; t++) S.step(w)
    Object.assign(w.skills, skills)
    for (const ag of w.agents) if (!ag.gone && ag.state === "walk") S.climbOut(w, ag, S.take)
  }
})
