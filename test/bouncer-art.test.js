import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const theme = themeOf("tokyo-night"), pal = P.build(theme.theme, 13)
const base = { kind: "bouncer", hp: 3, x: 15, y: 17, dir: 1,
  anim: 0, state: "walk", timer: 0, shotFor: 0 }

function picture(res = 1) {
  const img = canvas(120 * res, 100 * res, theme.background)
  img.ctx.setTransform(res, 0, 0, res, 0, 0)
  const rect = img.ctx.fillRect.bind(img.ctx)
  img.rects = []
  img.ctx.fillRect = (x, y, width, height) => {
    for (const n of [x, y, width, height]) {
      assert.ok(Number.isFinite(n), "finite coordinates")
      assert.equal(n * res, Math.round(n * res), "hard pixel grid")
    }
    assert.ok(width > 0 && height > 0)
    img.rects.push([x, y, width, height, img.ctx.fillStyle, img.ctx.globalAlpha])
    rect(x, y, width, height)
  }
  return img
}

function render(extra = {}, res, ticks = 100, agents = []) {
  const img = picture(res), en = Object.freeze({ ...base, ...extra })
  const w = Object.freeze({ k: Object.freeze({ CELL: 4 }), res, ticks,
    agents: Object.freeze(agents.map(a => Object.freeze(a))) })
  const random = Math.random
  Math.random = () => { throw Error("Bouncer art must not consume RNG") }
  try {
    if (en.gone) D.drawEnemyDefeat(img.ctx, w, pal, en)
    else D.drawEnemy(img.ctx, w, pal, en, {})
  } finally { Math.random = random }
  assert.equal(img.ctx.globalAlpha, 1)
  return img
}

test("Bouncer has a heavy walk, stop palm, stagger and flash at both resolutions", () => {
  for (const res of [undefined, 1, 2]) for (const dir of [-1, 1]) {
    const close = [{ x: base.x + dir * 3, y: base.y, state: "walk" }]
    const poses = [render({ dir }, res), render({ dir, anim: 8 }, res),
      render({ dir, anim: 24 }, res), render({ dir }, res, 100, close),
      ...[0, 2, 6, 12, 22, 30].map(age => render({ dir, state: "recover", hurtAt: 100 - age }, res))]
    for (const img of poses) assert.notDeepEqual(img.buf, picture(res).buf)
    for (const [a, b] of [[0, 1], [1, 2], [0, 3], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9]])
      assert.notDeepEqual(poses[a].buf, poses[b].buf)
    assert.ok(poses[4].rects.some(r => r[4] === "#ffffff" && r[5] > 0), "white hit flash")
    assert.ok(!poses[6].rects.some(r => r[4] === "#ffffff"), "flash ends after six ticks")
    assert.deepEqual(render({ dir, hurtAt: 101 }, res).buf, poses[0].buf, "future hit stays unflashed")
    assert.notDeepEqual(render({ dir, state: "jet" }, res).buf, poses[0].buf)
  }
  assert.deepEqual(render().buf, render({}, 1).buf)
})

test("not tonight is only for an ordinary living walker ahead on the same floor", () => {
  const en = Object.freeze(base)
  for (const extra of [{}, { gone: true }, { special: true }, { state: "saved" },
    { x: 14 }, { x: 20 }, { y: 19 }]) {
    const ag = Object.freeze({ x: 18, y: 17, state: "walk", ...extra })
    const w = Object.freeze({ agents: Object.freeze([ag]) })
    assert.equal(D.bouncerPalm(w, en), Object.keys(extra).length === 0)
  }
  assert.equal(D.bouncerPalm({}, en), false)
  assert.equal(D.bouncerPalm({ agents: [{ x: 18, y: 17, state: "walk" }] }, { ...en, state: "recover" }), false)
})

test("Bouncer stays under twenty art pixels tall with broad shoulders and res-2 cable and pass detail", () => {
  for (const res of [1, 2]) for (const dir of [-1, 1]) for (const anim of [0, 8, 24]) {
    const img = render({ dir, anim }, res)
    const body = img.rects.filter(r => !["#ff5268", "#3a2a30"].includes(r[4]) || r[1] > 52)
    assert.ok(Math.min(...body.map(r => r[1])) >= 72 - 20)
    assert.ok(Math.max(...body.map(r => r[1] + r[3])) <= 72)
    assert.ok(body.some(r => r[2] === 13 && r[3] === 4), "shoulders broader than a gunner")
    assert.ok(Math.min(...img.rects.map(r => r[1])) >= 72 - 24, "pips fit corridor too")
  }
  assert.ok(render({}, 1).rects.every(r => r.slice(0, 4).every(Number.isInteger)))
  assert.ok(render({}, 2).rects.some(r => r.slice(0, 4).some(n => !Number.isInteger(n))))
})

