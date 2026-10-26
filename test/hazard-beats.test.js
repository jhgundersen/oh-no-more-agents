import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {loadCore} from '../tools/load-core.js'
import {renderer} from '../tools/gag-art.js'
import {canvas,themeOf,THEMES} from '../tools/render.js'
import {HAZARD_CASES,hazardSpecimen,advanceHazard,captureHazards} from '../tools/hazard-beat-art.js'
const D=loadCore('Draw.js'),S=loadCore('Sim.js'),P=loadCore('Palette.js'),hash=x=>createHash('sha256').update(x).digest('hex')
function picture(D,scene){const{w,pool,h}=scene,a=canvas(800,496),pal=P.build(themeOf('tokyo-night').theme,w.level);if(pool)D.drawPagePoolImpact(a.ctx,w,pal,pool);else D.drawHazardKind(a.ctx,w,pal,h);return hash(a.buf)}
test('liquid fixtures seed their cosmetic entry dust for matched captures',()=>{for(const name of['water','green-liquid'])assert.equal(hash(JSON.stringify(hazardSpecimen(name).w)),hash(JSON.stringify(hazardSpecimen(name).w)))})
test('dated splash and hazard polish remain read-only and RNG-free, bounded on a half-pixel grid',()=>{
 for(const name of HAZARD_CASES)for(const theme of Object.keys(THEMES))for(const reducedMotion of[false,true]){
  const scene=hazardSpecimen(name),{w,pool,h}=scene;w.res=2;w.reducedMotion=reducedMotion
  for(const age of[0,4,10,20,32,40,48,54,66,70]){
   advanceHazard(scene,age);const before=hash(JSON.stringify(w)),c=canvas(800,496).ctx,fill=c.fillRect.bind(c);let calls=0
   c.fillRect=(...r)=>{assert.ok(++calls<1500);assert.ok(r.every(v=>Number.isFinite(v)&&Number.isInteger(v*2)));assert.ok(r[2]>0&&r[3]>0);fill(...r)}
   const old=Math.random;try{Math.random=()=>assert.fail('hazard art RNG');const pal=P.build(themeOf(theme).theme,w.level);if(pool)D.drawPagePoolImpact(c,w,pal,pool);else D.drawHazardKind(c,w,pal,h)}finally{Math.random=old}assert.equal(hash(JSON.stringify(w)),before)
  }
 }
})
test('reduced splashes, warning forks and crusher dust keep fixed poses and restore context',()=>{
 const scene=hazardSpecimen('water'),{w,pool}=scene;w.res=2;w.reducedMotion=true;const frames=[]
 for(const age of[0,1,3,5]){w.ticks=pool.ripple+age;frames.push(picture(D,scene))}assert.equal(new Set(frames).size,1);w.ticks=pool.ripple+6;assert.notEqual(picture(D,scene),frames[0])
 const pal=P.build(themeOf('tokyo-night').theme,18),h={phase:'fire',fired:1,t:0},g={cx:60,wide:20,y1:80,x0:50,y0:50,winding:true,progress:.8},poses=[]
 const draw=fn=>{const a=canvas(800,496),c=a.ctx;c.fillStyle='#123456';c.globalAlpha=.35;fn(c);assert.equal(c.fillStyle,'#123456');assert.equal(c.globalAlpha,.35);return hash(a.buf)}
 for(const t of[0,6,16,29]){h.t=t;poses.push(draw(c=>D.drawCrusherLandingDust(c,w,pal,h,g)))}assert.equal(new Set(poses).size,1)
 w.terrain.fill(0);const warns=[];for(const t of[10,20,30,40]){h.t=t;warns.push(draw(c=>D.drawLightningPrelude(c,w,h,g)))}assert.equal(new Set(warns).size,1)
})
test('native and share retain the previous pool, lightning and crusher pixels',()=>{
 const old=renderer(execFileSync('git',['show','d302dfff469e6c9733b9afb192201bffdb6e3345:public/agents/Draw.js'],{encoding:'utf8'}))
 for(const name of HAZARD_CASES)for(const res of[undefined,1,3]){const scene=hazardSpecimen(name);scene.w.res=res;for(const age of[0,4,20,40,48,60,70]){advanceHazard(scene,age);assert.equal(picture(D,scene),picture(old,scene))}}
})
test('rendering during live liquid and hazard play leaves complete simulation digests unchanged',()=>{
 for(const level of[2,18,20,25]){
  const a=S.generate(level,0,3),b=S.generate(level,0,3),pal=P.build(themeOf('tokyo-night').theme,level);a.res=b.res=2;let seed=113
  for(let i=0;i<120;i++){const old=Math.random,start=seed;try{Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);S.step(a);const end=seed;seed=start;S.step(b);assert.equal(seed,end)}finally{Math.random=old}const c=canvas(800,496).ctx;D.drawTerrain(c,a,pal);D.drawActors(c,a,pal,{intro:false});assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))}
 }
})
test('all four hazard fixtures capture desktop and 390 px pages without errors',{timeout:30000},async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'hazard-beats-'));try{const r=await captureHazards(out,{frames:[4,40,48]});assert.deepEqual(r.errors,[]);assert.equal(r.records.length,8);assert.ok(r.records.filter(r=>r.width===390).every(r=>r.clip.width<=390))}finally{fs.rmSync(out,{recursive:true,force:true})}
})
