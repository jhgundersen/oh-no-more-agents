import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const levels = [16, 36, 56, 76], layers = [D.drawDialHall, D.drawDialMotion]
const MAX_CALLS = 20000
function sample(level = 16, name = "tokyo-night") {
  const w = S.generate(level, 0, level * 7919 + 13)
  w.res = 2; w.ticks = 77
  return { w, pal: P.build(themeOf(name).theme, level) }
}
function picture(draw) {
  const img = canvas(800, 496, "#000000"), calls = []
  img.ctx.setTransform(2, 0, 0, 2, 0, 0)
  const fill = img.ctx.fillRect.bind(img.ctx)
  img.ctx.fillRect = (...args) => {
    assert.ok(args.slice(2).every(n => n > 0), "positive rectangles")
    for (const n of args) assert.equal(n * 2, Math.round(n * 2), "half-pixel grid")
    assert.ok(calls.length < MAX_CALLS, "bounded draw recording")
    calls.push([...args, img.ctx.fillStyle, img.ctx.globalAlpha]); fill(...args)
  }
  img.ctx.fillStyle = "#123456"; img.ctx.globalAlpha = 0.8
  draw(img.ctx)
  return { ...img, buf: createHash("sha256").update(img.buf).digest("hex"), calls }
}
function readonly(value, cache = new WeakMap()) {
  if (!value || typeof value !== "object") return value
  if (cache.has(value)) return cache.get(value)
  const proxy = new Proxy(value, {
    get(target, key) { return readonly(Reflect.get(target, key), cache) },
    set() { throw new Error("world write") },
    defineProperty() { throw new Error("world define") },
    deleteProperty() { throw new Error("world delete") }
  })
  cache.set(value, proxy); return proxy
}
function footprint(c, visit) {
  assert.ok(c.slice(0, 4).every(Number.isFinite))
  assert.ok(c[0] >= 0 && c[1] >= 0 && c[0] + c[2] <= 400 && c[1] + c[3] <= 248)
  assert.ok(c[2] <= 4 && c[3] <= 4, "one-cell accent footprint")
  for (let y = c[1]; y < c[1] + c[3]; y += 0.5)
    for (let x = c[0]; x < c[0] + c[2]; x += 0.5) visit(x, y)
}