test("Bouncer pips match hp through walking, refusal, stagger and hit flash", () => {
  for (const res of [1, 2]) for (const dir of [-1, 1]) for (const hp of [0, 1, 2, 3]) {
    for (const extra of [{}, { anim: 8 }, { state: "recover", hurtAt: 100 }]) {
      const img = render({ dir, hp, ...extra }, res, 100, [{ x: 15 + dir * 3, y: 17, state: "walk" }])
      const pips = img.rects.filter(r => r[1] < 54 && r[2] === 2 && r[3] === 1)
      assert.equal(pips.length, 3)
      assert.equal(pips.filter(r => r[4] === "#ff5268").length, hp)
      assert.equal(pips.filter(r => r[4] === "#3a2a30").length, 3 - hp)
      assert.deepEqual(pips.map(r => r[0]), [56, 59, 62])
      assert.ok(pips.every(r => r[5] === 1))
    }
  }
})

test("heavy defeat buckles, hits the floor and sheds the pass within a finite window", () => {
  assert.equal(D.ENEMY_DEFEAT_DRAW.bouncer, D.drawDefeatBouncer)
  for (const res of [undefined, 1, 2]) for (const dir of [-1, 1]) {
    const frames = []
    for (let age = -1; age <= D.ENEMY_DEFEAT_TICKS + 1; age++) {
      const img = render({ dir, gone: true, diedAt: 100 }, res, 100 + age)
      if (age < 0 || age >= D.ENEMY_DEFEAT_TICKS) assert.deepEqual(img.buf, picture(res).buf)
      else { assert.notDeepEqual(img.buf, picture(res).buf); frames.push(img.buf) }
    }
    for (const age of [6, 8, 14, 24, 31]) assert.notDeepEqual(frames[age], frames[0])
    const img = picture(res)
    img.ctx.fillStyle = "#123456"; img.ctx.globalAlpha = 0.7
    D.drawEnemyDefeat(img.ctx, { k: { CELL: 4 }, res, ticks: 114 }, pal,
      { ...base, dir, gone: true, diedAt: 100, diedBy: "force pushed" })
    assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.7)
    img.ctx.fillStyle = "#ffffff"; img.ctx.globalAlpha = 1; img.ctx.fillRect(0, 0, 1, 1)
    assert.equal(img.buf[0], 255, "restores facing and translation")
  }
})

test("throw landing puff is at Sim's destination, lasts eight ticks and restores context", () => {
  for (const res of [1, 2]) for (const age of [-1, 0, 7, 8, 11, 15, 16, 24]) {
    const img = picture(res), blank = img.buf.slice()
    img.ctx.fillStyle = "#123456"; img.ctx.globalAlpha = 0.7
    const ag = Object.freeze({ x: 15, y: 17, state: "stunned", thrownAt: 100, thrownFrom: 18 })
    D.drawThrowLanding(img.ctx, Object.freeze({ ticks: 100 + age, k: { CELL: 4 } }), pal, ag)
    if (age >= 8 && age < 16) assert.notDeepEqual(img.buf, blank)
    else assert.deepEqual(img.buf, blank)
    assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.7)
  }
  for (const extra of [{ thrownAt: undefined }, { thrownFrom: undefined }, { state: "walk" }]) {
    const img = picture(), blank = img.buf.slice()
    D.drawThrowLanding(img.ctx, { ticks: 108, k: { CELL: 4 } }, pal,
      { x: 15, y: 17, state: "stunned", thrownAt: 100, thrownFrom: 18, ...extra })
    assert.deepEqual(img.buf, blank)
  }
})

test("actual level 13 walk, palm, scuffle, throw, stagger and dated defeat never write world state", () => {
  // A colony in which the Bouncer walks, scuffles, recovers and is put down.
  // The colony comes from the cast, so a new trait reshuffles it; the moments
  // are read off a first run rather than pinned, and only the seed is chosen.
  const seed = 103011, moments = new Set(), scout = S.generate(13, 0, seed)
  let last = "", died = -1
  while (scout.ticks < 2400 && died < 0) {
    S.step(scout)
    const en = scout.enemies.find(e => e.kind === "bouncer")
    if (!en) continue
    if (en.state !== last) { moments.add(scout.ticks); moments.add(scout.ticks + 4); last = en.state }
    if (en.gone) died = en.diedAt
  }
  assert.ok(died > 0, "this colony must still put its Bouncer down; pick another seed if a cast change moved it")
  for (const age of [8, 14, 31, 32]) moments.add(died + age)
  const w = S.generate(13, 0, seed)
  assert.ok(w.enemyRoster.includes("bouncer"))
  for (const tick of [...moments].sort((a, b) => a - b)) {
    while (w.ticks < tick) S.step(w)
    const en = w.enemies.find(e => e.kind === "bouncer")
    if (tick === died + 8) { assert.ok(en.gone); assert.equal(en.diedAt, died) }
    for (const res of [1, 2]) {
      w.res = res
      const before = JSON.stringify(w), img = canvas(400 * res, 248 * res, theme.background)
      D.drawTerrain(img.ctx, w, pal); D.drawActors(img.ctx, w, pal, {})
      assert.equal(JSON.stringify(w), before, `tick ${tick}, res ${res}`)
    }
  }
})
