import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, crop, themeOf } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const POSES = {
  gun: ["walk", "fall", "aim", "reload", "recover", "jet"],
  sniper: ["walk", "seekpost", "deploy", "fall", "camp", "aim", "reload", "recover", "jet"],
  operator: ["walk", "fall", "operate", "deploy", "recover"],
  drone: ["fly"], xeno: ["walk", "fall", "recover", "jet"],
  harpoon: ["walk", "fall", "aim", "reload", "recover", "jet"]
}
const theme = themeOf("tokyo-night"), pal = P.build(theme.theme, 1)

function setup(res = 1, submerged = false) {
  const w = S.generate(1, 0, 99)
  w.res = res; w.ticks = 40; w.submerged = submerged
  return w
}

function enemy(kind, extra = {}) {
  return { kind, state: "walk", dir: 1, id: 2, x: 10, y: 12, anim: 0,
    shotFor: 0, lineTo: 22, lineY: 10, timer: 0, jetMode: "rise", ...extra }
}

function render(w, en, labels = false) {
  const res = w.res || 1
  const img = canvas(120 * res, 80 * res, theme.background)
  img.ctx.setTransform(res, 0, 0, res, 0, 0)
  const rect = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (x, y, width, height) => {
    for (const n of [x, y, width, height]) assert.equal(n * 2, Math.round(n * 2), "half-pixel grid")
    rect(x, y, width, height)
  }
  D.drawEnemy(img.ctx, w, pal, en, { labels })
  assert.equal(img.ctx.globalAlpha, 1, "opacity restored")
  return img
}

function pixels(img) { return Buffer.from(img.buf) }

function lowestPixel(img) {
  let last = -1
  for (let i = 0; i < img.buf.length; i += 3) {
    if (img.buf[i] !== 26 || img.buf[i + 1] !== 27 || img.buf[i + 2] !== 38) last = Math.floor(i / 3 / img.W)
  }
  return last
}

// All real states, moving phases, firing countdowns, facing directions and
// label branches at panel/page resolution, including underwater gunners.
for (const [kind, states] of Object.entries(POSES)) {
  test(`${kind} draws every state on the hard-pixel grid without mutating Sim`, () => {
    for (const res of [1, 2]) for (const wet of [false, true]) {
      if (wet && kind !== "gun" && kind !== "harpoon") continue
      const w = setup(res, wet), before = JSON.stringify(w)
      const blank = pixels(canvas(120 * res, 80 * res, theme.background))
      for (const state of states) for (const dir of [1, -1]) for (const phase of [0, 4, 8, 12]) {
        const en = enemy(kind, { state, dir, anim: phase, timer: phase, shotFor: state === "reload" ? 8 - phase : 0 })
        const saved = structuredClone(en)
        assert.notDeepEqual(pixels(render(w, en, true)), blank, `${state} res ${res}`)
        assert.deepEqual(en, saved)
      }
      assert.equal(JSON.stringify(w), before)
    }
  })
}

for (const kind of ["gun", "operator", "sniper", "xeno", "harpoon"]) {
  test(`${kind} lifts alternate feet and bobs with a planted floor line`, () => {
    for (const res of [1, 2]) for (const dir of [1, -1]) {
      const w = setup(res, kind === "harpoon")
      const frames = [0, 4, 12].map(anim => render(w, enemy(kind, { anim, dir })))
      const regions = frames.map(img => crop(img, 28 * res, 48 * res, 30 * res, 8 * res))
      const feet = regions.map(pixels)
      const floor = regions.map(lowestPixel)
      assert.ok(floor[0] >= 0, "feet visible")
      assert.equal(floor[0], floor[1], "one boot remains planted")
      assert.equal(floor[1], floor[2], "other boot remains planted")
      assert.notDeepEqual(feet[0], feet[1], "passing foot")
      assert.notDeepEqual(feet[1], feet[2], "opposite passing foot")
      // Ignore tail and exhaust: sample the bright crest/helmet/visor or head.
      const heads = frames.map(img => pixels(crop(img, 36 * res, 35 * res, 20 * res, 13 * res)))
      assert.notDeepEqual(heads[0], heads[1], "body bob")
    }
  })
}

