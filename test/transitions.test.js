import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const fresh = (res = 1, level = 2) => {
  const w = S.generate(level, 0, 8128)
  w.res = res
  return w
}

function recording(w, name = "tokyo-night") {
  const res = w.res || 1, theme = themeOf(name)
  const img = canvas(400 * res, 248 * res, "#010203"), ctx = img.ctx
  const pal = P.build(theme.theme, w.level), rects = []
  D.clearLayer(ctx, w)
  const fill = ctx.fillRect.bind(ctx)
  ctx.fillRect = (x, y, width, height) => {
    assert.equal(ctx.globalAlpha, 1)
    assert.ok(Object.values(pal).includes(ctx.fillStyle), "palette ink only")
    const grid = res >= 2 ? 2 : 1
    for (const v of [x, y, width, height]) assert.equal(v * grid, Math.round(v * grid), "hard pixel grid")
    rects.push([x, y, width, height, ctx.fillStyle])
    fill(x, y, width, height)
  }
  return { img, ctx, pal, rects }
}

test("intro draws at several ages in every biome/theme and leaves the world/context alone", () => {
  for (const res of [undefined, 1, 2]) for (let level = 1; level <= 12; level++) {
    for (const name of Object.keys(THEMES)) for (const ticks of [0, 1, 6, 12, 24, 32, 39]) {
      const w = fresh(res, level); w.ticks = ticks
      const r = recording(w, name), before = JSON.stringify(w)
      r.ctx.fillStyle = "#abcdef"
      const blank = r.img.buf.slice()
      D.drawLevelTransition(r.ctx, w, r.pal)
      assert.ok(r.rects.length > 0)
      assert.notDeepEqual(r.img.buf, blank)
      assert.equal(JSON.stringify(w), before)
      assert.equal(r.ctx.fillStyle, "#abcdef")
      assert.equal(r.ctx.globalAlpha, 1)
    }
  }
})

test("no commands or pixels outside the intro/done windows, even with a hold configured", () => {
  for (const res of [1, 2]) for (const ticks of [-1, 40, 41, 200, 5000]) {
    const w = fresh(res); w.ticks = ticks; w.doneHold = 110; w.doneTicks = 100
    const r = recording(w), blank = r.img.buf.slice()
    D.drawLevelTransition(r.ctx, w, r.pal)
    assert.equal(r.rects.length, 0)
    assert.deepEqual(r.img.buf, blank)
  }
})

test("opening reveals either hatch and its first drop before the first release", () => {
  for (const res of [1, 2]) for (const level of [1, 9, 21]) for (const hx of [10, 90]) {
    const w = fresh(res, level); w.hatch.x = hx
    const r = recording(w)
    D.drawLevelIris(r.ctx, w, r.pal, hx * 4, w.hatch.y * 4, 3 / D.LEVEL_OPEN_TICKS)
    // Neither the hatch nor the first body's falling column is under the mask.
    for (const yy of [w.hatch.y * 4, (w.hatch.y + 5) * 4]) {
      assert.ok(!r.rects.some(([x,y,ww,hh]) => x <= hx * 4 && hx * 4 < x + ww && y <= yy && yy < y + hh))
    }
    r.rects.length = 0
    D.drawLevelIris(r.ctx, w, r.pal, hx * 4, w.hatch.y * 4, 1)
    assert.equal(r.rects.length, 0)
    assert.ok(w.releaseInterval > D.LEVEL_OPEN_TICKS)
  }
})

test("results include the live total, all verdicts, and override an unfinished intro", () => {
  const cases = [[0,18,"OH NO! NO AGENTS"], [18,18,"ALL AGENTS ACCOUNTED FOR"],
    [10,18,"ACCEPTABLE COLLATERAL"], [8,18,"MORE AGENTS REQUIRED"],
    [20,20,"ALL AGENTS ACCOUNTED FOR"]]
  for (const res of [undefined, 1, 2]) for (const [saved,total,verdict] of cases) {
    for (const age of [0, 1, 6, 10, 50, 85, 86, 95, 105, 109, 110, 111]) {
      const w = fresh(res); w.done = true; w.ticks = 0; w.doneTicks = age
      w.doneHold = 110; w.saved = saved; w.toRelease = total
      assert.equal(D.levelVerdict(w), verdict)
      const r = recording(w), before = JSON.stringify(w)
      D.drawLevelTransition(r.ctx, w, r.pal)
      assert.ok(r.rects.length > 0)
      assert.equal(JSON.stringify(w), before)
      // The results stage uses exactly its own content and host timing.
      const expected = recording(w)
      D.drawLevelResults(expected.ctx, w, expected.pal)
      D.drawLevelClosing(expected.ctx, w, expected.pal)
      assert.deepEqual(r.img.buf, expected.img.buf)
    }
  }
})

