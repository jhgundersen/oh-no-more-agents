// End-of-level copy shared by the browser and the Omarchy panel. Keeping the
// selection here means a new joke or event rule cannot quietly appear in only
// one host. This file reads the finished world but never mutates it.

var COMPLETION_LINES = [
  "Everyone home. The acceptance tests are suspiciously green.",
  "All agents accounted for. Even the edge cases.",
  "The colony has achieved warp factor: eventually.",
  "Perfect run. Please do not ask about the technical debt underground.",
  "They boldly went where several agents had just gone before.",
  "Achievement unlocked: distributed consensus without a network.",
  "No casualties. The redshirts would like this level reviewed.",
  "The exit returned HTTP 200 for everyone.",
  "All home. The simulation insists this was emergent behavior.",
  "Flawless victory, powered by tiny feet and questionable priorities."
]

var NUKED_LINES = [
  "Time. Everybody out, the hard way.", "The clock won that one.",
  "Out of time, and out of options.", "Some levels don't get solved.",
  "That's what the last skill is for.", "The SLA expired. So did everybody else.",
  "TimeoutError: colony did not converge.",
  "The final countdown was less Europe, more incident response.",
  "Game over. Insert coin, or just wait for the next level.",
  "The clock applied a hard deadline. Very enterprise."
]

var PARTIAL_LINES = [
  "Some made it home. The rest became legacy infrastructure.",
  "Partial success is still success in cloud billing.",
  "The exit scaled horizontally. The agents did not.",
  "A mixed result, like every sequel after the second one.",
  "The survivors have merged to main. The others had conflicts.",
  "Some tunnels only go one direction. Like production migrations.",
  "Enough got home to ship it on a Friday.",
  "The away team returned with fewer redshirts than it started.",
  "Not a wipeout, not a triumph: the cinematic middle chapter.",
  "The colony calls this eventual consistency."
]

