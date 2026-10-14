// Sound effects for the web page, synthesised on the spot — square waves and
// filtered noise, the palette of the machines this game is drawn like. No
// files: every sound is a few oscillator calls, so there is nothing to load
// and nothing to cache-bust.
//
// It listens rather than being told. The simulation is shared with hosts that
// have no audio (the Omarchy panel), so nothing in Sim.js calls in here; after
// each step the page hands over the world and this compares it with what it
// saw last tick — a new umbrella open, a round fired, somebody home.
//
// Off by default. Browsers will not start audio without a gesture anyway, and
// a page that starts making noise in a background tab is a page that gets
// closed. Each sound has a minimum gap in real time, so the fast speed setting
// and a crowded level do not turn into a buzz.
(function () {
  var ctx = null, master = null, noiseBuf = null, on = false
  var last = {}            // sound name -> time it last played (ms)
  var seen = null          // what the previous tick looked like

  var GAPS = { chime: 600, zing: 120, whoosh: 150, scuffle: 110, pop: 70, tink: 90, pew: 55, bang: 70, boom: 160, home: 90, down: 120, fanfare: 0, clang: 200, radio: 800, jingle: 600 }

  function ensure() {
    if (ctx) return ctx
    var AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.11
    master.connect(ctx.destination)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
    var data = noiseBuf.getChannelData(0)
    for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    return ctx
  }

  function ready(name) {
    if (!on || !ctx || ctx.state !== "running") return false
    var now = performance.now()
    if (now - (last[name] || -1e9) < GAPS[name]) return false
    last[name] = now
    return true
  }

  // One square (or other) wave sliding from f0 to f1 over len seconds.
  function tone(type, f0, f1, len, vol, at) {
    var t = ctx.currentTime + (at || 0)
    var o = ctx.createOscillator(), g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(f1, t + len)
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + len)
    o.connect(g); g.connect(master)
    o.start(t); o.stop(t + len + 0.02)
  }

  function noise(len, vol, filter, freq) {
    var t = ctx.currentTime
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain()
    s.buffer = noiseBuf
    f.type = filter; f.frequency.value = freq
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + len)
    s.connect(f); f.connect(g); g.connect(master)
    s.start(t); s.stop(t + len + 0.02)
  }

  var SOUNDS = {
    pop: function () { tone("square", 520, 1300, 0.07, 0.5) },                  // umbrella opens
    tink: function () { tone("triangle", 2100, 1500, 0.12, 0.7); noise(0.05, 0.4, "highpass", 4000) },
    pew: function () { tone("square", 1100, 240, 0.06, 0.35) },                  // a sidearm round
    bang: function () { noise(0.07, 0.6, "bandpass", 1800); tone("square", 300, 90, 0.06, 0.3) },
    boom: function () { noise(0.4, 1, "lowpass", 600); tone("sine", 120, 40, 0.35, 0.8) },
    home: function () { tone("square", 880, 880, 0.06, 0.3); tone("square", 1320, 1320, 0.08, 0.3, 0.06) },
    down: function () { tone("square", 330, 70, 0.18, 0.4) },
    chime: function () { tone("sine", 659, 659, 0.25, 0.5); tone("sine", 523, 523, 0.35, 0.5, 0.22) },  // doors open
    zing: function () { tone("sawtooth", 1400, 2600, 0.12, 0.18) },                 // hooked on a line
    whoosh: function () { noise(0.22, 0.6, "bandpass", 900); tone("triangle", 500, 160, 0.22, 0.3) },  // thrown out
    scuffle: function () { noise(0.05, 0.7, "bandpass", 500 + Math.random() * 700) },  // fists in the cloud
    clang: function () { tone("triangle", 980, 720, 0.25, 0.6); tone("square", 1470, 1300, 0.08, 0.2); noise(0.06, 0.5, "highpass", 3000) },  // a boss takes a hit
    radio: function () { noise(0.12, 0.5, "bandpass", 2400); tone("square", 1200, 1200, 0.05, 0.25, 0.13); tone("square", 1200, 1200, 0.05, 0.25, 0.22) },  // backup on the way
    jingle: function () { tone("square", 784, 784, 0.07, 0.3); tone("square", 988, 988, 0.07, 0.3, 0.08); tone("square", 1319, 1319, 0.12, 0.3, 0.16) },  // mission done
    fanfare: function (good) {
      var notes = good ? [523, 659, 784, 1047] : [392, 330, 262, 196]
      for (var i = 0; i < notes.length; i++) tone("square", notes[i], notes[i], 0.11, 0.35, i * 0.1)
    }
  }

  function play(name, arg) { if (ready(name)) SOUNDS[name](arg) }

  // Events the world names outright, rather than ones read off a difference.
  var EVENT_SOUNDS = { "boss hit": "clang", "backup": "radio", "mission complete": "jingle" }

  function snapshot(w) {
    var open = {}, shots = 0, enemyShots = 0
    for (var i = 0; i < w.agents.length; i++) {
      var ag = w.agents[i]
      if (ag.gone) continue
      if (ag.floater && ag.state === "fall" && ag.fall > 2) open[ag.id] = true
      if (ag.shotFor === 8) shots++
    }
    var brawls = 0
    for (var e = 0; e < w.enemies.length; e++) {
      if (w.enemies[e].gone) continue
      if (w.enemies[e].shotFor === 8) enemyShots++
      if (w.enemies[e].state === "brawl") brawls++
    }
    var doors = 0, zips = 0
    for (var t = 0; w.trains && t < w.trains.length; t++)
      if (w.trains[t].phase === "wait" || w.trains[t].phase === "drop") doors++
    for (var z = 0; z < w.agents.length; z++) if (!w.agents[z].gone && w.agents[z].state === "zip") zips++
    return {
      doors: doors, zips: zips,
      world: w, open: open, shots: shots, enemyShots: enemyShots, brawls: brawls, blasts: w.blasts.length,
      saved: w.saved, lost: w.lost, parries: w.umbrellaSaves || 0, done: w.done
    }
  }

  // After every step. A new world (next level, restart) resets the memory
  // instead of playing the difference between two levels.
  function observe(w) {
    var now = snapshot(w), was = seen
    seen = now
    if (!on || !was || was.world !== w) return
    for (var id in now.open) if (!was.open[id]) { play("pop"); break }
    if (now.parries > was.parries) play("tink")
    if (now.shots) play("pew")
    if (now.enemyShots) play("bang")
    if (now.blasts > was.blasts) play("boom")
    if (now.brawls) play("scuffle")
    if (now.doors > was.doors) play("chime")
    if (now.zips > was.zips) play("zing")
    if (w.lastEvent === "thrown out") play("whoosh")
    var cue = EVENT_SOUNDS[w.lastEvent]
    if (cue) play(cue)
    if (now.saved > was.saved) play("home")
    if (now.lost > was.lost) play("down")
    if (now.done && !was.done) play("fanfare", w.saved * 2 >= w.toRelease)
  }

  function setOn(v) {
    on = !!v
    if (on && ensure() && ctx.state !== "running") ctx.resume()
  }

  // A saved "on" from a previous visit still needs a gesture to start.
  function wake() { if (on && ensure() && ctx.state !== "running") ctx.resume() }

  window.AgentSfx = { observe: observe, setOn: setOn, isOn: function () { return on }, wake: wake }
})()
