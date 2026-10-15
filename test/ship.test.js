import test, { after } from "node:test"
import vm from "node:vm"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { lean, lineStarts, prepareScript, report, build, SRC } from "../tools/ship.js"
import { loadCoreFrom } from "../tools/load-core.js"
import { frame } from "../tools/render.js"

// tools/ship.js: what goes on the wire is the source minus comment lines and
// indentation, and it behaves byte for byte the same.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ship-"))
for (const name of ["Sim.js", "Draw.js", "Palette.js", "Outcome.js"])
  fs.writeFileSync(path.join(dir, name), lean(fs.readFileSync(path.join(SRC, "agents", name), "utf8")))
after(() => fs.rmSync(dir, { recursive: true, force: true }))
const AGENTS = path.join(SRC, "agents")
const shipped = name => loadCoreFrom(dir, name, path.join(AGENTS, name))
const source = name => loadCoreFrom(AGENTS, name)

// One frame with page Math.random pinned, as tools/compare.js does.
function picture(load, opts) {
  const S = load("Sim.js"), D = load("Draw.js"), P = load("Palette.js"), random = Math.random
  let x = 0.5
  Math.random = () => (x = (x * 9301 + 49297) % 233280 / 233280)
  try { return frame(S, D, P, { ...opts, res: 2, theme: "tokyo-night" }).img }
  finally { Math.random = random }
}

test("comment lines and indentation go; strings, templates and regexes stay as written", () => {
  const src = [
    "// a comment line",
    "    var a = 1   // trailing comments stay",
    "  var s = \"// not a comment\"",
    "var t = `line one",
    "  // inside a template: kept",
    "  ${a}`",
    "var r = /\\/\\/[\"'`]/g",
    "  /* a block",
    "  // still in it */",
    "var b = a / 2 // division, then a comment",
    ""
  ].join("\n")
  assert.deepEqual(lineStarts(src), [true, true, true, true, false, false, true, true, false, true, true])
  assert.equal(lean(src), [
    "",
    "var a = 1   // trailing comments stay",
    "var s = \"// not a comment\"",
    "var t = `line one",
    "  // inside a template: kept",
    "  ${a}`",
    "var r = /\\/\\/[\"'`]/g",
    "/* a block",
    "  // still in it */",
    "var b = a / 2 // division, then a comment",
    ""
  ].join("\n"))
})

test("every page script scans cleanly to the end and keeps the same exported names", () => {
  for (const name of fs.readdirSync(AGENTS).filter(n => n.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(AGENTS, name), "utf8")
    assert.equal(prepareScript(src).fallback, null, name)
    const names = s => [...s.matchAll(/^\s*function\s+(\w+)/gm)].map(m => m[1]).join(",")
    assert.equal(names(lean(src)), names(src), name)
  }
})

test("the shipped Sim plays out exactly like the source", () => {
  const A = source("Sim.js"), B = shipped("Sim.js")
  for (const level of [1, 6, 9, 14, 22, 39, 59, 88, 106, 145]) {
    const a = A.generate(level, 0, level * 7919), b = B.generate(level, 0, level * 7919)
    while (!a.done && a.ticks < 6000) A.step(a)
    while (!b.done && b.ticks < 6000) B.step(b)
    const digest = w => JSON.stringify([w.saved, w.lost, w.ticks, w.agents.map(g => [g.id, g.state, g.x, g.y])])
    assert.equal(digest(b), digest(a), "level " + level)
  }
})

test("the shipped Draw paints the same bytes in every biome", () => {
  const S = source("Sim.js"), seen = new Set(), levels = []
  for (let level = 1; level <= 60 && levels.length < 20; level++) {
    const biome = S.generate(level, 0, 1).biome
    if (!seen.has(biome)) { seen.add(biome); levels.push(level) }
  }
  assert.equal(levels.length, S.BIOMES.length, "one level per biome")
  const hash = img => crypto.createHash("sha1").update(img.data || img.buf || img.pixels).digest("hex")
  for (const level of levels) {
    const opts = { level, seed: 4242, ticks: 300 }
    assert.equal(hash(picture(shipped, opts)), hash(picture(source, opts)), "level " + level)
  }
})

