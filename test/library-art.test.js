import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"
const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const level = S.BIOMES.indexOf("Library") + 1
const sample = name => {
  const w = S.generate(level, 0, 99)
  return { w, pal: P.build(themeOf(name).theme, level) }
}
const image = res => {
  const img = canvas(400 * res, 248 * res, "#000000")
  img.ctx.setTransform(res, 0, 0, res, 0, 0)
  return img
}

test("Library shelf bindings vary by cell and remain fixed through repaints and excavation", () => {
  for (const name of Object.keys(THEMES)) for (const res of [1, 2]) {
    const { w, pal } = sample(name); w.res = res
    assert.ok(D.BUILT.Library)
    w.terrain.fill(w.k.EMPTY)
    const row = 20, col = 20, index = row * w.k.COLS + col
    w.terrain[index] = w.k.ORE; w.terrain[index + 1] = w.k.ORE
    w.terrain[index + 2] = w.k.DIRT; w.terrain[index + 3] = w.k.ROCK
    const a = image(res), b = image(res)
    const fill = a.ctx.fillRect.bind(a.ctx)
    a.ctx.fillRect = (x, y, width, height) => {
      for (let yy = y; yy < y + height; yy += 0.5) for (let xx = x; xx < x + width; xx += 0.5)
        assert.notEqual(w.terrain[Math.floor(yy / 4) * w.k.COLS + Math.floor(xx / 4)], w.k.EMPTY,
          "shelf detail stays inside solid cells")
      fill(x, y, width, height)
    }
    D.drawLibraryStacks(a.ctx, w, pal); D.drawLibraryStacks(b.ctx, w, pal)
    assert.deepEqual(a.buf, b.buf)
    const colours = new Set()
    for (let y = row * 4 * res; y < (row + 1) * 4 * res; y++)
      for (let x = col * 4 * res; x < (col + 2) * 4 * res; x++) {
        const i = (y * a.W + x) * 3
        colours.add(a.buf.slice(i, i + 3).join(","))
      }
    assert.ok(colours.size >= 3, "bindings and shelf recess remain distinct")
    w.terrain[index + 1] = w.k.EMPTY
    const dug = image(res); D.drawLibraryStacks(dug.ctx, w, pal)
    for (let y = row * 4 * res; y < (row + 1) * 4 * res; y++) {
      const i = (y * a.W + col * 4 * res) * 3
      assert.deepEqual(dug.buf.slice(i, i + 4 * res * 3), a.buf.slice(i, i + 4 * res * 3))
    }
  }
})

test("Library props and their fine detail cover ladders, lamps and book piles", () => {
  const { w, pal } = sample("tokyo-night")
  for (const kind of ["spire", "hang", "clump", "tuft"]) for (const size of [0, 1, 2]) {
    const d = { kind, size, seed: 5 }, coarse = image(2), fine = image(2)
    D.drawLibraryDecor(coarse.ctx, pal, d, 40, 40, 4)
    D.drawLibraryDecor(fine.ctx, pal, d, 40, 40, 4)
    D.drawDecorFine(fine.ctx, pal, d, 40, 40, 44, "library")
    assert.notDeepEqual(fine.buf, coarse.buf, kind)
  }
  w.enemyHatch = { x: 30, y: 20, biome: "Library" }
  const img = image(2), labels = []
  img.ctx.fillText = text => labels.push(text)
  D.drawEnemyHatch(img.ctx, w, pal, { labels: true })
  assert.ok(labels.includes("STACK OVERFLOW"))
})

test("Library lamp dust moves in open air and disappears with its support", () => {
  const { w, pal } = sample("tokyo-night"); w.res = 2
  w.terrain.fill(w.k.EMPTY)
  w.decor = [{ kind: "hang", x: 20, y: 20, size: 1, seed: 3 }, { kind: "tuft", x: 30, y: 20, seed: 7 }]
  w.terrain[19 * w.k.COLS + 20] = w.k.ROCK
  w.terrain[21 * w.k.COLS + 30] = w.k.DIRT
  const a = image(2), b = image(2)
  D.drawLibraryLamplight(a.ctx, w, pal)
  w.ticks += 40; D.drawLibraryLamplight(b.ctx, w, pal)
  assert.notDeepEqual(a.buf, b.buf)
  w.terrain.fill(w.k.EMPTY)
  const c = image(2); D.drawLibraryLamplight(c.ctx, w, pal)
  assert.ok(c.buf.every(n => n === 0))
})

test("shelf climbers grip boards at both resolutions without changing world state", () => {
  const { w, pal } = sample("tokyo-night")
  w.terrain.fill(w.k.EMPTY)
  for (const dir of [-1, 1]) for (const res of [1, 2]) for (const anim of [0, 8]) {
    w.res = res
    const ag = { x: 30.5, y: 20, dir, state: "climb", anim, id: 1 }
    const face = Math.floor(ag.x) + dir
    w.terrain[20 * w.k.COLS + face] = w.k.ORE
    w.terrain[18 * w.k.COLS + face] = w.k.ROCK
    assert.ok(D.libraryShelfPose(w, ag))
    const before = JSON.stringify(w), a = image(res), b = image(res)
    D.drawAgent(a.ctx, w, pal, ag, {})
    w.biome = "Cavern"; D.drawAgent(b.ctx, w, pal, ag, {}); w.biome = "Library"
    assert.notDeepEqual(a.buf, b.buf, "shelf grip differs from paid climb")
    assert.equal(JSON.stringify(w), before)
    w.terrain[20 * w.k.COLS + face] = w.k.ROCK
    w.terrain[21 * w.k.COLS + face] = w.k.ORE
    assert.ok(D.libraryShelfPose(w, ag), "keep gripping across a shelf board")
    ag.climbDown = true; assert.equal(D.libraryShelfPose(w, ag), false)
    ag.climbDown = false; w.terrain[20 * w.k.COLS + face] = w.k.DIRT
    assert.equal(D.libraryShelfPose(w, ag), false)
  }
})
