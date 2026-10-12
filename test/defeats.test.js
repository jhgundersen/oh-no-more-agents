import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const theme = themeOf("tokyo-night"), pal = P.build(theme.theme, 1)
const kinds = ["gun", "drone", "operator", "sniper", "xeno", "harpoon"]
const causes = ["red team down", "drone down", "drone strike", "mine boom",
  "red team splash", "force pushed", "Model Collapse", "unknown", "", "constructor", "__proto__"]

function picture(res = 1) {
  const img = canvas(120 * res, 100 * res, theme.background)
  img.ctx.setTransform(res, 0, 0, res, 0, 0)
  return img
}

function enemy(kind, diedBy = "red team down", extra = {}) {
  return { kind, gone: true, state: "dead", diedAt: 100, diedBy,
    x: 15, y: 17, dir: 1, ...extra }
}

function world(age, res, submerged = false) {
  return Object.freeze({ k: Object.freeze({ CELL: 4 }), ticks: 100 + age, res, submerged })
}

function render(kind, age, res = 1, cause = "red team down", submerged = false) {
  const img = picture(res)
  D.drawEnemyDefeat(img.ctx, world(age, res, submerged), pal, enemy(kind, cause))
  return img.buf
}

for (const kind of kinds) {
  test(`${kind} defeat draws at both resolutions through its window, then expires`, () => {
    assert.equal(typeof D.ENEMY_DEFEAT_DRAW[kind], "function", "explicit kind recipe")
    for (const res of [undefined, 1, 2]) for (const dir of [-1, 1]) {
      for (const cause of causes) for (const age of [-1, ...Array.from({ length: D.ENEMY_DEFEAT_TICKS }, (_, i) => i), 32, 33, 100]) {
        const en = Object.freeze(enemy(kind, cause, { dir }))
        const w = world(age, res, kind === "harpoon")
        const img = picture(res), blank = img.buf.slice()
        img.ctx.fillStyle = "#123456"; img.ctx.globalAlpha = 0.7
        const rect = img.ctx.fillRect.bind(img.ctx)
        img.ctx.fillRect = (x, y, width, height) => {
          for (const n of [x, y, width, height])
            assert.equal(n * (res || 1), Math.round(n * (res || 1)), "hard pixel grid")
          assert.ok(width > 0 && height > 0)
          rect(x, y, width, height)
        }
        D.drawEnemyDefeat(img.ctx, w, pal, en)
        if (age < 0 || age >= D.ENEMY_DEFEAT_TICKS) assert.deepEqual(img.buf, blank)
        else assert.notDeepEqual(img.buf, blank, `${cause}, age ${age}`)
        assert.equal(img.ctx.fillStyle, "#123456")
        assert.equal(img.ctx.globalAlpha, 0.7)
        // Catch leaked translation, mirroring and drone quarter turns.
        img.ctx.globalAlpha = 1; img.ctx.fillStyle = "#ffffff"
        img.ctx.fillRect(0, 0, 1, 1)
        assert.equal(img.buf[0], 255)
      }
    }
  })

  test(`${kind} has changing poses and sensible unknown-event fallback`, () => {
    for (const res of [1, 2]) {
      const frames = [0, 8, 16, 24].map(age => render(kind, age, res))
      for (let i = 1; i < frames.length; i++) assert.notDeepEqual(frames[i], frames[i - 1])
      for (const cause of ["Model Collapse", "unknown", "", "constructor", "__proto__"])
        assert.deepEqual(render(kind, 8, res, cause), frames[1])
      assert.notDeepEqual(render(kind, 8, res, "force pushed"), frames[1])
      assert.notDeepEqual(render(kind, 8, res, "mine boom"), frames[1])
    }
  })
}

test("drone contact pops immediately; shot-down drone spins before popping", () => {
  for (const res of [1, 2]) {
    for (const age of [0, 3, 8, 17])
      assert.notDeepEqual(render("drone", age, res, "drone down"), render("drone", age, res, "drone strike"))
    assert.notDeepEqual(render("drone", 17, res), render("drone", 18, res))
  }
})

test("underwater gunners shed a rising helmet like harpooners, with their own weapon", () => {
  for (const res of [1, 2]) for (const age of [0, 8, 16, 31]) {
    const wet = render("gun", age, res, "red team down", true)
    assert.notDeepEqual(wet, render("gun", age, res))
    assert.notDeepEqual(wet, render("harpoon", age, res))
  }
})

test("living and unstamped enemies draw no defeat; unknown kinds fall back safely", () => {
  for (const fields of [{ gone: false }, { diedAt: undefined }]) {
    const img = picture(), blank = img.buf.slice()
    D.drawEnemyDefeat(img.ctx, world(0, 1), pal, enemy("gun", "red team down", fields))
    assert.deepEqual(img.buf, blank)
  }
  for (const kind of ["new kind", "constructor", "__proto__"])
    assert.deepEqual(render(kind, 0), render("gun", 0))
  assert.deepEqual(render("gun", 8, undefined), render("gun", 8, 1))
})

test("actor pass uses Sim's stamp, leaves state alone, and removes expired defeats", () => {
  const w = S.generate(1, 0, 99)
  w.agents = []; w.enemies = []; w.ticks = 100
  for (const res of [1, 2]) {
    w.res = res
    const blank = canvas(400 * res, 248 * res, theme.background)
    D.drawActors(blank.ctx, w, pal, {})
    for (const kind of kinds) {
      const en = enemy(kind, "", { gone: false, diedAt: undefined, x: 50, y: 20 })
      w.enemies = [en]
      S.killEnemy(w, en); S.noteDeaths(w)
      assert.equal(en.diedAt, 100); assert.equal(en.diedBy, "red team down")
      // The integration fixture isolates the corpse from Sim's blood layer.
      w.particles = []
      const before = JSON.stringify(w)
      const img = canvas(400 * res, 248 * res, theme.background)
      D.drawActors(img.ctx, w, pal, {})
      assert.equal(JSON.stringify(w), before)
      assert.notDeepEqual(img.buf, blank.buf)
      en.diedAt -= D.ENEMY_DEFEAT_TICKS
      const expired = canvas(400 * res, 248 * res, theme.background)
      D.drawActors(expired.ctx, w, pal, {})
      assert.deepEqual(expired.buf, blank.buf)
    }
    w.enemies = []
  }
})
