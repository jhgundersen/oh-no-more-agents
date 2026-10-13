import test from "node:test"
import assert from "node:assert/strict"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const kinds = ["civilian", "explorer", "animal", "camel"]
function fixture(kind, res, variant = 0, dir = 1) {
  const w = S.generate(1, 0, 321)
  w.res = res; w.ticks = 200; w.terrain.fill(w.k.EMPTY)
  w.terrain.fill(w.k.ROCK, 30 * w.k.COLS, 31 * w.k.COLS)
  const t = { x: 20, y: 30, dir, anim: 0, freed: true, escort: 0,
    lag: 10, trail: [[20 + dir * 0.1, 30, dir]], variant }
  w.mission = { kind, targets: [t], done: true, openedAt: 0, progress: 0 }
  return { w, t }
}
function readonly(value, cache = new WeakMap()) {
  if (!value || typeof value !== "object") return value
  if (cache.has(value)) return cache.get(value)
  const p = new Proxy(value, {
    get: (target, key) => readonly(Reflect.get(target, key, target), cache),
    set: () => assert.fail("Draw wrote world state"),
    deleteProperty: () => assert.fail("Draw deleted world state"),
    defineProperty: () => assert.fail("Draw defined world state")
  })
  cache.set(value, p)
  return p
}
function render(w, pal, draw = D.drawMission) {
  const res = w.res || 1, img = canvas(400 * res, 248 * res, "#010203")
  const ctx = img.ctx, calls = [], fill = ctx.fillRect.bind(ctx)
  ctx.setTransform(res, 0, 0, res, 0, 0)
  ctx.fillRect = (x, y, width, height) => {
    const grid = res >= 2 ? 2 : 1
    for (const n of [x, y, width, height]) {
      assert.ok(Number.isFinite(n)); assert.equal(n * grid, Math.round(n * grid))
    }
    assert.ok(width > 0 && height > 0)
    calls.push({ x, y, width, height, alpha: ctx.globalAlpha, ink: ctx.fillStyle })
    fill(x, y, width, height)
  }
  ctx.fillStyle = "#abcdef"; ctx.globalAlpha = 0.75
  const before = JSON.stringify(w), rng = Math.random
  Math.random = () => assert.fail("escort drawing used RNG")
  try { draw(ctx, readonly(w), pal) } finally { Math.random = rng }
  assert.equal(JSON.stringify(w), before)
  assert.equal(ctx.fillStyle, "#abcdef"); assert.equal(ctx.globalAlpha, 0.75)
  // A mark after the pass also verifies the transform and balanced save stack.
  const sample = canvas(img.W, img.H, "#010203")
  sample.ctx.setTransform(res, 0, 0, res, 0, 0)
  sample.ctx.fillStyle = "#abcdef"; sample.ctx.globalAlpha = 0.75
  ctx.fillRect(350, 230, 2, 2); sample.ctx.fillRect(350, 230, 2, 2)
  const start = (230 * res * img.W + 350 * res) * 3
  assert.deepEqual(img.buf.slice(start, start + 6 * res), sample.buf.slice(start, start + 6 * res))
  calls.pop()
  return { ...img, calls }
}

test("each follower hurries in both directions at both resolutions, without state or context writes", () => {
  for (const name of Object.keys(THEMES)) for (const kind of kinds) {
    for (const res of [undefined, 1, 2]) for (const variant of [0, 1, 2]) for (const dir of [-1, 1]) {
      const { w, t } = fixture(kind, res, variant, dir), pal = P.build(themeOf(name).theme, 1)
      const frames = []
      for (const anim of [0, 3, 6, 9]) {
        t.anim = anim
        const img = render(w, pal)
        assert.ok(img.calls.length > 0)
        assert.equal(img.calls.some(c => c.width === 0.5 || c.height === 0.5), res === 2)
        assert.deepEqual(img.buf, render(w, pal).buf, "deterministic drawing")
        frames.push(Buffer.from(img.buf).toString("base64"))
      }
      assert.ok(new Set(frames).size >= 3, "stride and bounce are visible")
    }
  }
})

test("pose follows the delayed trail and floor, including pickup waits, falls, climbs and empty tails", () => {
  const { w, t } = fixture("civilian", 1)
  assert.deepEqual(D.escortPose(w, t), { dir: 1, moving: true, air: false, up: false, phase: 0 })
  // The leader being airborne cannot put a still grounded follower in a fall.
  w.agents = [{ id: 0, state: "fall", x: 28, y: 34 }]
  assert.equal(D.escortPose(w, t).air, false)
  t.trail = [[25, 30, 1]]
  assert.equal(D.escortPose(w, t).moving, false, "pickup delay")
  t.trail = [[20, 30, 1]]
  assert.equal(D.escortPose(w, t).moving, false, "waiting behind a stopped agent")
  t.trail = [[20, 30.3, 1]]
  assert.equal(D.escortPose(w, t).air, true)
  t.trail = [[20, 29.8, 1]]
  assert.equal(D.escortPose(w, t).up, true)
  t.trail = []
  assert.equal(D.escortPose(w, t).moving, false)
  w.terrain.fill(w.k.EMPTY)
  assert.equal(D.escortPose(w, t).air, true, "vertical lift/ladder gap")
  t.trail = null; t.dir = 0
  assert.equal(D.escortPose(w, t).dir, 1)
})

