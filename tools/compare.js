#!/usr/bin/env node
// Side by side, for art review: main and another ref rendering the same level,
// colony and tick at page resolution, in one labelled PNG — the two full frames
// next to each other, and under each a 2x crop of where they differ most.
//
//   npm run compare -- codex/factory 8
//   npm run compare -- codex/factory 8 --seed 42 --ticks 600 --out shots/factory.png
//   npm run compare -- HEAD~3 12 --base HEAD
//
// Both sides come out of git objects (`git show <ref>:public/agents/...`) into
// a temp dir and are loaded from there, so nothing is checked out and the
// working tree does not matter. Page randomness is seeded the same for both.

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { loadCoreFrom } from "./load-core.js"
import { canvas, crop, writePNG, frame, themeOf } from "./render.js"

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const FILES = ["Sim.js", "Draw.js", "Palette.js"]

export function parseArgs(argv) {
  const opt = (name, d) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : d }
  const plain = argv.filter((a, i) => !a.startsWith("--") && !(argv[i - 1] || "").startsWith("--"))
  const level = Number(plain[1])
  if (!plain[0] || !(level >= 1)) throw new Error("usage: npm run compare -- <ref> <level> [--seed N] [--ticks N] [--base REF] [--out FILE]")
  return { ref: plain[0], level, seed: Number(opt("--seed", level * 7919 + 13)), ticks: Number(opt("--ticks", 400)),
    base: opt("--base", "main"), out: opt("--out", path.join("shots", `compare-${plain[0].replace(/[^\w.-]+/g, "_")}-${level}.png`)) }
}

// --out may name a file or a directory (existing, or written with a trailing
// slash); a directory gets <ref>-L<level>.png inside it. A directory used to
// fail with EISDIR.
export function outPath(opts) {
  const o = opts.out
  const isDir = /[\\/]$/.test(o) || (fs.existsSync(o) && fs.statSync(o).isDirectory())
  return isDir ? path.join(o, `${opts.ref.replace(/[^\w.-]+/g, "_")}-L${opts.level}.png`) : o
}

// The core files of `ref`, as written in git, in a fresh temp dir.
export function checkout(ref) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compare-"))
  for (const f of FILES)
    fs.writeFileSync(path.join(dir, f), execFileSync("git", ["show", `${ref}:public/agents/${f}`], { cwd: ROOT, maxBuffer: 64 << 20 }))
  return dir
}

export function render(dir, opts) {
  const S = loadCoreFrom(dir, "Sim.js"), D = loadCoreFrom(dir, "Draw.js"), P = loadCoreFrom(dir, "Palette.js")
  const random = Math.random
  let x = 0.5
  Math.random = () => (x = (x * 9301 + 49297) % 233280 / 233280)
  try { return { img: frame(S, D, P, { level: opts.level, seed: opts.seed, ticks: opts.ticks, res: 2, theme: "tokyo-night" }).img, D } }
  finally { Math.random = random }
}

// The bounding box of every pixel that differs, or null.
export function diffBox(a, b) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
  for (let y = 0; y < a.H; y++) for (let x = 0; x < a.W; x++) {
    const i = (y * a.W + x) * 3
    if (a.buf[i] !== b.buf[i] || a.buf[i + 1] !== b.buf[i + 1] || a.buf[i + 2] !== b.buf[i + 2]) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 }
}

// A W×H window centred on the box (or on the frame), kept inside it.
export function window(img, box, W, H) {
  const cx = box ? (box.x0 + box.x1) / 2 : img.W / 2, cy = box ? (box.y0 + box.y1) / 2 : img.H / 2
  return { x: Math.round(Math.max(0, Math.min(img.W - W, cx - W / 2))), y: Math.round(Math.max(0, Math.min(img.H - H, cy - H / 2))) }
}

function up2(img) {
  const out = canvas(img.W * 2, img.H * 2, "#000000")
  for (let y = 0; y < out.H; y++) for (let x = 0; x < out.W; x++) {
    const si = ((y >> 1) * img.W + (x >> 1)) * 3, di = (y * out.W + x) * 3
    out.buf[di] = img.buf[si]; out.buf[di + 1] = img.buf[si + 1]; out.buf[di + 2] = img.buf[si + 2]
  }
  return out
}

function blit(dst, src, ox, oy) {
  for (let y = 0; y < src.H; y++) {
    const si = y * src.W * 3, di = ((y + oy) * dst.W + ox) * 3
    dst.buf.set(src.buf.subarray(si, si + src.W * 3), di)
  }
}

function label(D, out, text, x, y) {
  out.ctx.setTransform(1, 0, 0, 1, 0, 0)
  out.ctx.fillStyle = "#e8e8f0"
  D.drawTransitionText(out.ctx, text.toUpperCase(), x, y, 2)
}

export function compose(a, b, opts, D) {
  const box = diffBox(a, b), cw = 200, ch = 124, gap = 8, strip = 18
  const w = window(a, box, cw, ch)
  const ca = up2(crop(a, w.x, w.y, cw, ch)), cb = up2(crop(b, w.x, w.y, cw, ch))
  const W = a.W * 2 + gap, H = strip + a.H + gap + strip + ca.H
  const out = canvas(W, H, "#101018")
  blit(out, a, 0, strip); blit(out, b, a.W + gap, strip)
  blit(out, ca, 0, strip * 2 + a.H + gap); blit(out, cb, a.W + gap, strip * 2 + a.H + gap)
  const what = `L${opts.level} S${opts.seed} T${opts.ticks}`
  label(D, out, `${opts.base} ${what}`, a.W / 2, 3)
  label(D, out, `${opts.ref} ${what}`, a.W + gap + a.W / 2, 3)
  label(D, out, box ? `2X AT ${w.x},${w.y}` : "2X - NO DIFFERENCE", a.W / 2, strip + a.H + gap + 3)
  label(D, out, box ? `2X AT ${w.x},${w.y}` : "2X - NO DIFFERENCE", a.W + gap + a.W / 2, strip + a.H + gap + 3)
  return { img: out, box }
}

async function main(argv) {
  const started = Date.now(), opts = parseArgs(argv)
  const dirs = [checkout(opts.base), checkout(opts.ref)]
  try {
    const left = render(dirs[0], opts), right = render(dirs[1], opts)
    const { img, box } = compose(left.img, right.img, opts, left.D)
    const out = outPath(opts)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    writePNG(out, img, 1)
    opts.out = out
    console.log(`${opts.out}  ${box ? `differs in ${box.x1 - box.x0 + 1}x${box.y1 - box.y0 + 1}px at ${box.x0},${box.y0}` : "identical"}  ${((Date.now() - started) / 1000).toFixed(1)} s`)
  } finally { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 2 })