var EVENT_LINES = {
  ai: [
    "The AI produced a confident route with no supporting evidence.",
    "Hallucination detected: the floor was not actually there.",
    "The agents requested more context. They received more rocks.",
    "Artificial intelligence met natural consequences.",
    "The model reasoned for 30 seconds and selected walking left.",
    "The benchmark says superhuman. The pit says otherwise.",
    "No training data was harmed. The agents were less fortunate.",
    "The chain of thought led directly into a wall.",
    "They aligned on a plan. It was the wrong plan, but beautifully aligned.",
    "The AI safety team recommends adding a railing.",
    "The colony passed the vibe check and failed navigation.",
    "A larger model would have fallen into a larger pit.",
    "The agents generated a bridge with several factual inaccuracies.",
    "Human feedback was unavailable. Human laughter was not.",
    "The neural network had many layers. The level had more.",
    "They asked the cloud for guidance. It sent an umbrella.",
    "Autonomy achieved. Accountability remains in beta.",
    "The AI explained the failure clearly after causing it.",
    "Tokens were spent. Lessons were allegedly learned.",
    "The prompt said reach the exit, not preserve dignity."
  ],
  hazard: ["The hazard documentation arrived one agent too late.", "They found the trap by unit testing it in production.", "One does not simply walk into a hazard. Several did.", "The danger was known. The pathfinding had other tabs open."],
  builder: ["The bridge passed code review. Gravity left comments.", "They built a stairway to heaven, or at least the next corridor.", "Brick by brick: infrastructure as actual code.", "The builders raised the uptime and several eyebrows."],
  digger: ["They dug through the stack until they found the root cause.", "The shovel performed a successful deep-dive.", "Dig first, ask questions at the postmortem.", "The lower corridor was discovered by downward compatibility."],
  miner: ["The miner deployed a breaking change. It broke the ground.", "That blast had excellent cache invalidation.", "They solved the obstacle with explosive refactoring."],
  floater: ["Cloud computing was taken unusually literally.", "The umbrellas provided a soft landing and zero vendor lock-in.", "They floated the proposal. Gravity reluctantly approved."],
  blocker: ["A blocker finally lived up to the ticket status.", "Somebody stood their ground. The ground filed a dependency.", "Traffic control was one agent in a robe saying no."],
  bomber: ["The rollback plan was mostly outward in every direction.", "They went with the nuclear option. It had excellent blast radius.", "A bomb fixed the bug and several neighboring features."],
  rescue: ["The director autoscaled the skill budget during the incident.", "An emergency tool arrived from the management plane.", "The rescue system achieved artificial helpfulness."],
  pit: ["The floor returned 404. Several agents followed the link.", "That pit had more depth than the plot.", "They stared into the abyss. The abyss had pixel graphics."],
  drone: ["The drone delivered same-day disruption.", "Air support arrived with a very hostile privacy policy.", "The operator chose remote work. The drone chose violence."],
  sniper: ["Long Context found a very short argument.", "The sniper established a position and declined all pull requests.", "Phasers were set to extremely inconvenient."],

  // Something happened to the level partway through. These only enter the pool
  // when it actually did, so the end-of-level line can be about the run rather
  // than about the game in general.
  collapse: ["The floor was deprecated without a migration path.", "Structural integrity was marked as out of scope.", "It turns out the ceiling was load-bearing after all.", "The level shipped a breaking change mid-sprint."],
  spill: ["The level filled up faster than the backlog.", "Somebody left the tap running in production.", "The water line rose. So did everyone's concerns.", "Liquidity event: entirely the wrong kind."],
  growth: ["New ground appeared, unrequested and unreviewed.", "The level grew a feature nobody asked for.", "Scope creep, but geological.", "Additional terrain was helpfully generated."],
  blackout: ["Every machine in the room changed its mind at once.", "The schedule was rewritten by something with no calendar.", "Somebody turned the clock rate up and left.", "The fixtures received an unscheduled config push."],
  drift: ["The rules quietly changed and nobody sent a changelog.", "Physics was updated to a version with known issues.", "Conditions degraded in a way the docs called 'expected'.", "The environment drifted. The agents did too."],
  spawn: ["Something arrived that was not on the manifest.", "An unscheduled participant joined the level.", "The guest list was not enforced.", "It came from outside the training distribution."],

  infect: [
    "One of them was not itself for the last stretch of that.",
    "The call was coming from inside the colony.",
    "Something got in through an input nobody thought to sanitise.",
    "It passed every check right up until it didn't.",
    "The threat model did not include the threat.",
    "An agent was compromised and kept working normally, which is worse."
  ],

  // Only when a dreamer actually walked to an exit that was not there.
  mirage: [
    "An agent cited an exit that does not exist. It was very well formatted.",
    "Hallucination detected: the door was confidently made up.",
    "One of them walked to a source it had invented. Then walked back.",
    "The exit was real in the sense that the agent believed in it.",
    "Grounding was applied on arrival. Mostly to the agent's expectations."
  ],

  // Only when a 429 sign actually held a crowd.
  ratelimit: [
    "429 Too Many Requests. The colony was asked to retry with backoff.",
    "The exit has a rate limit. The agents have a queue. Everyone is very polite.",
    "Too many agents in one place. Please try again in a few seconds.",
    "A token bucket was briefly drawn as a queue of people in suits.",
    "They respected the Retry-After header. A first for any client."
  ],

  // The golden agent, when there was one: home, or not.
  agiHome: [
    "AGI achieved. It went home.",
    "The AGI arrived on schedule, which surprised everyone, including the AGI.",
    "Artificial general intelligence: generally, it walked to the exit.",
    "The singularity was a single agent with an umbrella. It is home now."
  ],
  agiLost: [
    "AGI lost. It is still five years away.",
    "The AGI fell into a pit. The roadmap has been updated.",
    "General intelligence, specific pit.",
    "The AGI did not make it. The press release went out anyway."
  ],

  // Only when somebody actually explained its problem to the duck.
  duck: [
    "One agent explained the problem to a rubber duck and solved it halfway through the sentence.",
    "The rubber duck said nothing, which is exactly what was needed.",
    "Debugged by duck. The duck takes no credit and no equity.",
    "Rubber duck debugging: still undefeated."
  ],

  // Only when two of them met nose to nose in a tunnel and one rebased.
  conflict: [
    "Two agents met head-on in a tunnel. One rebased. Nobody force-pushed.",
    "Merge conflict resolved by the oldest method: one of them went back.",
    "<<<<<<< HEAD: forward. >>>>>>> theirs: also forward. Resolved: backward.",
    "A merge conflict, resolved without a meeting. Remarkable."
  ],

  // Only when a carrier actually reached the door still carrying it.
  carrier: [
    "One of them took it home with it. Nobody noticed.",
    "The rescue count includes something it should not.",
    "It made it to the exit. So did what it was carrying.",
    "Successfully exfiltrated: one agent, one passenger.",
    "That one goes in the next level's colony, presumably."
  ]
}

