import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {load,canvas,crop,themeOf,THEMES} from '../tools/render.js'
import {renderer} from '../tools/gag-art.js'
import {duckScene,duckAdvance,duckOffsets,duckBox,duckFrame,duckStrips,DUCK_CASES} from '../tools/duck-art.js'
const S=load('Sim.js'),D=load('Draw.js'),P=load('Palette.js'),hash=x=>createHash('sha256').update(x).digest('hex')
const OLD=renderer(execFileSync('git',['show','7dbe994:public/agents/Draw.js'],{maxBuffer:4<<20}).toString())
function marks(fn){
 const ctx=canvas(400,248).ctx,calls=[];ctx.fillStyle='#123456';ctx.globalAlpha=0.35
 ctx.fillRect=(...r)=>{assert.ok(calls.length<2000);assert.ok(r.every(Number.isFinite)&&r[2]>0&&r[3]>0);assert.ok(r.every(n=>Number.isInteger(n*2)));assert.ok(ctx.globalAlpha<=0.35+1e-9);calls.push([...r,ctx.fillStyle,ctx.globalAlpha])}
 fn(ctx);assert.equal(ctx.fillStyle,'#123456');assert.equal(ctx.globalAlpha,0.35);return calls
}
function nativeAggregate(Draw){
 const sum=createHash('sha256')
 for(const level of[1,12,20]){
  const w=S.generate(level,0,3),d={x:45,y:29,at:200}
  for(const name of Object.keys(THEMES))for(const res of[undefined,1,3])for(const reduced of[false,true])for(const age of[0,2,8,10,13,16,22,30,34,47]){
   Object.assign(w,{res,reducedMotion:reduced,ticks:200+age});const img=canvas(400,248)
   Draw.drawFloorDuck(img.ctx,w,d)
   for(const dir of[-1,1])for(const hero of[false,true])Draw.drawHeldDuck(img.ctx,hero?{debugFor:30-age%30}:{explainFor:48-age},200,100,dir,res,w)
   Draw.drawGagDuck(img.ctx,50,50,1,res);sum.update(img.buf)
  }
 }
 return sum.digest('hex')
}
test('default/native and share duck pixels stay exact through drop, both held forms and all palettes',()=>assert.equal(nativeAggregate(D),nativeAggregate(OLD)))
test('natural ducks are picked up in three distinct biomes and both directions; discovery is bounded',()=>{
 const biomes=new Set(),dirs=new Set()
 for(const info of DUCK_CASES){const{w,d}=duckScene(info.level,info.seed);assert.equal(w.ticks,d.at);assert.equal(d.takenBy,-1);biomes.add(w.biome)
  duckAdvance(w,info.pickup-1);assert.equal(d.takenBy,-1);duckAdvance(w,1);const a=w.agents.find(a=>a.id===d.takenBy);assert.equal(a.explainFor,48);dirs.add(a.dir)
  duckAdvance(w,48);assert.equal(w.duck,null);assert.equal(a.explainFor,0)
 }
 assert.equal(biomes.size,3);assert.equal(dirs.size,2);assert.throws(()=>duckScene(1,3),/No natural duck/)
})
test('round toy stays inside six art pixels, mirrors exactly and preserves context and inherited fade',()=>{
 for(const age of[0,22,23,24,30,34,38,82])for(const still of[false,true])for(const nod of[false,true]){
  const a=marks(c=>D.drawListeningDuck(c,100,80,1,age,still,nod)),b=marks(c=>D.drawListeningDuck(c,100,80,-1,age,still,nod))
  assert.ok(a.length<=20);assert.equal(a.length,b.length)
  for(let i=0;i<a.length;i++){const[x,y,width,height,...paint]=a[i];assert.ok(x>=100&&y>=80&&x+width<=106&&y+height<=86);assert.deepEqual(b[i],[206-x-width,y,width,height,...paint])}
 }
})
test('floor toy faces the nearest living ordinary walker on its own floor, with a stable fallback',()=>{
 const d={x:40,y:29},a=(x,extra={})=>({x,y:29,state:'walk',...extra})
 assert.equal(D.duckFloorFacing({agents:[]},d),1)
 assert.equal(D.duckFloorFacing({agents:[a(39),a(41,{gone:true}),a(40.6,{special:'rubberduck'}),a(40.7,{state:'dead'}),a(40.8,{y:28})]},d),-1)
 assert.equal(D.duckFloorFacing({agents:[a(39),a(41)]},d),1)
 assert.equal(D.duckFloorFacing({agents:[a(10)]},d),1)
})
test('floor toy drops and settles on the ledge; reduced motion suppresses the drop and blink',()=>{
 const{w,d}=duckScene();const draw=()=>marks(c=>D.drawFloorDuck(c,w,d))
 w.ticks=d.at;const fall=draw();w.ticks=d.at+10;const bounce=draw();w.ticks=d.at+14;const rest=draw();assert.notDeepEqual(fall,bounce);assert.notDeepEqual(bounce,rest)
 for(const age of[16,32,48]){w.ticks=d.at+age;assert.deepEqual(draw(),rest)}
 const foot=(d.y+1)*4;assert.equal(Math.max(...rest.map(c=>c[1]+c[3])),foot)
 w.reducedMotion=true;w.ticks=d.at;const still=draw();for(const age of[2,10,22,34,82]){w.ticks=d.at+age;assert.deepEqual(draw(),still)}
})
test('held toy faces its speaker, nods at OH, blinks and settles without moving under reduced motion',()=>{
 const w={reducedMotion:false},draw=(age,dir=1,hero=false)=>marks(c=>D.drawHeldDuck(c,hero?{debugFor:30-age}:{explainFor:48-age},100,80,dir,2,w))
 assert.equal(draw(48).length,0)
 for(const hero of[false,true]){
  const nodAt=hero?18:30,nod=draw(nodAt,1,hero),after=draw(nodAt+8,1,hero);assert.notDeepEqual(nod,after)
  const expected=marks(c=>D.drawListeningDuck(c,108,82,-1,nodAt,false,true));assert.deepEqual(nod,expected)
  assert.notDeepEqual(draw(22,1,hero),draw(24,1,hero))
  w.reducedMotion=true;const still=draw(0,1,hero)
  for(const age of[8,16,22,nodAt,nodAt+7])assert.deepEqual(draw(age,1,hero),still)
  assert.ok(draw(0,-1,hero).every(c=>c[0]>=94&&c[0]+c[2]<=100));w.reducedMotion=false
 }
})
test('every biome/theme and page listening pose is deterministic, read-only and RNG-free',()=>{
 const random=Math.random
 try{Math.random=()=>{throw Error('render RNG')}
  for(let level=1;level<=20;level++)for(const name of Object.keys(THEMES))for(const dir of[-1,1]){
   // Generate with the saved cosmetic source; painting may not consume it.
   Math.random=random;const w=S.generate(level,0,11);Math.random=()=>{throw Error('render RNG')};w.res=2
   const pal=P.build(themeOf(name).theme,level),ag={explainFor:14,dir},before=hash(JSON.stringify(w))
   const a=marks(c=>D.drawHeldDuck(c,ag,100,80,dir,2,w));assert.deepEqual(marks(c=>D.drawHeldDuck(c,ag,100,80,dir,2,w)),a);assert.equal(hash(JSON.stringify(w)),before);assert.ok(pal.robe)
  }
 }finally{Math.random=random}
})
test('live rendered and plain colonies retain identical complete digests through natural duck conversations',()=>{
 const random=Math.random
 try{for(const{level,seed}of DUCK_CASES){Math.random=()=>0.25;const a=S.generate(level,0,seed),b=S.generate(level,0,seed);a.res=b.res=2;const ctx=canvas(800,496).ctx;let seen=false,held=false
  for(let n=0;n<1300&&!a.done;n++){S.step(a);S.step(b);if(a.duck){seen=true;if(a.duck.takenBy<0)D.drawFloorDuck(ctx,a,a.duck)}for(const ag of a.agents)if(ag.explainFor>0){held=true;D.drawHeldDuck(ctx,ag,100,80,ag.dir,2,a)}if(n%25===0)assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))}
  assert.ok(seen&&held);assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))
 }}finally{Math.random=random}
})
test('translated cached duck crops match complete frames through native/page changes and terrain edits',()=>{
 const{w,d}=duckScene(),cache={};duckAdvance(w,11)
 for(const res of[1,2])for(const edit of[false,true]){
  w.res=res;if(edit)S.setCell(w,d.x,d.y+1,w.k.EMPTY)
  const box=duckBox(w,d),img=canvas(400*res,248*res,themeOf('tokyo-night').background),pal=P.build(themeOf('tokyo-night').theme,w.level)
  D.drawTerrain(img.ctx,w,pal);D.drawActors(img.ctx,w,pal,{intro:false,feed:false})
  assert.equal(hash(duckFrame(D,w,d,cache).buf),hash(crop(img,box.x*res,box.y*res,box.width*res,box.height*res).buf))
 }
})
test('reruns refresh canonical and source-stamped contact sheets and keep natural conversation timing',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'duck-art-'))
 try{const options={base:'7dbe994',cases:[DUCK_CASES[0]]},a=duckStrips(dir,options),file=path.join(dir,a.contactSheet),expected=hash(fs.readFileSync(file))
  assert.equal(a.contactSHA256,expected);assert.equal(hash(fs.readFileSync(path.join(dir,'contact-sheet.png'))),expected)
  fs.copyFileSync(path.join(dir,'13-11-frames.png'),file);fs.copyFileSync(file,path.join(dir,'contact-sheet.png'))
  const b=duckStrips(dir,options);assert.equal(hash(fs.readFileSync(file)),expected);assert.equal(hash(fs.readFileSync(path.join(dir,'contact-sheet.png'))),expected)
  assert.equal(b.drawSHA256,hash(fs.readFileSync(new URL('../public/agents/Draw.js',import.meta.url))));assert.match(fs.readFileSync(path.join(dir,'index.html'),'utf8'),new RegExp(b.contactSheet))
  assert.deepEqual(a.records[0].offsets,duckOffsets(DUCK_CASES[0]));assert.equal(a.records[0].frames[2].explainFor,48);assert.equal(a.records[0].frames.at(-1).visible,false)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
