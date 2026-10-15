// Action strips on deterministic terrain, with a dependency-free animated
// HTML preview. node tools/agent-art.js --base codex/cast-art --out /tmp/agent-art
import fs from "node:fs"
import path from "node:path"
import {execFileSync} from "node:child_process"
import {fileURLToPath} from "node:url"
import {performance} from "node:perf_hooks"
import {load,canvas,crop,writePNG,themeOf} from "./render.js"
import {renderer,copyPixels,doublePixels} from "./gag-art.js"
import {fixture as castFixture} from "./cast-art.js"
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const S=load("Sim.js"),P=load("Palette.js")
export const ACTIONS=["walk","fall","float-open","float","float-close","climb","dig","mine","bash","build","block","death-shot","death-splat","exit"]
const FLOAT_FALL=[2.01,2.13,2.25,2.38,2.5,2.63,2.88,3.1]
const MINE_FUSE=[90,89,88,87,86,85,84,82]
const DEATH_AGE=[0,2,4,6,8,12,18,26]
export function fixture(name,frame=0,dir=1,trait="steady",level=1){
 if(!ACTIONS.includes(name))throw Error("Unknown action "+name)
 const {w,target:p}=castFixture(["basis",level,"gun","walk",{}])
 Object.assign(w,{ticks:400,agents:[],enemies:[],hazards:[],particles:[],mines:[],enemyHatch:null,feed:[]})
 const a=Object.assign(S.spawn(w),{id:5,x:p.x,y:p.y,dir,trait,special:false,state:name,anim:frame*2,timer:frame,still:0,waitFor:0,shotFor:0,floater:false})
 w.agents=[a]
 const focus={x:a.x,y:a.y}
 if(name==="walk")a.x+=frame*0.13*dir
 if(name==="fall"||name.startsWith("float")){
  a.state=name==="float-close"?"walk":"fall";a.fall=name==="float-open"?FLOAT_FALL[frame]:8
  a.floater=name!=="fall";a.ownBrolly=a.floater
  if(name==="float-close"){a.brollyClosedAt=400;w.ticks+=frame}
  else {w.ticks+=frame*3;a.y-=1}
 }
 if(name==="climb"){
  const xx=Math.floor(a.x)+dir
  for(let y=Math.floor(a.y)-5;y<=Math.floor(a.y);y++)w.terrain[y*w.k.COLS+xx]=w.k.ROCK
 }
 if(name==="mine"){
  a.state="walk";S.plantMine(w,a);a.dir=-dir
  w.mines[0].fuse=MINE_FUSE[frame];a.mineCool=MINE_FUSE[frame]+60
  a.x-=(90-MINE_FUSE[frame])*0.13*dir
 }
 if(name==="block"){w.ticks=80+frame*8;a.id=1}
 if(name.startsWith("death"))Object.assign(a,{state:"dead",gone:true,diedAt:400,diedBy:name==="death-shot"?"red team":"splat"}),w.ticks+=DEATH_AGE[frame]
 if(name==="exit"){
  w.exit={x:p.x,y:p.y-4,w:4,h:5};a.x=p.x+0.5;a.state="saved";a.fade=frame*2
 }
 return{w,a,box:{x:Math.round(focus.x*4)-24,y:Math.round((focus.y+1)*4)-38,width:64,height:48}}
}
export function frame(D,name,i,res=2,dir=1,trait="steady",theme="tokyo-night",level=1,back=null){
 const {w,a,box}=fixture(name,i,dir,trait,level);w.res=res
 const pal=back?back.pal:P.build(themeOf(theme).theme,w.level),img=back?back.work:canvas(400*res,248*res)
 if(back)copyPixels(img,back.img,0,0);else D.drawTerrain(img.ctx,w,pal)
 D.drawActors(img.ctx,w,pal,{})
 return{img:crop(img,box.x*res,box.y*res,box.width*res,box.height*res),w,a}
}
function source(base){
 try{return execFileSync("git",["show",base+":public/agents/Draw.js"],{cwd:ROOT,maxBuffer:4<<20,stdio:["ignore","pipe","pipe"]}).toString()}
 catch(e){throw Error("Cannot read agent baseline "+base+": "+(e.code||e.status))}
}
function label(D,img,text,x,y){img.ctx.fillStyle="#e6e9ee";D.drawTransitionText(img.ctx,text.toUpperCase(),x,y,1)}
function html(names){
 const cards=names.map(n=>`<section><h2>${n}</h2><div class="pair"><div><p>Before</p><div class="flip" style="background-image:url(${n}-before-res2-strip.png)"></div></div><div><p>After</p><div class="flip" style="background-image:url(${n}-after-res2-strip.png)"></div></div></div><a href="${n}-comparison.png">Frame sheet · res 1 and 2</a></section>`).join("\n")
 return`<!doctype html><meta charset="utf-8"><title>Agent animation comparisons</title><style>body{background:#121822;color:#e6e9ee;font:16px monospace;margin:24px}section{margin-bottom:32px}h2{text-transform:uppercase}.pair{display:flex;gap:24px;flex-wrap:wrap}.flip{width:384px;height:288px;background-size:3072px 288px;image-rendering:pixelated;animation:frames 1.2s steps(8) infinite}a{color:#7aa2f7}@keyframes frames{to{background-position:-3072px 0}}@media(prefers-reduced-motion:reduce){.flip{animation:none}}</style><h1>Ordinary agents · before / after</h1><p>Eight frames of each action. Pixel scaling; static sheets linked below each pair.</p>${cards}`
}
export function run(base,out,names=ACTIONS){
 const start=performance.now(),D=load("Draw.js"),old=renderer(source(base)),sheet=canvas(1104,432*names.length,"#121822")
 for(const[row,name]of names.entries()){
  const compare=canvas(1104,432,"#121822");label(D,compare,name,552,4)
  for(const[ri,res]of[1,2].entries()){
   const {w}=fixture(name);w.res=res
   const pal=P.build(themeOf("tokyo-night").theme,w.level),back={img:canvas(400*res,248*res),work:canvas(400*res,248*res),pal}
   D.drawTerrain(back.img.ctx,w,pal)
   for(const[vi,draw]of[old,D].entries()){
   const tag=vi?"after":"before",strip=canvas(64*res*8,48*res)
   for(let i=0;i<8;i++){
    const {img}=frame(draw,name,i,res,1,"steady","tokyo-night",1,back);copyPixels(strip,img,i*img.W,0)
    writePNG(path.join(out,`${name}-${tag}-res${res}-${i}.png`),img)
   }
   writePNG(path.join(out,`${name}-${tag}-res${res}-strip.png`),strip)
   const y=28+(ri*2+vi)*100;label(D,compare,`${tag} ${res}X`,36,y+40)
   copyPixels(compare,res===1?doublePixels(strip):strip,80,y)
  }
  }
  writePNG(path.join(out,`${name}-comparison.png`),compare);copyPixels(sheet,compare,0,row*432)
 }
 writePNG(path.join(out,"contact-sheet.png"),sheet)
 fs.writeFileSync(path.join(out,"index.html"),html(names))
 const r={base,actions:names.length,frames:names.length*32,seconds:+((performance.now()-start)/1000).toFixed(2),peakRssMB:+(process.resourceUsage().maxRSS/1024).toFixed(1),manifest:names}
 fs.writeFileSync(path.join(out,"manifest.json"),JSON.stringify(r,null,2));return r
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),value=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d
 console.log(JSON.stringify(run(value("--base","codex/cast-art"),path.resolve(value("--out","/tmp/codex-agent-art/final")))))
}
