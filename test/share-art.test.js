import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import zlib from "node:zlib"
import { createHash } from "node:crypto"
import { shareCard, shareWorld, favicon, build, assetFiles, FILES } from "../tools/share-art.js"
import { canvas, writePNG } from "../tools/render.js"
const digest = data => createHash("sha256").update(data).digest("hex")
const root = new URL("../public/", import.meta.url)
function pixels(png) {
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), chunks = []
  assert.equal(png[24], 8); assert.equal(png[25], 2)
  for (let p = 8; p < png.length;) {
    const length = png.readUInt32BE(p), type = png.toString("ascii", p + 4, p + 8)
    if (type === "IDAT") chunks.push(png.subarray(p + 8, p + 8 + length))
    p += length + 12
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks)), stride = width * 3, buf = Buffer.alloc(stride * height)
  assert.equal(raw.length, (stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    assert.ok([0, 1, 2].includes(filter))
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, prev = filter === 1 && x >= 3 ? buf[i - 3] : filter === 2 && y ? buf[i - stride] : 0
      buf[i] = (raw[y * (stride + 1) + 1 + x] + prev) & 255
    }
  }
  return { width, height, buf }
}
test("lossless PNG optimisation preserves every RGB byte, scale and default screenshot output", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "share-png-"))
  try {
    const img = canvas(41, 29, "#192230")
    img.ctx.fillStyle = "#ffd23f"; img.ctx.fillRect(3, 5, 19, 13)
    img.ctx.fillStyle = "#f0c8a0"; img.ctx.fillRect(13, 4, 5, 19)
    for (const scale of [1, 2]) {
      writePNG(path.join(dir, "plain.png"), img, scale)
      writePNG(path.join(dir, "opt.png"), img, scale, { optimise: true })
      const plain = pixels(fs.readFileSync(path.join(dir, "plain.png"))), opt = pixels(fs.readFileSync(path.join(dir, "opt.png")))
      assert.equal(opt.width, 41 * scale); assert.equal(opt.height, 29 * scale)
      assert.equal(digest(opt.buf), digest(plain.buf))
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
test("share composition is deterministic and puts real sprites on supported roofs or under open umbrellas", () => {
  const random = Math.random; Math.random = () => 0.01
  try {
    const w = shareWorld(), a = shareCard(); Math.random = () => 0.99; const b = shareCard()
    assert.equal(w.biome, "Rooftops"); assert.equal(w.mirages.length, 1)
    assert.ok(w.agents.filter(a => a.floater).length >= 3)
    for (const ag of w.agents.filter(a => a.state === "walk")) {
      assert.notEqual(w.terrain[(ag.y + 1) * 100 + Math.floor(ag.x)], w.k.EMPTY)
      for (let y = ag.y - 2; y <= ag.y; y++) assert.equal(w.terrain[y * 100 + Math.floor(ag.x)], w.k.EMPTY)
    }
    assert.equal(a.W, 1200); assert.equal(a.H, 630); assert.equal(digest(a.buf), digest(b.buf))
    for (const size of [16, 32, 180]) { const i = favicon(size); assert.equal(i.W, size); assert.equal(i.H, size) }
    assert.throws(() => favicon(17), /size/)
  } finally { Math.random = random }
})
test("numbered share art is reproducible, compact and refuses to overwrite any existing asset", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "share-art-"))
  try {
    const files = build(dir), sizes = [[1200, 630], [16, 16], [32, 32], [180, 180]]
    for (const [i, f] of files.entries()) {
      const b = fs.readFileSync(f.file), decoded = pixels(b), committed = fs.readFileSync(new URL(FILES[i], root))
      assert.equal(decoded.width, sizes[i][0]); assert.equal(decoded.height, sizes[i][1])
      assert.equal(digest(b), digest(committed), FILES[i]); assert.ok(b.length < (i ? 2000 : 100000))
    }
    assert.ok(files.slice(1).reduce((n, f) => n + f.bytes, 0) < 2000)
    assert.throws(() => build(dir), /Refusing to overwrite/)
    assert.equal(assetFiles(2)[0], "share-2.png")
    for (const n of [0, -1, 1.5, 10000, NaN]) assert.throws(() => assetFiles(n), /number/)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
test("social and manifest-free icon links point to the matching immutable numbered PNGs", () => {
  const html = fs.readFileSync(new URL("index.html", root), "utf8"), headers = fs.readFileSync(new URL("_headers", root), "utf8")
  const meta = new Map([...html.matchAll(/<meta (?:property|name)="([^"]+)" content="([^"]*)">/g)].map(m => [m[1], m[2]]))
  assert.equal(meta.get("og:title"), "Oh No! More Agents"); assert.equal(meta.get("twitter:title"), meta.get("og:title"))
  assert.equal(meta.get("twitter:description"), meta.get("og:description")); assert.match(meta.get("og:description"), /umbrella/)
  assert.equal(meta.get("twitter:card"), "summary_large_image"); assert.equal(meta.get("og:type"), "website")
  assert.equal(meta.get("og:url"), "https://oh-no-more-agents.com/")
  assert.equal(meta.get("og:image"), "https://oh-no-more-agents.com/share-1.png")
  assert.equal(meta.get("twitter:image"), meta.get("og:image")); assert.equal(meta.get("twitter:image:alt"), meta.get("og:image:alt"))
  assert.equal(meta.get("og:image:width"), "1200"); assert.equal(meta.get("og:image:height"), "630")
  for (const [i, size] of [[1, 16], [2, 32], [3, 180]]) {
    assert.ok(html.includes(`sizes="${size}x${size}" href="/${FILES[i]}"`))
    assert.ok(headers.includes((i === 3 ? "/apple-touch-icon-*.png" : "/favicon-*.png") + "\n  cache-control: public, max-age=31536000, immutable"))
  }
  assert.ok(headers.includes("/share-*.png\n  cache-control: public, max-age=31536000, immutable"))
  assert.doesNotMatch(html, /rel="manifest"|<img[^>]+share-1\.png/)
})
