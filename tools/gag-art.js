// Deterministic art fixtures for rare gameplay gags. No simulation is changed.
// node tools/gag-art.js --base main --out /tmp/gag-art
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { performance } from "node:perf_hooks"
import { load, canvas, crop, writePNG, themeOf } from "./render.js"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const S = load("Sim.js"), P = load("Palette.js")
export const CASES = ["mirage", "queue", "agi", "duck-floor", "duck-talk", "conflict", "pep", "outage", "standup", "standup-board", "replay", "sightings", "party", "confetti", "lanterns", "bat", "ghost"]
export function renderer(source) {
  const names = [...source.matchAll(/^function\s+(\w+)\s*\(/gm), ...source.matchAll(/^var\s+([A-Z][A-Z0-9_]*)\s*=/gm)].map(m => m[1])
  return new Function(source + "\nreturn {" + [...new Set(names)].join(",") + "}")()
}
export function season(source, search = "?season=halloween") {
  const box = { window: { location: { search } }, Date, Math, Object, String }
  vm.runInNewContext(source, box)
  return box.window.AgentSeason
}
function clearStrip(w, c, x) {
  for (let xx = x; xx < x + 18; xx++) for (let y = c.floorY - 4; y < c.floorY; y++)
    if (w.terrain[y * w.k.COLS + xx] !== w.k.EMPTY) return false
  for (let xx = x; xx < x + 18; xx++) if (w.terrain[c.floorY * w.k.COLS + xx] === w.k.EMPTY) return false
  return true
}
function floorSpot(w) {
  for (const c of w.corridors) for (let x = c.x0 + 3; x < c.x1 - 18; x++)
    if (clearStrip(w, c, x)) return { x: x + 3, y: c.floorY - 1 }
  throw Error("No bounded fixture floor")
}
function airSpot(w) {
  for (let y = w.k.SKY + 2; y < w.k.ROWS - 10; y++) for (let x = 3; x < w.k.COLS - 8; x++) {
    if (airRect(w, x, y)) return { x: x + 2.5, y: y + 7 }
  }
  throw Error("No bounded fixture air column")
}
function airRect(w, x, y) {
  for (let yy = y; yy < y + 9; yy++) for (let xx = x; xx < x + 5; xx++)
    if (w.terrain[yy * w.k.COLS + xx] !== w.k.EMPTY) return false
  return true
}
function actor(w, p, dx = 0) {
  const ag = Object.assign(S.spawn(w), { x: p.x + dx, y: p.y, dir: 1, state: "walk", special: false, trait: "steady", anim: 5, still: 0, waitFor: 0 })
  w.agents.push(ag); return ag
}
const FIXTURES = {
  mirage(w, p) { actor(w, p); w.mirages = [{ x: p.x + 10, y: p.y, born: 365, popped: -1, dir: 1, by: 0 }] },
  queue(w, p) { for (let i = 0; i < 4; i++) Object.assign(actor(w, p, i * 3), { queueFor: 25 + i * 30 }); w.agents[3].queuedAt = 394; w.rateLimit = { x: p.x + 5, y: p.y, dir: 1, at: 360, count: 4, clearAt: -1 } },
  agi(w, p) { actor(w, p); Object.assign(actor(w, p, 8), { agi: true }) },
  "duck-floor"(w, p) { actor(w, p); w.duck = { x: p.x + 8, y: p.y, at: 380, takenBy: -1 } },
  "duck-talk"(w, p) { Object.assign(actor(w, p, 6), { explainFor: 25, duckAt: 393 }); actor(w, p, 12) },
  conflict(w, p) { Object.assign(actor(w, p, 7), { conflictAt: 395, conflictSide: 1, conflictFor: 25 }); Object.assign(actor(w, p, 9), { dir: -1, conflictAt: 395, conflictSide: -1, conflictFor: 25 }) },
  pep(w, p) { Object.assign(actor(w, p, 7), { pepAt: 394, pepLine: 1 }); actor(w, p, 14) },
  outage(w, p) { for (let i = 0; i < 4; i++) actor(w, p, i * 4); w.outage = { at: 370, len: 120 } },
  standup(w) { w.gagStandup = { t: 28, speakers: ["steady", "dreamer", "brave", "wary"].map((trait, i) => ({ id: i + 1, trait, agi: i === 1, lines: ["YESTERDAY: SHIPPED.", "TODAY: MORE OF THAT.", "BLOCKERS: GRAVITY."] })) } },
  replay(w, p) { actor(w, p); w.replaying = true },
  sightings(w) { Object.assign(w, { done: true, doneTicks: 20, saved: 9, toRelease: 12, sightings: { seen: ["agi", "dreamer", "queue", "duck", "conflict", "outage", "milestone"], fresh: ["duck"] } }) },
  party(w, p) { for (let i = 0; i < 3; i++) actor(w, p, i * 6); w.milestone = { kind: "ten", n: 490000 }; w.firstReleaseAt = 375 },
  lanterns(w, p, a) { actor(w, p, 4); a.dress(w) },
  bat(w, p, a) { a.dress(w); const ag = Object.assign(actor(w, airSpot(w)), { state: "fall", floater: true, ownBrolly: true, fall: 10 }); ag.id += (3 - (ag.id + w.colonySeed) % 3) % 3 },
  ghost(w, p, a) { a.dress(w); actor(w, p); const ag = Object.assign(actor(w, p, 9), { state: "dead", gone: true }); w.seasonSeen[ag.id] = true; w.seasonGhosts = [{ x: ag.x, y: ag.y, t: 390 }] }
}
FIXTURES["standup-board"] = FIXTURES.standup
FIXTURES.confetti = FIXTURES.party
export function fixture(name, api, level = name === "bat" ? 9 : 6) {
  if (!FIXTURES[name]) throw Error("Unknown fixture " + name)
  const w = S.generate(level, 0, 3), p = floorSpot(w)
  Object.assign(w, { ticks: 400, agents: [], enemies: [], feed: [], mirages: [], rateLimit: null, outage: null, duck: null })
  FIXTURES[name](w, p, api)
  return w
}
export function paint(D, api, name, w, res, theme = "tokyo-night") {
  w.res = res
  const pal = P.build(themeOf(theme).theme, w.level), img = canvas(400 * res, 248 * res)
  api.tint(pal)
  D.drawTerrain(img.ctx, w, pal)
  D.drawActors(img.ctx, w, pal, {})
  if (name.startsWith("standup")) D.drawStandup(img.ctx, w, pal, w.gagStandup)
  if (w.season) api.paint(img.ctx, w)
  return img
}
export function cropBox(name, w) {
  if (name === "standup-board") return { x: 180, y: 50, width: 220, height: 120 }
  if (name === "confetti") return { x: Math.max(0, Math.min(180, Math.round(w.hatch.x * 4 - 110))), y: 0, width: 220, height: 120 }
  if (name === "standup") return { x: 90, y: 70, width: 220, height: 120 }
  if (name === "sightings") return { x: 90, y: 75, width: 220, height: 120 }
  if (name === "queue") return { x: 0, y: 0, width: 220, height: 120 }
  if (name === "replay" || name === "party") return { x: 0, y: 25, width: 220, height: 120 }
  const p = w.agents.find(a => a.floater) || w.agents[0] || floorSpot(w)
  return { x: Math.max(0, Math.min(180, Math.round(p.x * 4 - 50))), y: Math.max(28, Math.min(128, Math.round((p.y + 1) * 4 - 70))), width: 220, height: 120 }
}
export function copyPixels(dst, src, x, y) {
  for (let row = 0; row < src.H; row++) dst.buf.set(src.buf.subarray(row * src.W * 3, (row + 1) * src.W * 3), ((y + row) * dst.W + x) * 3)
}
export function doublePixels(src) {
  const out = canvas(src.W * 2, src.H * 2)
  for (let y = 0; y < out.H; y++) for (let x = 0; x < out.W; x++) {
    const i = ((y >> 1) * src.W + (x >> 1)) * 3, j = (y * out.W + x) * 3
    out.buf.set(src.buf.subarray(i, i + 3), j)
  }
  return out
}
function heading(D, img, text, x, y) { img.ctx.fillStyle = "#e6e9ee"; D.drawTransitionText(img.ctx, text.toUpperCase(), x, y, 2) }
export function sheetRow(D, name, images) {
  const out = canvas(1760, 278, "#121822")
  for (let i = 0; i < images.length; i++) {
    copyPixels(out, images[i], i * 440, 38)
    heading(D, out, ["BEFORE RES 1 / 2X", "AFTER RES 1 / 2X", "BEFORE RES 2 / 1X", "AFTER RES 2 / 1X"][i], i * 440 + 220, 23)
  }
  heading(D, out, name.replaceAll("-", " "), 880, 4)
  return out
}
function gitSource(base, file) {
  try { return execFileSync("git", ["show", base + ":public/agents/" + file], { cwd: ROOT, maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).toString() }
  catch (e) { throw Error("Cannot read " + file + " at " + base + ": " + (e.code || e.status)) }
}
export function run(base, outDir, cases = CASES) {
  const started = performance.now(), current = load("Draw.js"), old = renderer(gitSource(base, "Draw.js")), seasonNow = fs.readFileSync(path.join(ROOT, "public/agents/season.js"), "utf8"), seasonOld = gitSource(base, "season.js")
  const sheet = canvas(1760, cases.length * 278, "#121822"), manifest = []
  const versions = [["before", old, season(seasonOld, "?season=none"), season(seasonOld)], ["after", current, season(seasonNow, "?season=none"), season(seasonNow)]]
  for (const [index, name] of cases.entries()) {
    const images = []
    for (const res of [1, 2]) for (const [tag, D, normal, halloween] of versions) {
      const api = ["lanterns", "bat", "ghost"].includes(name) ? halloween : normal, w = fixture(name, api), img = paint(D, api, name, w, res), box = cropBox(name, w)
      writePNG(path.join(outDir, `${name}-${tag}-res${res}.png`), img)
      const close = crop(img, box.x * res, box.y * res, box.width * res, box.height * res)
      writePNG(path.join(outDir, `${name}-${tag}-crop-res${res}.png`), close)
      images.push(res === 1 ? doublePixels(close) : close)
    }
    copyPixels(sheet, sheetRow(current, name, images), 0, index * 278)
    manifest.push({ name, files: versions.map(([tag]) => `${name}-${tag}-res1.png / res2.png`) })
  }
  writePNG(path.join(outDir, "contact-sheet.png"), sheet)
  const result = { base, scenes: cases.length, frames: cases.length * 4, seconds: Number(((performance.now() - started) / 1000).toFixed(2)), peakRssMB: Number((process.resourceUsage().maxRSS / 1024).toFixed(1)), manifest }
  fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(result, null, 2)); return result
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2), value = (flag, fallback) => argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : fallback
  const result = run(value("--base", "main"), path.resolve(value("--out", "/tmp/gag-art")))
  console.log(JSON.stringify({ scenes: result.scenes, frames: result.frames, seconds: result.seconds, peakRssMB: result.peakRssMB }))
}
