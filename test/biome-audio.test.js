import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {loadCore} from '../tools/load-core.js'
const source=fs.readFileSync(new URL('../public/agents/sfx.js',import.meta.url),'utf8')
const S=loadCore('Sim.js'),hash=a=>createHash('sha256').update(new Uint8Array(a.buffer)).digest('hex')
function rig(){
 const nodes=[],buffers=[],contexts=[]
 class Param{constructor(){this.value=0;this.events=[]}setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t])}linearRampToValueAtTime(v,t){this.value=v;this.events.push(['linear',v,t])}exponentialRampToValueAtTime(v,t){this.value=v;this.events.push(['exp',v,t])}cancelScheduledValues(){}}
 class Node{constructor(kind){this.kind=kind;this.edges=new Set();nodes.push(this)}connect(n){this.edges.add(n)}disconnect(){this.edges.clear()}start(t=0){this.started=t;this.active=true}stop(t=ctx.currentTime){this.stopAt=t;if(t<=ctx.currentTime)this.end()}end(){this.active=false;if(this.onended)this.onended()}}
 let ctx
 class Ctx{constructor(){ctx=this;contexts.push(this);this.currentTime=0;this.sampleRate=12000;this.state='running';this.destination={}}
  createGain(){const n=new Node('gain');n.gain=new Param();return n}
  createOscillator(){const n=new Node('osc');n.frequency=new Param();return n}
  createBiquadFilter(){const n=new Node('filter');n.frequency={};n.Q={};return n}
  createBufferSource(){return new Node('source')}
  createBuffer(c,n,rate){const data=new Float32Array(n),b={length:n,sampleRate:rate,getChannelData:()=>data};buffers.push(b);return b}
  resume(){this.state='running'}
 }
 const scope={window:{AudioContext:Ctx},performance:{now:()=>1e6},Math}
 vm.runInNewContext(source,scope)
 const sfx=scope.window.AgentSfx
 return{sfx,nodes,buffers,contexts,scope,get ctx(){return ctx},advance(t){ctx.currentTime=t;for(const n of nodes)if(n.active&&n.stopAt<=t)n.end()}}
}
function enable(r,biome){const w={biome};r.sfx.scene(w,true);r.sfx.setOn(true);return w}
function energy(a){let sq=0,peak=0;for(const x of a){assert.ok(Number.isFinite(x));sq+=x*x;peak=Math.max(peak,Math.abs(x))}return{rms:Math.sqrt(sq/a.length),peak}}

test('ambience stays off by default, needs no audio support, and never invents an unknown biome',()=>{
 const r=rig();r.sfx.scene({biome:'Rooftops'},true);assert.equal(r.contexts.length,0);assert.equal(r.nodes.length,0)
 r.scope.window.AudioContext=null;r.sfx.setOn(true);assert.equal(r.contexts.length,0)
 const u=rig();enable(u,'not a biome');assert.equal(u.nodes.length,1,'master only');assert.equal(u.buffers.length,1,'shared event noise only')
})
test('all twenty beds are finite, distinct, quiet, deterministic, seam-safe and independent of simulation RNG',()=>{
 const digests=new Set()
 for(const biome of S.BIOMES){
  const r=rig();r.sfx.setOn(true)
  const random=Math.random
  try{Math.random=()=>{throw Error('bed used global randomness')};r.sfx.scene({biome},true)}finally{Math.random=random}
  const a=r.buffers[1].getChannelData(0),e=energy(a)
  assert.equal(a.length,96000);assert.equal(r.buffers[1].sampleRate,12000)
  assert.ok(e.rms>.002&&e.rms<.08,biome+' RMS '+e.rms);assert.ok(e.peak<.45,biome+' peak')
  assert.ok(a[0]===0&&a.at(-1)===0)
  assert.ok(Math.abs(a[1])<.01&&Math.abs(a.at(-2))<.01,'no discontinuous loop edge')
  const b=rig();enable(b,biome);assert.equal(hash(a),hash(b.buffers[1].getChannelData(0)));digests.add(hash(a))
 }
 assert.equal(digests.size,20)
})
test('a running bed is one source and gain, reuses two cached buffers, and does not follow sim ticks or speed',()=>{
 const r=rig(),w=enable(r,'Rooftops'),n=r.nodes.length
 assert.equal(n,3);assert.equal(r.nodes.filter(x=>x.loop).length,1)
 for(let i=0;i<2000;i++){w.ticks=i*4;w.fastForward=!!(i%2);r.sfx.scene(w,true)}
 assert.equal(r.nodes.length,n);assert.equal(r.buffers.length,2)
 const first=r.nodes.find(x=>x.loop).buffer
 r.sfx.scene({biome:'Library'},true);r.advance(1);r.sfx.scene(w,true)
 assert.equal(r.buffers.length,3);assert.equal(r.nodes.filter(x=>x.loop).at(-1).buffer,first)
})
test('mute/pause/intermission transitions fade then disconnect; rapid navigation keeps at most two live beds',()=>{
 const r=rig(),w=enable(r,'The Cloud')
 for(let i=0;i<60;i++){
  r.sfx.scene({biome:S.BIOMES[i%2]},true)
  assert.ok(r.nodes.filter(n=>n.loop&&n.active).length<=2)
 }
 r.sfx.scene(w,false);r.advance(1)
 assert.equal(r.nodes.filter(n=>n.loop&&n.active).length,0)
 assert.ok(r.nodes.filter(n=>n.loop).every(n=>n.edges.size===0))
 assert.ok(r.nodes.filter(n=>n.kind==='gain').slice(1).every(n=>n.edges.size===0))
 r.sfx.scene(w,true);r.sfx.setOn(false);r.advance(2)
 assert.equal(r.nodes.filter(n=>n.loop&&n.active).length,0)
 const count=r.nodes.length;r.sfx.scene({biome:'Trench'},true);assert.equal(r.nodes.length,count)
 r.sfx.setOn(true);assert.equal(r.nodes.filter(n=>n.loop&&n.active).length,1)
 r.sfx.scene(null,false);r.advance(3);assert.equal(r.nodes.filter(n=>n.loop&&n.active).length,0)
})
test('every biome has identical simulation state with and without sound observation and ambience',()=>{
 const r=rig();r.sfx.setOn(true)
 const random=Math.random,seeded=n=>()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296)
 const digest=w=>createHash('sha256').update(JSON.stringify(w)).digest('hex')
 try{for(let level=1;level<=20;level++){
  const a=S.generate(level,0,3),b=S.generate(level,0,3)
  r.sfx.scene(a,true)
  for(let t=0;t<400;t++){
   Math.random=seeded(level*997+t);S.step(a);r.sfx.observe(a)
   Math.random=seeded(level*997+t);S.step(b)
  }
  assert.equal(digest(a),digest(b),'level '+level)
 }}finally{Math.random=random}
})
