#!/usr/bin/env node
//
// Refuse a core file that reaches into another core file.
//
// Sim.js, Draw.js and Palette.js carry no imports, deliberately: that is what
// lets the identical files run both in a browser and inside the Omarchy
// plugin's QML engine. It also means they cannot call each other. In a browser
// all three land in one global scope, so a call across files resolves and looks
// perfectly fine; in QML each .js is its own scope, and the same call throws a
// ReferenceError at runtime.
//
// Draw.js calling Sim.js's specialSpec() did exactly this. The web version was
// flawless and the bar plugin drew no agents at all on any level that had a
// special, because the exception came out of drawActors before the loop that
// draws them. Nothing warned about it anywhere, which is why this runs as part
// of `npm run check`.
//
// Anything one file needs from another travels on the world object instead —
// see `w.k` for the geometry constants and `w.specialSpec` for that case.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AGENTS = path.join(HERE, "..", "public", "agents")
const CORE = ["Sim.js", "Draw.js", "Palette.js", "Outcome.js"]

// Remove comments and string bodies so they cannot look like code.
function strip(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/"[^"\n]*"/g, '""')
    .replace(/'[^'\n]*'/g, "''")
}

const defines = {}, uses = {}, twice = []

for (const name of CORE) {
  const text = strip(fs.readFileSync(path.join(AGENTS, name), "utf8"))
  const top = [...text.matchAll(/^(?:function|var)\s+([A-Za-z_]\w*)/gm)].map(m => m[1])
  defines[name] = new Set(top)
  // And twice in the same file: the later one silently wins. A new
  // DUCK_REACH = 4 for the rubber duck was overwritten by the Debug hero's
  // DUCK_REACH = 18 three thousand lines further down, and nothing said so.
  const counts = {}
  for (const d of top) counts[d] = (counts[d] || 0) + 1
  for (const d in counts) if (counts[d] > 1) twice.push(`  ${d} is declared ${counts[d]} times in ${name}`)
  const local = new Set([...text.matchAll(/\b(?:var|function)\s+([A-Za-z_]\w*)/g)].map(m => m[1]))

  // The lookbehind matters: `k.CELL` and `ctx.fillRect(` are property accesses
  // on something that was passed in, not references to another file's globals.
  // Without it every constant Draw.js reads off `w.k` reports as a reach.
  const called = [...text.matchAll(/(?<![.\w])([A-Za-z_]\w*)\s*\(/g)].map(m => m[1])
  const shouted = [...text.matchAll(/(?<![.\w])([A-Z][A-Z0-9_]{2,})\b/g)].map(m => m[1])
  uses[name] = new Set([...called, ...shouted].filter(n => !local.has(n)))
}

const problems = []
for (const name of CORE)
  for (const other of CORE) {
    if (other === name) continue
    for (const ref of [...uses[name]].filter(r => defines[other].has(r)).sort())
      problems.push(`  ${name} uses ${ref}, which only ${other} defines`)
  }

// The same name declared twice is the mirror-image failure: in a browser the
// three files share one scope, so one definition silently overwrites the other.
const seen = {}, dupes = []
for (const name of CORE)
  for (const d of defines[name]) {
    if (seen[d] && seen[d] !== name) dupes.push(`  ${d} is declared in both ${seen[d]} and ${name}`)
    seen[d] = name
  }

if (problems.length || dupes.length || twice.length) {
  if (twice.length) {
    console.error("check-core-refs: a name is declared more than once in the same file:")
    console.error(twice.join("\n"))
    console.error("                 the last declaration silently replaces the others.")
  }
  if (problems.length) {
    console.error("check-core-refs: a core file reaches into another:")
    console.error(problems.join("\n"))
    console.error("                 that resolves in a browser and throws in QML.")
    console.error("                 pass it on the world object instead (see w.k).")
  }
  if (dupes.length) {
    console.error("check-core-refs: a name is declared in more than one core file:")
    console.error(dupes.join("\n"))
    console.error("                 they share one global scope in the browser.")
  }
  process.exit(1)
}
console.log("check-core-refs: core files are self-contained")