test("dial additions require Clock Tower page resolution", () => {
  for (let level = 1; level <= S.BIOMES.length; level++) for (const res of [undefined, 1, 2]) {
    const { w } = sample(level); w.res = res
    const visible = level === 16 && res === 2
    assert.equal(D.clocktowerPage(w), visible)
    for (const draw of layers) {
      const img = picture(ctx => draw(ctx, w))
      assert.equal(img.calls.length > 0, visible)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
    }
  }
})
test("dial art is deterministic, read-only, RNG-free, half-pixel and state balanced", () => {
  for (const level of levels) for (const name of Object.keys(THEMES)) {
    const { w, pal } = sample(level, name), before = JSON.stringify(w), frozen = readonly(w)
    const random = Math.random; Math.random = () => { throw new Error("render RNG") }
    try {
      for (const draw of layers) {
        const a = picture(ctx => draw(ctx, frozen)), b = picture(ctx => draw(ctx, frozen))
        assert.equal(a.buf, b.buf)
        assert.equal(a.ctx.fillStyle, "#123456"); assert.equal(a.ctx.globalAlpha, 0.8)
      }
      D.drawTerrain(canvas(800, 496).ctx, frozen, pal)
      D.drawActors(canvas(800, 496).ctx, frozen, pal, {})
    } finally { Math.random = random }
    assert.equal(JSON.stringify(w), before)
  }
})
test("glass, wheel rims, dusty shafts and varied rope bays are cached at fixed anchors", () => {
  for (const level of levels) {
    const { w } = sample(level), back = picture(ctx => D.drawDialHall(ctx, w))
    const anchors = [D.dialGeometry(w), D.dialWheels(w), w.corridors.map((_, row) => D.dialBays(w, row))]
    assert.ok(D.dialGeometry(w).r > D.clockFace(w).r)
    w.ticks += 271
    assert.equal(picture(ctx => D.drawDialHall(ctx, w)).buf, back.buf)
    w.terrain.fill(w.k.EMPTY)
    assert.deepEqual([D.dialGeometry(w), D.dialWheels(w), w.corridors.map((_, row) => D.dialBays(w, row))], anchors)
    assert.equal(picture(ctx => D.drawDialHall(ctx, w)).buf, back.buf)
    const variants = new Set()
    for (let row = 0; row < w.corridors.length; row++) {
      const bays = D.dialBays(w, row)
      bays.forEach((b, i) => {
        if (i > 0) assert.notEqual(b.kind, bays[i - 1].kind)
        const a = picture(ctx => D.drawDialBay(ctx, b)); variants.add(a.buf)
        assert.equal(a.ctx.fillStyle, "#123456"); assert.equal(a.ctx.globalAlpha, 0.8)
      })
    }
    assert.ok(variants.size >= 4)
    assert.ok(back.calls.some(c => c[4] === D.DIAL_ROPE))
    assert.ok(back.calls.some(c => c[4] === D.DIAL_LIGHT && c[3] === 9 && c[5] < 0.1))
  }
})
test("Roman numerals are exactly mirrored through the dial glass", () => {
  for (const text of D.DIAL_ROMAN) {
    const normal = canvas(82, 12), rear = canvas(82, 12), mirrored = new Uint8Array(82 * 12 * 3)
    for (const img of [normal, rear]) { img.ctx.setTransform(2, 0, 0, 2, 0, 0); img.ctx.fillStyle = "#ffffff" }
    D.drawTransitionText(normal.ctx, text, 20.5, 0.5, 1)
    D.drawDialNumeral(rear.ctx, text, 20.5, 0.5)
    for (let y = 0; y < 12; y++) for (let x = 0; x < 82; x++)
      mirrored.set(normal.buf.subarray((y * 82 + x) * 3, (y * 82 + x) * 3 + 3), (y * 82 + 81 - x) * 3)
    const digest = buf => createHash("sha256").update(buf).digest("hex")
    assert.equal(digest(rear.buf), digest(mirrored), text)
  }
  const { w } = sample(), f = D.dialGeometry(w), calls = picture(ctx => D.drawDialGlass(ctx, f)).calls
  const numeral = picture(ctx => { ctx.globalAlpha = 0.48; ctx.fillStyle = D.DIAL_LIGHT; D.drawDialNumeral(ctx, "III", f.x - 75, f.y - 2.5) }).calls
  const left = calls.filter(c => c[5] === 0.48 && c[0] >= f.x - 82 && c[0] <= f.x - 68 && c[1] >= f.y - 3 && c[1] <= f.y + 3)
  assert.deepEqual(left, numeral, "three o'clock lies left when seen from inside")
})
test("backlit glass stays lower contrast than Clock Tower masonry in every theme", () => {
  const mean = img => {
    let sum = 0
    for (let i = 0; i < img.buf.length; i += 3) sum += img.buf[i] * 0.2126 + img.buf[i + 1] * 0.7152 + img.buf[i + 2] * 0.0722
    return sum / (img.W * img.H)
  }
  for (const name of Object.keys(THEMES)) {
    const { w, pal } = sample(16, name), far = canvas(184, 184, D.DIAL_BACK), near = canvas(184, 184, D.DIAL_BACK)
    D.drawDialGlass(far.ctx, { x: 92, y: 92, r: 86 })
    D.drawDialLeading(far.ctx, { x: 92, y: 92, r: 86 })
    near.ctx.fillStyle = pal.dirt; near.ctx.fillRect(0, 0, 184, 184)
    for (let y = 0; y < 46; y++) for (let x = 0; x < 46; x++)
      D.drawClockCell(near.ctx, w.k, pal, w.k.DIRT, x * 4, y * 4, x, y, true)
    assert.ok(mean(far) < mean(near) * 0.8, `${name}: masonry remains the stronger plane`)
  }
})
test("live dial movement is bounded, slow and clipped to terrain and complete reserved silhouettes", () => {
  let seen = 0
  for (const level of levels) {
    const { w } = sample(level)
    for (const ticks of [0, 77, 160, 400, 476]) {
      w.ticks = ticks
      const img = picture(ctx => D.drawDialMotion(ctx, w)), boxes = D.dialReserved(w)
      seen += img.calls.length
      assert.ok(img.calls.length <= 350, "few moving parts; cached rims and light are not repainted")
      for (const c of img.calls) {
        assert.ok(D.abyssClear(w, ...c.slice(0, 4), boxes))
        footprint(c, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
      }
    }
    const old = picture(ctx => D.drawDialMotion(ctx, w)).buf
    w.ticks += 15
    assert.notEqual(picture(ctx => D.drawDialMotion(ctx, w)).buf, old)
    for (const material of [w.k.DIRT, w.k.ROCK, w.k.ORE, w.k.STEEL]) {
      w.terrain.fill(material)
      assert.equal(picture(ctx => D.drawDialMotion(ctx, w)).calls.length, 0)
    }
  }
  assert.ok(seen > 0)
  const w = S.generate(16, 0, 3); w.res = 2; w.ticks = 400
  const bob = picture(ctx => D.drawDialPendulum(D.dialInk(ctx, w), w)).calls.filter(c => c[1] >= D.clockFace(w).y + 56)
  assert.ok(bob.length >= 20, "reported level has a visible bob above the floor")
  const poses = [0, 15, 30, 45].map(t => { w.ticks = t; return picture(ctx => D.drawDialPendulum(D.dialInk(ctx, w), w)).buf })
  assert.equal(new Set(poses).size, 3, "pendulum reaches each side and passes its centre twice")
})
test("original props and the entire gate cassette, shutter and dial remain reserved", () => {
  const { w, pal } = sample(); w.terrain.fill(w.k.EMPTY); w.hazards = []; w.pits = []
  for (const kind of ["hang", "tuft", "clump", "spire"]) for (const size of [0, 1, 2, 3]) {
    const d = { kind, size, seed: 3, x: 45, y: 30 }; w.decor = [d]
    const boxes = D.dialReserved(w), img = picture(ctx => {
      D.drawClockDecor(ctx, pal, d, d.x * 4, d.y * 4, 4)
      D.drawDecorFine(ctx, pal, d, d.x * 4, d.y * 4, (d.y + 1) * 4, "clock")
    })
    for (const c of img.calls) assert.equal(D.assemblyUnreserved(boxes, ...c.slice(0, 4)), false, "complete original prop")
  }
  w.decor = []
  for (const thick of [1, 2, 3]) {
    const g = { x0: 45, x1: 44 + thick, top: 20, bottom: 24, phase: 43, changedAt: -1, open: false }
    w.gates = [g]; const boxes = D.dialReserved(w)
    for (const [open, changedAt] of [[false, -1], [true, -1], [false, 200], [true, 200], [true, 195], [false, 195]]) {
      Object.assign(g, { open, changedAt }); w.ticks = 200
      assert.deepEqual(D.dialReserved(w), boxes)
      const img = picture(ctx => D.drawClockGate(ctx, w, pal, g))
      for (const c of img.calls) assert.equal(D.assemblyUnreserved(boxes, ...c.slice(0, 4)), false, "gate guides, cassette, dial and bars")
    }
  }
  const ink = D.dialInk(canvas(800, 496).ctx, w)
  ink.fillRect(-1, 10, 1, 1); ink.fillRect(10, 10, 1, 1)
})
test("dial glass precedes masonry and live movement precedes gates, umbrellas and exit", () => {
  const { w, pal } = sample(36), ctx = canvas(800, 496).ctx
  let serial = 0, marks = {}
  ctx.fillRect = () => {
    assert.ok(++serial <= 100000)
    if (ctx.fillStyle === D.DIAL_LIGHT || ctx.fillStyle === D.DIAL_EDGE) marks.dial = serial
    if (ctx.fillStyle === pal.dirtEdge) marks.ground = serial
    if (ctx.fillStyle === pal.umbrellaStem) marks.umbrella = serial
    if (ctx.fillStyle === pal.exitLight) marks.exit = serial
    if (ctx.fillStyle === D.CLOCK_BRASS) marks.gate = serial
  }
  D.drawTerrain(ctx, w, pal)
  assert.ok(marks.dial > 0 && marks.ground > marks.dial)
  const ag = S.spawn(w)
  Object.assign(ag, { x: 70, y: w.corridors[0].floorY - 3, state: "fall", floater: true, ownBrolly: true, fall: 9, special: false })
  w.agents = [ag]; w.gates = [{ x0: 45, x1: 46, top: 20, bottom: 24, phase: 43, changedAt: -1, open: false }]
  w.ticks = 400; serial = 0; marks = {}
  D.drawActors(ctx, w, pal, {})
  assert.ok(marks.dial > 0)
  assert.ok(marks.umbrella > marks.dial && marks.exit > marks.dial && marks.gate > marks.dial)
})
test("dial light preserves opaque faces, shirts, eyes and umbrellas", () => {
  for (const name of Object.keys(THEMES)) for (const state of ["walk", "fall"]) {
    const { w, pal } = sample(16, name), mixer = D.dialGeometry(w), ag = S.spawn(w)
    Object.assign(ag, { x: mixer.x / 4, y: w.corridors[0].floorY - (state === "fall" ? 3 : 1), state,
      special: false, ownBrolly: true, floater: state === "fall", fall: 9, dir: 1, anim: 5 })
    w.agents = [ag]; w.ticks = 400
    let px = ag.x * 4, py = ag.y * 4
    const mask = canvas(800, 496, "#000000"), scene = canvas(800, 496)
    mask.ctx.setTransform(2, 0, 0, 2, 0, 0)
    D.drawAgent(mask.ctx, w, pal, ag, {})
    D.drawTerrain(scene.ctx, w, pal); D.drawActors(scene.ctx, w, pal, {})
    const colours = new Set([pal.skin, pal.shirt, pal.eye, pal.umbrellaStem].map(colour => {
      const dot = canvas(1, 1); dot.ctx.fillStyle = colour; dot.ctx.fillRect(0, 0, 1, 1); return dot.buf.join(",")
    }))
    let checked = 0
    const x0 = Math.floor(px * 2) - 40, y0 = Math.floor(py * 2) - 60
    for (let y = y0; y < y0 + 70; y++) for (let x = x0; x < x0 + 80; x++) {
      const i = (y * 800 + x) * 3, pixel = mask.buf.subarray(i, i + 3)
      if (!colours.has(pixel.join(","))) continue
      assert.equal(scene.buf.subarray(i, i + 3).join(","), pixel.join(","), `${name} ${state} opaque actor pixel`)
      checked++
    }
    assert.ok(checked >= 30, "real opaque actor pixels compared")
  }
})
test("Clock Tower native components retain bytes and page components match the reviewed gates", () => {
  for (const [resolutions, expected] of [
    [[undefined, 1], "7a7775c57d5ee2c3b18bc526e2a2f35170c1672e4b4ff0743c0d50840849b350"], [[2], "d23720d370d7f517dfcc30ec54839838828fffc7d570d65b62f90d1b25ac5fb3"]
  ]) {
    const hash = createHash("sha256")
    for (const name of Object.keys(THEMES)) for (const level of levels)
      for (const res of resolutions) for (const ticks of [0, 77, 240]) {
        const { w, pal } = sample(level, name); w.res = res; w.ticks = ticks
        const img = canvas(400, 248, themeOf(name).background)
        D.drawBackdrop(img.ctx, w, pal); D.drawTerrainMaterials(img.ctx, w, pal)
        D.drawDecor(img.ctx, w, pal); D.drawClockMaterials(img.ctx, w, pal); for (const g of w.gates) D.drawClockGate(img.ctx, w, pal, g)
        D.drawAmbience(img.ctx, w, pal); D.drawPits(img.ctx, w, pal)
        D.drawExitBack(img.ctx, w, pal); D.drawEnemyHatch(img.ctx, w, pal, {})
        for (const h of w.hazards) D.drawHazard(img.ctx, w, pal, h, {})
        hash.update(img.buf)
      }
    assert.equal(hash.digest("hex"), expected)
  }
})
test("drawing the dial leaves real clockwork-gate playthroughs identical", () => {
  const random = Math.random
  const jitter = seed => { let n = seed; return () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296) }
  try {
    for (const level of levels) {
      const seed = level * 7919 + 13
      const a = S.generate(level, 0, seed), b = S.generate(level, 0, seed)
      a.res = 2; b.res = 2
      const pal = P.build(themeOf("tokyo-night").theme, level), img = canvas(800, 496)
      for (let tick = 0; tick < 600; tick++) {
        // Spawn animation/blood jitter is outside the colony stream. Pin it
        // per step so a complete world digest also compares cosmetic fields.
        Math.random = jitter(seed + tick); S.step(a)
        Math.random = jitter(seed + tick); S.step(b)
        if (tick % 60 !== 0) continue
        Math.random = () => { throw new Error("render RNG during live play") }
        D.drawTerrain(img.ctx, a, pal); D.drawActors(img.ctx, a, pal, {})
        const digest = world => createHash("sha256").update(JSON.stringify(world)).digest("hex")
        assert.equal(digest(a), digest(b), `simulation replay ${level}, tick ${tick}`)
      }
    }
  } finally { Math.random = random }
})



