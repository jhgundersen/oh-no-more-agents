import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"
import { CASES, fixture, season, paint, renderer, cropBox, run, sheetRow, doublePixels, copyPixels } from "../tools/gag-art.js"
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const src = fs.readFileSync(new URL("../public/agents/season.js", import.meta.url), "utf8")
const api = season(src), off = season(src, "?season=none")
const digest = value => createHash("sha256").update(value).digest("hex")
function readonly(obj, cache = new WeakMap()) {
  if (!obj || typeof obj !== "object") return obj
  if (cache.has(obj)) return cache.get(obj)
  const p = new Proxy(obj, { get(o, k) { return readonly(Reflect.get(o, k), cache) }, set() { throw Error("world write") }, deleteProperty() { throw Error("world delete") }, defineProperty() { throw Error("world define") } })
  cache.set(obj, p); return p
}
function record(w, draw) {
  const img = canvas(400 * (w.res || 1), 248 * (w.res || 1)), calls = []
  img.ctx.setTransform(w.res || 1, 0, 0, w.res || 1, 0, 0)
  const fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...a) => {
    assert.ok(calls.length < 2000, "bounded gag draw recording")
    assert.ok(a.every(Number.isFinite)); assert.ok(a[2] > 0 && a[3] > 0)
    const unit = (w.res || 1) >= 2 ? 2 : 1
    assert.ok(a.every(n => n * unit === Math.round(n * unit)), "whole pixels at res 1; half-pixels at res 2")
    calls.push([...a, img.ctx.fillStyle, img.ctx.globalAlpha]); fill(...a)
  }
  img.ctx.fillStyle = "#123456"; img.ctx.globalAlpha = 0.75
  draw(img.ctx)
  return { calls, hash: digest(img.buf), style: img.ctx.fillStyle, alpha: img.ctx.globalAlpha }
}

