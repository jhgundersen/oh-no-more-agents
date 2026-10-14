import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { loadCore } from "../tools/load-core.js"
import { canvas, themeOf, THEMES } from "../tools/render.js"

const S = loadCore("Sim.js"), D = loadCore("Draw.js"), P = loadCore("Palette.js")
const levels = [15, 34, 53, 72], layers = [D.drawWorksite, D.drawWorkDrums]
const MAX_CALLS = 20000
function sample(level = 15, name = "tokyo-night") {
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

test("worksite additions require Building Site page resolution", () => {
  for (let level = 1; level <= S.BIOMES.length; level++) for (const res of [undefined, 1, 2]) {
    const { w } = sample(level); w.res = res
    const visible = level === 15 && res === 2
    assert.equal(D.buildingSitePage(w), visible)
    for (const draw of layers) {
      const img = picture(ctx => draw(ctx, w))
      if (!visible) assert.equal(img.calls.length, 0)
      else if (draw === D.drawWorksite) assert.ok(img.calls.length > 0)
      assert.equal(img.ctx.fillStyle, "#123456"); assert.equal(img.ctx.globalAlpha, 0.8)
    }
  }
})
test("worksite art is deterministic, read-only, RNG-free and canvas-state balanced", () => {
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
test("scaffolds, jackets, tape, rebar and mixers have fixed cached anchors", () => {
  for (const level of levels) {
    const { w } = sample(level), back = picture(ctx => D.drawWorksite(ctx, w))
    const anchors = [w.corridors.map((_, row) => D.workBays(w, row)), D.workMixers(w), D.workSafetyBox(w)]
    w.ticks += 271
    assert.equal(picture(ctx => D.drawWorksite(ctx, w)).buf, back.buf)
    const bay = D.workBays(w, 0)[0], old = picture(ctx => D.drawWorkBay(ctx, bay)).buf
    w.terrain.fill(w.k.EMPTY)
    assert.deepEqual([w.corridors.map((_, row) => D.workBays(w, row)), D.workMixers(w), D.workSafetyBox(w)], anchors)
    assert.equal(picture(ctx => D.drawWorkBay(ctx, bay)).buf, old)
    assert.ok(!back.calls.some(c => c[2] === 40 && c[3] === 24), "no framed display bays")
    assert.ok(back.calls.some(c => c[2] === 3 && c[3] === 1 && c[4] === D.WORK_EDGE), "scaffold clamps")
    assert.ok(back.calls.some(c => c[2] === 24 && c[3] === 1.5 && c[4] === D.WORK_YELLOW))
    assert.ok(back.calls.some(c => c[2] === 6 && c[3] === 9 && [D.WORK_VIS_ORANGE, D.WORK_VIS_YELLOW].includes(c[4])), "sparse hi-vis jackets")
    assert.ok(back.calls.some(c => c[2] === 29 && c[3] === 0.5))
  }
  const { w } = sample(15, "tokyo-night")
  const bays = w.corridors.map((_, row) => D.workBays(w, row))
  D.workMixers(w).forEach((b, row) => {
    assert.ok(b.x - 2 >= bays[row][0].x + 40 && b.x + 18 <= bays[row][1].x, "mixer in gap, never under a jacket")
    assert.ok(picture(ctx => D.drawWorkMixer(ctx, b)).calls.some(c => c[4] === D.WORK_ORANGE))
  })
})
test("far workwear and scaffold panels are lower contrast than playable concrete in five themes", () => {
  const mean = img => {
    let sum = 0
    for (let i = 0; i < img.buf.length; i += 3) sum += img.buf[i] * 0.2126 + img.buf[i + 1] * 0.7152 + img.buf[i + 2] * 0.0722
    return sum / (img.W * img.H)
  }
  for (const name of Object.keys(THEMES)) for (const kind of [0, 1, 2, 3, 4, 5, 6]) for (const seed of [0, 1]) {
    const { w, pal } = sample(15, name), far = canvas(40, 24, D.WORK_BACK), near = canvas(40, 24, D.WORK_BACK)
    D.drawWorkBay(far.ctx, { x: 0, base: 24, seed, kind })
    near.ctx.fillStyle = pal.rock; near.ctx.fillRect(0, 0, 40, 24)
    for (let y = 0; y < 6; y++) for (let x = 0; x < 10; x++)
      D.drawSiteCell(near.ctx, w.k, pal, w.k.ROCK, x * 4, y * 4, x, y, true)
    assert.ok(mean(far) < mean(near) * 0.8, `${name}: concrete stays the stronger plane`)
  }
})
test("neighbouring work bays differ, with at most two bright jackets on bare hooks", () => {
  for (let level = 15; level < 400; level += S.BIOMES.length) {
    const { w } = sample(level)
    let jackets = 0
    for (let row = 0; row < w.corridors.length; row++) {
      const bays = D.workBays(w, row)
      bays.forEach((bay, i) => {
        if (bay.kind === 1) jackets++
        if (i > 0) assert.notEqual(bay.kind, bays[i - 1].kind, "no identical neighbours")
      })
    }
    assert.ok(jackets <= 2)
  }
  const pictures = []
  for (let kind = 0; kind < 7; kind++) {
    const img = picture(ctx => D.drawWorkBay(ctx, { x: 36, base: 68, kind, seed: kind }))
    pictures.push(img.buf)
    assert.ok(img.calls.length < 80)
    assert.equal(img.ctx.globalAlpha, 0.8); assert.equal(img.ctx.fillStyle, "#123456")
  }
  assert.equal(new Set(pictures).size, 7, "distinct scaffold, workwear, rebar, plywood, hats, barrow and pallet silhouettes")
  for (const seed of [0, 1]) {
    const img = picture(ctx => D.drawWorkJacket(ctx, 60, 45, seed))
    assert.ok(img.calls.some(c => c[4] === (seed ? D.WORK_VIS_ORANGE : D.WORK_VIS_YELLOW) && c[5] === 0.85))
    assert.ok(img.calls.some(c => c[4] === D.WORK_REFLECT && c[2] === 6 && c[3] === 1 && c[5] === 0.95))
    assert.ok(img.calls.every(c => c[2] <= 6), "no frame around jacket")
    assert.equal(img.ctx.globalAlpha, 0.8); assert.equal(img.ctx.fillStyle, "#123456")
  }
})
test("drum animation stays bounded and clears complete terrain, fixture and crane envelopes", () => {
  let seen = 0
  for (const level of levels) {
    const { w } = sample(level), mixers = D.workMixers(w), boxes = D.workReserved(w)
    for (const ticks of [0, 12, 24, 36, 77, 160, 476]) {
      w.ticks = ticks
      const img = picture(ctx => D.drawWorkDrums(ctx, w)); seen += img.calls.length
      assert.ok(img.calls.length <= mixers.length * 3 && img.calls.length <= 18)
      for (const c of img.calls) {
        assert.ok(D.abyssClear(w, ...c.slice(0, 4), boxes))
        footprint(c, (x, y) => assert.ok(D.mechanismAir(w, x, y)))
      }
    }
    for (const material of [w.k.DIRT, w.k.ROCK, w.k.ORE, w.k.STEEL, w.k.EMPTY]) {
      w.terrain.fill(material)
      assert.equal(picture(ctx => D.drawWorkDrums(ctx, w)).calls.length, 0, "no drum in solid ground or without support")
    }
  }
  assert.ok(seen > 0)
  const { w } = sample(); w.decor = []; w.hazards = []; w.pits = []; w.cranes = []; w.terrain.fill(w.k.EMPTY)
  w.corridors = w.corridors.slice(0, 1)
  const b = D.workMixers(w)[0], C = w.k.CELL
  w.terrain[Math.floor(b.base / C) * w.k.COLS + Math.floor((b.x + 4) / C)] = w.k.ROCK
  const images = [0, 12, 24, 36].map(t => { w.ticks = t; return picture(ctx => D.drawWorkDrums(ctx, w)).buf })
  assert.equal(new Set(images).size, 4, "four distinct slow drum positions")
  w.terrain[Math.floor((b.base - 8) / C) * w.k.COLS + Math.floor((b.x + 8) / C)] = w.k.ROCK
  assert.equal(picture(ctx => D.drawWorkDrums(ctx, w)).calls.length, 0, "whole mixer omitted if its centre is buried")
})
test("full original props and gantry rider routes remain reserved at every crane phase", () => {
  const { w, pal } = sample(); w.terrain.fill(w.k.EMPTY); w.decor = []; w.hazards = []; w.pits = []
  for (const kind of ["hang", "tuft", "clump", "spire"]) for (const seed of [3, 4, 5]) {
    const d = { kind, seed, size: 3, x: 45, y: 30 }; w.decor = [d]
    const boxes = D.workReserved(w), img = picture(ctx => {
      D.drawSiteDecor(ctx, pal, d, d.x * 4, d.y * 4, 4)
      D.drawDecorFine(ctx, pal, d, d.x * 4, d.y * 4, (d.y + 1) * 4, "site")
    })
    for (const c of img.calls) assert.equal(D.assemblyUnreserved(boxes, ...c.slice(0, 4)), false, "complete original prop")
  }
  w.decor = []
  const crane = w.cranes[0], boxes = D.workReserved(w)
  for (const phase of ["wait", "up", "across", "down", "back"]) {
    crane.phase = phase
    for (const x of [crane.ax, crane.hx]) for (const drop of [0, 2, crane.land - crane.y + 2]) {
      crane.hookX = x; crane.drop = drop; w.ticks = 77
      assert.deepEqual(D.workReserved(w), boxes, "clearance never follows a moving hook")
      const g = D.craneDrawing(w, crane)
      assert.equal(D.assemblyUnreserved(boxes, g.tipX - 4, g.feet - 16, 8, 16), false, "rider and dangling feet")
      assert.equal(D.assemblyUnreserved(boxes, g.x, g.railY, 1, 4), false, "rail and warning lamp")
    }
  }
})
test("SITE SAFETY / 0 DAYS SINCE / LAST INCIDENT board is complete or omitted", () => {
  const w = S.generate(15, 0, 3); w.res = 2
  assert.ok(picture(ctx => D.drawWorkSafety(ctx, w, D.workReserved(w))).calls.length > 80, "requested level-15 board is fully present")
  w.terrain.fill(w.k.EMPTY); w.decor = []; w.hazards = []; w.pits = []; w.cranes = []
  const b = D.workSafetyBox(w), C = w.k.CELL
  const sign = picture(ctx => D.drawWorkSafety(ctx, w, []))
  assert.ok(sign.calls.length > 80)
  assert.equal(picture(ctx => D.drawWorkSafety(ctx, w, [b])).calls.length, 0)
  for (const [x, y] of [[b.x, b.y], [b.x + 20, b.y + 8], [b.x + 39, b.y + 16]]) {
    w.terrain.fill(w.k.EMPTY)
    w.terrain[Math.floor(y / C) * w.k.COLS + Math.floor(x / C)] = w.k.ROCK
    assert.equal(picture(ctx => D.drawWorkSafety(ctx, w, [])).calls.length, 0)
  }
})
test("worksite scenery precedes ground; live drums precede gantries, umbrellas and exit", () => {
  const { w, pal } = sample(), ctx = canvas(800, 496).ctx
  w.terrain.fill(w.k.EMPTY); w.decor = []; w.hazards = []; w.pits = []
  const b = D.workMixers(w)[0]
  w.terrain[Math.floor(b.base / 4) * w.k.COLS + Math.floor((b.x + 4) / 4)] = w.k.ROCK
  let serial = 0, marks = {}
  ctx.fillRect = () => {
    assert.ok(++serial <= 100000, "bounded streamed pass")
    if (ctx.fillStyle === D.WORK_PAPER || ctx.fillStyle === D.WORK_EDGE) marks.work = serial
    if (ctx.fillStyle === pal.rockEdge) marks.ground = serial
    if (ctx.fillStyle === pal.umbrellaStem) marks.umbrella = serial
    if (ctx.fillStyle === pal.exitLight) marks.exit = serial
    if (ctx.fillStyle === pal.oreEdge) marks.crane = serial
  }
  D.drawTerrain(ctx, w, pal)
  assert.ok(marks.work > 0 && marks.ground > marks.work)
  const ag = S.spawn(w)
  Object.assign(ag, { x: 70, y: w.corridors[0].floorY - 3, state: "fall", floater: true, ownBrolly: true, fall: 9, special: false })
  w.agents = [ag]; w.ticks = 400; serial = 0; marks = {}
  D.drawActors(ctx, w, pal, {})
  assert.ok(marks.work > 0)
  assert.ok(marks.umbrella > marks.work && marks.exit > marks.work && marks.crane > marks.work)
})
test("worksite background preserves opaque faces, shirts, eyes and umbrellas", () => {
  for (const name of Object.keys(THEMES)) for (const state of ["walk", "fall", "hooked"]) {
    const { w, pal } = sample(15, name), mixer = D.workMixers(w)[0], ag = S.spawn(w)
    Object.assign(ag, { x: mixer.x / 4, y: w.corridors[0].floorY - (state === "fall" ? 3 : 1), state,
      special: false, ownBrolly: true, floater: state === "fall", fall: 9, dir: 1, anim: 5 })
    w.agents = [ag]; w.ticks = 400
    let px = ag.x * 4, py = ag.y * 4
    if (state === "hooked") {
      const crane = w.cranes[0]; crane.who = ag.id; crane.phase = "down"; crane.drop = 6
      const g = D.craneDrawing(w, crane); px = g.tipX; py = g.feet - 4
    }
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
    assert.ok(checked >= (state === "hooked" ? 8 : 30), "real opaque actor pixels compared")
  }
})
test("original Building Site ground, fixtures, cranes, pits, hazards and exit retain bytes", () => {
  for (const [resolutions, expected] of [
    [[undefined, 1], "ea9e74422fc751d55c3aaae08d2c6a20cf2c825db71272db3221d311927a40d5"], [[2], "a4510513fd98275cd1032af02b9d2eedebb44bf10673cdac7a75fd420f672f14"]
  ]) {
    const hash = createHash("sha256")
    for (const name of Object.keys(THEMES)) for (const level of levels)
      for (const res of resolutions) for (const ticks of [0, 77, 240]) {
        const { w, pal } = sample(level, name); w.res = res; w.ticks = ticks
        const img = canvas(400, 248, themeOf(name).background)
        D.drawBackdrop(img.ctx, w, pal); D.drawTerrainMaterials(img.ctx, w, pal)
        D.drawDecor(img.ctx, w, pal); D.drawSiteMaterials(img.ctx, w, pal); D.drawSiteMachines(img.ctx, w, pal)
        D.drawAmbience(img.ctx, w, pal); D.drawPits(img.ctx, w, pal)
        D.drawExitBack(img.ctx, w, pal); D.drawEnemyHatch(img.ctx, w, pal, {})
        for (const h of w.hazards) D.drawHazard(img.ctx, w, pal, h, {})
        hash.update(img.buf)
      }
    assert.equal(hash.digest("hex"), expected)
  }
})
test("drawing the worksite leaves real crane playthroughs identical", () => {
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



