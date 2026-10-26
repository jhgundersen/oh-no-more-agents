import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {loadCore} from '../tools/load-core.js'
import {renderer} from '../tools/gag-art.js'
import {canvas,THEMES,themeOf} from '../tools/render.js'
import {enemySpecimen,poseEnemies,captureEnemies} from '../tools/enemy-life-art.js'
const D=loadCore('Draw.js'),S=loadCore('Sim.js'),P=loadCore('Palette.js'),hash=x=>createHash('sha256').update(x).digest('hex')
function image(D,w,en,pal){const a=canvas(1200,744);D.drawEnemy(a.ctx,w,pal,en,{});D.drawEnemyDefeat(a.ctx,w,pal,en);return hash(a.buf)}
test('enemy life is deterministic, read-only, RNG-free and bounded across kinds and palettes',()=>{
 const w=enemySpecimen();w.res=2;const old=Math.random
 try{Math.random=()=>assert.fail('enemy art RNG')
 for(const name of Object.keys(THEMES))for(const kind of['gun','sniper','bouncer','operator','drone','xeno','harpoon'])for(const dir of[-1,1])for(const phase of['idle','aim','down'])for(const tick of[0,6,12,20,30,40]){
  poseEnemies(w,{phase,tick});const en={...w.enemies[0],kind,dir,hurtAt:w.ticks-6},pal=P.build(themeOf(name).theme,13),before=hash(JSON.stringify(w));let calls=0
  const a=canvas(800,496),fill=a.ctx.fillRect.bind(a.ctx);a.ctx.fillRect=(...p)=>{assert.ok(++calls<1500);assert.ok(p.every(Number.isFinite));fill(...p)}
  D.drawEnemy(a.ctx,w,pal,en,{});D.drawEnemyDefeat(a.ctx,w,pal,en);assert.equal(hash(JSON.stringify(w)),before)
 }
 }finally{Math.random=old}
})
test('preparations use actual aim timers; idle, stagger and guard flex have fixed reduced poses',()=>{
 const w=enemySpecimen(),en=w.enemies[1];w.res=2;en.state='aim';en.timer=0
 assert.ok(D.pageEnemyPose(w,en).x===0);en.timer=4;assert.equal(D.pageEnemyPose(w,en).x,-2);en.timer=7;assert.equal(D.pageEnemyPose(w,en).x,-.5)
 en.state='recover';en.hurtAt=400;w.ticks=403;assert.equal(D.pageEnemyPose(w,en).x,-1)
 en.state='camp';const poses=[];for(const t of[400,430,460,490]){w.ticks=t;poses.push(D.pageEnemyPose(w,en).y)}assert.ok(new Set(poses).size>1)
 en.boss=true;en.state='aim';assert.deepEqual(D.pageEnemyPose(w,en),{x:0,y:0});en.boss=false
 w.reducedMotion=true;for(const state of['aim','recover','camp','operate']){en.state=state;assert.deepEqual(D.pageEnemyPose(w,en),{x:0,y:0})}
 const pal=P.build(themeOf('tokyo-night').theme,13);const frames=[]
 for(const tick of[0,10,20,30]){poseEnemies(w,{phase:'down',tick});frames.push(image(D,w,w.enemies[0],pal))}assert.equal(new Set(frames).size,1)
 for(const res of[1,3]){w.res=res;en.state='aim';assert.deepEqual(D.pageEnemyPose(w,en),{x:0,y:0})}
})
test('native and share enemy/defeat frames retain their previous pixels',()=>{
 const old=renderer(execFileSync('git',['show','9133313:public/agents/Draw.js'],{encoding:'utf8'})),w=enemySpecimen(),pal=P.build(themeOf('tokyo-night').theme,13)
 for(const res of[undefined,1,3])for(const phase of['idle','aim','down'])for(const tick of[0,6,12,20,30,40]){w.res=res;poseEnemies(w,{phase,tick});for(const en of w.enemies)assert.equal(image(D,w,en,pal),image(old,w,en,pal))}
})
test('drawing alongside live enemy simulation leaves complete world digests unchanged',()=>{
 const a=S.generate(13,0,3),b=S.generate(13,0,3),pal=P.build(themeOf('tokyo-night').theme,13);a.res=b.res=2;let seed=45
 for(let i=0;i<180;i++){
  const old=Math.random,start=seed;try{Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);S.step(a);const end=seed;seed=start;S.step(b);assert.equal(seed,end)}finally{Math.random=old}
  const c=canvas(800,496).ctx;D.drawTerrain(c,a,pal);D.drawActors(c,a,pal,{intro:false});assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))
 }
})
test('desktop and 390 px enemy captures render without errors',{timeout:30000},async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'enemy-life-'));try{const r=await captureEnemies(out,{frames:[{name:'idle-2',phase:'idle',tick:18,ms:0},{name:'aim-2',phase:'aim',tick:4,ms:100},{name:'down-5',phase:'down',tick:10,ms:200}]});assert.deepEqual(r.errors,[]);assert.equal(r.records.length,2);assert.ok(r.records[1].clip.width<=390)}finally{fs.rmSync(out,{recursive:true,force:true})}
})
