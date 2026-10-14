// "Share this run": a link that opens a level with the same colony, so a
// friend watches the same fifteen meet the same ground. The layout comes from
// the level number and the colony from its seed (Sim's generate(level, attempt,
// seed)); nothing else in the simulation is random, so the run replays as it
// played. Everything read from the address bar is checked strictly here and
// anything that does not look exactly right is ignored — the page then just
// plays as it would have.
(function (root) {
  var MAX_LEVEL = 9999
  var MAX_SEED = 2147483646      // generate draws floor(random * 2147483647)

  function parse(search) {
    var q
    try { q = new URLSearchParams(search || "") } catch (e) { return null }
    var level = q.get("level"), seed = q.get("seed")
    if (level === null || seed === null) return null
    if (!/^[1-9][0-9]{0,3}$/.test(level) || !/^(0|[1-9][0-9]{0,9})$/.test(seed)) return null
    var l = Number(level), s = Number(seed)
    if (l > MAX_LEVEL || s > MAX_SEED) return null
    return { level: l, seed: s }
  }

  // `base` is the page's address; any query or fragment on it is dropped.
  function url(base, level, seed) {
    if (!(level >= 1 && level <= MAX_LEVEL && level === Math.floor(level))) return null
    if (!(seed >= 0 && seed <= MAX_SEED && seed === Math.floor(seed))) return null
    return String(base).split(/[?#]/)[0] + "?level=" + level + "&seed=" + seed
  }

  root.AgentShare = { parse: parse, url: url, MAX_LEVEL: MAX_LEVEL, MAX_SEED: MAX_SEED }
})(typeof window !== "undefined" ? window : globalThis)
