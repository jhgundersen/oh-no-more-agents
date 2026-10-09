import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"

const S = loadCore("Sim.js")

test("backoff falls in four drops with growing waits", () => {
  assert.equal(S.backoffCurve(0), 0)
  assert.equal(S.backoffCurve(1), 1)
  let last = 0, holds = 0, wasHolding = false
  for (let i = 1; i <= 1100; i++) {
    const v = S.backoffCurve(i / 1100)
    assert.ok(v >= last, "never rises back up")
    const holding = v === last
    if (holding && !wasHolding) holds++
    wasHolding = holding
    last = v
  }
  assert.equal(holds, 3)
})

test("Rate Limiter freezes a fixture and the colony stops treating it as lethal", () => {
  // Set the encounter up directly rather than hunting the catalogue for one:
  // the catalogue reshuffles whenever a biome or special is added.
  let w = null
  for (let lv = 1; lv <= 60 && !w; lv++) {
    const cand = S.generate(lv, 0, lv * 7919 + 13)
    if (cand.hazards.some(h => h.kind !== "current")) w = cand
  }
  const h = w.hazards.find(h => h.kind !== "current")
  const mid = S.hazardMid(h)
  h.known = true
  const ag = { special: "ratelimit", x: mid.x - 6, y: Math.floor(mid.y), dir: 1, state: "walk", cool: 0, gone: false }
  // Line of sight is the special's own business; here the point is what a
  // throttle does, so stand it where it can see.
  for (let y = Math.floor(mid.y) - 3; y <= Math.floor(mid.y); y++)
    for (let x = Math.floor(ag.x); x <= Math.round(mid.x); x++)
      if (S.solid(w, x, y) && !(x >= h.zx0 && x <= h.zx1 && y >= h.zy0 && y <= h.zy1)) w.terrain[y * S.COLS + x] = S.EMPTY
  assert.ok(S.throttleHazard(w, ag), "throttled")
  assert.equal(h.throttled, S.THROTTLE_TICKS)
  assert.ok(ag.cool > 0, "spent its cooldown")
  assert.equal(S.hazardZoneAt(w, Math.round(mid.x), Math.round(mid.y), true), null)
  const phase = h.phase
  for (let i = 0; i < 50; i++) S.stepOneHazard(w, h)
  assert.equal(h.phase, phase, "frozen in place")
  while (h.throttled > 0) S.stepOneHazard(w, h)
  assert.equal(h.phase, "rest", "comes back through rest, not mid-shot")
})

test("every special has its own flight gear, and a trick unless it never does one", () => {
  const D = loadCore("Draw.js")
  // These never enter the `trick` state: they act while walking, or camp.
  const noTrick = new Set(["ceiling", "camp", "shield", "throttle", "net"])
  for (const spec of S.SPECIALS) {
    assert.ok(D.GEAR_DRAW[spec.height], spec.name + " has no drawing for " + spec.height)
    if (!noTrick.has(spec.act)) assert.ok(D.TRICK_DRAW[spec.act], spec.name + " has no drawing for " + spec.act)
  }
})

test("every trick and every flight device draws without throwing, both ways", async () => {
  const { canvas, themeOf } = await import("../tools/render.js")
  const D = loadCore("Draw.js"), P = loadCore("Palette.js")
  const theme = themeOf("tokyo-night")
  const w = S.generate(3, 0, 99)
  const pal = P.build(theme.theme, 3)
  for (const spec of S.SPECIALS) {
    w.specialSpec = spec
    for (const dir of [1, -1]) for (const anim of [0, 3]) {
      const img = canvas(200, 160, theme.background)
      for (let timer = 0; timer <= 14; timer += 7)
        D.drawAgentTrick(img.ctx, w, pal, { special: spec.id, state: "trick", timer, anim, dir, x: 25, y: 20, id: 1, shotIndex: 2 },
          100, 80, dir, spec.robe, spec.hair)
      for (const tick of [0, 20, 45])
        D.drawAgentHeightGear(img.ctx, w, pal, { special: spec.id, state: "height", heightMode: spec.height, heightTick: tick,
          heightTicks: 60, anim, dir, x: 25, y: 20, id: 1, heightFromX: 24, heightFromY: 15, heightToX: 30, heightToY: 30 },
          100, 80, dir, spec.robe, spec.hair)
    }
  }
})

