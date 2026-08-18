#!/usr/bin/env node
//
// Put a content hash on every script URL in public/index.html.
//
//   node tools/stamp-assets.js          rewrite the stamps
//   node tools/stamp-assets.js --check  report stale stamps and change nothing
//
// Workers Assets serves everything as `max-age=0, must-revalidate`, so nothing
// ever went stale — but nothing was ever cached either: four conditional
// requests for 300 kB of JS on every single load, plus the soundtrack.
//
// `agents/Sim.js?v=1a2b3c4d` fixes that from the other end. The URL changes
// whenever the bytes change, so public/_headers can promise the browser the
// answer is immutable and it stops asking. The stamps live in the committed
// HTML rather than in a build step, because this game is meant to stay
// dependency-free and runnable straight off the filesystem: a file:// open with
// a stale ?v= still loads the file next to it.
//
// The hash is of the file on disk, so `npm run check` fails if you edit a core
// file and forget to re-stamp.

import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.join(HERE, "..", "public")
const PAGE = path.join(PUBLIC, "index.html")

// Matches src="agents/web.js" and src="agents/web.js?v=deadbeef" alike, so
// re-stamping is idempotent and a hand-written URL gets adopted on first run.
const SCRIPT = /<script src="([^"?]+\.js)(?:\?v=[0-9a-f]+)?"/g

function hashOf(file) {
  const bytes = fs.readFileSync(path.join(PUBLIC, file))
  return crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 8)
}

const html = fs.readFileSync(PAGE, "utf8")
const seen = []
const stamped = html.replace(SCRIPT, (all, file) => {
  const v = hashOf(file)
  seen.push({ file, v, was: /\?v=([0-9a-f]+)/.exec(all)?.[1] || null })
  return `<script src="${file}?v=${v}"`
})

if (!seen.length) {
  console.error("stamp-assets: no <script src> tags in index.html — has the page changed shape?")
  process.exit(1)
}

const stale = seen.filter(s => s.was !== s.v)

if (process.argv.includes("--check")) {
  if (stale.length) {
    console.error("stamp-assets: index.html carries stale cache-busting stamps:")
    for (const s of stale) console.error(`  ${s.file} is ?v=${s.was || "unstamped"}, should be ?v=${s.v}`)
    console.error("                 run `npm run stamp` and commit the page with the code.")
    process.exit(1)
  }
  console.log(`stamp-assets: all ${seen.length} script stamps match the files on disk`)
  process.exit(0)
}

if (stale.length) fs.writeFileSync(PAGE, stamped)
for (const s of seen) console.log(`  ${s.file}?v=${s.v}${s.was === s.v ? "" : "   (updated)"}`)
