import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {renderer} from '../tools/gag-art.js'
import {loadCore} from '../tools/load-core.js'
import {canvas,themeOf,THEMES} from '../tools/render.js'
import {bombSite,setupBomb,captureBomb} from '../tools/bomb-art.js'
const S=loadCore('Sim.js'),D=loadCore('Draw.js'),P=loadCore('Palette.js')
const hash=x=>createHash('sha256').update(x).digest('hex')
const make=()=>{const w=S.generate(8,0,3);setupBomb(w,S.spawn,bombSite(w));w.res=2;return w}
const pal=P.build(themeOf('tokyo-night').theme,8)
function detonate(w){const random=Math.random;let seed=19;try{Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);w.ticks=850;w.agents[0].fuse=1;S.stepBomb(w,w.agents[0])}finally{Math.random=random}return w.blasts.at(-1)}
function paint(w,b,p=pal){const a=canvas(800,496),c=a.ctx;let calls=0;const fill=c.fillRect.bind(c)
 c.fillRect=(x,y,ww,h)=>{assert.ok(++calls<1500,'bounded calls');assert.ok([x,y,ww,h].every(v=>Number.isFinite(v)&&Number.isInteger(v*2)));assert.ok(x>=0&&y>=0&&x+ww<=400&&y+h<=248,'clipped board');fill(x,y,ww,h)}
 const before=hash(JSON.stringify(w)),random=Math.random;c.fillStyle='#abcdef';c.globalAlpha=.7
 try{Math.random=()=>assert.fail('art consumed RNG');D.drawBlast(c,w,p,b)}finally{Math.random=random}
 assert.equal(hash(JSON.stringify(w)),before);assert.equal(c.fillStyle,'#abcdef');assert.equal(c.globalAlpha,.7)
 return{hash:hash(a.buf),calls}
}
test('page blasts remain clipped, half-pixel, RNG-free and read-only across themes and boundary positions',()=>{
 for(const name of Object.keys(THEMES))for(const reducedMotion of[false,true]){
  const w=make(),b=detonate(w);w.reducedMotion=reducedMotion;const p=P.build(themeOf(name).theme,8)
  for(const age of[-1,0,2,5,10,18,25,26,27])for(const point of[[b.x,b.y],[0,0],[100,62]]){
   w.ticks=b.t+age;const r=paint(w,{...b,x:point[0],y:point[1]},p)
   if(age<0||age>26)assert.equal(r.calls,0)
  }
 }
})
test('native and share blast/fuse pixels retain the pre-polish renderer',()=>{
 const old=renderer(execFileSync('git',['show','0c2a6d9:public/agents/Draw.js'],{encoding:'utf8'}))
 for(const res of[undefined,1,3])for(const age of[-1,0,3,8,18,26,27]){
  const w=make();w.res=res;w.ticks=850+age;const b={x:40,y:40,r:5,t:850}
  const render=(d,name)=>{const a=canvas(1200,744);d[name](a.ctx,w,pal,b);return hash(a.buf)}
  assert.equal(render(D,'drawBlast'),render(old,'drawBlast'));assert.equal(render(D,'drawBlastLight'),render(old,'drawBlastLight'))
  for(const fuse of[149,39,24,9]){const a=canvas(100,100),b=canvas(100,100),ag={fuse};D.drawBombFuse(a.ctx,w,pal,ag,40,40,1);old.drawBombFuse(b.ctx,w,pal,ag,40,40,1);assert.equal(hash(a.buf),hash(b.buf))}
 }
})

test('rubble rises, returns to terrain, and holds its landing while the scorch fades',()=>{
 const w=make(),b=detonate(w),i=3
 const a=D.blastRubblePose(w,b,i,0),up=D.blastRubblePose(w,b,i,6),end=D.blastRubblePose(w,b,i,26)
 assert.ok(up.y<a.y,'visible upward arc');assert.equal(end.settled,true)
 assert.deepEqual(D.blastRubblePose(w,b,i,25),end,'settled, no continuing crawl')
 const marks=age=>{const c=canvas(800,496).ctx;let alpha=0;c.fillRect=()=>{alpha=c.globalAlpha};D.drawBlastScorch(c,w,b,age);return alpha}
 assert.ok(marks(24)<marks(10),'brief char fades')
})
test('reduced motion has a fixed aftermath, fixed fuse spark, and no flash light',()=>{
 const w=make(),b=detonate(w);w.reducedMotion=true;const frames=[]
 for(const age of[0,3,10,20,26]){w.ticks=b.t+age;frames.push(paint(w,b).hash)}
 assert.equal(new Set(frames).size,1)
 const c=canvas(800,496).ctx;c.fillRect=()=>assert.fail('reduced-motion flash');D.drawBlastLight(c,w,pal,{...b,t:w.ticks})
 const ag={fuse:12};const hashes=[]
 for(const ticks of[900,910]){w.ticks=ticks;const a=canvas(100,100);D.drawCountdownSpark(a.ctx,w,pal,ag,30,30,1,8);hashes.push(hash(a.buf))}assert.equal(hashes[0],hashes[1])
})
test('drawing during real Bomb steps leaves the entire world and random stream unchanged',()=>{
 const a=make(),b=make();let seed=91
 const step=w=>{const old=Math.random;const from=seed;try{Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);S.step(w)}finally{Math.random=old}return from}
 for(let i=0;i<180;i++){
  const start=seed;step(a);const end=seed;seed=start;step(b);assert.equal(seed,end)
  const img=canvas(800,496);D.drawTerrain(img.ctx,a,pal);D.drawActors(img.ctx,a,pal,{intro:false})
  assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))
 }
})
test('actual desktop and phone Bomb specimens render the real terrain cut',{timeout:30000},async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'bomb-art-'))
 try{const r=await captureBomb(out,{frames:[{name:'fuse-1',fuse:1,ms:0},{name:'blast-3',age:3,ms:100},{name:'blast-24',age:24,ms:800}]});assert.deepEqual(r.errors,[])
  for(const v of r.records){assert.ok(v.clip.width<=v.width);assert.ok(v.shots[1].terrainVersion>v.shots[0].terrainVersion);assert.equal(v.shots[1].blasts,1)}
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})
