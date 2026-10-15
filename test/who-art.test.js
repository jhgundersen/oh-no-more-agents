import test from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {load,canvas,themeOf,THEMES} from '../tools/render.js'
import {renderer} from '../tools/gag-art.js'
const S=load('Sim.js'),D=load('Draw.js'),P=load('Palette.js'),OLD=renderer(execFileSync('git',['show','a09ddc0:public/agents/Draw.js'],{maxBuffer:4<<20}).toString()),hash=x=>createHash('sha256').update(x).digest('hex')
function scene(level=12,tick=400){const w=S.generate(level,0,3);w.res=2;for(let n=0;n<tick&&!w.done;n++)S.step(w);return w}
function collect(w){const tags=[],ctx=canvas(800,496).ctx,pal=P.build(themeOf('tokyo-night').theme,w.level);for(const a of w.agents)if(!a.gone)D.drawAgent(ctx,w,pal,a,{labels:true,whoLabels:tags});return tags}
function pixels(draw,w,labels){const img=canvas(400*(w.res||1),248*(w.res||1)),text=[];img.ctx.fillText=(...a)=>text.push([img.ctx.font,img.ctx.fillStyle,img.ctx.globalAlpha,...a]);const pal=P.build(themeOf('tokyo-night').theme,w.level);draw.drawActors(img.ctx,w,pal,{intro:false,feed:false,labels});return hash(Buffer.concat([img.buf,Buffer.from(JSON.stringify(text))]))}
test('native, default, share and WHO-off rendering retain pixels and native text calls',()=>{
 for(const level of[1,10,12,20]){const w=scene(level);for(const res of[undefined,1,2,3])for(const labels of[false,true]){if(res===2&&labels)continue;w.res=res;assert.equal(pixels(D,w,labels),pixels(OLD,w,labels))}}
})
test('all twenty biomes and five themes use finite crisp glyphs without changing world or caller options',()=>{
 let visible=0
 for(let level=1;level<=20;level++){
  const w=scene(level),tags=collect(w),before=hash(JSON.stringify(w)),layout=D.whoLabelLayout(w,tags),keep=D.whoKeepClear(w,tags)
  assert.deepEqual(D.whoLabelLayout(w,tags),layout);assert.equal(hash(JSON.stringify(w)),before)
  for(const{tag,rect:r}of layout){visible++;assert.ok(D.whoFits(r,keep));assert.ok(r.x>=6&&r.x+r.width<=394&&r.y>=w.k.SKY*4+1&&r.y+r.height<=248);for(const c of tag.text)assert.ok(D.TRANSITION_GLYPHS[c]);keep.push(r)}
  for(const name of Object.keys(THEMES)){
   const ctx=canvas(800,496).ctx,opts=Object.freeze({labels:true}),pal=P.build(themeOf(name).theme,level);let calls=0
   const fill=ctx.fillRect.bind(ctx);ctx.fillRect=(...r)=>{assert.ok(++calls<20000);assert.ok(r.every(Number.isFinite));fill(...r)}
   D.drawActorColony(ctx,w,pal,opts);assert.equal(hash(JSON.stringify(w)),before)
  }
 }
 assert.ok(visible>75,'useful tags remain visible across the biome audit')
})
test('crowded queues are bounded, non-overlapping, deterministic, and favour hero/action tags',()=>{
 const w=scene(),ag=w.agents.find(a=>!a.gone),tags=Array.from({length:30},(_,id)=>({text:'STEADY',x:200,y:100,width:29,height:9,priority:id===29?2:0,alpha:1,ag:{...ag,id}}))
 const layout=D.whoLabelLayout(w,tags);assert.ok(layout.length>0&&layout.length<30);assert.equal(layout[0].tag.ag.id,29)
 for(let i=0;i<layout.length;i++)for(let j=i+1;j<layout.length;j++)assert.equal(D.levelTitleOverlap(layout[i].rect,layout[j].rect),0)
 const a=D.whoCandidate(w,{...tags[0],x:-100,y:-100},0,-1),b=D.whoCandidate(w,{...tags[0],x:900,y:900},2,1);assert.equal(a.x,6);assert.equal(b.x+b.width,394)
 assert.equal(D.whoFits({x:0,y:0,width:1,height:1},[{x:0,y:0,width:2,height:2}]),false)
})
test('float canopies, live speech, hazards, enemy tells, hatch, exit and rate-limit sign reserve space',()=>{
 const w=scene(),tags=collect(w),tag=tags[0];assert.ok(tag)
 tag.ag.state='fall';tag.ag.floater=true;tag.ag.fall=5;assert.equal(D.whoBodyRect(w,tag).height,36)
 tag.ag.wonAt=w.ticks;tag.ag.state='walk';assert.ok(D.whoSpeechRect(w,tag))
 const keep=D.whoKeepClear(w,tags);assert.ok(keep.length>=tags.length+3)
 const q=D.whoSpeechRect(w,tag);assert.ok(q.width>5&&q.height===15)
 for(const item of D.whoLabelLayout(w,tags))assert.equal(D.levelTitleOverlap(item.rect,q),0)
})
test('direct agent labels preserve inherited fade and drawing context; saved and empty labels emit none',()=>{
 const w=scene(),ag=w.agents.find(a=>!a.gone),ctx=canvas(800,496).ctx;ctx.fillStyle='#123456';ctx.globalAlpha=.4;let max=0,count=0
 ctx.fillRect=()=>{count++;max=Math.max(max,ctx.globalAlpha)}
 D.drawAgentLabel(ctx,w,{},ag,180,100,'walk',{labels:true});assert.ok(count>0);assert.equal(max,.4);assert.equal(ctx.fillStyle,'#123456');assert.equal(ctx.globalAlpha,.4)
 count=0;D.drawAgentLabel(ctx,w,{},ag,180,100,'saved',{labels:true});assert.equal(count,0)
 const tags=[];D.drawAgentLabel(ctx,w,{}, {...ag,special:null,trait:''},180,100,'walk',{labels:true,whoLabels:tags});assert.equal(tags.length,0)
})
test('rendering WHO during a live run never changes simulation digests, including motion preferences',()=>{
 const random=Math.random;Math.random=()=>.25
 try{const a=S.generate(12,0,3),b=S.generate(12,0,3);a.res=b.res=2;const ctx=canvas(800,496).ctx,pal=P.build(themeOf('tokyo-night').theme,12)
 for(let tick=0;tick<650&&!a.done;tick++){S.step(a);S.step(b);if(tick%10===0){a.reducedMotion=b.reducedMotion=tick%20===0;D.drawActorColony(ctx,a,pal,{labels:true});assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))}}
 }finally{Math.random=random}
})