test("build: hashed scripts, exact cache rules, unchanged source paths/stamps and complete assets", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "ship-out-"))
  const originalIndex = fs.readFileSync(path.join(SRC, "index.html"), "utf8")
  try {
    const sizes = build(SRC, out), html = fs.readFileSync(path.join(out, "index.html"), "utf8")
    const headers = fs.readFileSync(path.join(out, "_headers"), "utf8")
    const sim = sizes.find(s => s.name === "Sim.js")
    assert.ok(sim.after < sim.before * 0.7, "Sim.js loses its prose")
    assert.equal(fs.readFileSync(path.join(SRC, "index.html"), "utf8"), originalIndex)
    assert.equal(/<meta name="build"[^>]+>/.exec(html)[0], /<meta name="build"[^>]+>/.exec(originalIndex)[0])
    assert.equal([...html.matchAll(/<script src="agents\/[^" ]+"/g)].length, sizes.length)
    assert.doesNotMatch(html, /<script src="agents\/[^" ]+\?v=/)
    assert.doesNotMatch(headers, /^\/agents\/\*\.js/m, "bare files inherit must-revalidate")
    for (const s of sizes) {
      const source = fs.readFileSync(path.join(AGENTS, s.name), "utf8")
      const bytes = fs.readFileSync(path.join(out, "agents", s.file))
      const hash = crypto.createHash("sha256").update(bytes).digest("hex")
      assert.equal(s.file, s.name.slice(0, -3) + "." + hash + ".js")
      assert.ok(html.includes('src="agents/' + s.file + '"'), s.name)
      assert.ok(headers.includes("/agents/" + s.file + "\n  cache-control: public, max-age=31536000, immutable"))
      assert.equal(bytes.toString(), lean(source))
      assert.equal(fs.readFileSync(path.join(out, "agents", s.name), "utf8"), source, "bare compatibility source")
    }
    assert.ok(fs.existsSync(path.join(out, "share-1.png")), "non-script assets copied")
  } finally { fs.rmSync(out, { recursive: true, force: true }) }
})

// Value comparisons catch syntactically valid corruption that node --check
// cannot catch. These are the review's reproductions, not scanner snapshots.
const fixtures = [
  ["regex in a template substitution", [
    "globalThis.result = `${/[}`]/.source}", "  // keep me", "  * tail`;", "const other = /`/;"
  ].join("\n")],
  ["regex after a control condition", 'if (true) /["\'`]/.test("x"); globalThis.result=7;'],
  ["regex after a widely spaced return", 'function f() { return       /["\'`]/.source; } globalThis.result=f();'],
  ["URL, block comments and escaped regex", [
    'const url = "https://example.test//a";', '/* block', ' * retained */',
    'const r = /https?:\\/\\/["\'`]/;', 'globalThis.result = [url, r.source];'
  ].join("\n")],
  ["nested templates", 'globalThis.result = `outer ${`inner ${2 + 3}`}\n // kept\n * kept`;'],
  ["division and nested object in substitution", 'globalThis.result = `ratio ${({a: 12}).a / 3}\n  // kept`;'],
  ["tagged raw template", 'globalThis.result = String.raw`alpha\\\n  // beta\n  * omega`;'],
  ["regex after else/do and comment-separated keyword", 'if (false) {} else /["\'`]/.test("x"); do /["\'`]/.test("x"); while(false); function f(){return /* why */ /["\'`]/.source} globalThis.result=f();'],
  ["regex operand after spread", 'globalThis.result = [.../[}`]/.source].join("") + `line\n  // kept`;'],
  ["regex operand after extends", 'try { class X extends /[}`]/ {} } catch(e) { globalThis.result = e.name + `line\n  // kept`; }'],
  ["property names that are keywords", 'globalThis.result = ({return: 12}).return / 3;'],
  ["escaped slash/bracket in character class", 'globalThis.result = `${/[\\]}/`]/.source}\n  // kept`;']
]
for (const end of ["\n", "\r\n", "\r", "\u2028", "\u2029"]) {
  fixtures.push(["quoted continuation " + JSON.stringify(end), 'globalThis.result = "alpha\\' + end + '  * beta";'])
  fixtures.push(["template continuation " + JSON.stringify(end), 'globalThis.result = `alpha\\' + end + '  // beta' + end + '   omega`;'])
}
const value = src => {
  const context = vm.createContext({})
  new vm.Script(src).runInContext(context, { timeout: 1000 })
  return JSON.stringify(context.result)
}
for (const [name, src] of fixtures) test("value equivalence: " + name, () => {
  const result = prepareScript(src)
  assert.equal(result.fallback, null)
  assert.equal(value(result.text), value(src))
  assert.equal(lineStarts(src).length, src.split(/\r\n|[\n\r\u2028\u2029]/).length)
})

