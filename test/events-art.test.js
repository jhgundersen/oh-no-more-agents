import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"
import { levelWith } from "./levels.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const theme = themeOf("tokyo-night")
const events = S.EVENTS.filter(e => ["blackout", "drift"].includes(e.mech))
function sample(ev, res) {
  const level = levelWith(S, ev.biome, w => ev.mech !== "blackout" || w.hazards.length > 0, 99)
  const w = S.generate(level, 0, 99)
  for (let i = 0; i < 280; i++) S.step(w)
  w.res = res; w.events = []; w.eventBoost = 0; w.eventDrift = 0
  S.fireEvent(w, ev)
  w.eventFlash = 0; w.eventWarnFor = 0
  if (ev.mech === "blackout") w.eventBoost = ev.ticks - 80
  else w.eventDrift = ev.ticks - 80
  return { w, pal: P.build(theme.theme, level) }
}
function picture(w, draw) {
  const res = w.res || 1, img = canvas(400 * res, 248 * res, theme.background), calls = []
  img.ctx.setTransform(res, 0, 0, res, 0, 0)
  const fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...args) => { calls.push([...args, img.ctx.fillStyle, img.ctx.globalAlpha]); fill(...args) }
  draw(img.ctx)
  return { pixels: Buffer.from(img.buf), calls, ctx: img.ctx }
}

for (const ev of events) test(`${ev.name} remains visible without a banner at res 1 and 2`, () => {
  for (const res of [1, 2]) {
    const { w, pal } = sample(ev, res)
    const before = JSON.stringify(w)
    const active = picture(w, ctx => D.drawActors(ctx, w, pal, {}))
    assert.equal(JSON.stringify(w), before, "drawing changed world state")
    const layer = picture(w, ctx => ev.mech === "drift" ? D.drawActiveEventAir(ctx, w, pal)
      : w.hazards.forEach(h => D.drawEventHazardStatus(ctx, w, pal, h, D.activeEventFade(w, "boost"))))
    assert.ok(layer.calls.length > 0, "no persistent effect")
    assert.ok(layer.calls.every(c => typeof c[4] === "string"), "missing palette colour")
    assert.ok(layer.calls.length <= 600, "event exceeded rectangle budget")
    const replay = picture(w, ctx => D.drawActors(ctx, w, pal, {}))
    assert.deepEqual(replay.pixels, active.pixels, "render depends on hidden state")
    w.eventBoost = 0; w.eventDrift = 0
    assert.equal(picture(w, ctx => D.drawActiveEventAir(ctx, w, pal)).calls.length, 0)
    for (const h of w.hazards) assert.equal(picture(w, ctx => D.drawEventHazardStatus(ctx, w, pal, h, 1)).calls.length, 0)
    const inactive = picture(w, ctx => D.drawActors(ctx, w, pal, {}))
    assert.notDeepEqual(active.pixels, inactive.pixels, "event missing from actor pass")
    w.eventMult = 1; w.driftWhat = ""
    assert.deepEqual(picture(w, ctx => D.drawActors(ctx, w, pal, {})).pixels, inactive.pixels,
      "expired state still affects the board")
  }
})

test("visual duration mirrors match every rule event and fade at both ends", () => {
  for (const ev of events) {
    const { w } = sample(ev, 1), kind = ev.mech === "blackout" ? "boost" : ev.what
    const field = kind === "boost" ? "eventBoost" : "eventDrift"
    assert.equal(D.eventVisualSpan(w, kind), ev.ticks)
    const fades = [ev.ticks, ev.ticks - 12, ev.ticks - 24, 15, 1, 0].map(left => {
      w[field] = left; return D.activeEventFade(w, kind)
    })
    assert.ok(fades[0] > 0 && fades[0] < fades[1] && fades[1] < fades[2])
    assert.equal(fades[2], 1)
    assert.ok(fades[3] < 1 && fades[4] < fades[3]); assert.equal(fades[5], 0)
  }
  const { w } = sample(S.EVENTS.find(e => e.mech === "blackout"), 1); w.biome = "future biome"
  assert.ok(D.activeEventFade(w, "boost") > 0)
})

test("inactive air makes no canvas calls, including stale and unsupported drift flags", () => {
  const { w, pal } = sample(S.EVENTS.find(e => e.id === "nullgrav"), 1)
  for (const res of [undefined, 1, 2]) for (const what of ["sight", "fall", "", "unknown"]) {
    w.res = res; w.driftWhat = what; w.eventDrift = 0
    assert.equal(picture(w, ctx => D.drawActiveEventAir(ctx, w, pal)).calls.length, 0)
    if (["", "unknown"].includes(what)) {
      w.eventDrift = 80
      assert.equal(picture(w, ctx => D.drawActiveEventAir(ctx, w, pal)).calls.length, 0)
    }
  }
})

