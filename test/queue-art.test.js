import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {load,canvas,crop,themeOf,THEMES} from '../tools/render.js'
import {renderer} from '../tools/gag-art.js'
import {queueScene,queueAdvance,queueOffsets,queueBox,queueFrame,queueStrips,QUEUE_CASES} from '../tools/queue-art.js'
const S=load('Sim.js'),D=load('Draw.js'),P=load('Palette.js'),hash=x=>createHash('sha256').update(x).digest('hex')
const OLD=renderer(execFileSync('git',['show','63efc2a:public/agents/Draw.js'],{maxBuffer:4<<20}).toString())
function marks(fn){
 const ctx=canvas(400,248).ctx,calls=[];ctx.fillStyle='#123456';ctx.globalAlpha=0.35
 ctx.fillRect=(...r)=>{assert.ok(calls.length<2000);assert.ok(r.every(Number.isFinite)&&r[2]>0&&r[3]>0);assert.ok(r.every(n=>Number.isInteger(n*2)));assert.ok(ctx.globalAlpha<=0.35+1e-9);calls.push([...r,ctx.fillStyle,ctx.globalAlpha])}
 fn(ctx);assert.equal(ctx.fillStyle,'#123456');assert.equal(ctx.globalAlpha,0.35);return calls
}
function nativeAggregate(Draw){
 const sum=createHash('sha256')
 for(const level of[1,12,20])for(const name of Object.keys(THEMES))for(const res of[undefined,1,3])for(const reduced of[false,true])for(const age of[-1,0,1,5,6,18,30,54])for(const clear of[-1,0,19,30]){
  const w=S.generate(level,0,3);Object.assign(w,{res,reducedMotion:reduced,ticks:200+age});const rl={x:45.375,y:29,at:200,count:6,clearAt:clear<0?-1:w.ticks-clear},img=canvas(400,248)
  Draw.drawRateLimitSign(img.ctx,w,P.build(themeOf(name).theme,level),rl);sum.update(img.buf)
 }
 return sum.digest('hex')
}
test('native/default and share 429 paint stays exact across palettes, appearance and departure phases',()=>assert.equal(nativeAggregate(D),nativeAggregate(OLD)))
test('natural fixtures cover three biomes, both directions and a larger six-member queue',()=>{
 const biomes=new Set(),directions=new Set()
 for(const{level,seed}of QUEUE_CASES){const{w,rl}=queueScene(level,seed);biomes.add(w.biome);directions.add(rl.dir);assert.equal(w.ticks,rl.at);assert.ok(D.queueReadout(w,rl).waiting>=5);assert.equal(D.queueReadout(w,rl).clear,false)}
 assert.equal(biomes.size,3);assert.equal(directions.size,2);assert.equal(queueScene(72,2).rl.count,6);assert.throws(()=>queueScene(1,3),/No natural queue/)
})
test('readout counts exactly the living walking queue, never stale holds from dead or gone members',()=>{
 const agents=[{state:'walk',queueFor:5},{state:'walk',queueFor:3},{state:'dead',queueFor:90},{state:'walk',gone:true,queueFor:90},{state:'saved',queueFor:90},{state:'fall',queueFor:90},{state:'walk',queueFor:0}]
 const rl={count:6,clearAt:-1},r=D.queueReadout({agents},rl);assert.deepEqual(r,{waiting:2,pips:2,clear:false})
 assert.deepEqual(D.queueReadout({agents:[]},rl),{waiting:0,pips:0,clear:false})
 rl.clearAt=0;assert.equal(D.queueReadout({agents:[]},rl).clear,true)
 assert.equal(D.queueReadout({agents:[agents[0]]},{clearAt:-1}).pips,5)
})
test('page hardware stays within the original plate, pole and foot envelope, including pop-up and drop-away',()=>{
 const{w,rl}=queueScene(),pal=P.build(themeOf('tokyo-night').theme,w.level)
 for(const age of[-1,0,1,2,6,18,40])for(const gone of[-1,0,18,19,29,30,31]){
  w.ticks=rl.at+age;rl.clearAt=gone<0?-1:w.ticks-gone;const g=D.queueSignGeometry(w,rl),calls=marks(ctx=>D.drawRateLimitSign(ctx,w,pal,rl))
  if(!g){assert.equal(calls.length,0);continue}
  const boxes=[[g.cx-11,g.top-1,23,12],[g.cx-3,g.foot-1,7,1]];if(g.foot-g.top-9>0)boxes.push([g.cx-1,g.top+9,3,g.foot-g.top-9])
  for(const[x,y,width,height]of calls)for(let yy=y;yy<y+height;yy+=0.5)for(let xx=x;xx<x+width;xx+=0.5)assert.ok(boxes.some(([a,b,c,d])=>xx>=a&&xx<a+c&&yy>=b&&yy<b+d))
  const b=D.gagRateLimitRect({...w,rateLimit:rl});assert.ok(b&&g.cx-11>=b[0]&&g.cx+12<=b[2]&&g.top-1>=b[1]&&g.top+11<=b[3])
 }
})
test('complete white 429 digits never blink off, and 200 appears only in the actual clear phase',()=>{
 const{w,rl}=queueScene(),pal=P.build(themeOf('tokyo-night').theme,w.level)
 for(const clear of[false,true])for(const age of[6,7,12,18,24,30,86]){
  w.ticks=rl.at+age;rl.clearAt=clear?w.ticks:-1;const g=D.queueSignGeometry(w,rl)
  const actual=marks(ctx=>D.drawRateLimitSign(ctx,w,pal,rl)).filter(c=>c[4]===D.GAG_PAPER)
  const expected=marks(ctx=>{ctx.save();ctx.fillStyle=D.GAG_PAPER;D.drawTransitionText(ctx,clear?'200':'429',g.cx+1,g.top+3,1);ctx.restore()})
  assert.deepEqual(actual,expected);assert.ok(actual.length>20)
 }
})
test('both plate states have crisp high-contrast lettering in every theme',()=>{
 const luminance=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)
 for(const face of['#7b2d40','#1f5147'])assert.ok((luminance(D.GAG_PAPER)+.05)/(luminance(face)+.05)>7)
 const{w,rl}=queueScene()
 for(const name of Object.keys(THEMES))assert.ok(marks(ctx=>D.drawRateLimitSign(ctx,w,P.build(themeOf(name).theme,w.level),rl)).length===0,'appearance starts below ground')
})
test('reduced motion stops the amber lamp pulse but preserves actual queue progress and clearance',()=>{
 const{w,rl}=queueScene(),pal=P.build(themeOf('tokyo-night').theme,w.level);w.reducedMotion=true;w.ticks=rl.at+6
 const first=marks(ctx=>D.drawRateLimitSign(ctx,w,pal,rl))
 for(const age of[12,24,36]){w.ticks=rl.at+age;assert.deepEqual(marks(ctx=>D.drawRateLimitSign(ctx,w,pal,rl)),first)}
 w.reducedMotion=false;w.ticks=rl.at+6;const live=marks(ctx=>D.drawRateLimitSign(ctx,w,pal,rl));w.ticks=rl.at+18;assert.notDeepEqual(marks(ctx=>D.drawRateLimitSign(ctx,w,pal,rl)),live)
})
test('real queue releases drain the lamps and finish on 200 without changing simulation digests',()=>{
 const random=Math.random
 try{for(const{level,seed}of QUEUE_CASES){
  const a=S.generate(level,0,seed),b=S.generate(level,0,seed);a.res=b.res=2;const pal=P.build(themeOf('tokyo-night').theme,level),ctx=canvas(800,496).ctx;let seen=false,green=false
  for(let n=0;n<2200&&!a.done;n++){Math.random=()=>0.25;S.step(a);S.step(b);if(a.rateLimit){seen=true;const r=D.queueReadout(a,a.rateLimit);green||=r.clear;D.drawRateLimitSign(ctx,a,pal,a.rateLimit)}if(n%25===0)assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))}
  assert.ok(seen&&green)
 }}finally{Math.random=random}
})
test('all palettes and sampled queue poses are read-only, RNG-free, deterministic and bounded',()=>{
 const random=Math.random
 try{for(const{level,seed}of QUEUE_CASES){const{w,rl}=queueScene(level,seed),offsets=queueOffsets(rl);let age=0
  for(const next of offsets){queueAdvance(w,next-age);age=next;const before=hash(JSON.stringify(w));Math.random=()=>{throw Error('render RNG')}
   for(const name of Object.keys(THEMES)){const pal=P.build(themeOf(name).theme,level),draw=()=>marks(ctx=>D.drawRateLimitSign(ctx,w,pal,rl)),a=draw();assert.ok(a.length<120);assert.deepEqual(draw(),a)}assert.equal(hash(JSON.stringify(w)),before);Math.random=random
  }
 }}finally{Math.random=random}
})
test('direct crops match complete frames through native/page changes and terrain edits',()=>{
 const{w,rl}=queueScene(),cache={};queueAdvance(w,70)
 for(const res of[1,2])for(const edit of[false,true]){
  w.res=res;if(edit)S.setCell(w,Math.floor(rl.x),rl.y+1,w.k.EMPTY)
  const box=queueBox(w,rl),img=canvas(400*res,248*res,themeOf('tokyo-night').background),pal=P.build(themeOf('tokyo-night').theme,w.level)
  D.drawTerrain(img.ctx,w,pal);D.drawActors(img.ctx,w,pal,{intro:false,feed:false})
  assert.equal(hash(queueFrame(D,w,rl,cache).buf),hash(crop(img,box.x*res,box.y*res,box.width*res,box.height*res).buf))
 }
})
test('every rerun refreshes canonical and content-stamped contact sheets with matching source and image hashes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'queue-art-'))
 try{
  const options={base:'63efc2a',cases:[QUEUE_CASES[0]]},a=queueStrips(dir,options),file=path.join(dir,a.contactSheet),expected=hash(fs.readFileSync(file))
  assert.equal(a.contactSHA256,expected);assert.equal(hash(fs.readFileSync(path.join(dir,'contact-sheet.png'))),expected)
  fs.copyFileSync(path.join(dir,'40-3-frames.png'),file);fs.copyFileSync(file,path.join(dir,'contact-sheet.png'))
  const b=queueStrips(dir,options);assert.equal(hash(fs.readFileSync(file)),expected);assert.equal(hash(fs.readFileSync(path.join(dir,'contact-sheet.png'))),expected)
  assert.equal(b.drawSHA256,hash(fs.readFileSync(new URL('../public/agents/Draw.js',import.meta.url))));assert.match(fs.readFileSync(path.join(dir,'index.html'),'utf8'),new RegExp(b.contactSheet))
  assert.ok(b.records[0].frames[9].clearAt>=0);assert.equal(b.records[0].frames.at(-1).visible,false)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
