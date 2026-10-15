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

  // Colony of the day: one level and one colony per UTC date, the same for
  // everyone anywhere, from nothing but the date — no server, no state. The
  // level and seed are two FNV-1a hashes of "YYYY-MM-DD".
  var DAILY_LEVELS = 200
  function validDate(d) {
    if (typeof d !== "string" || !/^20[0-9]{2}-[01][0-9]-[0-3][0-9]$/.test(d)) return false
    var t = Date.parse(d + "T00:00:00Z")
    return !isNaN(t) && new Date(t).toISOString().slice(0, 10) === d
  }
  function hash(str, salt) {
    var h = (2166136261 ^ salt) >>> 0
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
    return h
  }
  function daily(date) {
    if (!validDate(date)) return null
    return { level: 1 + hash(date, 0) % DAILY_LEVELS, seed: hash(date, 0x9e3779b9) % (MAX_SEED + 1), daily: date }
  }
  function today(now) { return new Date(now === undefined ? Date.now() : now).toISOString().slice(0, 10) }
  function dailyUrl(base, date) {
    return validDate(date) ? String(base).split(/[?#]/)[0] + "?daily=" + date : null
  }

  function parse(search) {
    var q
    try { q = new URLSearchParams(search || "") } catch (e) { return null }
    if (q.get("daily") !== null) return daily(q.get("daily"))
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

  root.AgentShare = { parse: parse, url: url, daily: daily, today: today, dailyUrl: dailyUrl, MAX_LEVEL: MAX_LEVEL, MAX_SEED: MAX_SEED }
})(typeof window !== "undefined" ? window : globalThis)
