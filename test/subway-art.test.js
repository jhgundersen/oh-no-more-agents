import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

import { levelWith } from "./levels.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
function sample(level = 18, res = 1, name = "tokyo-night") {
  const w = S.generate(level, 0, level * 7919 + 13)
  w.res = res
  return { w, tr: w.trains[0], pal: P.build(themeOf(name).theme, level) }
}
function picture(w, draw) {
  const img = canvas(800, 496, "#000000"), calls = [], words = []
  img.ctx.setTransform(2, 0, 0, 2, 0, 0)
  const fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...args) => { assert.ok(calls.length < 25000, "bounded paint recording"); calls.push([...args, img.ctx.fillStyle]); fill(...args) }
  img.ctx.fillText = (...args) => words.push(args)
  img.ctx.fillStyle = "#123456"; img.ctx.globalAlpha = 0.8
  draw(img.ctx)
  return { ...img, buf: createHash("sha256").update(img.buf).digest("hex"), calls, words }
}

// Component properties, never whole-frame pins. Both directions and all
// phases are exercised on generated geometry, including a two-car line.
test("metro trains draw every phase at both resolutions without changing the world or context", () => {
  for (const level of [0, 1, 2, 3].map(k => S.BIOMES.indexOf("Subway") + 1 + k * S.BIOMES.length)) for (const res of [undefined, 1, 2]) for (const name of Object.keys(THEMES)) {
    const { w, tr, pal } = sample(level, res, name)
    for (const phase of ["wait", "run", "drop", "back"]) {
      Object.assign(tr, { phase, t: 2, riders: phase === "back" ? [] : [1, 2, 3], v: phase === "run" ? 0.45 : 0.1 })
      const before = JSON.stringify(w)
      const img = picture(w, ctx => D.drawSubwayTrain(ctx, w, pal, tr))
      assert.ok(img.calls.length > 0)
      assert.ok(img.calls.every(c => c.slice(0, 4).every(Number.isFinite) && c[2] > 0 && c[3] > 0))
      assert.equal(JSON.stringify(w), before)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
      if (res !== 2) assert.ok(img.words.some(c => c[0] === "HOME"))
      else assert.ok(img.calls.some(c => c[4] === D.METRO_WARM), "page rollsign is pixel ink")
      if ((res || 1) === 1) for (const c of img.calls) for (const n of c.slice(0, 4)) assert.equal(n, Math.round(n), "coarse whole pixels")
    }
  }
})

test("train windows show exactly one silhouette per rider, including a full single car", () => {
  for (const cars of [1, 2]) for (const count of [0, 1, 4, 12]) {
    const tr = { riders: Array.from({ length: count }, (_, i) => i) }, calls = []
    const ctx = { fillRect: (...a) => calls.push(a) }
    for (let car = 0; car < cars; car++) D.drawSubwayPassengers(ctx, tr, 100 - car * 38, 160, car, cars)
    assert.equal(calls.filter(c => c[2] === 1 && c[3] === 2).length, count, "heads match riders.length")
    assert.equal(new Set(calls.filter(c => c[2] === 1).map(c => c[0])).size, count, "separate heads")
  }
  for (const res of [1, 2]) {
    const { w, tr, pal } = sample(18, res), frames = []
    for (const count of [0, 1, 4, 12]) {
      tr.riders = Array.from({ length: count }, (_, i) => i)
      frames.push(picture(w, ctx => D.drawSubwayTrain(ctx, w, pal, tr)).buf)
    }
    for (let i = 1; i < frames.length; i++) assert.notEqual(frames[i], frames[i - 1], "count remains visible in the assembled carriage")
  }
})

test("doors meet the boarding/alighting point, part for moving boarders and close on an empty return", () => {
  const { w, tr, pal } = sample(), ag = S.spawn(w)
  Object.assign(ag, { x: tr.ax + 0.5, y: tr.y, dir: tr.dir, state: "walk" })
  w.agents = [ag]
  const g = D.subwayTrainDrawing(w, tr)
  assert.equal(g.x, ag.x * w.k.CELL)
  assert.equal(g.y, (ag.y + 1) * w.k.CELL)
  assert.equal(g.open, true)
  S.stepTrains(w)
  assert.equal(ag.state, "train")
  assert.equal(picture(w, ctx => D.drawAgent(ctx, w, pal, ag, {})).calls.length, 0, "riders hidden inside")
  tr.phase = "run"
  assert.equal(D.subwayTrainDrawing(w, tr).open, false)
  ag.state = "walk"
  assert.equal(D.subwayTrainDrawing(w, tr).open, true, "moving pickup has an open door")
  for (const changes of [{ special: true }, { gone: true }, { dir: -tr.dir }, { state: "fall" }, { x: tr.x + 10 }, { y: tr.y + 4 }]) {
    const save = { ...ag }; Object.assign(ag, changes)
    assert.equal(D.subwayTrainBoarding(w, tr), false)
    Object.assign(ag, save)
  }
  ag.state = "train"; tr.phase = "drop"; tr.x = tr.bx; tr.t = S.TRAIN_ALIGHT - 1
  assert.equal(D.subwayTrainDrawing(w, tr).open, true)
  S.stepTrains(w)
  assert.equal(ag.state, "walk")
  assert.equal(ag.x * w.k.CELL, D.subwayTrainDrawing(w, tr).x)
  assert.equal(D.subwayTrainDrawing(w, tr).open, false, "empty return closes doors")
  const open = picture(w, ctx => D.drawSubwayDoors(ctx, 120, 120, true))
  const shut = picture(w, ctx => D.drawSubwayDoors(ctx, 120, 120, false))
  assert.notEqual(open.buf, shut.buf)
})