test("Fallback nets a lethal fall once the umbrellas are gone, and the net is drawn", async () => {
  const { canvas, themeOf } = await import("../tools/render.js")
  const D = loadCore("Draw.js"), P = loadCore("Palette.js")
  const w = S.generate(1, 0, 99)
  // A clear shaft, a floor at the bottom, nobody else on the board.
  w.agents = []; w.enemies = []; w.hazards = []; w.toRelease = w.released = 2
  for (let y = 10; y < 40; y++) for (let x = 20; x < 40; x++) w.terrain[y * S.COLS + x] = S.EMPTY
  for (let x = 20; x < 40; x++) w.terrain[40 * S.COLS + x] = S.DIRT
  w.skills.floater = 0
  const hero = { id: 1, special: "fallback", x: 25.5, y: 39, dir: 1, state: "walk", cool: 0, gone: false }
  const faller = { id: 2, x: 30.5, y: 12, dir: 1, state: "fall", fall: 0, floater: false, gone: false, trait: "steady" }
  w.specialSpec = S.specialSpec("fallback")
  w.agents.push(hero, faller)
  assert.ok(S.deployNet(w, hero), "a net goes down under a lethal drop")
  assert.equal(w.nets.length, 1)
  assert.ok(!S.deployNet(w, Object.assign({}, hero, { cool: 0 })), "and not a second under the same spot")
  for (let i = 0; i < 400 && faller.state === "fall"; i++) S.stepFall(w, faller)
  assert.ok(!faller.gone, "caught, not splatted")
  assert.equal(faller.state, "walk")

  const theme = themeOf("tokyo-night"), pal = P.build(theme.theme, 1)
  const img = canvas(400, 248, theme.background)
  const blank = Buffer.from(img.buf).toString("base64")
  D.drawNet(img.ctx, w, w.nets[0])
  assert.notEqual(Buffer.from(img.buf).toString("base64"), blank)
})

test("without the net the same fall kills", () => {
  const w = S.generate(1, 0, 99)
  w.agents = []
  for (let y = 10; y < 40; y++) for (let x = 20; x < 40; x++) w.terrain[y * S.COLS + x] = S.EMPTY
  for (let x = 20; x < 40; x++) w.terrain[40 * S.COLS + x] = S.DIRT
  w.skills.floater = 0
  const faller = { id: 2, x: 30.5, y: 12, dir: 1, state: "fall", fall: 0, floater: false, gone: false, trait: "steady" }
  w.agents.push(faller)
  for (let i = 0; i < 400 && faller.state === "fall"; i++) S.stepFall(w, faller)
  assert.ok(faller.gone)
})

test("an agent fires at a drone in range whichever way it is facing", () => {
  const w = S.generate(1, 0, 99)
  w.agents = []; w.enemies = []
  for (let y = 10; y < 40; y++) for (let x = 20; x < 40; x++) w.terrain[y * S.COLS + x] = S.EMPTY
  for (let x = 20; x < 40; x++) w.terrain[40 * S.COLS + x] = S.DIRT
  const ag = { id: 1, x: 30.5, y: 39, dir: 1, state: "walk", gunCool: 0, shotFor: 0, special: null, gone: false }
  const drone = { id: 9, kind: "drone", x: 24, y: 33, gone: false, state: "fly" }   // behind and above
  w.agents.push(ag); w.enemies.push(drone)
  assert.ok(S.shootDrone(w, ag), "it fires")
  assert.ok(ag.gunCool > 0, "and has to reload")
  drone.x = 5; drone.gone = false
  ag.gunCool = 0
  assert.ok(!S.shootDrone(w, ag), "not at one out of range")
})
