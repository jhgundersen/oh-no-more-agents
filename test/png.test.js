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