test("all gag contexts render at both resolutions, RNG-free, deterministically and without world writes", () => {
  const terrain = new Map()
  for (const name of CASES) for (const res of [1, 2]) for (const theme of Object.keys(THEMES)) {
    const a = ["lanterns", "bat", "ghost"].includes(name) ? api : off
    const w = fixture(name, a); w.res = res
    const before = digest(JSON.stringify(w)), pal = P.build(themeOf(theme).theme, w.level); a.tint(pal)
    const draw = () => { const img = canvas(400 * res, 248 * res); const frozen = readonly(w); const key = [w.level, res, theme, w.season && w.season.name].join(":"); if (!terrain.has(key)) { const back = canvas(img.W, img.H); D.drawTerrain(back.ctx, frozen, pal); terrain.set(key, back) } copyPixels(img, terrain.get(key), 0, 0); D.drawActors(img.ctx, frozen, pal, {}); if (name.startsWith("standup")) D.drawStandup(img.ctx, frozen, pal, frozen.gagStandup); if (w.season) a.paint(img.ctx, frozen); return digest(img.buf) }
    const random = Math.random; Math.random = () => { throw Error("render RNG") }
    try { assert.equal(draw(), draw()) } finally { Math.random = random }
    assert.equal(digest(JSON.stringify(w)), before, name)
  }
})
test("gag silhouettes stay on their resolution grid and restore context across appearance, fade and reduced motion", () => {
  for (const res of [1, 2]) for (const reducedMotion of [false, true]) {
    const w = fixture("agi", off); Object.assign(w, { res, reducedMotion }); const pal = P.build(themeOf("tokyo-night").theme, 6)
    const ag = w.agents[1]
    const tasks = [ctx => D.drawReplayTag(ctx, w, pal), ctx => D.drawOutageGlows(ctx, w, pal), ctx => D.drawPartyHat(ctx, "million", ag, 160, 100), ctx => D.drawPartyHat(ctx, "hundred", ag, 160, 100), ctx => D.drawPartyHat(ctx, "ten", ag, 160, 100)]
    for (const age of [0, 2, 7, 25, 40, 65]) {
      tasks.push(ctx => D.drawMirage(ctx, w, pal, { x: 45, y: 29, born: w.ticks - age, popped: -1 }))
      tasks.push(ctx => D.drawRateLimitSign(ctx, w, pal, { x: 45, y: 29, at: w.ticks - age, clearAt: -1 }))
      tasks.push(ctx => D.drawFloorDuck(ctx, w, { x: 45, y: 29, at: w.ticks - age }))
      tasks.push(ctx => D.drawDebugFx(ctx, w, { t: w.ticks - age, fromX: 40, fromY: 29, x: 45, y: 29, helped: age % 2 === 1 }))
    }
    for (const draw of tasks) { const r = record(w, draw); assert.equal(r.style, "#123456"); assert.equal(r.alpha, 0.75) }
    const glitter = record(w, ctx => { D.drawAgiSparkle(ctx, w, ag, 160, 100); D.drawPepSparkle(ctx, w, { ...ag, pepAt: 394 }, 180, 100) })
    assert.ok(glitter.calls.length <= 40)
    const bat = record(w, ctx => D.drawBatUmbrella(ctx, w, pal, 160, 100, 0, "#2a2233"))
    assert.ok(bat.calls.some(c => c[4] === "#a393bc")); assert.ok(bat.calls.length <= 30)
  }
})
test("mirage remains a readable false exit that ripples, fades and vanishes; reduced motion is still", () => {
  const w = fixture("mirage", off), pal = P.build(themeOf("tokyo-night").theme, 6), m = w.mirages[0]
  w.res = 1
  const draw = () => record(w, ctx => D.drawMirage(ctx, w, pal, m))
  const first = draw(); w.ticks += 3; assert.notEqual(draw().hash, first.hash)
  w.reducedMotion = true; const still = draw(); w.ticks += 1; assert.equal(draw().hash, still.hash)
  assert.ok(still.calls.filter(c => c[4] === pal.exitLight).length > 20, "EXIT glyph plus broken neon jambs")
  m.popped = w.ticks - 12; assert.notEqual(draw().hash, still.hash)
  m.popped = w.ticks - 24; assert.equal(draw().calls.length, 0)
  m.popped = -1; m.born = w.ticks + 1; assert.equal(draw().calls.length, 0)
})
test("native conflict and duck dialogue is visible, bounded and separated; unrelated panel quips stay off", () => {
  for (const x of [1, 40, 98]) {
    const w = fixture("conflict", off); w.res = 1; w.agents[0].x = x; w.agents[1].x = x + 0.8
    const pal = P.build(themeOf("tokyo-night").theme, 6), boxes = []
    for (const ag of w.agents) {
      const q = D.quipFor(w, ag), r = record(w, ctx => D.drawQuip(ctx, w, pal, ag, ag.x * 4 - 4, 100))
      assert.ok(r.calls.length > 20)
      const left = D.gagConflictLeft(w, q, ag.x * 4, q.text.length * 4 + 5, 400)
      boxes.push({ left, right: left + q.text.length * 4 + 5 })
      assert.ok(r.calls.every(c => c[0] >= 0 && c[0] + c[2] <= 400))
    }
    assert.ok(boxes[0].right < boxes[1].left, "two chevron panels cannot overlap at either edge")
  }
  const w = fixture("duck-talk", off); w.res = 1; const pal = P.build(themeOf("tokyo-night").theme, 6), ag = w.agents[0]
  assert.ok(record(w, ctx => D.drawQuip(ctx, w, pal, ag, 150, 100)).calls.length > 20)
  assert.equal(record(w, ctx => D.drawQuip(ctx, w, pal, { id: 99, wonAt: 398 }, 150, 100)).calls.length, 0)
  assert.equal(D.gagQuipAtOne("REBASED"), true)
  assert.ok(D.bubbleClear(w, w.exit.x * 4, w.exit.y * 4, 30, 13) + 13 <= w.exit.y * 4 - 4)
})
test("queue speech clears the complete visible 429 plate", () => {
  const w = fixture("queue", off), rl = w.rateLimit, foot = (rl.y + 1) * w.k.CELL
  const top = D.bubbleClear(w, rl.x * 4 - 20, foot - 30, 42, 13)
  assert.ok(top + 13 < foot - 32)
  const pal = P.build(themeOf("tokyo-night").theme, 6), ag = w.agents[3]; w.res = 1
  const r = record(w, ctx => D.drawQuip(ctx, w, pal, ag, ag.x * 4 - 4, foot - 18))
  assert.ok(r.calls.length > 20)
  assert.ok(r.calls.every(c => c[1] >= w.k.SKY * 4), "queue dialogue stays below the hero card")
  rl.at = w.ticks + 1
  assert.equal(D.bubbleClear(w, rl.x * 4 - 20, foot - 30, 42, 13), foot - 30)
})
test("gag paint preserves real opaque faces, collars and umbrellas", () => {
  for (const name of ["agi", "pep", "queue", "duck-talk", "party", "bat"]) for (const res of [1, 2]) {
    const a = name === "bat" ? api : off, w = fixture(name, a); w.res = res
    const pal = P.build(themeOf("tokyo-night").theme, w.level); a.tint(pal)
    const img = paint(D, a, name, w, res)
    const colours = new Set([pal.skin, pal.shirt, pal.eye, pal.umbrellaStem].map(c => { const p = canvas(1, 1); p.ctx.fillStyle = c; p.ctx.fillRect(0, 0, 1, 1); return p.buf.join(",") }))
    for (const ag of w.agents) {
      const mask = canvas(400 * res, 248 * res, "#000000"); mask.ctx.setTransform(res, 0, 0, res, 0, 0); D.drawAgent(mask.ctx, w, pal, ag, {})
      let checked = 0
      for (let y = Math.max(0, Math.round((ag.y + 1) * 4 - 20) * res); y < Math.min(mask.H, Math.round((ag.y + 1) * 4) * res); y++)
        for (let x = Math.max(0, Math.round(ag.x * 4 - 8) * res); x < Math.min(mask.W, Math.round(ag.x * 4 + 9) * res); x++) {
          const i = (y * mask.W + x) * 3, p = mask.buf.subarray(i, i + 3).join(",")
          if (!colours.has(p)) continue
          assert.equal(img.buf.subarray(i, i + 3).join(","), p, name); checked++
        }
      assert.ok(checked > 3)
    }
  }
})
test("sighting icons are seven distinct complete seven-pixel silhouettes", () => {
  const hashes = new Set(), w = fixture("sightings", off); w.res = 1
  for (const s of D.SIGHTINGS) {
    const r = record(w, ctx => D.SIGHTING_ICONS[s.id](ctx, 150, 100)); hashes.add(r.hash)
    assert.ok(r.calls.length >= 10 && r.calls.length <= 49)
    assert.ok(r.calls.every(c => c[0] >= 150 && c[0] < 157 && c[1] >= 100 && c[1] < 107))
  }
  assert.equal(hashes.size, 7)
})
test("season props cannot paint over living faces, umbrellas, exit frames or dangers", () => {
  const w = fixture("lanterns", api); w.res = 1
  const p = { x: 40, y: 29 }, ag = w.agents[0]
  w.terrain.fill(w.k.EMPTY); w.terrain.fill(w.k.DIRT, 30 * 100 + 39, 30 * 100 + 42)
  w.seasonLanterns = [p]; w.agents = []; w.exit = null; w.hazards = []
  const draw = () => record(w, ctx => api.paint(ctx, w))
  assert.ok(draw().calls.length > 15, "a clear supported pumpkin really draws")
  Object.assign(ag, { x: p.x + 0.5, y: p.y, floater: true }); w.agents = [ag]
  const before = digest(JSON.stringify(w)); assert.equal(draw().calls.length, 0)
  assert.equal(digest(JSON.stringify(w)), before)
  w.agents = []; w.exit = { x: p.x - 1, y: p.y - 1, w: 3, h: 3 }
  assert.equal(draw().calls.length, 0)
  w.exit = null; w.hazards = [{ zx0: p.x - 1, zx1: p.x + 1, zy0: p.y - 1, zy1: p.y, wrecked: false }]
  assert.equal(draw().calls.length, 0)
  w.hazards[0].wrecked = true; assert.ok(draw().calls.length > 15)
  w.terrain[(p.y - 1) * 100 + p.x + 1] = w.k.STEEL; assert.equal(draw().calls.length, 0)
  const g = fixture("ghost", api); g.res = 1; g.agents = []; g.seasonLanterns = []
  assert.ok(record(g, ctx => api.paint(ctx, g)).calls.length > 10)
  g.ticks = 430; assert.equal(record(g, ctx => api.paint(ctx, g)).calls.length, 0); assert.equal(g.seasonGhosts.length, 0)
})
test("reduced-motion confetti is still; bursts and glow windows stay bounded", () => {
  const w = fixture("party", off); w.res = 1; w.reducedMotion = true
  const a = record(w, ctx => D.drawConfetti(ctx, w)); w.ticks += 3
  assert.equal(record(w, ctx => D.drawConfetti(ctx, w)).hash, a.hash)
  assert.ok(a.calls.length <= 60)
  w.milestone.kind = "million"; assert.ok(record(w, ctx => D.drawConfetti(ctx, w)).calls.length <= 60)
  w.ticks = w.firstReleaseAt + D.CONFETTI_TICKS; assert.equal(record(w, ctx => D.drawConfetti(ctx, w)).calls.length, 0)
  assert.equal(record(w, ctx => D.drawPepSparkle(ctx, w, { pepAt: w.ticks - D.PEP_GLOW }, 150, 100)).calls.length, 0)
  assert.equal(record(w, ctx => D.drawAgiSparkle(ctx, w, { state: "saved", fade: 11 }, 150, 100)).calls.length, 0)
})
test("rendering and seasonal dressing leave complete simulation digests identical in all nineteen biomes", () => {
  const random = Math.random, jitter = seed => { let n = seed; return () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296) }
  const hashWorld = w => digest(JSON.stringify(w, (key, value) => key.startsWith("season") ? undefined : value))
  try {
    for (let level = 1; level <= 19; level++) {
      const a = S.generate(level, 0, level * 7919 + 13), b = S.generate(level, 0, level * 7919 + 13); a.res = 2; b.res = 2
      const pal = P.build(themeOf("tokyo-night").theme, level), img = canvas(800, 496)
      for (let tick = 0; tick < 600; tick++) {
        Math.random = jitter(level * 997 + tick); S.step(a)
        Math.random = jitter(level * 997 + tick); S.step(b)
        if (tick % 120 !== 0) continue
        Math.random = () => { throw Error("render RNG") }; api.dress(a); D.drawTerrain(img.ctx, a, pal); D.drawActors(img.ctx, a, pal, {}); api.paint(img.ctx, a)
        assert.equal(hashWorld(a), hashWorld(b), `level ${level}, tick ${tick}`)
      }
    }
  } finally { Math.random = random }
})
test("the fast contact-sheet command covers every gag and retains native full frames", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gag-art-test-"))
  try {
    const result = run("HEAD", dir)
    assert.equal(result.scenes, CASES.length); assert.equal(result.frames, CASES.length * 4)
    for (const name of CASES) for (const res of [1, 2]) for (const tag of ["before", "after"]) {
      const header = fs.readFileSync(path.join(dir, `${name}-${tag}-res${res}.png`)).subarray(0, 24)
      assert.equal(header.readUInt32BE(16), 400 * res); assert.equal(header.readUInt32BE(20), 248 * res)
    }
    assert.throws(() => fixture("not-a-gag", off), /Unknown fixture/)
    assert.throws(() => run("not-a-ref", dir, ["agi"]), /Cannot read/)
    const source = fs.readFileSync(new URL("../public/agents/Draw.js", import.meta.url), "utf8")
    assert.equal(renderer(source).QUIP_MAX, 2)
    const tiny = canvas(2, 2, "#123456"), twice = doublePixels(tiny), dst = canvas(4, 4)
    copyPixels(dst, twice, 0, 0); assert.equal(digest(dst.buf), digest(twice.buf))
    assert.equal(sheetRow(D, "sample", [canvas(440, 240), canvas(440, 240), canvas(440, 240), canvas(440, 240)]).H, 278)
    assert.equal(cropBox("replay", fixture("replay", off)).y, 25)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
