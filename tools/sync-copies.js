#!/usr/bin/env node
//
// Push the three core simulation files from this repo, which is the source of
// truth, out to the sibling copies that also run them.
//
//   node tools/sync-copies.js          copy out, after checking
//   node tools/sync-copies.js --check  report drift and change nothing
//   node tools/sync-copies.js --force  copy out even if the screen is locked
//
// Sim.js, Draw.js and Palette.js are meant to be byte-identical everywhere.
// web.js is NOT synced: each copy has its own host integration (this one
// reports to the rescue counter, the plugin has Panel.qml instead), and that is
// the seam where they are allowed to differ.

import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(HERE, "..", "public", "agents")
const CORE = ["Sim.js", "Draw.js", "Palette.js"]

// Each destination is optional: whoever runs this may not have all of them
// checked out, and a missing sibling is not an error.
const DESTS = [
  { name: "omarchy plugin", dir: path.join(os.homedir(), ".config/omarchy/plugins/jhgundersen.oh-no-more-agents"), plugin: true },
  { name: "jonh.no site", dir: path.join(os.homedir(), "jonh.no/jonh.no/agents"), plugin: false }
]

const mode = process.argv[2] || ""
const present = DESTS.filter(d => fs.existsSync(d.dir))
if (!present.length) {
  console.log("sync-copies: no sibling copies on this machine, nothing to do")
  process.exit(0)
}

if (mode === "--check") {
  let drift = 0
  for (const d of present)
    for (const f of CORE) {
      const to = path.join(d.dir, f)
      if (!fs.existsSync(to) || fs.readFileSync(to, "utf8") !== fs.readFileSync(path.join(SRC, f), "utf8")) {
        console.error(`sync-copies: ${f} differs in the ${d.name} copy`)
        drift++
      }
    }
  if (!drift) console.log(`sync-copies: all ${present.length} sibling copies match`)
  process.exit(drift ? 1 : 0)
}

// The one guard that protects something other than the code.
//
// The Omarchy lock screen is not a separate program: it is a quickshell plugin,
// so quickshell IS the lockscreen app. Writing a file into the plugin directory
// makes the shell hot-reload local plugins, and a hot-reload while a session
// lock is held destroys the lock surface — Hyprland then reports that the
// lockscreen app died and the machine is unusable until somebody runs
//
//   hyprctl eval 'hl.clear_crashed_lockscreen()'
//
// from another tty. That has happened, from exactly this kind of copy, and the
// journal showed the reload and the lock coming apart in the same second.
function screenIsLocked() {
  try {
    return execFileSync("omarchy", ["shell", "lock", "isLocked"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === "true"
  } catch (e) {
    return false   // no omarchy here, so no lock screen to strand
  }
}

const toPlugin = present.some(d => d.plugin)
if (toPlugin && mode !== "--force" && screenIsLocked()) {
  console.error("sync-copies: the screen is locked — not touching the plugin directory.")
  console.error("             quickshell is the lock screen here, and writing to a plugin")
  console.error("             hot-reloads it, which kills the lock and strands the session.")
  console.error("             unlock first, or pass --force if you know the screen is free.")
  process.exit(1)
}

for (const d of present) {
  for (const f of CORE) fs.copyFileSync(path.join(SRC, f), path.join(d.dir, f))
  console.log(`  ${CORE.join(", ")} -> ${d.name}`)
}

if (toPlugin) {
  console.log("")
  console.log("The plugin will not pick these up from a hot reload — .pragma-free")
  console.log("JS still needs 'omarchy restart shell', and never while locked.")
}