test('browser review captures real labels at desktop and phone size and refreshes canonical evidence', {timeout:60000},async()=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path'),{whoScreens,whoContact}=await import('../tools/who-art.js'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'who-art-'))
 try{
  const result=await whoScreens(path.join(dir,'views'),{cases:[{level:12}]});assert.equal(result.records.length,2);assert.deepEqual(result.errors,[])
  for(const row of result.records){assert.equal(row.tick,400);assert.equal(row.who,'true');assert.equal(row.pageWidth,row.width);assert.equal(row.fontReady,'loaded');for(const[file,digest]of Object.entries(row.images))assert.equal(hash(fs.readFileSync(path.join(dir,'views',file))),digest)}
  const out=path.join(dir,'review'),a=await whoContact(out,path.join(dir,'views'),path.join(dir,'views'));assert.equal(a.cases.length,2);assert.equal(hash(fs.readFileSync(path.join(out,a.contactSheet))),a.contactSHA256)
  fs.writeFileSync(path.join(out,'contact-sheet.png'),'stale');const b=await whoContact(out,path.join(dir,'views'),path.join(dir,'views'));assert.equal(hash(fs.readFileSync(path.join(out,'contact-sheet.png'))),b.contactSHA256);assert.equal(a.contactSHA256,b.contactSHA256)
  assert.match(fs.readFileSync(path.join(out,'index.html'),'utf8'),new RegExp(b.contactSheet))
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})

test('untagged homeward/brawl poses and enemy speech cannot be painted over',()=>{
 const w=scene(),tags=collect(w),a=w.agents.find(a=>!a.gone);assert.ok(a)
 const untagged={...a,id:999,state:'brawl'};w.agents.push(untagged)
 const bodies=D.whoOtherBodies(w,tags);assert.ok(bodies.some(r=>r.x===D.pageAgentX(w,untagged)-4))
 const en={...w.enemies[0],x:50,y:30,dir:1,anim:0,kind:'bouncer',gone:false,state:'walk',threwAt:w.ticks};w.enemies.push(en)
 const q=D.whoBubbleRect(w,D.enemyQuipFor(w,en),200,124-16-3),keep=D.whoKeepClear(w,tags)
 assert.ok(keep.some(r=>JSON.stringify(r)===JSON.stringify(q)))
 for(const item of D.whoLabelLayout(w,tags))assert.equal(D.levelTitleOverlap(item.rect,q),0)
 const conflict=D.whoBubbleRect(w,{text:'<<<<<<<',at:w.ticks},200,100);assert.ok(Number.isFinite(conflict.x)&&conflict.width===37)
})

test('clearance contains every real falling, folding and parrying canopy pixel in all seasons and directions',()=>{
 const w=scene(),pal=P.build(themeOf('tokyo-night').theme,12),source=w.agents.find(a=>!a.gone)
 for(const season of[null,{bat:'#845b9f',batEvery:1},{candy:'#d94d59',candyEvery:1}])for(const dir of[-1,1])for(const reduced of[false,true])for(let age=0;age<8;age++)for(const mode of['fall','fold','parry']){
  Object.assign(w,{season,reducedMotion:reduced,ticks:400+age})
  const ag={...source,dir,state:mode==='fall'?'fall':'walk',floater:true,fall:5,ownBrolly:true,brollyClosedAt:mode==='fold'?400:undefined,brollyFor:mode==='parry'?24-age:0,brollyDir:dir},tag={ag,x:104,y:100},r=D.whoBodyRect(w,tag),ctx=canvas(400,248).ctx;let count=0
  ctx.fillRect=(x,y,width,height)=>{count++;assert.ok(count<2000);assert.ok(x>=r.x&&y>=r.y&&x+width<=r.x+r.width&&y+height<=r.y+r.height,JSON.stringify({season,mode,dir,age,r,pixel:[x,y,width,height]}))}
  D.drawUmbrella(ctx,w,pal,ag,100,100,ag.state);assert.ok(count>0)
  const layout=D.whoLabelLayout(w,[{...tag,text:'STEADY',width:29,height:9,priority:0,alpha:1}]);for(const item of layout)assert.equal(D.levelTitleOverlap(item.rect,r),0)
 }
 const bomb=D.whoBodyRect(w,{ag:{...source,state:'bomb'},x:104,y:100});assert.ok(bomb.y<=87&&bomb.y+bomb.height>=118)
 assert.equal(D.whoRaisedCanopy(w,{...source,state:'dig',brollyFor:0}),false)
 const zip=D.whoBodyRect(w,{ag:{...source,state:'zip',brollyFor:0},x:104,y:100});assert.equal(zip.y,92)
})
