//
// Draw the game to a PNG from Node, with no browser and no dependencies.
//
// This is a library; `tools/shoot.js` is the command that uses it.
//
// Looks are checked by rendering, not by reading code — but the browser is an
// awkward place to do it from a terminal: it needs a dev server, a headless
// Chromium, a debugging port and a page that is running its own loop and
// advancing levels underneath you. Every one of those failed at least once.
//
// None of it is necessary. Draw.js only ever calls fillRect, fillText and a
// handful of no-ops on its context, so a recording canvas that rasterises
// fillRect into a byte buffer renders the real thing — the same code the page
// runs, not an approximation of it. Node has zlib, and a PNG is four chunks
// around a deflate stream, so writing the result out costs about forty lines.
//
// Two things are deliberately not reproduced. Text is skipped, because labels
// distort a look review and pixel fonts are not worth the trouble. Gradients
// collapse to their middle stop, which is close enough where Draw.js uses them
// (sky, glow, the wash) and would only matter if something drew a wide ramp.

import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AGENTS = path.join(HERE, "..", "public", "agents")

// Same trick as simcheck's loadSim: the core files carry no imports, so they
// can be evaluated as text and their top-level declarations handed back.
export function load(name) {
  const src = fs.readFileSync(path.join(AGENTS, name), "utf8")
  const fns = [...src.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)].map(m => m[1])
  const consts = [...src.matchAll(/^var\s+([A-Z][A-Z0-9_]*)\s*=/gm)].map(m => m[1])
  const names = [...new Set([...fns, ...consts])]
  const mod = { exports: {} }
  new Function("module", "exports", src + "\nmodule.exports={" + names.join(",") + "}")(mod, mod.exports)
  return mod.exports
}

// The themes live in web.js, which this cannot load — it is the host file and
// it does have imports. They are short, and only the five roles matter here.
export const THEMES = {
  "tokyo-night": { background: "#1a1b26", foreground: "#a9b1d6", accent: "#7aa2f7", urgent: "#f7768e", muted: "#414868" },
  "gruvbox": { background: "#282828", foreground: "#d4be98", accent: "#7daea3", urgent: "#ea6962", muted: "#665c54" },
  "nord": { background: "#2e3440", foreground: "#d8dee9", accent: "#81a1c1", urgent: "#bf616a", muted: "#4c566a" },
  "matte-black": { background: "#121212", foreground: "#bebebe", accent: "#e68e0d", urgent: "#d35f5f", muted: "#333333" },
  "hackerman": { background: "#0b0c16", foreground: "#ddf7ff", accent: "#82fb9c", urgent: "#ff5555", muted: "#2d3450" }
}

const hex = s => ({
  r: parseInt(s.slice(1, 3), 16) / 255,
  g: parseInt(s.slice(3, 5), 16) / 255,
  b: parseInt(s.slice(5, 7), 16) / 255
})

export function themeOf(name) {
  const t = THEMES[name] || THEMES["tokyo-night"]
  return {
    theme: {
      background: hex(t.background), foreground: hex(t.foreground),
      accent: hex(t.accent), urgent: hex(t.urgent), muted: hex(t.muted)
    },
    background: t.background
  }
}

function parseColor(c) {
  if (c && typeof c === "object" && c.__stops) {
    const s = c.__stops
    return s.length ? parseColor(s[Math.floor(s.length / 2)]) : [136, 136, 136, 1]
  }
  if (typeof c !== "string") return [136, 136, 136, 1]
  let m = c.match(/^#([0-9a-fA-F]{6})$/)
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1] }
  m = c.match(/^#([0-9a-fA-F]{3})$/)
  if (m) { const h = m[1]; return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), 1] }
  m = c.match(/rgba?\(([^)]+)\)/)
  if (m) { const p = m[1].split(",").map(Number); return [p[0] | 0, p[1] | 0, p[2] | 0, p.length > 3 ? p[3] : 1] }
  return [136, 136, 136, 1]
}

