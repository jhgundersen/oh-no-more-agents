// Load one of the core game files the way a browser does — as a plain script,
// with its top-level declarations handed back — so nothing in the game files
// has to change to be run from Node.
//
// It goes through `vm` with the real path as the script's file name rather than
// through `new Function`, because coverage is attributed by file name: an
// anonymous function body is invisible to `npm run coverage`, and so to the
// CRAP report built on it (`npm run crap`). The wrapper is kept on the first
// line so line numbers in stack traces and coverage match the file.

import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const AGENTS = path.join(HERE, "..", "public", "agents")

export function loadCore(name) {
  const file = path.join(AGENTS, name)
  const src = fs.readFileSync(file, "utf8")
  const fns = [...src.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)].map(m => m[1])
  const consts = [...src.matchAll(/^var\s+([A-Z][A-Z0-9_]*)\s*=/gm)].map(m => m[1])
  // And the later names in `var A = 1, B = 2` — they were silently missing,
  // and a test reading one got undefined (OUTAGE_RESOLVED, STANDUP_TURN).
  for (const line of src.match(/^var [^\n]*/gm) || [])
    for (const m of line.matchAll(/,\s*([A-Z][A-Z0-9_]*)\s*=(?!=)/g)) consts.push(m[1])
  const names = [...new Set([...fns, ...consts])]
  const wrapped = "(function(){" + src + "\nreturn {" + names.join(",") + "}})"
  return vm.runInThisContext(wrapped, { filename: file })()
}
