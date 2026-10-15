#!/usr/bin/env node
// Static share artwork from the game's own canvas, glyphs and sprites.
// node --max-old-space-size=256 tools/share-art.js --out /tmp/share-art
// Copy reviewed assets to public/ with a NEW number; published files stay put.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { load, canvas, crop, writePNG, themeOf } from "./render.js"

export function assetFiles(number = 1) {
  if (!Number.isInteger(number) || number < 1 || number > 9999) throw Error("artwork number must be an integer from 1 to 9999")
  return [`share-${number}.png`, `favicon-${number}-16.png`, `favicon-${number}-32.png`, `apple-touch-icon-${number}.png`]
}
export const FILES = assetFiles()
const S = load("Sim.js"), D = load("Draw.js"), P = load("Palette.js")
const INK = "#1a1b26", LIGHT = "#e9edf7", BLUE = "#7aa2f7"
export function shareWorld() {
  const w = S.generate(17, 0, 3)
  Object.assign(w, { res: 3, ticks: 400, agents: [], enemies: [], feed: [], mirages: [], duck: null, rateLimit: null })
  const add = (x, y, dir, extra = {}) => {
    const ag = Object.assign(S.spawn(w), { x, y, dir, state: "walk", special: false, trait: "steady", anim: 5, still: 0, ownBrolly: true }, extra)
    w.agents.push(ag)
  }
  add(21, 17, 1, { trait: "dreamer" }); add(14, 17, 1); add(9, 17, 1)
  add(80, 17, -1); add(86, 17, -1); add(92, 17, -1)
  add(47, 23, 1, { state: "fall", floater: true, fall: 12 })
  add(73, 24, -1, { state: "fall", floater: true, fall: 12 })
  add(9, 29, 1); add(18, 29, 1); add(60, 29, 1)
  add(84, 29, -1)
  add(71, 36, 1, { state: "fall", floater: true, fall: 12 })
  add(27, 41, 1); add(37, 41, 1); add(54, 41, -1); add(88, 41, -1)
  w.mirages = [{ x: 33, y: 17, born: 365, popped: -1, dir: 1, by: 0 }]
  return w
}
function paste(dst, src, x, y) {
  for (let row = 0; row < src.H; row++) dst.buf.set(src.buf.subarray(row * src.W * 3, (row + 1) * src.W * 3), ((y + row) * dst.W + x) * 3)
}
export function shareCard() {
  const w = shareWorld(), pal = P.build(themeOf("tokyo-night").theme, w.level)
  const board = canvas(1200, 744, INK)
  D.drawTerrain(board.ctx, w, pal); D.drawActors(board.ctx, w, pal, {})
  const card = canvas(1200, 630, INK), ctx = card.ctx
  paste(card, crop(board, 0, 84, 1200, 450), 0, 180)
  ctx.fillStyle = "#12131d"; ctx.fillRect(0, 0, 1200, 180)
  ctx.fillStyle = "#414868"; D.drawTransitionText(ctx, "OH NO! MORE AGENTS", 606, 48, 12)
  ctx.fillStyle = LIGHT; D.drawTransitionText(ctx, "OH NO! MORE AGENTS", 600, 42, 12)
  ctx.fillStyle = BLUE; D.drawTransitionText(ctx, "OH NO!", 312, 42, 12)
  ctx.fillStyle = "#a9b1d6"; D.drawTransitionText(ctx, "NO SUPERVISOR. NO PLAN. ONE UMBRELLA EACH.", 600, 126, 4)
  ctx.fillStyle = BLUE; ctx.fillRect(48, 168, 1104, 3)
  return card
}

// An optical 16px drawing: face, white collar, suit and umbrella survive in a
// browser tab. Larger icons use integer pixels too; no smoothing or font files.
export function favicon(size) {
  if (![16, 32, 180].includes(size)) throw Error("favicon size must be 16, 32 or 180")
  const img = canvas(size, size, INK), ctx = img.ctx, u = Math.floor(size / 16), pad = (size - 16 * u) / 2
  ctx.setTransform(u, 0, 0, u, pad, pad)
  ctx.fillStyle = "#9aa2b4"; ctx.fillRect(11, 5, 1, 8)
  ctx.fillStyle = BLUE; ctx.fillRect(6, 1, 4, 1); ctx.fillRect(4, 2, 8, 1); ctx.fillRect(2, 3, 12, 2)
  ctx.fillRect(1, 5, 2, 2); ctx.fillRect(13, 5, 2, 2)
  ctx.fillStyle = "#b2ccff"; ctx.fillRect(6, 1, 4, 1); ctx.fillRect(4, 2, 2, 1)
  ctx.fillStyle = "#526eae"; ctx.fillRect(3, 5, 10, 1); ctx.fillRect(7, 3, 1, 2)
  ctx.fillStyle = "#414868"; ctx.fillRect(6, 7, 3, 1); ctx.fillRect(5, 8, 5, 1)
  ctx.fillStyle = "#f0c8a0"; ctx.fillRect(6, 9, 4, 2); ctx.fillRect(10, 10, 1, 1); ctx.fillRect(11, 11, 1, 1)
  ctx.fillStyle = "#16161c"; ctx.fillRect(9, 9, 1, 1)
  ctx.fillStyle = LIGHT; ctx.fillRect(6, 11, 4, 1)
  ctx.fillStyle = "#58607b"; ctx.fillRect(6, 12, 4, 2); ctx.fillRect(10, 12, 2, 1)
  ctx.fillStyle = "#a9b1d6"; ctx.fillRect(6, 14, 1, 1); ctx.fillRect(9, 14, 1, 1)
  ctx.fillStyle = "#414868"; ctx.fillRect(5, 15, 2, 1); ctx.fillRect(9, 15, 2, 1)
  return img
}
export function build(out, number = 1) {
  const files = assetFiles(number)
  for (const file of files) if (fs.existsSync(path.join(out, file))) throw Error("Refusing to overwrite numbered artwork: " + file)
  fs.mkdirSync(out, { recursive: true })
  const images = [shareCard(), ...[16, 32, 180].map(favicon)]
  return images.map((img, i) => {
    const file = path.join(out, files[i]); writePNG(file, img, 1, { optimise: true })
    return { file, width: img.W, height: img.H, bytes: fs.statSync(file).size }
  })
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), i = args.indexOf("--out"), n = args.indexOf("--number")
  console.log(JSON.stringify(build(path.resolve(i >= 0 ? args[i + 1] : "/tmp/share-art"), n >= 0 ? Number(args[n + 1]) : 1), null, 2))
}
