#!/usr/bin/env node
// Build the deploy-only copy. Source paths/stamps remain the panel/dev API.
// A conservative lexer removes indentation and comment-only lines only when
// it can classify the entire file. Uncertain input is shipped byte-for-byte,
// with a notice; node --check still rejects invalid JavaScript either way.
// Hashed names describe the bytes actually shipped, with exact immutable
// header rules. Bare compatibility paths retain their source and revalidate.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const SRC = path.join(HERE, "..", "public")
export const OUT = path.join(HERE, "..", "dist")
const OPERAND_WORDS = new Set("return throw case delete void typeof new in instanceof else do extends".split(" "))
const UNCERTAIN_WORDS = new Set("await yield of break continue debugger async".split(" "))
const CONTROL_WORDS = new Set("if while for with switch catch".split(" "))
const LINE_END = /\r\n|[\n\r\u2028\u2029]/g
class Uncertain extends Error {}
const uncertain = reason => { throw new Uncertain(reason) }
const isEnd = c => c === "\n" || c === "\r" || c === "\u2028" || c === "\u2029"

// Every physical line gets an entry, including escaped LF/CRLF continuations.
// No handler may skip a line terminator. The emitter asserts this alignment.
export function lineStarts(src) {
  const st = { mode: "code", quote: "", escaped: false, stack: [], operand: true, last: "", lineBreak: false, out: [true] }
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (isEnd(c)) {
      newline(st)
      if (c === "\r" && src[i + 1] === "\n") i++
      st.out.push(st.mode === "code")
    } else if (st.mode === "code") i = code(st, src, i)
    else i = inside(st, src, i)
  }
  if (!["code", "line"].includes(st.mode) || st.stack.length) uncertain("unterminated lexical state")
  if (st.out.length !== src.split(LINE_END).length) uncertain("line-state alignment mismatch")
  return st.out
}

function newline(st) {
  st.lineBreak = true
  if (st.mode === "line") st.mode = "code"
  else if (st.mode === "str" && !st.escaped) uncertain("unescaped string newline")
  else if (st.mode === "regex" || st.mode === "class") uncertain("newline in regular expression")
  st.escaped = false
}

function token(st, value, operand) { st.last = value; st.operand = operand; st.lineBreak = false }

function inside(st, src, i) {
  const c = src[i], n = src[i + 1]
  if (st.mode === "line") return i
  if (st.mode === "block") {
    if (c === "*" && n === "/") { st.mode = "code"; return i + 1 }
    return i
  }
  if (st.escaped) { st.escaped = false; return i }
  if (c === "\\") { st.escaped = true; return i }
  if (st.mode === "str") {
    if (c === st.quote) { st.mode = "code"; token(st, "literal", false) }
    return i
  }
  if (st.mode === "tpl") return template(st, c, n, i)
  return regularExpression(st, src, i)
}

function template(st, c, n, i) {
  if (c === "`") { st.mode = "code"; token(st, "literal", false) }
  else if (c === "$" && n === "{") {
    st.stack.push({ kind: "substitution" }); st.mode = "code"; token(st, "${", true)
    return i + 1
  }
  return i
}

function regularExpression(st, src, i) {
  const c = src[i]
  if (st.mode === "class") {
    // Nested sets require the v-flag grammar, which this lexer doesn't parse.
    if (c === "[") uncertain("nested regular-expression character class")
    if (c === "]") st.mode = "regex"
  } else if (c === "[") st.mode = "class"
  else if (c === "/") {
    const flags = /^[a-z]*/i.exec(src.slice(i + 1))[0]
    if (flags.includes("v")) uncertain("regular-expression v flag")
    st.mode = "code"; token(st, "literal", false)
    return i + flags.length
  }
  return i
}

function code(st, src, i) {
  const c = src[i], n = src[i + 1]
  if (/\s/.test(c)) return i
  if (src.startsWith("<!--", i) || src.startsWith("-->", i)) uncertain("legacy HTML comment")
  if (c === "/") return slash(st, n, i)
  if (c === "'" || c === '"') { st.mode = "str"; st.quote = c; return i }
  if (c === "`") { st.mode = "tpl"; return i }
  if (/[a-z_$]/i.test(c)) {
    const word = /^[\w$]+/.exec(src.slice(i))[0], property = st.last === "." || st.last === "?."
    if (!property && (word === "import" || word === "export")) uncertain("module syntax")
    const operand = property ? false : UNCERTAIN_WORDS.has(word) ? null : OPERAND_WORDS.has(word)
    token(st, property ? "property" : word, operand)
    return i + word.length - 1
  }
  if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(n || ""))) {
    const number = /^(?:0[xob][\da-f_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:e[+-]?[\d_]+)?n?)/i.exec(src.slice(i))
    if (!number) uncertain("unclassified numeric literal")
    token(st, "literal", false); return i + number[0].length - 1
  }
  return punctuation(st, src, i)
}