function outcomeLine(w) {
  // The completion lines all claim nobody was lost, so they are earned by
  // exactly that. With the per-level goal gone there is no longer a result
  // that counts as a win while somebody is still down a shaft.
  var outcome = w.saved >= w.toRelease ? COMPLETION_LINES : (w.nuking ? NUKED_LINES : PARTIAL_LINES)
  var facts = EVENT_LINES.ai.slice()
  function used(name) { return Object.prototype.hasOwnProperty.call(w.lastUsed, name) }
  function add(name, yes) { if (yes) facts = facts.concat(EVENT_LINES[name]) }
  add("hazard", w.hazardKills > 0); add("builder", used("builder"))
  add("digger", used("digger")); add("miner", used("miner"))
  add("floater", used("floater")); add("blocker", used("blocker"))
  add("bomber", used("bomber") || w.bombsUsed > 0); add("rescue", w.rescues > 0)
  add("pit", w.pits && w.pits.length > 0 && w.lost > 0)
  add("drone", w.enemyRoster && w.enemyRoster.indexOf("operator") >= 0)
  add("sniper", w.enemyRoster && w.enemyRoster.indexOf("sniper") >= 0)
  // Whatever happened to the level itself, by mechanism rather than by name.
  // Sim.js puts the mechanisms on the world for exactly this: reaching into
  // its EVENTS table from here resolves in a browser and throws in QML.
  for (var m in (w.eventMechs || {})) add(m, true)
  add("carrier", w.carrierHome === true)
  add("mirage", w.hallucinations > 0)
  add("ratelimit", w.rateLimited > 0)
  add("agiHome", w.agiHome === true)
  add("agiLost", w.agiLost === true)
  add("duck", w.ducked > 0)
  add("conflict", w.conflicts > 0)
  var pool = facts.length && Math.random() < 0.78 ? facts : outcome
  return pool[Math.floor(Math.random() * pool.length)]
}

// ---------------------------------------------------------------------------
// Daily standup
// ---------------------------------------------------------------------------
// Every few levels the page holds a standup: the survivors in a circle, each
// with a three-line status. The lines are about what actually happened over
// the last few levels, most specific first, and nothing here is random — the
// same recap gives the same meeting.

// What one finished world contributes to the recap.
function standupFacts(w) {
  var used = w.lastUsed || {}
  // Booleans, counts and missing fields alike, as a number.
  function n(v) { return v ? Number(v) : 0 }
  function did(skill) { return n(Object.prototype.hasOwnProperty.call(used, skill)) }
  return {
    levels: 1, saved: n(w.saved), lost: n(w.lost),
    pitDeaths: n(w.pits && w.pits.length && w.lost > 0),
    hazardKills: n(w.hazardKills), hallucinations: n(w.hallucinations),
    rateLimited: n(w.rateLimited), ducked: n(w.ducked),
    agiHome: n(w.agiHome), agiLost: n(w.agiLost), brolly: n(w.brollyLandings),
    blocker: did("blocker"), builder: did("builder"), events: n(w.eventLog && w.eventLog.length)
  }
}

function standupRecap(list) {
  var r = {}
  for (var i = 0; i < list.length; i++) for (var k in list[i]) r[k] = (r[k] || 0) + list[i][k]
  return r
}

