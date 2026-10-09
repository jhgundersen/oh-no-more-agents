import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

// Every danger has its own drawing — eight once shared one graphic and nobody
// could tell them apart. This draws each kind in each phase on a real raster
// and checks it put something on the board without throwing.

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")

test("every hazard kind has its own drawing", () => {
  for (const spec of S.HAZARDS) assert.ok(D.HAZARD_DRAW[spec.id], spec.id + " falls through to the default")
})

for (const spec of S.HAZARDS) {
  test(`${spec.id} draws in every phase`, () => {
    const theme = themeOf("tokyo-night")
    const w = S.generate(1, 0, 99)
    const pal = P.build(theme.theme, 1)
    for (const phase of ["idle", "charge", "fire", "rest"]) for (const ticks of [0, 5, 60]) for (const dir of [1, -1]) {
      const img = canvas(400, 248, theme.background)
      const blank = Buffer.from(img.buf).toString("base64")
      w.ticks = ticks
      const h = { kind: spec.id, phase, t: 3, fired: 1, dir, known: true, throttled: 0, lineTo: 30, lineY: 20,
        zx0: 40, zx1: 40 + spec.w - 1, zy0: 20, zy1: 20 + spec.h - 1, mount: spec.mount, name: spec.name }
      D.drawHazardKind(img.ctx, w, pal, h)
      assert.notEqual(Buffer.from(img.buf).toString("base64"), blank, `${spec.id} ${phase} drew nothing`)
    }
  })
}
