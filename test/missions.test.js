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

test("a freed civilian follows an agent heading home, and goes in after it", () => {
  let checked = 0
  for (let lv = 1; lv <= 120 && checked < 3; lv++) {
    const w = S.generate(lv, 0, lv * 7919 + 13)
    if (!w.mission || w.mission.still) continue
    let followed = null
    while (!w.done && w.ticks < 6000) {
      S.step(w)
      followed = followed || w.mission.targets.find(t => t.escort >= 0)
      if (followed && followed.home) break
    }
    if (!followed || !followed.home) continue
    const lead = w.agents.find(a => a.id === followed.escort)
    assert.equal(lead.state, "saved", "it went in after the agent it followed")
    assert.ok(w.escortsHome >= 1)
    assert.ok(w.saved <= w.released, "followers are not counted as agents")
    checked++
  }
  assert.equal(checked, 3)
})

test("followers leave the frame when home and are named on the report card", () => {
  const w = S.generate(1, 0, 3), pal = P.build(themeOf("tokyo-night").theme, 1)
  w.mission = { kind: "civilian", targets: [{ x: 20, y: 30, freed: true, home: true, anim: 0, dir: 1 }], progress: 0, done: true }
  const img = canvas(400, 248), blank = canvas(400, 248)
  D.drawMission(img.ctx, w, pal)
  w.mission.targets = []
  D.drawMission(blank.ctx, w, pal)
  assert.deepEqual(img.buf, blank.buf)
  assert.equal(D.escortLine({ escortsHome: 2 }), " · +2 RESCUED")
  assert.equal(D.escortLine({}), "")
})
