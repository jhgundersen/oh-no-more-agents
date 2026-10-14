import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const theme = themeOf("tokyo-night"), pal = P.build(theme.theme, 8)
const base = { kind: "gun", boss: true, hp: 3, x: 15, y: 17, dir: 1,
  anim: 12, state: "walk", timer: 0, shotFor: 0, lineTo: 5, lineY: 17 }

function picture(res = 1) {
  const img = canvas(120 * res, 100 * res, theme.background)
  img.ctx.setTransform(res, 0, 0, res, 0, 0)
  const rect = img.ctx.fillRect.bind(img.ctx)
  img.rects = []
  img.ctx.fillRect = (x, y, width, height) => {
    for (const n of [x, y, width, height]) {
      assert.ok(Number.isFinite(n), "finite drawing coordinates")
      assert.equal(n * res, Math.round(n * res), "hard pixel grid")
    }
    assert.ok(width > 0 && height > 0)
    img.rects.push([x, y, width, height, img.ctx.fillStyle, img.ctx.globalAlpha])
    rect(x, y, width, height)
  }
  return img
}

function render(extra = {}, res = 1, ticks = 100) {
  const img = picture(res), en = Object.freeze({ ...base, ...extra })
  const w = Object.freeze({ k: Object.freeze({ CELL: 4 }), res, ticks })
  const random = Math.random
  Math.random = () => { throw Error("boss art must not consume RNG") }
  try {
    if (en.gone) D.drawEnemyDefeat(img.ctx, w, pal, en)
    else D.drawEnemy(img.ctx, w, pal, en, {})
  } finally { Math.random = random }
  return img
}

test("Moderator walks, aims, fires, jets and reels at both resolutions using only world reads", () => {
  for (const res of [undefined, 1, 2]) for (const dir of [-1, 1]) {
    const poses = [
      { state: "walk", anim: 0 }, { state: "walk", anim: 4 },
      { state: "aim", timer: 2 }, { state: "aim", timer: 6 },
      { state: "reload", timer: 1, shotFor: 8 },
      { state: "jet", anim: 4 }, { state: "jet", anim: 6 },
      { state: "recover", hurtAt: 100 }, { state: "recover", hurtAt: 98 },
      { state: "recover", hurtAt: 92 }, { state: "recover", hurtAt: 82 },
      { state: "recover", hurtAt: 72 }, { state: "recover", hurtAt: 60 },
      { state: "recover", hurtAt: 101 }, { state: "fall" }
    ].map(extra => render({ ...extra, dir }, res))
    for (const img of poses) assert.notDeepEqual(img.buf, picture(res).buf)
    for (const [a, b] of [[0, 1], [2, 3], [3, 4], [5, 6], [7, 8], [8, 9], [9, 10]])
      assert.notDeepEqual(poses[a].buf, poses[b].buf, `distinct animation ${a}/${b}`)
    assert.notDeepEqual(poses[0].buf, render({ boss: false, dir, anim: 0 }, res).buf)
  }
  assert.deepEqual(render().buf, render({}, undefined).buf)
})

test("boss body fits the headroom, hammer has a coarse silhouette, and fine work stays at res 2", () => {
  for (const res of [1, 2]) for (const dir of [-1, 1]) {
    const img = render({ dir, anim: 0 }, res)
    const body = img.rects.filter(r => r[1] !== 49) // the separate health strip
    assert.ok(Math.min(...body.map(r => r[1])) >= 72 - 22)
    assert.ok(Math.max(...body.map(r => r[1] + r[3])) <= 72)
    const hammer = picture(res)
    D.drawModeratorHammer(hammer.ctx, { res }, 50, 50, dir)
    assert.ok(hammer.rects.some(r => r[2] === 6 && r[3] >= 3), "wide hammer head")
    assert.ok(hammer.rects.some(r => r[2] === 1 && r[3] === 8), "long gold haft")
  }
  const coarse = render({}, 1), fine = render({}, 2)
  assert.ok(coarse.rects.every(r => r.slice(0, 4).every(Number.isInteger)))
  assert.ok(fine.rects.some(r => r.slice(0, 4).some(n => !Number.isInteger(n))))
})

test("three HP pips follow hp without being mirrored, flashed or lost during a stagger", () => {
  for (const res of [1, 2]) for (const dir of [-1, 1]) for (const hp of [0, 1, 2, 3]) {
    const img = render({ hp, dir, anim: 0, state: "recover", hurtAt: 100 }, res)
    const pips = img.rects.filter(r => r[1] === 49 && r[2] === 2 && r[3] === 1)
    assert.equal(pips.length, 3)
    assert.equal(pips.filter(r => r[4] === "#ff5268").length, hp)
    assert.equal(pips.filter(r => r[4] === "#3a2a30").length, 3 - hp)
    assert.deepEqual(pips.map(r => r[0]), [56, 59, 62])
    assert.ok(pips.every(r => r[5] === 1))
  }
})