export function canvas(W, H, background) {
  const buf = new Uint8Array(W * H * 3)
  const base = parseColor(background || "#1a1b26")
  for (let i = 0; i < W * H; i++) { buf[i * 3] = base[0]; buf[i * 3 + 1] = base[1]; buf[i * 3 + 2] = base[2] }

  const state = { fillStyle: "#888888", globalAlpha: 1 }
  const stack = []
  const gradient = () => { const g = { __stops: [] }; g.addColorStop = (o, c) => g.__stops.push(c); return g }

  const ctx = {
    get fillStyle() { return state.fillStyle },
    set fillStyle(v) { state.fillStyle = v },
    get globalAlpha() { return state.globalAlpha },
    set globalAlpha(v) { state.globalAlpha = v },
    set font(v) { }, set textAlign(v) { }, set strokeStyle(v) { }, set lineWidth(v) { },
    canvas: { width: W, height: H },

    fillRect(x, y, w, h) {
      const col = parseColor(state.fillStyle)
      const a = Math.max(0, Math.min(1, state.globalAlpha * col[3]))
      if (a <= 0) return
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h)
      if (w < 0) { x += w; w = -w }
      if (h < 0) { y += h; h = -h }
      const x1 = Math.min(W, x + w), y1 = Math.min(H, y + h)
      for (let yy = Math.max(0, y); yy < y1; yy++) {
        for (let xx = Math.max(0, x); xx < x1; xx++) {
          const i = (yy * W + xx) * 3
          buf[i] = buf[i] * (1 - a) + col[0] * a
          buf[i + 1] = buf[i + 1] * (1 - a) + col[1] * a
          buf[i + 2] = buf[i + 2] * (1 - a) + col[2] * a
        }
      }
    },

    fillText() { },
    clearRect() { },
    save() { stack.push({ fillStyle: state.fillStyle, globalAlpha: state.globalAlpha }) },
    restore() { const s = stack.pop(); if (s) { state.fillStyle = s.fillStyle; state.globalAlpha = s.globalAlpha } },
    beginPath() { }, closePath() { }, moveTo() { }, lineTo() { }, arc() { }, fill() { }, stroke() { },
    translate() { }, scale() { }, rotate() { }, setTransform() { }, drawImage() { }, strokeRect() { },
    quadraticCurveTo() { }, clip() { }, rect() { },
    measureText() { return { width: 6 } },
    createLinearGradient: gradient,
    createRadialGradient: gradient
  }

  return { ctx, buf, W, H }
}

// A rectangle out of an image, as a new image. For looking at texture rather
// than at layout.
export function crop(img, x, y, w, h) {
  const out = canvas(w, h, "#000000")
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const si = ((yy + y) * img.W + (xx + x)) * 3
      const di = (yy * w + xx) * 3
      out.buf[di] = img.buf[si]; out.buf[di + 1] = img.buf[si + 1]; out.buf[di + 2] = img.buf[si + 2]
    }
  }
  return out
}

// Stack images vertically, for a contact sheet.
export function stack(images, gap) {
  gap = gap || 4
  const W = Math.max(...images.map(i => i.W))
  const H = images.reduce((n, i) => n + i.H, 0) + gap * (images.length - 1)
  const out = canvas(W, H, "#000000")
  let oy = 0
  for (const img of images) {
    for (let y = 0; y < img.H; y++) {
      for (let x = 0; x < img.W; x++) {
        const si = (y * img.W + x) * 3, di = ((y + oy) * W + x) * 3
        out.buf[di] = img.buf[si]; out.buf[di + 1] = img.buf[si + 1]; out.buf[di + 2] = img.buf[si + 2]
      }
    }
    oy += img.H + gap
  }
  return out
}

let TABLE = null
function crc32(b) {
  if (!TABLE) {
    TABLE = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
      TABLE[n] = c >>> 0
    }
  }
  let c = 0xFFFFFFFF
  for (let i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]) & 255] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

// Nearest-neighbour upscaling on the way out: the art is pixel art, so a
// smooth resize in an image viewer is the wrong thing to look at.
export function writePNG(file, img, scale) {
  scale = Math.max(1, scale || 1)
  const { W, H, buf } = img
  const SW = W * scale, SH = H * scale
  const raw = Buffer.alloc((SW * 3 + 1) * SH)
  let p = 0
  for (let y = 0; y < SH; y++) {
    raw[p++] = 0
    const sy = (y / scale) | 0
    for (let x = 0; x < SW; x++) {
      const i = (sy * W + ((x / scale) | 0)) * 3
      raw[p++] = buf[i]; raw[p++] = buf[i + 1]; raw[p++] = buf[i + 2]
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SW, 0); ihdr.writeUInt32BE(SH, 4)
  ihdr[8] = 8; ihdr[9] = 2      // 8-bit, truecolour
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]))
  return { file, width: SW, height: SH }
}

// Generate a level, run it for a while, and draw one frame of it.
export function frame(S, D, P, { level, seed, ticks, theme, labels }) {
  const t = themeOf(theme)
  const w = S.generate(level, 0, seed === undefined ? level * 7919 + 13 : seed)
  for (let i = 0; i < (ticks === undefined ? 240 : ticks); i++) S.step(w)
  const pal = P.build(t.theme, level)
  const img = canvas(w.k.COLS * w.k.CELL, w.k.ROWS * w.k.CELL, t.background)
  D.drawTerrain(img.ctx, w, pal)
  D.drawActors(img.ctx, w, pal, { labels: !!labels })
  return { img, world: w }
}
