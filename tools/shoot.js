#!/usr/bin/env node
//
// Render the game to PNGs without a browser. See tools/render.js for why.
//
//   node tools/shoot.js level 8              one level, as the page draws it
//   node tools/shoot.js level 8 --seed 3     pin the colony too
//   node tools/shoot.js crop 8               a close crop, for texture
//   node tools/shoot.js biomes               one of each biome, stacked
//   node tools/shoot.js themes 8             one level in every theme
//
// Options: --seed N, --ticks N, --theme NAME, --scale N, --labels, --out DIR.
//
// `--ticks` is how far the level is played before the frame is taken; the
// default puts the colony out on the board and some of it in trouble. Every
// command pins the colony seed unless told otherwise, so two runs of the same
// command produce the same image and a diff between them means a real change.
//
// Shots land in shots/ and are not committed.

import path from "node:path"
import { fileURLToPath } from "node:url"
import { load, frame, crop, stack, writePNG, THEMES } from "./render.js"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, "..")

const argv = process.argv.slice(2)
const cmd = argv[0] || "level"
const positional = argv.slice(1).filter(a => !a.startsWith("--"))

function opt(name, fallback) {
  const i = argv.indexOf("--" + name)
  if (i < 0) return fallback
  const v = argv[i + 1]
  return v === undefined || v.startsWith("--") ? true : v
}

const level = Number(positional[0] || 8)
const seed = opt("seed") === undefined ? undefined : Number(opt("seed"))
const ticks = Number(opt("ticks", 240))
const theme = String(opt("theme", "tokyo-night"))
const scale = Number(opt("scale", 2))
const labels = opt("labels", false) === true
const outDir = path.resolve(ROOT, String(opt("out", "shots")))

const S = load("Sim.js")
const D = load("Draw.js")
const P = load("Palette.js")

const shot = o => frame(S, D, P, { level, seed, ticks, theme, labels, ...o })

function report(r, note) {
  console.log(`  ${path.relative(ROOT, r.file)}  ${r.width}x${r.height}${note ? "  " + note : ""}`)
}

if (cmd === "level") {
  const { img, world } = shot()
  report(writePNG(path.join(outDir, `level-${level}.png`), img, scale), world.biome)

} else if (cmd === "crop") {
  const { img, world } = shot()
  // The middle-left of the board: corridors rather than sky or bedrock.
  const c = crop(img, Math.round(img.W * 0.05), Math.round(img.H * 0.20),
    Math.round(img.W * 0.42), Math.round(img.H * 0.42))
  report(writePNG(path.join(outDir, `crop-${level}.png`), c, scale * 2), world.biome)

} else if (cmd === "biomes") {
  // One level from each biome, in order, stacked into a contact sheet. The
  // biome is picked by level number, so level N shows biome (N-1) % BIOMES.length.
  const images = []
  const names = []
  for (let i = 0; i < S.BIOMES.length; i++) {
    const lv = i + 1
    const { img, world } = frame(S, D, P, { level: lv, seed, ticks, theme, labels })
    images.push(img)
    names.push(`${lv} ${world.biome}`)
  }
  report(writePNG(path.join(outDir, "biomes.png"), stack(images), scale), names.join(", "))

} else if (cmd === "themes") {
  const images = []
  for (const name of Object.keys(THEMES)) {
    images.push(frame(S, D, P, { level, seed, ticks, theme: name, labels }).img)
  }
  report(writePNG(path.join(outDir, `themes-${level}.png`), stack(images), scale),
    Object.keys(THEMES).join(", "))

} else {
  console.error(`unknown command: ${cmd}`)
  console.error("try: level | crop | biomes | themes")
  process.exit(1)
}
