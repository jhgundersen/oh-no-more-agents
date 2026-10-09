import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")

test("an explosion draws for its whole life and nothing after", () => {
  const theme = themeOf("tokyo-night")
  const w = S.generate(1, 0, 99)
  const pal = P.build(theme.theme, 1)
  for (const r of [2, S.BOMB_RADIUS, S.MINE_RADIUS]) {
    for (let a = 0; a <= S.BLAST_LIFE + 1; a++) {
      const img = canvas(100, 100, theme.background)
      const blank = Buffer.from(img.buf).toString("base64")
      w.ticks = 100 + a
      D.drawBlast(img.ctx, w, pal, { x: 12.5, y: 15, r, t: 100 })
      const drew = Buffer.from(img.buf).toString("base64") !== blank
      if (a < S.BLAST_LIFE) assert.ok(drew, `radius ${r} drew nothing at age ${a}`)
      else if (a > S.BLAST_LIFE) assert.ok(!drew, `radius ${r} still drawing at age ${a}`)
    }
  }
})

test("the sim forgets an explosion once it has burned out", () => {
  const w = S.generate(1, 0, 99)
  S.noteBlast(w, 10, 10, 5)
  for (let i = 0; i <= S.BLAST_LIFE + 1; i++) S.step(w)
  assert.equal(w.blasts.length, 0)
})