// Yesterday, today, blockers — at most 24 characters a line, for the bubble.
var STANDUP_TOPICS = [
  ["agiHome", function (n) { return ["SHIPPED AGI.", "GOING HOME AGAIN.", "NONE. IT'S AGI."] }],
  ["agiLost", function (n) { return ["LOST THE AGI.", "UPDATING ROADMAP.", "FIVE MORE YEARS."] }],
  ["hallucinations", function (n) { return ["WALKED TO AN EXIT.", "CHECKING IT EXISTS.", "IT DID NOT EXIST."] }],
  ["ducked", function (n) { return ["TALKED TO A DUCK.", "SHIPPING THE FIX.", "NONE. ASK THE DUCK."] }],
  ["rateLimited", function (n) { return ["STOOD IN A QUEUE.", "RETRY WITH BACKOFF.", "429."] }],
  ["pitDeaths", function (n) { return ["FELL IN A PIT.", "NOT THAT.", "GRAVITY."] }],
  ["hazardKills", function (n) { return ["LOST " + Math.min(n, 99) + " IN PROD.", "TESTING IN STAGING.", "PROD."] }],
  ["blocker", function (n) { return ["STOOD IN THE WAY.", "MORE OF THAT.", "THE BLOCKER."] }],
  ["brolly", function (n) { return ["OPENED " + Math.min(n, 99) + " UMBRELLAS.", "STAYING DRY.", "THE CEILING."] }],
  ["builder", function (n) { return ["BUILT A BRIDGE.", "MAINTAINING IT.", "TECH DEBT."] }],
  ["events", function (n) { return ["SCOPE CHANGED.", "NEW SCOPE.", "THE SCOPE."] }]
]
var STANDUP_FILLER = [
  ["WALKED HOME.", "WALK HOME.", "NONE."],
  ["SHIPPED.", "SHIP AGAIN.", "THIS MEETING."],
  ["FOLLOWED THE CROWD.", "SAME.", "THE CROWD."],
  ["READ THE DOCS.", "IGNORE THE DOCS.", "THE DOCS."],
  ["NOTHING TO REPORT.", "MORE NOTHING.", "NONE."]
]

function standupLines(recap, speakers) {
  var out = []
  for (var i = 0; i < STANDUP_TOPICS.length && out.length < speakers; i++) {
    var n = recap[STANDUP_TOPICS[i][0]] || 0
    if (n > 0) out.push(STANDUP_TOPICS[i][1](n))
  }
  for (var f = 0; out.length < speakers; f++) out.push(STANDUP_FILLER[f % STANDUP_FILLER.length])
  return out.map(function (l) { return ["YESTERDAY: " + l[0], "TODAY: " + l[1], "BLOCKERS: " + l[2]] })
}

// ---------------------------------------------------------------------------
// Community milestones
// ---------------------------------------------------------------------------
// The page fetches the worldwide rescue total anyway. When it crosses a round
// number while somebody is watching — every 10,000, with 100,000s and the
// million as bigger occasions — the colony dresses for it for the rest of the
// session. Pure cosmetics: the counter and its API are untouched. `previous`
// is the total the page last saw (null at first), `total` the new one; null
// total, null result. A total that has only just passed a round number when
// the page opens counts too, so the party is not only for whoever happened to
// be watching at the exact moment.
var MILESTONE_STEP = 10000
var MILESTONE_FRESH = 300     // "only just passed", at first sight

function milestoneFor(previous, total) {
  if (typeof total !== "number" || !(total >= MILESTONE_STEP)) return null
  var m = Math.floor(total / MILESTONE_STEP) * MILESTONE_STEP
  var crossed = typeof previous === "number" ? previous < m : total - m < MILESTONE_FRESH
  if (!crossed) return null
  return { n: m, kind: m % 1000000 === 0 ? "million" : m % 100000 === 0 ? "hundred" : "ten",
    line: "COMMUNITY MILESTONE: " + withCommas(m) + " AGENTS HOME" }
}

// By hand: this file also runs in the Omarchy panel's QML engine, where
// toLocaleString with a locale argument is not something to count on.
function withCommas(n) {
  var s = String(Math.floor(n)), out = ""
  for (var i = 0; i < s.length; i++) out += (i && (s.length - i) % 3 === 0 ? "," : "") + s[i]
  return out
}