function slash(st, n, i) {
  if (n === "/" || n === "*") { st.mode = n === "/" ? "line" : "block"; return i + 1 }
  if (st.lineBreak && st.operand === false) uncertain("ambiguous / after a line break (ASI)")
  if (st.operand === null) uncertain("ambiguous / after " + st.last)
  if (st.operand) st.mode = "regex"
  else token(st, "/", true)
  return i
}

function punctuation(st, src, i) {
  const c = src[i], n = src[i + 1]
  if (c === "(" || c === "[" || c === "{") {
    st.stack.push({ kind: c, control: st.operand === null ? null : CONTROL_WORDS.has(st.last) })
    token(st, c, true)
  } else if (c === ")" || c === "]" || c === "}") close(st, c)
  else if ((c === "+" || c === "-") && n === c) {
    token(st, c + n, null); return i + 1
  } else if (c === "?" && n === ".") {
    token(st, "?.", false); return i + 1
  } else if (src.startsWith("...", i)) {
    token(st, "...", true); return i + 2
  } else if (c === ".") token(st, ".", false)
  else if (",;:=!?~+-*%<>&|^".includes(c)) token(st, c, true)
  else uncertain("unsupported code character " + JSON.stringify(c))
  return i
}

function close(st, c) {
  const open = st.stack.pop()
  if (c === "}" && open?.kind === "substitution") { st.mode = "tpl"; return }
  const expected = { ")": "(", "]": "[", "}": "{" }[c]
  if (open?.kind !== expected) uncertain("unmatched delimiter")
  // A } might close a block or an object. Don't guess the next slash's goal.
  token(st, c, c === "}" ? null : c === ")" ? open.control : false)
}

export function prepareScript(src) {
  try {
    const starts = lineStarts(src), lines = src.split(LINE_END), ends = src.match(LINE_END) || []
    if (starts.length !== lines.length) uncertain("line-state alignment mismatch")
    const text = lines.map((line, i) => {
      if (!starts[i]) return line + (ends[i] || "")
      const t = line.replace(/^[ \t]+/, "")
      // Keep terminators even for removed comments: ASI/restricted productions
      // and escaped continuations must see exactly the original line breaks.
      return (t === "" || /^\/\/(?!#)/.test(t) ? "" : t) + (ends[i] || "")
    }).join("")
    return { text, fallback: null }
  } catch (error) {
    if (!(error instanceof Uncertain)) throw error
    return { text: src, fallback: error.message }
  }
}

export function lean(src) { return prepareScript(src).text }

function shipScript(src, out, name) {
  const original = fs.readFileSync(path.join(src, "agents", name), "utf8")
  const { text, fallback } = prepareScript(original)
  const hash = crypto.createHash("sha256").update(text).digest("hex")
  const file = name.slice(0, -3) + "." + hash + ".js", to = path.join(out, "agents", file)
  fs.writeFileSync(to, text)
  execFileSync(process.execPath, ["--check", to], { stdio: "pipe" })
  return { name, file, before: Buffer.byteLength(original), after: Buffer.byteLength(text), fallback }
}

function shipReferences(out, scripts) {
  const index = path.join(out, "index.html"), names = new Map(scripts.map(s => [s.name, s.file]))
  const html = fs.readFileSync(index, "utf8").replace(/(<script\b[^>]*\bsrc=)(["'])(\/?agents\/[^"'?]+\.js)(?:\?[^"']*)?\2/g,
    (whole, prefix, quote, url) => {
      const file = names.get(url.split("/").pop())
      if (!file) throw new Error("ship: missing script " + url)
      return prefix + quote + url.slice(0, url.lastIndexOf("/") + 1) + file + quote
    })
  fs.writeFileSync(index, html)
  const headers = path.join(out, "_headers")
  const rules = scripts.map(s => `/agents/${s.file}\n  cache-control: public, max-age=31536000, immutable\n`).join("\n")
  fs.appendFileSync(headers, "\n# Generated by tools/ship.js: immutable only at these exact content hashes.\n" + rules)
}

export function build(src = SRC, out = OUT) {
  fs.rmSync(out, { recursive: true, force: true })
  fs.cpSync(src, out, { recursive: true })
  const sizes = fs.readdirSync(path.join(src, "agents")).filter(name => name.endsWith(".js"))
    .map(name => shipScript(src, out, name))
  shipReferences(out, sizes)
  return sizes
}

export function report(sizes, log = console.log) {
  const kb = n => (n / 1024).toFixed(1) + " KB"
  for (const s of sizes) log(`${s.name.padEnd(12)} ${kb(s.before).padStart(9)} -> ${kb(s.after).padStart(9)}` +
    (s.fallback ? ` (unchanged: ${s.fallback})` : ""))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) report(build())
