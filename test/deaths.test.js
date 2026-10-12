import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const causes = ["boom", "red team", "hazard", "drone strike", "fell", "splat", "crushed", "turned", "stand down", "", "unknown", "constructor", "__proto__"]
const theme = themeOf("tokyo-night"), pal = P.build(theme.theme, 1)

function picture(res) {
  const img = canvas(80 * (res || 1), 80 * (res || 1), theme.background)
  img.ctx.setTransform(res || 1, 0, 0, res || 1, 0, 0)
  return img
}

function seeded(n) {
  let a = n
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

for (const cause of causes) {
  test(`death ${JSON.stringify(cause)} draws at both resolutions and expires`, () => {
    if (cause && !["unknown", "constructor", "__proto__"].includes(cause))
      assert.equal(typeof D.DEATH_DRAW[cause], "function", "cause has its own recipe")
    for (const res of [undefined, 1, 2]) for (const dir of [-1, 1]) for (const submerged of [false, true]) {
      const ag = Object.freeze({ gone: true, state: "dead", diedAt: 0, diedBy: cause, x: 10, y: 14, dir })
      for (const age of [-1, ...Array.from({ length: D.DEATH_TICKS }, (_, i) => i), D.DEATH_TICKS, D.DEATH_TICKS + 1, 100]) {
        const w = Object.freeze({ k: Object.freeze({ CELL: 4 }), ticks: age, res, submerged })
        const img = picture(res), blank = img.buf.slice()
        img.ctx.fillStyle = "#123456"; img.ctx.globalAlpha = 0.7
        const rect = img.ctx.fillRect.bind(img.ctx)
        img.ctx.fillRect = (x, y, width, height) => {
          for (const n of [x, y, width, height]) assert.equal(n * (res || 1), Math.round(n * (res || 1)), "hard pixel grid")
          assert.ok(width > 0 && height > 0)
          rect(x, y, width, height)
        }
        assert.doesNotThrow(() => D.drawDeath(img.ctx, w, pal, ag))
        if (age < 0 || age >= D.DEATH_TICKS || cause === "fell") assert.deepEqual(img.buf, blank, "no pixels outside the window / below world")
        else assert.notDeepEqual(img.buf, blank, "visible death pose")
        const belowBoots = 60 * (res || 1) * img.W * 3
        assert.deepEqual(img.buf.subarray(belowBoots), blank.subarray(belowBoots), "death stays above the last boot line")
        assert.equal(img.ctx.fillStyle, "#123456", "restore colour")
        assert.equal(img.ctx.globalAlpha, 0.7, "restore opacity")
        // Also catches a leaked translation or mirror on the shared context.
        img.ctx.globalAlpha = 1; img.ctx.fillStyle = "#ffffff"
        img.ctx.fillRect(0, 0, 1, 1)
        assert.equal(img.buf[0], 255)
      }
    }
  })
}

test("living, saved, and unstamped agents have no death drawing", () => {
  const w = { k: { CELL: 4 }, ticks: 0, res: 1 }
  for (const fields of [{ gone: false }, { state: "saved" }, { diedAt: undefined }]) {
    const img = picture(1), blank = img.buf.slice()
    D.drawDeath(img.ctx, w, pal, { gone: true, state: "dead", diedAt: 0, diedBy: "splat", x: 10, y: 14, dir: 1, ...fields })
    assert.deepEqual(img.buf, blank)
  }
})

test("actor pass dispatches deaths, expires them, and never changes the world", () => {
  const w = S.generate(1, 0, 99)
  w.agents = []; w.ticks = 100
  for (const res of [1, 2]) {
    w.res = res
    const blank = canvas(400 * res, 248 * res, theme.background)
    D.drawActors(blank.ctx, w, pal, {})
    for (const cause of causes) {
      const ag = { gone: true, state: "dead", diedAt: 100, diedBy: cause, x: 40, y: 12, dir: 1 }
      w.agents = [ag]
      const before = JSON.stringify(w)
      const img = canvas(400 * res, 248 * res, theme.background)
      D.drawActors(img.ctx, w, pal, {})
      assert.equal(JSON.stringify(w), before)
      if (cause === "fell") assert.deepEqual(img.buf, blank.buf)
      else assert.notDeepEqual(img.buf, blank.buf)
      ag.diedAt = 100 - D.DEATH_TICKS
      const expired = canvas(400 * res, 248 * res, theme.background)
      D.drawActors(expired.ctx, w, pal, {})
      assert.deepEqual(expired.buf, blank.buf)
    }
    w.agents = []
  }
})

test("once the window has passed, the dead draw nothing", () => {
  // Was a pinned hash of every frame, which any later change to the art
  // broke. What it guards is this: a death past its animation leaves the
  // frame exactly as if the agent had never been in the list.
  const random = Math.random
  try {
    for (let level = 1; level <= 12; level++) for (const ticks of [200, 500]) for (const res of [undefined, 2]) {
      Math.random = seeded(level * 1000 + ticks)
      const w = S.generate(level, 0, level * 7919 + 13)
      for (let t = 0; t < ticks && !w.done; t++) S.step(w)
      w.res = res
      for (const a of w.agents) if (a.gone && a.diedAt !== undefined) a.diedAt = w.ticks - D.DEATH_TICKS
      const scale = res || 1, colours = P.build(theme.theme, level)
      const withDead = canvas(400 * scale, 248 * scale, theme.background)
      D.drawTerrain(withDead.ctx, w, colours); D.drawActors(withDead.ctx, w, colours, {})
      const all = w.agents
      w.agents = all.filter(a => !(a.gone && a.diedAt !== undefined))
      const without = canvas(400 * scale, 248 * scale, theme.background)
      D.drawTerrain(without.ctx, w, colours); D.drawActors(without.ctx, w, colours, {})
      w.agents = all
      assert.deepEqual(withDead.buf, without.buf, `level ${level} at ${ticks}`)
    }
  } finally { Math.random = random }
})
