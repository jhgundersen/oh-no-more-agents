import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {load,canvas,crop,themeOf,THEMES} from '../tools/render.js'
import {renderer} from '../tools/gag-art.js'
import {arrivalWorld} from '../tools/exit-welcome.js'
import {officeFrame,officeBox,officeReview,OFFICE_SEASONS} from '../tools/umbrella-office.js'
const S=load('Sim.js'),D=load('Draw.js'),P=load('Palette.js'),OLD=renderer(execFileSync('git',['show','2b12360:public/agents/Draw.js'],{maxBuffer:4<<20}).toString()),hash=x=>createHash('sha256').update(x).digest('hex')
const pal=P.build(themeOf('tokyo-night').theme,1)
function marks(w){const ctx=canvas(400,248).ctx,calls=[];ctx.fillStyle='#123456';ctx.globalAlpha=.35;ctx.fillRect=(...r)=>{assert.ok(calls.length<128,'bounded paint budget');assert.ok(r.every(Number.isFinite)&&r[2]>0&&r[3]>0);assert.ok(r.every(n=>Number.isInteger(n*2)));calls.push([...r,ctx.fillStyle,ctx.globalAlpha])};D.drawUmbrellaOffice(ctx,w,pal);assert.equal(ctx.fillStyle,'#123456');assert.equal(ctx.globalAlpha,.35);return calls}
test('twenty biome stands use only supported air outside the exit, in every palette and season',()=>{
 const random=Math.random
 try{for(let level=1;level<=20;level++){
  const w=arrivalWorld(level),e=w.exit,b=D.umbrellaOfficeLayout(w);assert.ok(b,w.biome);assert.ok(Object.hasOwn(D.UMBRELLA_OFFICES,w.biome))
  assert.ok(b.x>=6&&b.x+b.width<=394);assert.ok(b.x+b.width<=e.x*4-12||b.x>=(e.x+e.w)*4+12)
  assert.ok(D.umbrellaOfficeClear(w,b.x,b.foot,b.width));w.saved=10
  for(const season of Object.values(OFFICE_SEASONS)){
   w.season=season;const before=hash(JSON.stringify(w));Math.random=()=>{throw Error('render entropy')}
   const calls=marks(w);assert.ok(calls.length>20)
   for(const[x,y,width,height,,alpha]of calls){assert.equal(alpha,.35);assert.ok(x>=b.x&&x+width<=b.x+b.width);assert.ok(y>=b.foot-16&&y+height<=b.foot);for(let yy=y;yy<y+height;yy+=.5)for(let xx=x;xx<x+width;xx+=.5)assert.ok(D.mechanismAir(w,xx,yy))}
   assert.equal(hash(JSON.stringify(w)),before);Math.random=random
   for(const name of Object.keys(THEMES)){const img=canvas(800,496),colors=P.build(themeOf(name).theme,level);D.drawUmbrellaOffice(img.ctx,w,colors);assert.ok(img.buf.some(x=>x))}
  }
 }}finally{Math.random=random}
})
test('native, default and share actors keep every original pixel after arrivals',()=>{
 const a=createHash('sha256'),b=createHash('sha256')
 for(let level=1;level<=20;level++){
  const w=arrivalWorld(level)
  for(const res of[undefined,1,3]){w.res=res;for(const[draw,sum]of[[D,a],[OLD,b]]){const img=canvas(400*(res||1),248*(res||1));draw.drawActors(img.ctx,w,P.build(themeOf('tokyo-night').theme,level),{intro:false,feed:false});sum.update(img.buf)}}
 }
 assert.equal(a.digest('hex'),b.digest('hex'))
})
test('saved count fills five slots then a capped tidy pile, using the actual arrival colours',()=>{
 const w=arrivalWorld(13);w.homeOrder=[9,2,14,7,8,0,3,11,4,6];const all=[]
 for(const count of[0,1,2,3,4,5,6,7,8,9,10]){w.saved=count;all.push(hash(JSON.stringify(marks(w))))}
 assert.equal(new Set(all).size,11)
 w.saved=10;const full=marks(w);for(const count of[11,20,1e9]){w.saved=count;assert.deepEqual(marks(w),full)}
 for(const res of[undefined,1,3]){w.res=res;assert.equal(marks(w).length,0)}
 w.res=2;w.saved=-1;const empty=marks(w);w.saved=0;assert.deepEqual(marks(w),empty)
 const ctx=canvas(400,248).ctx,calls=[];ctx.fillRect=(...r)=>calls.push([...r,ctx.fillStyle]);w.season=null;D.drawOfficeBrolly(ctx,w,pal,0,40,40,false);assert.ok(calls.some(c=>c[4]===D.brollyColour(w,pal,{id:9})))
 w.colonySeed=0;w.homeOrder=[0];w.season=OFFICE_SEASONS.christmas;calls.length=0;D.drawOfficeBrolly(ctx,w,pal,0,40,40,false);assert.ok(calls.some(c=>c[4]==='#d42a3c'));assert.ok(calls.some(c=>c[4]===D.GAG_PAPER))
 w.season=OFFICE_SEASONS.halloween;calls.length=0;D.drawOfficeBrolly(ctx,w,pal,0,40,40,true);assert.ok(calls.some(c=>c[4]==='#2a2233'));assert.ok(calls.some(c=>c[4]==='#a393bc'))
 w.homeOrder=[];calls.length=0;D.drawOfficeBrolly(ctx,w,pal,1,40,40,false);assert.ok(calls.length)
 w.biome='__proto__';assert.ok(marks(w).length>0)
})
test('cached positions refresh after terrain edits and never float above a missing floor',()=>{
 const w=arrivalWorld(13),terrain=w.terrain;let forbid=false
 w.terrain=new Proxy(terrain,{get(t,p){if(forbid)throw Error('per-frame terrain search');return Reflect.get(t,p,t)}})
 const first=D.umbrellaOfficeLayout(w);forbid=true;w.saved=10;w.ticks++;assert.equal(D.umbrellaOfficeLayout(w),first);assert.ok(marks(w).length);forbid=false
 w.terrain=terrain;assert.notEqual(D.umbrellaOfficeLayout(w),first)
 const b=D.umbrellaOfficeLayout(w);S.setCell(w,b.x/4,b.foot/4,w.k.EMPTY);assert.notDeepEqual(D.umbrellaOfficeLayout(w),b)
 w.terrain.fill(w.k.EMPTY);w.terrainVersion++;assert.equal(D.umbrellaOfficeLayout(w),null);assert.equal(marks(w).length,0)
 w.terrain.fill(w.k.STEEL);w.terrainVersion++;assert.equal(D.umbrellaOfficeLayout(w),null)
 assert.equal(D.umbrellaOfficeClear(w,-1,100,12),false);assert.equal(D.umbrellaOfficeClear(w,390,100,12),false);assert.equal(D.umbrellaOfficeClear(w,20,4,12),false)
 w.terrain.fill(0);for(let x=0;x<100;x++)w.terrain[50*100+x]=1;w.hazards=[{zx0:10,zx1:16,zy0:45,zy1:50}];assert.equal(D.umbrellaOfficeClear(w,40,200,24),false)
 w.exit=null;assert.equal(marks(w).length,0)
})
test('collection is static under ticks, fast speed, reduced motion and report hold',()=>{
 const w=arrivalWorld(20);w.saved=10;const first=marks(w)
 for(const over of[{ticks:1},{ticks:9999},{reducedMotion:true},{fastForward:true},{done:true,doneTicks:80},{mission:{done:false}}]){Object.assign(w,over);assert.deepEqual(marks(w),first)}
})
test('direct crop matches full frame, palette/resolution invalidates terrain cache, and changes stay by the stand',()=>{
 for(const level of[8,10,13,19,20]){
  const w=arrivalWorld(level);w.saved=10;const cache={},small=officeFrame(D,w,cache),box=officeBox(w),full=canvas(800,496),colors=P.build(themeOf('tokyo-night').theme,level)
  D.drawTerrain(full.ctx,w,colors);D.drawActors(full.ctx,w,colors,{intro:false,feed:false});assert.equal(hash(small.buf),hash(crop(full,box.x*2,box.y*2,256,128).buf))
  const before=officeFrame(OLD,w),b=D.umbrellaOfficeLayout(w)
  for(let y=0;y<128;y++)for(let x=0;x<256;x++){const ax=x/2+box.x,ay=y/2+box.y;if(ax>=b.x&&ax<b.x+b.width&&ay>=b.foot-16&&ay<b.foot)continue;const at=(y*256+x)*3;for(let c=0;c<3;c++)assert.equal(small.buf[at+c],before.buf[at+c])}
  const first=cache.terrain;officeFrame(D,w,cache,'nord');assert.notEqual(cache.terrain,first);const next=cache.terrain;w.res=1;officeFrame(D,w,cache,'nord');assert.notEqual(cache.terrain,next)
 }
})
test('live rendering across saved arrivals leaves world digests identical',()=>{
 const random=Math.random
 try{Math.random=()=>.25;for(const level of[8,10,13,20]){
  const a=S.generate(level,0,3),b=S.generate(level,0,3);a.res=b.res=2;const ctx=canvas(800,496).ctx,colors=P.build(themeOf('tokyo-night').theme,level)
  for(let tick=0;tick<5000&&!a.done;tick++){S.step(a);S.step(b);if(tick%37===0){D.drawUmbrellaOffice(ctx,a,colors);assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))}}
  assert.ok(a.saved>0)
 }}finally{Math.random=random}
})
test('bounded stock sheets cover normal and seasonal colours, refresh canonical evidence and validate labels',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'umbrella-office-'))
 try{const r=officeReview(out,{levels:[13]});assert.equal(r.rows.length,3);assert.equal(r.counts.length,6);assert.equal(hash(fs.readFileSync(path.join(out,r.contactSheet))),r.contactSHA256);fs.writeFileSync(path.join(out,'contact-sheet.png'),'stale');officeReview(out,{levels:[13]});assert.equal(hash(fs.readFileSync(path.join(out,'contact-sheet.png'))),r.contactSHA256);assert.match(fs.readFileSync(path.join(out,'index.html'),'utf8'),/illustrative counts/)}finally{fs.rmSync(out,{recursive:true,force:true})}
})
