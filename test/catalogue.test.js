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

// Every event is played in catalogue-events.test.js, sharded off this file so
// the two run in parallel.

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

test("every hazard kind runs its whole cycle with the colony walking past", () => {
  // Placed by hand on a plain level so every kind, the sniper post included,
  // gets idle → charge → fire → rest with targets in reach, whichever levels
  // the played sample happens to give it.
  for (const spec of S.HAZARDS) {
    const w = S.generate(1, 0, 3), c = w.corridors[1]
    const x = Math.round((c.startX + c.handoffX) / 2)
    w.hazards = [{ kind: spec.id, phase: "idle", t: 0, fired: 0, dir: -c.dir, known: false, throttled: 0,
      lineTo: -1, lineY: 0, zx0: x, zx1: x + spec.w - 1, zy0: c.floorY - spec.h, zy1: c.floorY - 1,
      floorY: c.floorY, mount: spec.mount, name: spec.name }]
    w.hazard = w.hazards[0]
    for (let t = 0; t < 600 && !w.done; t++) S.step(w)
    assert.ok(w.saved + w.lost <= w.released, spec.id)
  }
})

test("an enemy sniper finds a post and takes aim", () => {
  const level = levelWith(S, "Cavern", (w) => w.enemyRoster[0] === "sniper", 3, 200)
  const w = S.generate(level, 0, 3)
  let states = new Set()
  while (!w.done && w.ticks < 6000) {
    S.step(w)
    for (const e of w.enemies) if (e.kind === "sniper") states.add(e.state)
  }
  assert.ok(states.size > 1, [...states].join(","))
})

test("Fallback's net draws through its life", async () => {
  const w = S.generate(3, 0, 3), theme2 = themeOf("tokyo-night")
  w.specialSpec = S.specialSpec("fallback")
  for (const [t, caught] of [[0, -1], [5, 2], [60, 50], [100, -1], [119, -1], [130, -1]]) {
    w.ticks = t
    const img = canvas(400, 248, theme2.background)
    D.drawNet(img.ctx, w, { x: 50, y: 30, t: 0, caught })
  }
  w.specialSpec = null
  D.drawNet(canvas(400, 248, theme2.background).ctx, w, { x: 50, y: 30, t: 0, caught: -1 })
})

test("a Model Collapse copy comes out ahead of the original, or on it at a wall", () => {
  const w = S.generate(1, 0, 3), c = w.corridors[0]
  const ag = S.spawn(w)
  ag.special = "collapse"; ag.dir = 1; ag.x = c.startX + 5; ag.y = c.floorY - 1; ag.modelGen = 0
  w.agents = [ag]
  const land = { x: ag.x + 6, y: ag.y }
  assert.equal(S.collapseCopy(w, ag, land), true)
  const copy = w.agents[1]
  assert.ok(copy.x >= land.x && copy.dir === ag.dir)
  ag.modelGen = 3
  assert.equal(S.collapseCopy(w, ag, land), false, "third generation makes no more")
})

