import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { canvas, writePNG } from "../tools/render.js"

// tools/render.js writes PNGs by hand. Every chunk carries a CRC; get it wrong
// and image viewers refuse the file. The IEND chunk's CRC is fixed by the spec.
test("writePNG writes a valid PNG: signature, IHDR size, chunk CRCs", () => {
  const img = canvas(3, 2, "#336699")
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "png-")), "t.png")
  writePNG(file, img, 2)
  const b = fs.readFileSync(file)
  assert.deepEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  assert.equal(b.toString("ascii", 12, 16), "IHDR")
  assert.equal(b.readUInt32BE(16), 6)          // width, scaled
  assert.equal(b.readUInt32BE(20), 4)          // height, scaled
  const end = b.length - 12
  assert.equal(b.toString("ascii", end + 4, end + 8), "IEND")
  assert.equal(b.readUInt32BE(end + 8), 0xAE426082)
})

// Independent pixel-centre containment checks protect the shot fast path's
// edges, clipping, alpha, negative sizes and the fractional/rotated fallback.
test("scaled rectangles preserve pixel-centre coverage and blending", () => {
  const transforms = [
    [2, 0, 0, 2, 0, 0], [2, 0, 0, 2, 3, -2], [1, 0, 0, 1, 4, 3],
    [2, 0, 0, 2, 0.5, 1.5], [-2, 0, 0, 2, 20, 0],
    [2, 0.5, 0, 2, 0, 0], [0, 2, -2, 0, 20, 0],
    [Math.SQRT1_2, Math.SQRT1_2, -Math.SQRT1_2, Math.SQRT1_2, 10, 5]
  ]
  for (const m of transforms) for (const rect of [[1, 2, 4, 3], [0.5, 1.5, 3.5, 2.5],
    [-2, -1, 7, 5], [3, 3, -2, -2], [0.2, 0.3, 4.1, 2.7]]) {
    const img = canvas(32, 24, "#000000")
    img.ctx.setTransform(...m); img.ctx.fillStyle = "#ff0000"; img.ctx.globalAlpha = 0.5
    img.ctx.fillRect(...rect)
    let [x, y, w, h] = rect
    if (w < 0) { x += w; w = -w }
    if (h < 0) { y += h; h = -h }
    const det = m[0] * m[3] - m[1] * m[2]
    for (let py = 0; py < 24; py++) for (let px = 0; px < 32; px++) {
      const dx = px + 0.5 - m[4], dy = py + 0.5 - m[5]
      const sx = (m[3] * dx - m[2] * dy) / det
      const sy = (m[0] * dy - m[1] * dx) / det
      const hit = sx >= x && sx < x + w && sy >= y && sy < y + h
      const i = (py * 32 + px) * 3
      assert.equal(img.buf[i], hit ? 127 : 0, `edge ${m} ${rect} at ${px},${py}`)
      assert.equal(img.buf[i + 1], 0); assert.equal(img.buf[i + 2], 0)
    }
  }
})