const uncertainFixtures = [
  ['let a\n/[}`]/.test("x"); globalThis.result = `kept\n  // tail`;', "line break (ASI)"],
  ['var a /* comment\n */ /[}`]/.test("x"); globalThis.result=7;', "line break (ASI)"],
  ['let a=2; globalThis.result = a++ / 2;', "ambiguous /"],
  ['globalThis.result = {} / 2;', "ambiguous /"],
  ['let of=12; globalThis.result=of / 2;', "ambiguous /"],
  ['let café=7; globalThis.result=café;', "unsupported code character"],
  ['globalThis.result=/[[a]--[b]]/v.source;', "nested regular-expression"],
  ['globalThis.result=/[a]/v.source;', "v flag"],
  ['<!-- legacy " comment\nglobalThis.result=7;', "legacy HTML comment"],
  ['class Box { #n=7; get(){return this.#n} } globalThis.result=new Box().get();', "unsupported code character"]
]
for (const [src, reason] of uncertainFixtures) test("uncertain syntax ships unchanged: " + reason + " " + src.slice(0, 25), () => {
  const result = prepareScript(src)
  assert.ok(result.fallback.includes(reason), result.fallback)
  assert.equal(result.text, src)
  assert.equal(value(result.text), value(src))
})

function fixtureTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ship-fixture-")), src = path.join(root, "src"), out = path.join(root, "out")
  fs.mkdirSync(path.join(src, "agents"), { recursive: true })
  fs.writeFileSync(path.join(src, "index.html"), '<meta name="build" content="unchanged"><script src="agents/demo.js?v=1234"></script>')
  fs.writeFileSync(path.join(src, "_headers"), fs.readFileSync(path.join(SRC, "_headers")))
  return { root, src, out, js: path.join(src, "agents", "demo.js") }
}

test("build: uncertain originals are syntax checked, hashed exactly, and reported in output", () => {
  const f = fixtureTree()
  try {
    const src = uncertainFixtures[0][0]
    fs.writeFileSync(f.js, src)
    const sizes = build(f.src, f.out), lines = []
    report(sizes, line => lines.push(line))
    assert.match(lines.join("\n"), /demo\.js.*unchanged: ambiguous \//)
    assert.equal(fs.readFileSync(path.join(f.out, "agents", sizes[0].file), "utf8"), src)
    assert.equal(sizes[0].after, Buffer.byteLength(src))
    fs.writeFileSync(f.js, 'const café = "unterminated;')
    assert.throws(() => build(f.src, f.out), /Command failed/)
  } finally { fs.rmSync(f.root, { recursive: true, force: true }) }
})

test("build: content changes get new names, old versions cannot be served at the new URL", () => {
  const f = fixtureTree()
  try {
    fs.writeFileSync(f.js, '// prose\n globalThis.result = "A";\n')
    const a = build(f.src, f.out)[0], aIndex = fs.readFileSync(path.join(f.out, "index.html"), "utf8")
    assert.equal(build(f.src, f.out)[0].file, a.file, "repeat builds are stable")
    fs.writeFileSync(f.js, '// prose\n globalThis.result = "B";\n')
    const b = build(f.src, f.out)[0]
    assert.notEqual(b.file, a.file)
    assert.ok(aIndex.includes(a.file))
    assert.ok(fs.readFileSync(path.join(f.out, "index.html"), "utf8").includes(b.file))
    assert.equal(value(fs.readFileSync(path.join(f.out, "agents", b.file), "utf8")), '"B"')
    assert.ok(!fs.existsSync(path.join(f.out, "agents", a.file)), "no stale output survives")
    fs.writeFileSync(path.join(f.src, "index.html"), '<script src="agents/missing.js"></script>')
    assert.throws(() => build(f.src, f.out), /missing script/)
  } finally { fs.rmSync(f.root, { recursive: true, force: true }) }
})

test("module grammar is deliberately left unchanged rather than guessed", () => {
  const src = 'import "x"\n/[}`]/.test("x");\n  // comment\n'
  assert.deepEqual(prepareScript(src), { text: src, fallback: "module syntax" })
})