test("Moderator reuses gunner muzzle and shot timing in either direction", () => {
  for (const res of [1, 2]) for (const dir of [-1, 1]) {
    for (const fields of [{ state: "aim", timer: 7 }, { state: "reload", shotFor: 8 },
      { state: "reload", shotFor: 4, timer: 5 }, { state: "reload", timer: 13 }]) {
      const en = { ...base, ...fields, dir }, w = { res, ticks: 100, k: { CELL: 4 } }
      const ox = 56 - dir * D.enemyRecoil(en), oy = 56
      const weapon = picture(res)
      D.drawGunnerWeapon(weapon.ctx, w, en, ox, oy, dir, fields.state === "aim" || fields.shotFor > 0 ? 6 : 8)
      const actual = render(en, res).rects
      const start = actual.findIndex(r => JSON.stringify(r) === JSON.stringify(weapon.rects[0]))
      assert.ok(start >= 0)
      assert.deepEqual(actual.slice(start, start + weapon.rects.length), weapon.rects)
    }
  }
})

test("boss defeat kneels, topples and bounces its crown, then expires with no context leak", () => {
  for (const res of [undefined, 1, 2]) for (const dir of [-1, 1]) {
    const en = Object.freeze({ ...base, dir, gone: true, state: "dead", diedAt: 100 })
    const frames = []
    for (let age = -1; age <= D.ENEMY_DEFEAT_TICKS + 1; age++) {
      const img = picture(res), blank = img.buf.slice()
      img.ctx.fillStyle = "#123456"; img.ctx.globalAlpha = 0.7
      D.drawEnemyDefeat(img.ctx, Object.freeze({ k: Object.freeze({ CELL: 4 }), res, ticks: 100 + age }), pal, en)
      if (age < 0 || age >= D.ENEMY_DEFEAT_TICKS) assert.deepEqual(img.buf, blank)
      else { assert.notDeepEqual(img.buf, blank); frames.push(img.buf) }
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.7)
      img.ctx.fillStyle = "#ffffff"; img.ctx.globalAlpha = 1
      img.ctx.fillRect(0, 0, 1, 1)
      assert.equal(img.buf[0], 255, "restores translation and facing")
    }
    for (const age of [6, 10, 16, 24, 31]) assert.notDeepEqual(frames[age], frames[0])
  }
  const crowns = [0, 4, 16, 24].map(age => {
    const img = picture(); D.drawModeratorCrownFall(img.ctx, {}, age); return img.rects
  })
  assert.ok(crowns[3][0][0] > crowns[0][0][0] + 8, "crown travels a few cells")
  assert.ok(crowns[1][0][1] < crowns[0][0][1], "initial upward pop")
})

test("actual boss poses and Sim-dated defeat leave the entire world unchanged", () => {
  // A Moderator level where it falls: found, not pinned, so the test survives
  // a change to which levels get a boss.
  let found = null
  for (let lv = S.BOSS_EVERY; lv < 400 && !found; lv += S.BOSS_EVERY) for (let seed = 1; seed < 6 && !found; seed++) {
    const probe = S.generate(lv, 0, seed)
    if (!probe.bossPost || probe.bossName !== "THE MODERATOR") continue
    while (!probe.done && probe.ticks < 6000) S.step(probe)
    const boss = probe.enemies.find(e => e.boss)
    if (boss && boss.gone && boss.diedAt) found = { lv, seed, died: boss.diedAt }
  }
  assert.ok(found, "a level where the Moderator falls")
  const w = S.generate(found.lv, 0, found.seed)
  const ticks = [60, 120, 200, found.died - 30, found.died, found.died + 8, found.died + 16].filter((t, i, a) => t > 0 && a.indexOf(t) === i).sort((x, y) => x - y)
  for (const tick of ticks) {
    while (w.ticks < tick) S.step(w)
    const en = w.enemies.find(e => e.boss)
    if (tick === found.died) { assert.ok(en.gone); assert.equal(en.diedAt, found.died) }
    for (const res of [1, 2]) {
      w.res = res
      const before = JSON.stringify(w), img = canvas(400 * res, 248 * res, theme.background)
      D.drawTerrain(img.ctx, w, pal); D.drawActors(img.ctx, w, pal, {})
      assert.equal(JSON.stringify(w), before, `tick ${tick}, res ${res}`)
    }
  }
})