test("Failover freezes and darkens every fixture kind and removes animated hazard light", () => {
  const { w, pal } = sample(S.EVENTS.find(e => e.id === "failover"), 1)
  for (const res of [1, 2]) for (const spec of S.HAZARDS) {
    w.res = res
    const h = { kind: spec.id, phase: "fire", t: 2, fired: 1, dir: 1, known: true, throttled: 0,
      zx0: 40, zx1: 40 + spec.w - 1, zy0: 20, zy1: 20 + spec.h - 1, mount: spec.mount, lineTo: 58, lineY: 21 }
    const before = JSON.stringify(h)
    const frames = [105, 125].map(t => {
      w.ticks = t
      assert.equal(picture(w, ctx => D.drawHazardLight(ctx, w, pal, h)).calls.length, 0)
      return picture(w, ctx => D.drawEventHazard(ctx, w, pal, h)).pixels
    })
    assert.deepEqual(frames[0], frames[1], spec.id + " still moves during Failover")
    assert.equal(JSON.stringify(h), before)
    w.eventBoost = 0
    const normal = picture(w, ctx => D.drawEventHazard(ctx, w, pal, h))
    assert.deepEqual(normal.pixels, picture(w, ctx => D.drawHazardKind(ctx, w, pal, h)).pixels)
    assert.notDeepEqual(normal.pixels, frames[0], spec.id + " did not go dark")
    w.eventBoost = 220
  }
})

test("overclock status animates, spares wrecks and throttled fixtures, and adds fine sparks at res 2", () => {
  const { w, pal } = sample(S.EVENTS.find(e => e.id === "surge"), 1)
  const h = w.hazards[0]
  w.terrain.fill(w.k.EMPTY)
  for (const res of [1, 2]) {
    w.res = res
    const frames = [90, 93].map(t => { w.ticks = t; return picture(w, ctx => D.drawEventHazardStatus(ctx, w, pal, h, 1)) })
    assert.notDeepEqual(frames[0].pixels, frames[1].pixels)
    assert.equal(frames[0].calls.some(c => c[2] === 0.5), res === 2)
    for (const patch of [{ wrecked: true }, { throttled: 30 }])
      assert.equal(picture(w, ctx => D.drawEventHazardStatus(ctx, w, pal, { ...h, ...patch }, 1)).calls.length, 0)
  }
})

test("sight haze leaves clear pockets, and Null Gravity only bobs living falling bodies", () => {
  const { w, pal } = sample(S.EVENTS.find(e => e.id === "nullgrav"), 2)
  const ag = { x: 30, y: 20, dir: 1, state: "fall", anim: 0, fade: 0 }
  w.agents = [ag]; w.ticks = 9
  assert.equal(D.eventHazeClear(w, 120, 80), 0.22)
  assert.equal(D.eventHazeClear(w, 190, 80), 1)
  ag.gone = true; assert.equal(D.eventHazeClear(w, 120, 80), 1); ag.gone = false
  for (const res of [undefined, 1, 2]) {
    w.res = res
    const bobs = [9, 25, 45].map(t => { w.ticks = t; return D.eventFloatBob(w, ag) })
    assert.ok(bobs.some(b => b !== 0)); assert.ok(bobs.every(b => Math.abs(b) <= 1))
    for (const state of ["walk", "ride", "saved", "dead"]) assert.equal(D.eventFloatBob(w, { ...ag, state }), 0)
    assert.equal(D.eventFloatBob(w, { ...ag, gone: true }), 0)
    w.ticks = 25
    const active = picture(w, ctx => D.drawAgent(ctx, w, pal, ag, {}))
    w.eventDrift = 0
    assert.equal(D.eventFloatBob(w, ag), 0)
    assert.notDeepEqual(picture(w, ctx => D.drawAgent(ctx, w, pal, ag, {})).pixels, active.pixels)
    w.eventDrift = 320; w.driftWhat = "sight"
    assert.equal(D.eventFloatBob(w, ag), 0)
    w.driftWhat = "fall"
  }
})


test("ceiling sparks enter the corridor while floor sparks rise into it", () => {
  const { w, pal } = sample(S.EVENTS.find(e => e.id === "surge"), 1)
  w.terrain.fill(w.k.ROCK)
  for (let y = 20; y < 26; y++) for (let x = 30; x < 45; x++) w.terrain[y * w.k.COLS + x] = w.k.EMPTY
  for (const dir of [-1, 1]) for (const res of [1, 2]) {
    w.res = res
    const y = dir > 0 ? 80 : 103
    const sparks = picture(w, ctx => D.drawEventHeat(ctx, w, pal, 150, y, 1, dir))
    assert.ok(sparks.calls.length > 0, "sparks hidden in solid terrain")
    assert.ok(sparks.calls.every(c => c[1] >= 80 && c[1] < 104))
  }
})

test("Failover lamps cool and relight with the event fade", () => {
  assert.equal(D.eventDimColour("rgba(200,100,50,1)", "rgba(20,30,40,1)", 0), "rgba(200,100,50,1)")
  assert.equal(D.eventDimColour("rgba(200,100,50,1)", "rgba(20,30,40,1)", 1), "rgba(20,30,40,1)")
  assert.equal(D.eventDimColour("rgba(200,100,50,1)", "rgba(20,30,40,1)", 0.5), "rgba(110,65,45,1)")
  const { w, pal } = sample(S.EVENTS.find(e => e.id === "failover"), 1)
  for (const res of [1, 2]) {
    w.res = res
    const images = [0.1, 0.5, 1].map(fade => picture(w, ctx => D.drawEventQuietHazard(ctx, w, pal, w.hazards[0], fade)).pixels)
    assert.notDeepEqual(images[0], images[1]); assert.notDeepEqual(images[1], images[2])
  }
})
