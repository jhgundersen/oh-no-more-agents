import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

// Every mission's prisoner and its pen, drawn tied up and freed, in every
// variant: the freed pose is the one a still frame of a level rarely catches.
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")

for (const [biome, spec] of Object.entries(S.MISSION_SPECS)) {
  test(`${biome} mission (${spec.kind}) draws held and freed`, () => {
    const theme = themeOf("tokyo-night")
    const pal = P.build(theme.theme, S.BIOMES.indexOf(biome) + 1)
    for (const freed of [false, true]) for (const variant of [0, 1, 2]) for (const dir of [1, -1]) for (const fine of [false, true]) {
      const img = canvas(60, 40, theme.background)
      const blank = Buffer.from(img.buf).toString("base64")
      D.drawMissionContainer(img.ctx, spec.kind, 30, 36, pal)
      D.drawMissionSubject(img.ctx, spec.kind, { freed, variant, dir, anim: 7, dead: false }, 30, 36, pal, fine)
      assert.notEqual(Buffer.from(img.buf).toString("base64"), blank)
    }
  })
}
