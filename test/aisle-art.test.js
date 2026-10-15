import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {load,canvas,crop,themeOf,THEMES} from '../tools/render.js'
import {renderer} from '../tools/gag-art.js'
import {aisleScene,aisleAdvance,aisleBox,aisleFrame,aisleStrips,AISLE_LEVELS} from '../tools/aisle-art.js'
const S=load('Sim.js'),D=load('Draw.js'),P=load('Palette.js'),hash=b=>createHash('sha256').update(b).digest('hex')
const OLD=renderer(execFileSync('git',['show','8ccc99a:public/agents/Draw.js'],{maxBuffer:4<<20}).toString())
function marks(fn){
 const ctx=canvas(400,248).ctx,calls=[];ctx.fillStyle='#123456';ctx.globalAlpha=0.35
 ctx.fillRect=(...r)=>{assert.ok(calls.length<3000,'bounded paint');assert.ok(r.every(Number.isFinite)&&r[2]>0&&r[3]>0);assert.ok(r.every(n=>Number.isInteger(n*2)),'half-pixel grid');assert.ok(ctx.globalAlpha<=0.35+1e-9,'inherited opacity');calls.push([...r,ctx.fillStyle,ctx.globalAlpha])}
 fn(ctx);assert.equal(ctx.globalAlpha,0.35);assert.equal(ctx.fillStyle,'#123456');return calls
}
function nativeAggregate(Draw){
 const h=createHash('sha256')
 for(const level of[12,32,52,72,92])for(const name of Object.keys(THEMES))for(const res of[undefined,1,3])for(const reduced of[false,true])for(const tick of[0,7,24,47]){
  const w=S.generate(level,0,3);w.res=res;w.reducedMotion=reduced;w.ticks=tick
  const img=canvas(400,248);Draw.drawAisles(img.ctx,w,P.build(themeOf(name).theme,level));h.update(img.buf)
 }
 return h.digest('hex')
}
test('native/default and share-card aisles keep the exact pre-pass pixels in every palette and motion preference',()=>{
 assert.equal(nativeAggregate(D),nativeAggregate(OLD),'frozen main 8ccc99a is the independent baseline')
})
test('ventilation exists only on the Data Center aisle cells; a missing pair is bounded',()=>{
 for(let level=1;level<=20;level++){
  const w=S.generate(level,0,3);w.res=2;const pal=P.build(themeOf('tokyo-night').theme,level)
  const calls=marks(ctx=>D.drawPageThermalAisles(ctx,w,pal))
  assert.equal(calls.length>0,level===12)
 }
 assert.throws(()=>aisleScene(13),/No aisle/);assert.throws(()=>aisleScene(72,99),/No aisle/);assert.throws(()=>aisleScene(12),/No natural aisle crossing/)
})
test('page hardware occupies only actual exposed supporting floor; loose air stays above its own valid cell',()=>{
 for(const level of AISLE_LEVELS){
  const{w}=aisleScene(level),pal=P.build(themeOf('tokyo-night').theme,level)
  for(const tick of[0,6,16,24,47]){
   w.ticks=tick;const calls=marks(ctx=>D.drawPageThermalAisles(ctx,w,pal));assert.ok(calls.length<=200*w.aisles.length)
   for(const[x,y,width,height]of calls)for(let yy=y;yy<y+height;yy+=0.5)for(let xx=x;xx<x+width;xx+=0.5){
    const col=Math.floor(xx/4),row=Math.floor(yy/4),a=w.aisles.find(a=>col>=a.x0&&col<a.x1&&yy>=(a.y+1)*4-9&&yy<(a.y+1)*4+3)
    assert.ok(a,'inside an existing aisle envelope');assert.ok(w.terrain[(a.y+1)*w.k.COLS+col]);assert.equal(w.terrain[a.y*w.k.COLS+col],0)
    if(yy<(a.y+1)*4)assert.equal(w.terrain[row*w.k.COLS+col],0,'entire air footprint clears terrain')
    else assert.equal(row,a.y+1,'grate never spills below its own supporting cell')
   }
  }
 }
})
test('removed support and a covered floor suppress the corresponding vent and plume without changing the aisle map',()=>{
 const{w,aisle:a}=aisleScene(),pal=P.build(themeOf('tokyo-night').theme,w.level),before=hash(w.aisleAt)
 const removed=a.x0+1,covered=a.x0;w.terrain[(a.y+1)*w.k.COLS+removed]=0;w.terrain[a.y*w.k.COLS+covered]=w.k.STEEL
 const calls=marks(ctx=>D.drawPageThermalAisles(ctx,w,pal)),top=(a.y+1)*4
 for(const[x,y,width,height]of calls)if(y>=top-9&&y<top+3)for(const col of[removed,covered])assert.ok(x+width<=col*4||x>=(col+1)*4)
 assert.equal(hash(w.aisleAt),before);assert.equal(S.aisleUnder(w,{x:removed+0.5,y:a.y}),0)
})
test('floor fans have four poses, reverse hot versus cold, and hold still with reduced motion',()=>{
 const w=S.generate(12,0,3),pal=P.build(themeOf('tokyo-night').theme,12),draw=hot=>marks(ctx=>{ctx.save();D.drawThermalRotor(ctx,w,pal,100,100,hot);ctx.restore()})
 const poses=new Set()
 for(const tick of[0,8,16,24]){w.ticks=tick;poses.add(hash(JSON.stringify(draw(false))))}
 assert.equal(poses.size,4)
 for(let phase=0;phase<4;phase++){
  w.ticks=phase*8;const hot=draw(true).filter(c=>c[4]===pal.steelEdge)
  w.ticks=((4-((phase+25)%4))%4+3)*8;const cold=draw(false).filter(c=>c[4]===pal.steelEdge)
  assert.deepEqual(hot,cold)
 }
 w.reducedMotion=true;w.ticks=0;const first=draw(false);for(const tick of[8,16,100]){w.ticks=tick;assert.deepEqual(draw(false),first)}
})
test('warm curls rise and chilled air descends; obstruction clipping and opacity remain exact',()=>{
 const w=S.generate(12,0,3);w.terrain.fill(0);const xs=96,top=100,hotY=[],coldY=[]
 for(let step=0;step<8;step++){
  w.ticks=24+step*6
  for(const hot of[true,false]){
   const calls=marks(ctx=>{ctx.save();D.drawThermalAir(ctx,w,xs,top,hot);ctx.restore()});assert.equal(calls.length,3)
   ;(hot?hotY:coldY).push(calls[0][1]);assert.ok(calls.every(c=>c[5]<=0.35*(hot?0.55:0.42)))
  }
 }
 assert.ok(hotY.every((y,i)=>!i||y<hotY[i-1]));assert.ok(coldY.every((y,i)=>!i||y>coldY[i-1]))
 w.terrain.fill(w.k.STEEL);assert.equal(marks(ctx=>{ctx.save();D.drawThermalAir(ctx,w,xs,top,true);ctx.restore()}).length,0)
})
test('reduced motion keeps the complete new machinery static, while retaining both thermal colours',()=>{
 const{w}=aisleScene(),pal=P.build(themeOf('tokyo-night').theme,w.level);w.reducedMotion=true;w.ticks=0
 const first=marks(ctx=>D.drawPageThermalAisles(ctx,w,pal));assert.ok(first.some(c=>c[4]===D.AISLE_HOT_LIT));assert.ok(first.some(c=>c[4]===D.AISLE_COLD_LIT))
 for(const tick of[1,7,24,99,240]){w.ticks=tick;assert.deepEqual(marks(ctx=>D.drawPageThermalAisles(ctx,w,pal)),first)}
 for(const[x,y]of first)assert.ok(w.aisles.some(a=>x>=a.x0*4&&x<a.x1*4&&y>=(a.y+1)*4&&y<(a.y+1)*4+3))
})
test('every palette remains read-only, RNG-free, repeatable and bounded across live crossings',()=>{
 const random=Math.random
 try{for(const level of AISLE_LEVELS){
  const{w}=aisleScene(level)
  for(let frame=0;frame<8;frame++){
   if(frame)aisleAdvance(w);const before=hash(JSON.stringify(w));Math.random=()=>{throw Error('render RNG')}
   for(const name of Object.keys(THEMES)){const pal=P.build(themeOf(name).theme,level),a=marks(ctx=>D.drawPageThermalAisles(ctx,w,pal));assert.deepEqual(marks(ctx=>D.drawPageThermalAisles(ctx,w,pal)),a)}
   assert.equal(hash(JSON.stringify(w)),before);Math.random=random
  }
 }}finally{Math.random=random}
})
test('new machinery leaves actual aisle pace, updrafts and complete simulation digests identical',()=>{
 const random=Math.random
 try{for(const level of AISLE_LEVELS){
  const a=S.generate(level,0,3),b=S.generate(level,0,3);a.res=b.res=2;const pal=P.build(themeOf('tokyo-night').theme,level),img=canvas(800,496)
  for(let n=0;n<800;n++){Math.random=()=>0.25;S.step(a);S.step(b);if(n%25===0){D.drawAisles(img.ctx,a,pal);assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))}}
  assert.ok(Object.keys(a.aisleNoted).length>0)
 }}finally{Math.random=random}
 assert.equal(S.aislePace(1),1.35);assert.equal(S.aislePace(-1),0.85)
})
test('cached translated crops equal completed frames through actual floor edits and resolution changes',()=>{
 const{w,aisle:a}=aisleScene(),cache={}
 for(const res of[1,2])for(const edit of[false,true]){
  w.res=res;if(edit)S.setCell(w,a.x0+1,a.y+1,w.k.EMPTY)
  const box=aisleBox(w,a),img=canvas(400*res,248*res,themeOf('tokyo-night').background),pal=P.build(themeOf('tokyo-night').theme,w.level)
  D.drawTerrain(img.ctx,w,pal);D.drawActors(img.ctx,w,pal,{intro:false,feed:false})
  const expected=crop(img,box.x*res,box.y*res,box.width*res,box.height*res);assert.equal(hash(aisleFrame(D,w,a,cache).buf),hash(expected.buf));assert.equal(hash(aisleFrame(D,w,a,cache).buf),hash(expected.buf))
 }
})
test('review strips show naturally walking agents at six-tick intervals with supported labels',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aisle-art-'))
 try{const result=aisleStrips(dir,{base:'8ccc99a',levels:[32]});assert.equal(result.records.length,1);const frames=result.records[0].frames;assert.ok(frames[0].walkers.length>0);assert.equal(frames[7].tick-frames[0].tick,42);for(const name of['32-after-res2.png','32-frames.png','contact-sheet.png'])assert.ok(fs.statSync(path.join(dir,name)).size>0);assert.match(fs.readFileSync(path.join(dir,'index.html'),'utf8'),/Natural seed-3 crossings/)}finally{fs.rmSync(dir,{recursive:true,force:true})}
})
