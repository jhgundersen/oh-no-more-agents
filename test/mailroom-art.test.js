import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const level = S.BIOMES.indexOf("Mail Room") + 1
function image(res) {
  const img = canvas(400 * res, 248 * res, "#000000")
  img.ctx.setTransform(res, 0, 0, res, 0, 0)
  return img
}
function sample(name = "tokyo-night") {
  const w = S.generate(level, 0, 99)
  return { w, pal: P.build(themeOf(name).theme, level) }
}

test("Mail Room letters and parcel strings stay in surviving pigeonholes", () => {
  for (const name of Object.keys(THEMES)) for (const res of [1, 2]) {
    const { w, pal } = sample(name); w.res = res
    assert.ok(D.BUILT[w.biome])
    w.terrain.fill(w.k.EMPTY)
    const row = 20, col = 30, index = row * w.k.COLS + col
    for (const [i, material] of [w.k.ORE, w.k.ORE, w.k.DIRT, w.k.ROCK, w.k.STEEL].entries()) w.terrain[index + i] = material
    const a = image(res), b = image(res), fill = a.ctx.fillRect.bind(a.ctx)
    a.ctx.fillRect = (x, y, width, height) => {
      for (let yy = y; yy < y + height; yy += 0.5) for (let xx = x; xx < x + width; xx += 0.5)
        assert.notEqual(w.terrain[Math.floor(yy / 4) * w.k.COLS + Math.floor(xx / 4)], w.k.EMPTY)
      fill(x, y, width, height)
    }
    const before = JSON.stringify(w)
    D.drawMailSlots(a.ctx, w, pal); D.drawMailSlots(b.ctx, w, pal)
    assert.deepEqual(a.buf, b.buf, "repaint keeps the same letters")
    assert.equal(JSON.stringify(w), before)
    w.terrain[index + 1] = w.k.EMPTY
    const dug = image(res); D.drawMailSlots(dug.ctx, w, pal)
    for (let y = row * 4 * res; y < (row + 1) * 4 * res; y++) {
      const i = (y * a.W + col * 4 * res) * 3
      assert.deepEqual(dug.buf.slice(i, i + 4 * res * 3), a.buf.slice(i, i + 4 * res * 3))
      assert.ok(dug.buf.slice(i + 4 * res * 3, i + 8 * res * 3).every(n => n === 0), "dug letters disappear")
    }
  }
})

test("Mail Room props include sacks, string parcels, sorting signs and a franking machine", () => {
  const { w, pal } = sample()
  for (const kind of ["spire", "clump", "hang", "tuft"]) for (const size of [0, 1, 2]) for (const seed of [3, 5]) {
    const d = { kind, size, seed }, coarse = image(2), fine = image(2)
    D.drawMailDecor(coarse.ctx, pal, d, 40, 40, 4)
    D.drawMailDecor(fine.ctx, pal, d, 40, 40, 4)
    D.drawDecorFine(fine.ctx, pal, d, 40, 40, 44, "mail")
    assert.notDeepEqual(fine.buf, coarse.buf, `${kind}, ${seed}`)
  }
  w.enemyHatch = { x: 30, y: 20, biome: "Mail Room" }
  const img = image(2), labels = []
  img.ctx.fillText = text => labels.push(text)
  D.drawEnemyHatch(img.ctx, w, pal, { labels: true })
  assert.ok(labels.includes("MAILER DAEMON"))
  for (const res of [1, 2]) {
    w.res = res
    const before = JSON.stringify(w)
    D.drawTerrain(image(res).ctx, w, pal)
    D.drawActors(image(res).ctx, w, pal, {})
    assert.equal(JSON.stringify(w), before)
  }
})

test("tube send hides only its passenger, carries a capsule and releases the body at delivery", () => {
  for (const res of [1, 2]) {
    const { w, pal } = sample(); w.res = res
    const p = w.pads[0], ag = S.spawn(w)
    assert.ok(p?.tube)
    ag.x = p.ax + 0.5; ag.y = p.ay; ag.state = "walk"
    w.agents = [ag]; w.ticks = 200
    const idle = image(res); D.drawPadPair(idle.ctx, w, pal, p)
    assert.equal(D.drawBeamArrival(idle.ctx, w, ag), false, "never-used tube hides nobody")
    S.stepPads(w)
    assert.equal(ag.y, p.by)
    const route = D.tubeRoute(w, p), start = D.tubePosition(route, 0), end = D.tubePosition(route, 1)
    assert.deepEqual([start.x, start.y], [route[0].x, route[0].y])
    assert.deepEqual([end.x, end.y], [route[3].x, route[3].y])
    const snapshots = new Set()
    for (const age of [-1, 0, 1, 3, 5, 7, 8, 9, 10, 23, 24, 100]) {
      w.ticks = p.usedAt + age
      const img = image(res), before = JSON.stringify(w)
      const fill = img.ctx.fillRect.bind(img.ctx)
      img.ctx.fillRect = (x, y, width, height) => {
        assert.equal(typeof img.ctx.fillStyle, "string", "every pipe and passenger colour exists")
        for (const n of [x, y, width, height]) assert.equal(n * 2, Math.round(n * 2), "hard pixel grid")
        fill(x, y, width, height)
      }
      D.drawPadPair(img.ctx, w, pal, p)
      assert.equal(D.drawBeamArrival(img.ctx, w, ag), age >= 0 && age < D.TUBE_TRAVEL)
      assert.equal(D.drawBeamArrival(img.ctx, w, { ...ag, id: ag.id + 99 }), false)
      assert.equal(JSON.stringify(w), before, "art never advances or pauses the traveller")
      assert.equal(img.ctx.globalAlpha, 1)
      if (age >= 0 && age < D.TUBE_TRAVEL) snapshots.add(Buffer.from(img.buf).toString("base64"))
    }
    assert.ok(snapshots.size >= 5, "capsule visibly moves along the pipe")
    p.who = -1; w.ticks = p.usedAt + 3
    D.drawPadPair(image(res).ctx, w, pal, p) // missing passenger remains a sealed capsule
    p.bx = p.ax
    D.drawPadPair(image(res).ctx, w, pal, p) // vertical-only installation
  }
})
