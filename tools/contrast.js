// Contrast of the page's own text (not the canvas) against what is actually
// behind it, for tests and audits: run CONTRAST in the page and it returns one
// row per visible element with text of its own — selector, sample, ratio.
// WCAG asks 4.5:1 for body text. Opacity on an element counts; opacity set on
// an ancestor does not (the page has none on text).
export const PROBE = `(() => {
  const parse = s => { let m = s.match(/rgba?\\(([^)]+)\\)/); if (m) { const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1] }
    m = s.match(/color\\(srgb ([^)]+)\\)/); if (m) { const p = m[1].split(/[ \\/]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1] } return null }
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]) }
  const bgOf = el => { const stack = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { stack.push(c); if (c[3] >= 1) break } }
    let out = parse(getComputedStyle(document.body).backgroundColor); for (let i = stack.length - 1; i >= 0; i--) { const c = stack[i]; out = [0,1,2].map(k => c[k] * c[3] + out[k] * (1 - c[3])) } return out }
  const rows = []
  for (const el of document.querySelectorAll("body *")) {
    if (!el.offsetParent || ["CANVAS","SCRIPT","STYLE","AUDIO"].includes(el.tagName)) continue
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()); if (!own) continue
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || +cs.opacity === 0) continue
    let fg = parse(cs.color); if (!fg) continue; const bg = bgOf(el); fg = [0,1,2].map(k => fg[k] * fg[3] + bg[k] * (1 - fg[3]))
    const a = lum(fg), c = lum(bg), ratio = (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05)
    rows.push({ sel: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""), text: el.textContent.trim().slice(0, 18), ratio: Math.round(ratio * 100) / 100, px: parseFloat(cs.fontSize), op: +cs.opacity })
  }
  return rows
})()`

export const CONTRAST = PROBE
