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

  var GAPS = { chime: 600, zing: 120, whoosh: 150, scuffle: 110, pop: 70, tink: 90, pew: 55, bang: 70, boom: 160, home: 90, down: 120, fanfare: 0, clang: 200, radio: 800, jingle: 600, dream: 400, wake: 300, busy: 1500, served: 90, agi: 600, agiHome: 0, agiLost: 0, quack: 300, plop: 300, pep: 120, murmur: 300, conflict: 400 }

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
    // A dreamer sees an exit: a soft glissando up, with a second voice a
    // fifth above coming in late — the heat haze, in sound.
    dream: function () { tone("sine", 440, 880, 0.35, 0.3); tone("triangle", 660, 1320, 0.3, 0.15, 0.06) },
    // ...and arrives at it: the door going out like a soap bubble.
    wake: function () { noise(0.12, 0.35, "lowpass", 900); tone("sine", 700, 260, 0.16, 0.3) },
    // 429: a telephone busy signal, two beats.
    busy: function () {
      for (var b = 0; b < 2; b++) { tone("square", 480, 480, 0.13, 0.22, b * 0.26); tone("square", 620, 620, 0.13, 0.16, b * 0.26) }
    },
    served: function () { tone("square", 1568, 1568, 0.03, 0.2) },    // 200 OK: one through the gate
    // The gold one: a glitter of high notes when it turns up...
    agi: function () { var n = [1568, 2093, 2637, 3136]; for (var i = 0; i < n.length; i++) tone("triangle", n[i], n[i], 0.06, 0.25, i * 0.05) },
    // ...a proper arpeggio when it gets home...
    agiHome: function () { var n = [523, 659, 784, 1047, 1319, 1568]; for (var i = 0; i < n.length; i++) tone("square", n[i], n[i], 0.09, 0.3, i * 0.07) },
    // ...and the roadmap slipping when it does not.
    agiLost: function () { var n = [784, 740, 698, 659]; for (var i = 0; i < n.length; i++) tone("triangle", n[i], n[i] * 0.98, 0.16, 0.35, i * 0.15) },
    // The rubber duck: a plop as it lands, a squeaky quack when it is picked up.
    plop: function () { tone("sine", 900, 300, 0.09, 0.4) },
    quack: function () { tone("square", 760, 520, 0.08, 0.3); tone("square", 700, 480, 0.09, 0.3, 0.1) },
    pep: function () { tone("square", 1047, 1047, 0.05, 0.25); tone("square", 1568, 1568, 0.08, 0.25, 0.06) },   // you're absolutely right
    // The standup: a low murmur of voices as each one starts talking.
    murmur: function () { noise(0.3, 0.25, "lowpass", 500); tone("sine", 180, 150, 0.25, 0.15); tone("sine", 240, 210, 0.2, 0.1, 0.08) },
    // A merge conflict: two notes a semitone apart, then the one that gives way.
    conflict: function () { tone("square", 440, 440, 0.12, 0.2); tone("square", 466, 466, 0.12, 0.2); tone("square", 392, 330, 0.1, 0.2, 0.16) },
    fanfare: function (good) {
      var notes = good ? [523, 659, 784, 1047] : [392, 330, 262, 196]
      for (var i = 0; i < notes.length; i++) tone("square", notes[i], notes[i], 0.11, 0.35, i * 0.1)
    }
  }

  function play(name, arg) { if (ready(name)) SOUNDS[name](arg) }

  // Events the world names outright, rather than ones read off a difference.
  var EVENT_SOUNDS = { "boss hit": "clang", "backup": "radio", "mission complete": "jingle" }

  // Agents something happened to on exactly this tick (Sim dates these).
  function count(w, field) {
    var n = 0
    for (var i = 0; i < w.agents.length; i++) if (w.agents[i][field] === w.ticks) n++
    return n
  }

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
      saved: w.saved, lost: w.lost, parries: w.umbrellaSaves || 0, done: w.done,
      dreams: w.hallucinations || 0, wakes: count(w, "wokeAt"), served: count(w, "servedAt"),
      limited: w.rateLimited || 0, agi: w.agiId >= 0, agiHome: !!w.agiHome, agiLost: !!w.agiLost,
      duck: !!w.duck, ducked: w.ducked || 0, peps: w.peps || 0, conflicts: w.conflicts || 0
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
    if (now.dreams > was.dreams) play("dream")
    if (now.wakes) play("wake")
    if (now.limited > was.limited) play("busy")
    if (now.served) play("served")
    if (now.agi && !was.agi) play("agi")
    if (now.duck && !was.duck && !now.ducked) play("plop")
    if (now.ducked > was.ducked) play("quack")
    if (now.peps > was.peps) play("pep")
    if (now.conflicts > was.conflicts) play("conflict")
    // The AGI's own cue takes the place of the ordinary one for that agent.
    if (now.agiHome && !was.agiHome) play("agiHome")
    else if (now.saved > was.saved) play("home")
    if (now.agiLost && !was.agiLost) play("agiLost")
    else if (now.lost > was.lost) play("down")
    if (now.done && !was.done) play("fanfare", w.saved * 2 >= w.toRelease)
  }

  function setOn(v) {
    on = !!v
    if (on && ensure() && ctx.state !== "running") ctx.resume()
  }

  // A saved "on" from a previous visit still needs a gesture to start.
  function wake() { if (on && ensure() && ctx.state !== "running") ctx.resume() }

  // For the page's own moments that are not in a world, like the standup.
  function cue(name) { if (SOUNDS[name]) play(name) }

  window.AgentSfx = { observe: observe, setOn: setOn, isOn: function () { return on }, wake: wake, cue: cue }
})()