test("carriage fine detail is gated and foreground terrain occludes it", () => {
  const { w, tr, pal } = sample()
  const coarse = picture(w, ctx => D.drawSubwayTrain(ctx, w, pal, tr))
  w.res = 2
  const fine = picture(w, ctx => D.drawSubwayTrain(ctx, w, pal, tr))
  assert.notEqual(fine.buf, coarse.buf)
  assert.ok(fine.calls.some(c => c.slice(0, 4).some(n => n % 1)))
  w.terrain.fill(w.k.ROCK)
  assert.equal(picture(w, ctx => D.drawSubwayTrain(ctx, w, pal, tr)).calls.length, 0)
  w.terrain.fill(w.k.EMPTY)
  const g = D.subwayTrainDrawing(w, tr), col = Math.floor(g.x / 4), row = tr.y - 2
  w.terrain[row * w.k.COLS + col] = w.k.ROCK
  const img = picture(w, ctx => D.drawSubwayTrain(ctx, w, pal, tr))
  for (const c of img.calls) {
    const [x, y, ww, hh] = c
    for (let yy = y; yy < y + hh; yy += 0.5) for (let xx = x; xx < x + ww; xx += 0.5)
      assert.equal(w.terrain[Math.floor(yy / 4) * w.k.COLS + Math.floor(xx / 4)], w.k.EMPTY)
  }
  const one = sample(levelWith(S, "Subway", w => w.trains.length && D.subwayTrainDrawing(w, w.trains[0]).cars === 1)).w
  assert.equal(D.subwayTrainDrawing(w, tr).cars, 2)
  assert.equal(D.subwayTrainDrawing(one, one.trains[0]).cars, 1, "cramped platform fits a single car")
})

test("rails span the line, mark both platforms and add a fine third rail", () => {
  const { w, tr, pal } = sample()
  const coarse = picture(w, ctx => D.drawSubwayTrack(ctx, w, pal, tr))
  assert.deepEqual(coarse.words.map(c => c[0]), ["BOARD", "HOME"])
  assert.ok(coarse.calls.some(c => c[0] === Math.min(tr.ax, tr.bx) * 4 && c[2] === (Math.abs(tr.ax - tr.bx) + 1) * 4))
  w.res = 2
  assert.notEqual(picture(w, ctx => D.drawSubwayTrack(ctx, w, pal, tr)).buf, coarse.buf)
})

test("the train is painted before the corridor walkers", () => {
  const { w, tr, pal } = sample(), ag = S.spawn(w)
  Object.assign(ag, { state: "walk", x: tr.x + 0.5, y: tr.y, dir: tr.dir })
  w.agents = [ag]; w.ticks = 240
  const layer = picture(w, ctx => D.drawActors(ctx, w, pal, {}))
  const car = layer.calls.findIndex(c => c[4] === D.SUBWAY_CREAM)
  const head = layer.calls.findLastIndex(c => c[4] === pal.skin)
  assert.ok(car >= 0 && head > car, "walker in front of carriage")
})

test("station furniture, lights and event markers remain read-only", () => {
  for (const res of [1, 2]) {
    const { w, tr, pal } = sample(18, res), before = JSON.stringify(w)
    for (const kind of ["clump", "spire", "hang", "tuft"]) for (const seed of [0, 1]) {
      const img = picture(w, ctx => D.drawSubwayDecor(ctx, w, pal, { kind, seed }, 100, 160))
      assert.ok(img.calls.length > 0)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
    }
    const snapshots = []
    const c = w.corridors.find(c => picture(w, ctx => D.drawSubwayTube(ctx, w, pal, c, 0)).calls.length > 1)
    assert.ok(c, "a visible tube on a real corridor")
    for (const ticks of [0, 233 - w.level * 17 % 233]) {
      w.ticks = ticks
      snapshots.push(picture(w, ctx => D.drawSubwayTube(ctx, w, pal, c, 0)).buf)
    }
    assert.notEqual(...snapshots, "tube flickers")
    w.eventBoost = 200; w.eventMult = 0
    assert.notEqual(picture(w, ctx => D.drawSubwayTube(ctx, w, pal, c, 0)).buf, snapshots[0], "signal failure dims tubes")
    for (const mult of [0, 2]) {
      w.eventMult = mult
      const img = picture(w, ctx => D.drawSubwaySignal(ctx, w, pal, { zx0: 20, zx1: 22, zy0: 30 }, 1))
      assert.ok(img.calls.some(c => c[4] === (mult === 0 ? pal.urgent : pal.decorLit)))
    }
    w.eventBoost = 0; w.eventMult = 1; w.ticks = 0
    const fx = { x: 20, span: 3, floorY: 30, fireAt: 75 }
    assert.ok(picture(w, ctx => D.drawSubwayWorks(ctx, w, pal, fx)).words.some(c => c[0] === "SERVICE PATCH"))
    w.ticks = 76
    assert.equal(picture(w, ctx => D.drawSubwayWorks(ctx, w, pal, fx)).calls.length, 0)
    w.ticks = 0
    assert.equal(JSON.stringify(w), before)
    w.terrain.fill(w.k.ROCK)
    assert.equal(picture(w, ctx => D.drawSubwayTube(ctx, w, pal, c, 0)).calls.length, 0)
  }
})