test("absent/invalid host hold keeps the plate visible indefinitely without a closing wipe", () => {
  for (const res of [1, 2]) for (const doneHold of [undefined, 0, -1, NaN]) {
    const w = fresh(res); w.done = true; w.saved = 14; w.doneHold = doneHold
    const frames = []
    for (const age of [10, 85, 110, 5000]) {
      w.doneTicks = age
      const r = recording(w), blank = r.img.buf.slice()
      D.drawLevelClosing(r.ctx, w, r.pal)
      assert.equal(r.rects.length, 0); assert.deepEqual(r.img.buf, blank)
      D.drawLevelTransition(r.ctx, w, r.pal)
      frames.push(r.img.buf)
    }
    for (const frame of frames) assert.deepEqual(frame, frames[0])
  }
})

test("report numbers respond to saves and added colleagues, independently of the loss counter", () => {
  for (const res of [1, 2]) {
    const w = fresh(res); w.done = true; w.doneTicks = 10; w.saved = 14; w.toRelease = 18
    const report = () => {
      const r = recording(w)
      D.drawLevelTransition(r.ctx, w, r.pal)
      // Only the large numeric line; no whole-frame snapshot.
      return r.img.buf.slice(115 * res * 400 * res * 3, 125 * res * 400 * res * 3)
    }
    const before = report()
    w.lost = 99
    assert.deepEqual(report(), before)
    w.toRelease = 20
    assert.notDeepEqual(report(), before, "newly released colleagues count toward the total")
    const added = report()
    w.saved = 15
    assert.notDeepEqual(report(), added, "home count stays live")
  }
})

test("closing covers increasingly much of the board only in the last 25 host ticks", () => {
  for (const res of [1, 2]) for (const hold of [60, 110, 200]) {
    const w = fresh(res); w.done = true; w.doneHold = hold
    let previous = 0
    for (const remaining of [40, 25, 24, 18, 10, 1, 0, -1]) {
      w.doneTicks = hold - remaining
      const r = recording(w)
      D.drawLevelClosing(r.ctx, w, r.pal)
      const area = r.rects.reduce((n, [, , width, height]) => n + width * height, 0)
      assert.ok(area >= previous); previous = area
      if (remaining >= 25) assert.equal(r.rects.length, 0)
      else assert.ok(area > 0)
      if (remaining <= 0) assert.equal(area, 400 * 248)
    }
  }
})

test("pixel font handles each glyph, fallback, spaces and alignment without native text", () => {
  for (const res of [1, 2]) for (const size of [1, 2]) {
    const w = fresh(res), r = recording(w)
    r.ctx.fillStyle = r.pal.label
    r.ctx.fillText = () => assert.fail("transition font must use hard pixels")
    for (const char of Object.keys(D.TRANSITION_GLYPHS)) {
      const count = r.rects.length
      D.drawTransitionText(r.ctx, char, 200, 100, size)
      if (char === " ") assert.equal(r.rects.length, count)
      else assert.ok(r.rects.length > count)
    }
    D.drawTransitionText(r.ctx, "@", 200, 100, size)
    const a = recording(w), b = recording(w)
    a.ctx.fillStyle = a.pal.label; b.ctx.fillStyle = b.pal.label
    D.drawTransitionText(a.ctx, "?", 200, 100, size)
    D.drawTransitionText(b.ctx, "@", 200, 100, size)
    assert.deepEqual(a.img.buf, b.img.buf)
  }
})

test("page provides the hold at world creation and transition is last in the actor pass", () => {
  const web = fs.readFileSync(new URL("../public/agents/web.js", import.meta.url), "utf8")
  assert.match(web, /world = generate\(level, 0\)\s+world.res = RES\s+world.doneHold = DONE_HOLD/)
  const actors = D.drawActors.toString()
  assert.match(actors, /drawLevelTransition\(ctx, w, pal\)\s*}$/)
})