for (const kind of ["gun", "sniper", "drone"]) {
  test(`${kind} hovers instead of sliding rigidly through the air`, () => {
    for (const res of [1, 2]) {
      const w = setup(res), state = kind === "drone" ? "fly" : "jet"
      // Six ticks keep the rotor/flame phase equal, isolating body motion.
      const a = render(w, enemy(kind, { state, anim: 0 }))
      const b = render(w, enemy(kind, { state, anim: 6 }))
      assert.notDeepEqual(pixels(a), pixels(b))
    }
  })
}

for (const [kind, duration] of [["gun", 8], ["sniper", 36], ["harpoon", 46]]) {
  test(`${kind} tells before its actual Sim shot, recoils and recovers briefly`, () => {
    for (const res of [1, 2]) for (const dir of [1, -1]) {
      const w = setup(res, kind === "harpoon")
      w.terrain.fill(S.EMPTY)
      for (let x = 0; x < S.COLS; x++) w.terrain[13 * S.COLS + x] = S.DIRT
      const ag = S.spawn(w)
      Object.assign(ag, { id: 100, state: "walk", x: 10 + dir * 10, y: 12 })
      w.agents = [ag]
      const en = enemy(kind, { state: "aim", dir, targetId: ag.id, lineTo: ag.x })
      w.enemies = [en]
      const quiet = render(w, { ...en, state: kind === "sniper" ? "camp" : "walk" })
      const early = render(w, en)
      assert.notDeepEqual(pixels(early), pixels(quiet), "tell visible at timer 0")
      for (let tick = 1; tick < duration; tick++) {
        S.stepEnemy(w, en)
        assert.equal(en.shotFor, 0, "no discharge during wind-up")
      }
      const late = render(w, en)
      assert.notDeepEqual(pixels(early), pixels(late), "tell builds toward fire")
      S.stepEnemy(w, en)
      assert.equal(en.shotFor, 8); assert.equal(en.state, "reload")
      const firing = render(w, en)
      assert.notDeepEqual(pixels(firing), pixels(late), "release distinct from charge")
      for (let i = 0; i < 4; i++) S.stepEnemy(w, en)
      const recovery = render(w, en)
      assert.notDeepEqual(pixels(firing), pixels(recovery), "recoil relaxes")
      for (let i = 0; i < 6; i++) S.stepEnemy(w, en)
      assert.equal(en.shotFor, 0)
      // Only the discharge layer: recovery remains for four ticks beyond the
      // tracer, expires at twelve, and cancelled aims start beyond its window.
      const img = canvas(80, 60, theme.background), blank = pixels(img)
      D.drawEnemyDischarge(img.ctx, en, 40, 40, dir, kind === "harpoon")
      assert.notDeepEqual(pixels(img), blank, "brief residual smoke/bubbles")
      for (const timer of [12, 40, 72]) {
        const out = canvas(80, 60, theme.background), empty = pixels(out)
        D.drawEnemyDischarge(out.ctx, { ...en, timer }, 40, 40, dir, false)
        assert.deepEqual(pixels(out), empty, "expired/abandoned shot has no discharge")
      }
    }
  })
}

test("underwater gunner gets the same aim, recoil and recovery without a stray dry muzzle", () => {
  for (const res of [1, 2]) for (const dir of [1, -1]) {
    const w = setup(res, true)
    const poses = [enemy("gun", { dir, state: "walk" }), enemy("gun", { dir, state: "aim" }),
      enemy("gun", { dir, state: "reload", shotFor: 8 }), enemy("gun", { dir, state: "reload", shotFor: 4, timer: 4 })]
    const imgs = poses.map(en => pixels(render(w, en)))
    for (let i = 1; i < imgs.length; i++) assert.notDeepEqual(imgs[i - 1], imgs[i])
  }
})

