#!/usr/bin/env node
// What gets deployed: public/ copied to dist/, with the page's scripts
// shipped lean. The source stays as written — commented, indented, the same
// files the Omarchy panel loads — and the copy on the wire drops only what
// the browser throws away anyway: lines that are nothing but a // comment, and
// leading indentation. Nothing is renamed, reordered or rewritten, so the
// shipped code is the source code, line for line minus the prose.
//
// Lines inside a string or template literal are left exactly as they are; a
// small scanner tracks quotes, template literals (with ${} nesting), block
// comments and regex literals to know where those are. Every shipped file is
// then checked with node --check; test/ship.test.js checks that the shipped
// Sim plays out identically and the shipped Draw paints identical bytes.
//
//   node tools/ship.js            build dist/ and print the sizes
//   (npm run deploy runs it first; wrangler serves ./dist)

import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const SRC = path.join(HERE, "..", "public")
export const OUT = path.join(HERE, "..", "dist")

// Characters after which a / starts a regex literal rather than a division.
const REGEX_AFTER = new Set("(,=:[!&|?{};+-*%<>~^".split(""))
const REGEX_WORDS = /(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|new|delete|void|throw|instanceof)$/

// For each line, whether it starts in plain code (not inside a string,
// template literal or block comment).
export function lineStarts(src) {
  const out = [true]
  const st = { mode: "code", quote: "", stack: [] }  // stack: "`" a template, "{" a ${ } in one
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === "\n") { if (st.mode === "line") st.mode = "code"; out.push(st.mode === "code"); continue }
    i += st.mode === "code" ? inCode(st, src, i) : (INSIDE[st.mode] || none)(st, c, src[i + 1])
  }
  if (st.mode !== "code" && st.mode !== "line") throw new Error("ship: ended inside a " + st.mode)
  return out
}

const none = () => 0

// One character inside something; the return is how many extra to skip.
const INSIDE = {
  block: (st, c, n) => { if (c === "*" && n === "/") { st.mode = "code"; return 1 } return 0 },
  str: (st, c) => { if (c === "\\") return 1; if (c === st.quote) st.mode = "code"; return 0 },
  regex: (st, c) => { if (c === "\\") return 1; if (c === "[") st.mode = "class"; else if (c === "/") st.mode = "code"; return 0 },
  class: (st, c) => { if (c === "\\") return 1; if (c === "]") st.mode = "regex"; return 0 },
  tpl: (st, c, n) => {
    if (c === "\\") return 1
    if (c === "`") { st.stack.pop(); st.mode = "code" }
    else if (c === "$" && n === "{") { st.stack.push("{"); st.mode = "code"; return 1 }
    return 0
  }
}

function inCode(st, src, i) {
  const c = src[i], n = src[i + 1]
  if (c === "/" && n === "/") { st.mode = "line"; return 1 }
  if (c === "/" && n === "*") { st.mode = "block"; return 1 }
  if (c === "'" || c === '"') { st.mode = "str"; st.quote = c; return 0 }
  if (c === "`") { st.stack.push("`"); st.mode = "tpl"; return 0 }
  if (st.stack.length) braces(st, c)
  else if (c === "/" && regexStarts(src, i)) st.mode = "regex"
  return 0
}

// Braces inside a ${ }: the one that closes it goes back into the template.
function braces(st, c) {
  if (c === "{") st.stack.push("{")
  else if (c === "}" && st.stack[st.stack.length - 1] === "{") {
    st.stack.pop()
    if (st.stack[st.stack.length - 1] === "`") st.mode = "tpl"
  }
}

function regexStarts(src, i) {
  const before = src.slice(Math.max(0, i - 12), i).replace(/\s+$/, "")
  const prev = before[before.length - 1] || ""
  return !prev || REGEX_AFTER.has(prev) || REGEX_WORDS.test(before)
}

export function lean(src) {
  const starts = lineStarts(src), lines = src.split("\n"), out = []
  for (let i = 0; i < lines.length; i++) {
    if (!starts[i]) { out.push(lines[i]); continue }
    const t = lines[i].replace(/^[ \t]+/, "")
    if (t === "" || /^\/\/(?!#)/.test(t)) continue
    out.push(t)
  }
  return out.join("\n") + "\n"
}

export function build(src = SRC, out = OUT) {
  fs.rmSync(out, { recursive: true, force: true })
  fs.cpSync(src, out, { recursive: true })
  const sizes = []
  for (const name of fs.readdirSync(path.join(src, "agents"))) {
    if (!name.endsWith(".js")) continue
    const from = path.join(src, "agents", name), to = path.join(out, "agents", name)
    const text = lean(fs.readFileSync(from, "utf8"))
    fs.writeFileSync(to, text)
    execFileSync(process.execPath, ["--check", to])
    sizes.push({ name, before: fs.statSync(from).size, after: text.length })
  }
  return sizes
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sizes = build()
  const kb = n => (n / 1024).toFixed(1) + " KB"
  for (const s of sizes) console.log(`${s.name.padEnd(12)} ${kb(s.before).padStart(9)} -> ${kb(s.after).padStart(9)}`)
}
