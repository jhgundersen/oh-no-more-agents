import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {load,canvas,crop,themeOf,THEMES} from '../tools/render.js'
import {librarianScene,librarianBox,librarianFrame,librarianStrips,KEEPER_LEVELS,KEEPER_AGES} from '../tools/librarian-art.js'
const S=load('Sim.js'),D=load('Draw.js'),P=load('Palette.js'),hash=b=>createHash('sha256').update(b).digest('hex')
function marks(fn){
 const ctx=canvas(400,248).ctx,calls=[];ctx.fillStyle='#123456';ctx.globalAlpha=0.35
 ctx.fillRect=(...r)=>{assert.ok(calls.length<1500,'bounded paint');assert.ok(r.every(Number.isFinite)&&r[2]>0&&r[3]>0);assert.ok(r.every(n=>Number.isInteger(n*2)),'half-pixel grid');assert.ok(ctx.globalAlpha<=0.35+1e-9);calls.push([...r,ctx.fillStyle,ctx.globalAlpha])}
 fn(ctx);assert.equal(ctx.globalAlpha,0.35);assert.equal(ctx.fillStyle,'#123456');return calls
}
function nativeAggregate(Draw=D){
 const h=createHash('sha256')
 for(const level of KEEPER_LEVELS)for(const name of Object.keys(THEMES))for(const res of[undefined,1,3])for(const reduced of[false,true])for(const dir of[-1,1])for(const age of[0,5,20,39,44]){
  const w=S.generate(level,0,3),lib=w.librarians[0];w.res=res;w.reducedMotion=reduced;w.ticks=400;lib.shushAt=400-age;lib.dir=dir
  const img=canvas(400,248);Draw.drawLibrarians(img.ctx,w,P.build(themeOf(name).theme,level));h.update(img.buf)
 }
 return h.digest('hex')
}
test('native/default and share-card librarians retain original pixels, gestures and bubbles',()=>{
 assert.equal(nativeAggregate(),'25bc51a65078a52d7c790a7f0b6211f14a3087651aa52d45ff7b792976bebb43')
})
test('the desk stays in place when its keeper turns; the forty-tick gesture follows the real shush pause',()=>{
 assert.equal(S.HUSH_TICKS,40)
 for(const level of KEEPER_LEVELS){
  const w=S.generate(level,0,3),lib=w.librarians[0];lib.shushAt=100
  const desk=D.librarianDrawing(w,lib).deskDir
  for(const dir of[-1,1])for(const[age,lift]of[[-1,0],[0,0],[2,0.5],[5,1],[25,1],[34,1],[39,0.25],[40,0],[80,0]]){
   lib.dir=dir;w.ticks=100+age;const g=D.librarianDrawing(w,lib);assert.equal(g.deskDir,desk);assert.equal(g.lift,lift)
   if(age>=0&&age<40)assert.equal(g.page,0,'no idle page turn while shushing')
  }
 }
})
test('all page paint stays inside the original two-facing desk envelope, at half-pixel precision',()=>{
 for(const level of KEEPER_LEVELS){
  const w=S.generate(level,0,3),lib=w.librarians[0],pal=P.build(themeOf('tokyo-night').theme,level);w.res=2
  for(const dir of[-1,1])for(let age=-1;age<=45;age++){
   lib.dir=dir;lib.shushAt=100;w.ticks=100+age
   const calls=marks(ctx=>D.drawPageLibrarian(ctx,w,pal,lib,100,80));assert.ok(calls.length<=64)
   for(const[x,y,width,height]of calls)assert.ok(x>=96&&x+width<=112&&y>=80&&y+height<=96)
  }
 }
})
test('reading and shushing are read-only, deterministic and RNG-free in every palette',()=>{
 const random=Math.random
 try{for(const level of KEEPER_LEVELS)for(const kind of['reading','shush']){
  const{w,lib}=librarianScene(level,kind),before=hash(JSON.stringify(w));Math.random=()=>{throw Error('render RNG')}
  for(const name of Object.keys(THEMES)){
   const pal=P.build(themeOf(name).theme,level),a=marks(ctx=>D.drawPageLibrarian(ctx,w,pal,lib,100,80))
   assert.deepEqual(marks(ctx=>D.drawPageLibrarian(ctx,w,pal,lib,100,80)),a)
  }
  assert.equal(hash(JSON.stringify(w)),before);Math.random=random
 }}finally{Math.random=random}
 assert.throws(()=>librarianScene(12),/No librarian/);assert.throws(()=>librarianScene(13,'dance'),/Unknown librarian/)
})
test('the reading page has four bounded poses; reduced motion fixes idle pages and snaps the functional gesture',()=>{
 const w=S.generate(13,0,3),lib=w.librarians[0],pal=P.build(themeOf('tokyo-night').theme,13);w.res=2;lib.shushAt=-150
 const poses=new Set()
 for(let tick=0;tick<240;tick++){w.ticks=tick;poses.add(D.librarianDrawing(w,lib).page)}
 assert.deepEqual([...poses].sort(),[0,1,2,3])
 w.reducedMotion=true
 const draw=()=>marks(ctx=>D.drawPageLibrarian(ctx,w,pal,lib,100,80))
 w.ticks=100;const idle=draw();for(const tick of[110,130,180,240]){w.ticks=tick;assert.deepEqual(draw(),idle)}
 lib.shushAt=300;w.ticks=300;const hold=draw();assert.notDeepEqual(hold,idle)
 for(const tick of[301,310,325,339]){w.ticks=tick;assert.deepEqual(draw(),hold)}
 w.ticks=340;assert.deepEqual(draw(),idle)
})
test('page rendering leaves live Library play, shush targets, pauses and headings identical',()=>{
 const random=Math.random
 try{for(const level of KEEPER_LEVELS){
  const a=S.generate(level,0,3),b=S.generate(level,0,3);a.res=b.res=2;const pal=P.build(themeOf('tokyo-night').theme,level),img=canvas(800,496)
  for(let tick=0;tick<600;tick++){
   Math.random=()=>0.25;S.step(a);S.step(b)
   if(tick%20===0){D.drawLibrarians(img.ctx,a,pal);assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))}
  }
  assert.ok(a.shushes>0)
 }}finally{Math.random=random}
})
test('cached direct crops equal completed full-frame crops at native and page resolution',()=>{
 for(const kind of['reading','shush']){
  const{w,lib}=librarianScene(13,kind),cache={}
  for(const res of[1,2]){
   w.res=res;const box=librarianBox(w,lib),img=canvas(400*res,248*res,themeOf('tokyo-night').background),pal=P.build(themeOf('tokyo-night').theme,w.level)
   D.drawTerrain(img.ctx,w,pal);D.drawActors(img.ctx,w,pal,{intro:false,feed:false})
   const expected=crop(img,box.x*res,box.y*res,box.width*res,box.height*res)
   assert.equal(hash(librarianFrame(D,w,lib,cache).buf),hash(expected.buf));assert.equal(hash(librarianFrame(D,w,lib,cache).buf),hash(expected.buf))
  }
 }
})
test('natural-cycle sheets label each row with supported ROM glyphs and retain actual event timing',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'librarian-art-'))
 try{
  const result=librarianStrips(dir,{base:'15179a2',levels:[13]});assert.equal(result.records.length,2)
  for(const rec of result.records){assert.equal(rec.label,`LIBRARY 13 - ${rec.kind.toUpperCase()} - BEFORE / AFTER`);assert.equal(rec.frames.length,8);assert.equal(rec.frames[7].tick-rec.frames[0].tick,KEEPER_AGES[rec.kind][7])}
  assert.ok(fs.statSync(path.join(dir,'13-shush-after-res2.png')).size>0);assert.match(fs.readFileSync(path.join(dir,'index.html'),'utf8'),/no staged interactions/)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