test("operator presses its controls and warns of a replacement drone; drone shows proximity", () => {
  for (const res of [1, 2]) for (const dir of [1, -1]) {
    const w = setup(res)
    const normal = pixels(render(w, enemy("operator", { dir, state: "operate" })))
    const press = pixels(render(w, enemy("operator", { dir, state: "operate", anim: 8 })))
    assert.notDeepEqual(normal, press)
    const early = pixels(render(w, enemy("operator", { dir, state: "operate", timer: 145 })))
    const late = pixels(render(w, enemy("operator", { dir, state: "operate", timer: 179 })))
    assert.notDeepEqual(normal, early); assert.notDeepEqual(early, late)
    const drone = enemy("drone", { dir, state: "fly", targetId: 100 })
    const idle = pixels(render(w, drone))
    w.agents = [{ id: 100, state: "walk", x: 30, y: 12 }]
    const pursuit = pixels(render(w, drone))
    w.agents[0].x = 12
    const near = pixels(render(w, drone))
    assert.notDeepEqual(idle, pursuit); assert.notDeepEqual(pursuit, near)
    w.agents[0].gone = true
    assert.deepEqual(pixels(render(w, drone)), idle, "no lock on a corpse")
    w.agents[0].gone = false; w.agents[0].state = "saved"
    assert.deepEqual(pixels(render(w, drone)), idle, "no lock on a rescued agent")
  }
})

test("throttling stills gait/hover and suppresses launch and pursuit tells", () => {
  const w = setup(2)
  for (const kind of Object.keys(POSES)) {
    const en = enemy(kind, { throttled: 10, state: kind === "drone" ? "fly" : "walk" })
    const a = D.enemyMotion(w, en), b = D.enemyMotion(w, { ...en, anim: 12 })
    assert.deepEqual(a, b)
  }
  const img = canvas(80, 60, theme.background), blank = pixels(img)
  D.drawOperatorSignal(img.ctx, enemy("operator", { state: "operate", timer: 179, throttled: 1 }), 36, 36, 1, 0)
  D.drawDroneLock(img.ctx, w, enemy("drone", { throttled: 1 }), 36, 36, 1)
  assert.deepEqual(pixels(img), blank)
})

test("unstamped gone enemies stay absent from the living enemy renderer", () => {
  const w = setup()
  for (const kind of Object.keys(POSES)) {
    const en = enemy(kind)
    S.killEnemy(w, en)
    assert.equal(en.gone, true); assert.equal(en.state, "dead")
    const blank = pixels(canvas(120, 80, theme.background))
    assert.deepEqual(pixels(render(w, en)), blank)
  }
})

test("unspecified resolution draws exactly the panel art", () => {
  for (const kind of Object.keys(POSES)) {
    const w = setup(), en = enemy(kind, { anim: 4 })
    const explicit = pixels(render(w, en))
    delete w.res
    assert.deepEqual(pixels(render(w, en)), explicit)
  }
})

test("the guard house draws in every biome at both resolutions", async () => {
  const { canvas, themeOf } = await import("../tools/render.js")
  const D2 = loadCore("Draw.js"), P2 = loadCore("Palette.js")
  const theme = themeOf("tokyo-night")
  for (const biome of S.BIOMES) for (const res of [1, 2]) {
    const w = S.generate(13, 0, 3)
    w.res = res
    w.enemyHatch = { x: 50, y: 30, biome, corridor: 1, dir: 1 }
    const img = canvas(400 * res, 248 * res, theme.background)
    img.ctx.setTransform(res, 0, 0, res, 0, 0)
    const blank = Buffer.from(img.buf).toString("base64")
    D2.drawEnemyHatch(img.ctx, w, P2.build(theme.theme, 1), {})
    assert.notEqual(Buffer.from(img.buf).toString("base64"), blank, biome)
  }
})
