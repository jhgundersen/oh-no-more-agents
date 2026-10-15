import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {load,canvas,crop,themeOf,THEMES} from '../tools/render.js'
import {renderer} from '../tools/gag-art.js'
import {thawScene,thawAdvance,thawBox,thawFrame,thawReview,THAW_CASES,THAW_PHASES} from '../tools/thaw-art.js'
const S=load('Sim.js'),D=load('Draw.js'),P=load('Palette.js'),OLD=renderer(execFileSync('git',['show','44ef025:public/agents/Draw.js'],{maxBuffer:4<<20}).toString()),hash=x=>createHash('sha256').update(x).digest('hex')
function marks(fn){const ctx=canvas(64,64).ctx,calls=[];ctx.fillStyle='#123456';ctx.globalAlpha=.45;ctx.fillRect=(...r)=>{assert.ok(calls.length<200);assert.ok(r.every(Number.isFinite)&&r[2]>0&&r[3]>0);assert.ok(r.every(n=>Number.isInteger(n*2)));assert.ok(ctx.globalAlpha>=0&&ctx.globalAlpha<=1);calls.push([...r,ctx.fillStyle,ctx.globalAlpha])};fn(ctx);assert.equal(ctx.fillStyle,'#123456');assert.equal(ctx.globalAlpha,.45);return calls}
function inAir(w,calls){for(const[x,y,width,height]of calls){assert.ok(width<=4&&height<=4);for(let yy=y;yy<y+height;yy+=.5)for(let xx=x;xx<x+width;xx+=.5)assert.ok(D.mechanismAir(w,xx,yy))}}
test('natural rescue scenes start before real releases, add a live colleague, and are bounded',()=>{
 for(const level of THAW_CASES){const{w,f,thawTick}=thawScene(level),count=w.released,total=w.toRelease;assert.equal(w.ticks,thawTick-8);assert.equal(f.thawedAt,-1);thawAdvance(w,8);assert.equal(f.thawedAt,thawTick);assert.ok(w.released>=count+1);assert.equal(w.toRelease,total+1);assert.ok(w.agents.some(a=>Math.abs(a.x-f.x-.5)<1&&a.y===f.y))}
 assert.throws(()=>thawScene(1),/No frozen colleagues/);assert.throws(()=>thawScene(26),/No natural thaw/)
})
test('native/default/share frozen colleagues and thaw retain exact old pixels in every theme and season',()=>{
 const before=createHash('sha256'),after=createHash('sha256')
 for(const level of THAW_CASES){const{w,f}=thawScene(level),cx=(f.x+.5)*4,base=(f.y+1)*4
  for(const res of[undefined,1,3])for(const season of[undefined,'halloween','christmas'])for(const theme of Object.keys(THEMES))for(const age of[-1,0,4,12,29,30]){
   w.res=res;w.season=season;f.thawedAt=age<0?-1:w.ticks-age
   for(const[draw,sum]of[[OLD,before],[D,after]]){const img=canvas(64*(res||1),64*(res||1));img.ctx.setTransform(res||1,0,0,res||1,(32-cx)*(res||1),(40-base)*(res||1));draw.drawFrozen(img.ctx,w,P.build(themeOf(theme).theme,level),f);sum.update(img.buf)}
  }
 }
 assert.equal(before.digest('hex'),after.digest('hex'))
})
test('the page portrait is centred, half-pixel aligned, deterministic, read-only and keeps its context',()=>{
 const random=Math.random
 try{for(const level of THAW_CASES){const{w,f}=thawScene(level),cx=(f.x+.5)*4,base=(f.y+1)*4
 for(const theme of Object.keys(THEMES))for(const season of[undefined,'halloween','christmas'])for(const dir of[-1,1]){
  w.season=season;f.dir=dir;const pal=P.build(themeOf(theme).theme,level),before=hash(JSON.stringify(w));Math.random=()=>{throw Error('render entropy')};const a=marks(c=>D.drawFrozen(c,w,pal,f)),b=marks(c=>D.drawFrozen(c,w,pal,f));assert.deepEqual(a,b);assert.ok(a.length>30)
  for(const[x,y,width,height]of a){assert.ok(x>=cx-6&&x+width<=cx+6);assert.ok(y>=base-22&&y+height<=base)}
  assert.ok(a.filter(c=>c[4]===pal.skin).length>=3,'face and palms remain warm');assert.ok(!a.some(c=>c[4]==='#b8860b'),'a stand-in never owns the sweepstake coin');assert.equal(hash(JSON.stringify(w)),before);const view=new Proxy(w,{set(){throw Error('world write')},defineProperty(){throw Error('world define')}});marks(c=>D.drawFrozen(c,view,pal,f));Math.random=random
 }
 }}finally{Math.random=random}
})
test('normal breath changes softly; reduced-motion portraits hold still and thaw only fades in place',()=>{
 const{w,f}=thawScene(),pal=P.build(themeOf('tokyo-night').theme,w.level);w.ticks=180-f.x*13%180;const a=marks(c=>D.drawFrozen(c,w,pal,f));w.ticks+=12;assert.notDeepEqual(marks(c=>D.drawFrozen(c,w,pal,f)),a)
 w.reducedMotion=true;const still=marks(c=>D.drawFrozen(c,w,pal,f));w.ticks+=179;assert.deepEqual(marks(c=>D.drawFrozen(c,w,pal,f)),still)
 const live=thawScene();thawAdvance(live.w,8);live.w.reducedMotion=true;
 const remnant=marks(c=>D.drawPageThaw(c,live.w,pal,live.f,0));assert.ok(remnant.length>0)
 for(const age of[1,10,29]){const next=marks(c=>D.drawPageThaw(c,live.w,pal,live.f,age));assert.deepEqual(next.map(c=>c.slice(0,5)),remnant.map(c=>c.slice(0,5)));assert.ok(next.every((c,i)=>c[5]<remnant[i][5]))}
})
test('shards and melt stay inside air, remain small, expire, and respect inherited opacity',()=>{
 for(const level of THAW_CASES){const{w,f}=thawScene(level);thawAdvance(w,8);const pal=P.build(themeOf('tokyo-night').theme,level),cx=(f.x+.5)*4,base=(f.y+1)*4
 for(const reduced of[false,true])for(const age of[-1,0,1,4,8,12,18,29,30,100]){
  w.reducedMotion=reduced;const before=hash(JSON.stringify(w)),calls=marks(c=>D.drawPageThaw(c,w,pal,f,age));assert.equal(calls.length>0,age>=0&&age<30);inAir(w,calls)
  for(const[x,y,width,height,,alpha]of calls){assert.ok(x>=cx-23&&x+width<=cx+23&&y>=base-25&&y+height<=base);assert.ok(alpha<=.45)}assert.equal(hash(JSON.stringify(w)),before)
 }
 w.terrain.fill(w.k.ROCK);assert.equal(marks(c=>D.drawPageThaw(c,w,pal,f,5)).length,0)
 }
})
test('direct crops match full frames through release, resolution, palette and terrain-version changes',()=>{
 const{w,f}=thawScene(),cache={};const a=thawFrame(D,w,f,cache),box=thawBox(w,f),full=canvas(800,496),pal=P.build(themeOf('tokyo-night').theme,w.level);D.drawTerrain(full.ctx,w,pal);D.drawActors(full.ctx,w,pal,{intro:false,feed:false});assert.equal(hash(a.buf),hash(crop(full,box.x*2,box.y*2,192,128).buf))
 let previous=cache.terrain;thawAdvance(w,8);thawFrame(D,w,f,cache);assert.notEqual(cache.terrain,previous);previous=cache.terrain;w.res=1;thawFrame(D,w,f,cache);assert.notEqual(cache.terrain,previous);previous=cache.terrain;thawFrame(D,w,f,cache,'nord');assert.notEqual(cache.terrain,previous)
})
test('drawing between live steps preserves complete world digests through the rescue',()=>{
 const random=Math.random
 try{Math.random=()=>.25;for(const level of THAW_CASES){const a=S.generate(level,0,3),b=S.generate(level,0,3);a.res=b.res=2;const ctx=canvas(800,496).ctx,pal=P.build(themeOf('tokyo-night').theme,level)
 for(let tick=0;tick<750&&!a.done;tick++){S.step(a);S.step(b);if(tick%11===0){for(const f of a.frozen)D.drawFrozen(ctx,a,pal,f);assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))}}assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)));assert.ok(a.frozen.some(f=>f.thawedAt>=0))}
 }finally{Math.random=random}
})
test('natural-event review emits native/page strips, real ticks and refreshed canonical hashes',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'thaw-art-'))
 try{fs.writeFileSync(path.join(out,'old-stale.png'),'stale');const r=thawReview(out,{levels:[6]});assert.equal(r.rows.length,1);assert.equal(r.rows[0].records.length,THAW_PHASES.length);assert.equal(r.rows[0].records[1].thawedAt,r.rows[0].thawTick);assert.ok(!r.images['old-stale.png']);for(const[file,digest]of Object.entries(r.images))assert.equal(hash(fs.readFileSync(path.join(out,file))),digest);fs.writeFileSync(path.join(out,'contact-sheet.png'),'stale');const next=thawReview(out,{levels:[6]});assert.equal(hash(fs.readFileSync(path.join(out,'contact-sheet.png'))),next.contactSHA256);assert.match(fs.readFileSync(path.join(out,'index.html'),'utf8'),/prefers-reduced-motion/)}finally{fs.rmSync(out,{recursive:true,force:true})}
})
