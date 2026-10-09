import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

// Every hostile in every state it has, both ways, at the panel's res and the
// page's: a pose that throws or draws nothing fails here, not on the board.
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const POSES = {
  gun: ["walk", "aim", "jet"], sniper: ["walk", "camp", "aim", "reload", "jet"],
  operator: ["walk", "operate", "deploy"], drone: ["fly"], xeno: ["walk"], harpoon: ["walk", "aim"]
}

for (const [kind, states] of Object.entries(POSES)) {
  test(`${kind} draws in every state`, () => {
    const theme = themeOf("tokyo-night")
    for (const res of [1, 2]) for (const submerged of [false, true]) {
      if (submerged && kind !== "gun" && kind !== "harpoon") continue
      const w = S.generate(1, 0, 99)
      w.res = res; w.ticks = 40; w.submerged = submerged
      const pal = P.build(theme.theme, 1)
      for (const state of states) for (const dir of [1, -1]) for (const shotFor of [0, 7]) {
        const img = canvas(80 * res, 60 * res, theme.background)
        img.ctx.setTransform(res, 0, 0, res, 0, 0)
        const blank = Buffer.from(img.buf).toString("base64")
        D.drawEnemy(img.ctx, w, pal, { kind, state, dir, id: 2, x: 10, y: 12, anim: 5, shotFor, lineTo: 4, lineY: 10, timer: 3, jetMode: "rise" }, {})
        assert.notEqual(Buffer.from(img.buf).toString("base64"), blank, `${kind} ${state} res ${res}`)
      }
    }
  })
}