test("followers tuck legs and reach or flap mid-air instead of walking on air", () => {
  const pal = P.build(themeOf("tokyo-night").theme, 1)
  for (const kind of kinds) for (const res of [undefined, 1, 2]) for (const variant of [0, 1, 2]) {
    const { w, t } = fixture(kind, res, variant)
    const walk = render(w, pal)
    t.trail = [[20.02, 30.3, 1]]
    const fall = render(w, pal)
    assert.notDeepEqual(walk.buf, fall.buf)
    t.trail = [[20.02, 29.8, 1]]
    const climb = render(w, pal)
    if (kind === "civilian" || kind === "explorer") assert.notDeepEqual(fall.buf, climb.buf)
    assert.ok(fall.calls.some(c => c.y >= 116 && c.y < 120), "tucked legs below the body")
  }
})

test("home followers rise and fade with sparks, then draw nothing", () => {
  const pal = P.build(themeOf("tokyo-night").theme, 1)
  for (const kind of kinds) for (const res of [undefined, 1, 2]) for (const dir of [-1, 1]) {
    const { w, t } = fixture(kind, res, 1, dir)
    t.home = true; t.homeAt = w.ticks
    const pictures = []
    for (const age of [0, 4, 8, 13]) {
      w.ticks = t.homeAt + age
      const img = render(w, pal)
      assert.ok(img.calls.length > 4)
      assert.ok(img.calls.every(c => c.alpha === 0.75 * (1 - age / D.ESCORT_HOME_TICKS)))
      assert.ok(img.calls.slice(-4).every(c => c.ink === pal.exitLight && c.width === 1 && c.height === 1))
      pictures.push(img)
    }
    assert.equal(pictures[2].calls[0].y, pictures[0].calls[0].y - 8, "body rises with age")
    for (const age of [-1, 14, 15, 50, 5000]) {
      w.ticks = t.homeAt + age
      assert.equal(render(w, pal).calls.length, 0)
    }
    delete t.homeAt
    assert.equal(render(w, pal).calls.length, 0, "legacy home without a timestamp")
  }
})

test("held, roaming, lost, cargo and alien subjects keep the existing art path", () => {
  const pal = P.build(themeOf("tokyo-night").theme, 1)
  for (const kind of [...kinds, "alien", "treasure"]) {
    const { w, t } = fixture(kind, 2)
    for (const patch of [{ freed: false }, { freed: true, escort: -1 }, { escort: undefined }, { dead: true }]) {
      const subject = { ...t, ...patch }
      assert.equal(D.drawMissionEscort(canvas(400, 248).ctx, w, pal, kind, subject), false)
    }
    if (kind === "alien" || kind === "treasure") {
      assert.equal(D.drawMissionEscort(canvas(400, 248).ctx, w, pal, kind, t), false)
      t.home = true; t.homeAt = w.ticks
      assert.equal(render(w, pal).calls.length, 0)
    }
  }
})

test("rescued report row includes only arrivals and keeps icons and text inside the plate", () => {
  const pal = P.build(themeOf("tokyo-night").theme, 1)
  for (const kind of kinds) for (const res of [undefined, 1, 2]) {
    const { w, t } = fixture(kind, res)
    w.escortsHome = 3
    w.mission.targets = [0, 1, 2].map(variant => ({ ...t, variant, home: true }))
    const draw = (ctx, world, palette) => D.drawEscortReport(ctx, world, palette, 200, 150)
    const img = render(w, pal, draw)
    assert.ok(img.calls.length > 0)
    assert.ok(img.calls.every(c => c.x > 70 && c.x + c.width < 330 && c.y >= 150 && c.y + c.height <= 158))
    w.mission.targets.push({ ...t, home: false })
    assert.deepEqual(render(w, pal, draw).buf, img.buf, "still following is not rescued yet")
    w.escortsHome = 0
    assert.equal(render(w, pal, draw).calls.length, 0)
    w.escortsHome = 30; w.mission.targets = Array.from({ length: 30 }, () => ({ ...t, home: true }))
    assert.ok(render(w, pal, draw).calls.every(c => c.x > 70 && c.x + c.width < 330))
    w.mission = null
    assert.ok(render(w, pal, draw).calls.length > 0, "count still shown without icons")
  }
  D.drawEscortBadge(canvas(400, 248).ctx, "alien", {}, 0, 0)
})

test("the finished report leaves room for the verdict and rescued row at both resolutions", () => {
  const pal = P.build(themeOf("tokyo-night").theme, 1)
  for (const res of [undefined, 1, 2]) for (const saved of [0, 8, 10, 18]) {
    const { w, t } = fixture("camel", res)
    w.done = true; w.doneTicks = 10; w.saved = saved; w.toRelease = 18
    w.escortsHome = 2; w.mission.targets = [{ ...t, home: true }, { ...t, home: false }]
    const img = render(w, pal, D.drawLevelTransition)
    assert.ok(img.calls.some(c => c.height === 78), "taller plate only when there are rescues")
    // Verdict occupies y136..140, badges y152..159; both inside the plate.
    assert.ok(img.calls.some(c => c.y === 136 && c.height === 1))
    assert.ok(img.calls.some(c => c.y === 154 && c.height === 1))
    assert.ok(img.calls.every(c => c.y + c.height <= 174))
    w.escortsHome = 0
    const without = render(w, pal, D.drawLevelTransition)
    assert.ok(without.calls.some(c => c.height === 62), "original card without rescues")
    assert.ok(without.calls.every(c => c.y + c.height <= 158))
  }
})
