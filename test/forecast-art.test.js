import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {load,canvas,themeOf,THEMES,writePNG} from '../tools/render.js'
import {renderer} from '../tools/gag-art.js'
const S=load('Sim.js'),D=load('Draw.js'),P=load('Palette.js'),O=load('Outcome.js'),hash=x=>createHash('sha256').update(x).digest('hex'),OLD=renderer(execFileSync('git',['show','5ce3368:public/agents/Draw.js'],{maxBuffer:4<<20}).toString())
test('forecast copy wraps at word boundaries, retains both supplied lines, and fits the existing ROM including a local percent glyph',()=>{
 for(let level=1;level<=400;level++){
  const w=S.generate(level,0,3),before=JSON.stringify(w),raw=O.forecastLines(w),copy=D.levelForecastCopy(raw)
  assert.equal(copy.rows.join(' '),raw.join(' '));assert.ok(copy.width<=351);assert.equal(copy.height,36)
  for(const line of copy.rows)for(const ch of line)assert.ok(ch==='%'||D.TRANSITION_GLYPHS[ch],ch)
  w.skills.floater=0;const none=D.levelForecastCopy(O.forecastLines(w));assert.ok(none.rows.every(row=>row.length<=56));assert.ok(none.height<=49)
  w.skills.floater=JSON.parse(before).skills.floater;assert.equal(JSON.stringify(w),before)
 }
 const word='A'.repeat(120),long=D.levelForecastCopy([word]);assert.equal(long.rows.join(''),word);assert.ok(long.rows.every(row=>row.length<=56))
})
test('four hundred layouts clear hatch, exit and title; the same snapshot chooses the same pocket',()=>{
 for(let level=1;level<=400;level++){
  const w=S.generate(level,0,3),before=hash(JSON.stringify(w)),title=D.levelTitleLayout(w)
  for(const noBrollies of[false,true]){
   const raw=O.forecastLines(noBrollies?{...w,skills:{...w.skills,floater:0}}:w),copy=D.levelForecastCopy(raw),r=D.levelForecastLayout(w,copy,title)
   assert.ok(r&&r.x>=14&&r.x+r.width<=386&&r.y>=48&&r.y+r.height<=236,'level '+level)
   for(const keep of[...D.levelTitleKeepClear(w),{x:title.x-4,y:title.y-4,width:title.width+8,height:title.height+8}])assert.equal(D.levelTitleOverlap(r,keep),0,'level '+level)
   assert.deepEqual(D.levelForecastLayout(w,copy,title),r)
  }
  assert.equal(hash(JSON.stringify(w)),before)
 }
})
test('forecast paint is bounded, crisp, read-only, theme aware, and restores caller alpha and colour',()=>{
 const random=Math.random
 try{Math.random=()=>{throw Error('render entropy')}
 for(let level=1;level<=20;level++)for(const name of Object.keys(THEMES)){
  const w=S.generate(level,0,3),copy=D.levelForecastCopy(O.forecastLines(w)),r=D.levelForecastLayout(w,copy,D.levelTitleLayout(w)),pal=P.build(themeOf(name).theme,level),before=hash(JSON.stringify(w)),img=canvas(800,496),ctx=img.ctx,calls=[]
  ctx.fillStyle='#123456';ctx.globalAlpha=.35;ctx.fillRect=(...p)=>{assert.ok(calls.length<2500);assert.ok(p.every(n=>Number.isInteger(n*2)));assert.ok(p[2]>0&&p[3]>0);assert.ok(ctx.globalAlpha<=.35);assert.ok(p[0]>=r.x&&p[0]+p[2]<=r.x+r.width&&p[1]>=r.y&&p[1]+p[3]<=r.y+r.height);calls.push(p)}
  D.drawLevelForecastCard(ctx,w,pal,copy,r);assert.ok(calls.length>100);assert.equal(ctx.fillStyle,'#123456');assert.equal(ctx.globalAlpha,.35);assert.equal(hash(JSON.stringify(w)),before)
  const n=calls.length;for(const over of[{done:true},{replaying:true}])D.drawLevelForecastCard(ctx,{...w,...over},pal,copy,r);D.drawLevelForecastCard(ctx,w,pal,copy,null);assert.equal(calls.length,n)
 }
 }finally{Math.random=random}
})
test('the compact title keeps its exact old pixels and percentage support is local to forecasts',()=>{
 for(const level of[1,9,13,20,50])for(const name of Object.keys(THEMES)){
  const w=S.generate(level,0,3),pal=P.build(themeOf(name).theme,level),pair=[OLD,D].map(draw=>{const img=canvas(400,248);img.ctx.globalAlpha=.6;draw.drawLevelTitleCard(img.ctx,w,pal,(level-1)%20);return hash(img.buf)});assert.equal(pair[0],pair[1])
 }
 assert.equal(D.TRANSITION_GLYPHS['%'],undefined)
 const ctx=canvas(40,20).ctx,calls=[];ctx.fillRect=(...p)=>calls.push(p);D.drawLevelForecastLine(ctx,'%',0,0);assert.equal(calls.length,7);assert.ok(calls.every(r=>r[2]===1.5&&r[3]===2))
})
test('forecast drawing through the opening leaves live-world digests identical at both resolutions',()=>{
 const random=Math.random
 try{Math.random=()=>.25;for(const level of[9,13,20,55])for(const res of[1,2]){
  const a=S.generate(level,0,3),b=S.generate(level,0,3);a.res=b.res=res;const copy=D.levelForecastCopy(O.forecastLines(a)),r=D.levelForecastLayout(a,copy,D.levelTitleLayout(a)),ctx=canvas(400*res,248*res).ctx,pal=P.build(themeOf('tokyo-night').theme,level)
  for(let tick=0;tick<240;tick++){S.step(a);S.step(b);if(tick%10===0)D.drawLevelForecastCard(ctx,a,pal,copy,r)}assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))
 }}finally{Math.random=random}
})
