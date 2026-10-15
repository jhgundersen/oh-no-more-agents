// Bounded action fixtures on real seeded terrain: node tools/cast-art.js
// --base codex/christmas-art --out /tmp/codex-cast-art/final
import fs from "node:fs"
import path from "node:path"
import {execFileSync} from "node:child_process"
import {fileURLToPath} from "node:url"
import {performance} from "node:perf_hooks"
import {load,canvas,crop,writePNG,themeOf} from "./render.js"
import {renderer,copyPixels,doublePixels,sheetRow} from "./gag-art.js"
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..")
const S=load("Sim.js"),P=load("Palette.js")
export const CASES=[
 ["red-team-aim",6,"gun","aim",{timer:6}],
 ["red-team-fire",6,"gun","reload",{shotFor:6}],
 ["red-team-jet",17,"gun","jet",{anim:6}],
 ["sniper-aim",18,"sniper","aim",{timer:26}],
 ["sniper-fire",18,"sniper","reload",{shotFor:5}],
 ["ricochet",17,"gun","dead",{gone:true,diedAt:398,diedBy:"ricochet"}],
 ["moderator-patrol",7,"gun","walk",{boss:true,hp:3}],
 ["moderator-aim",7,"gun","aim",{boss:true,hp:3,timer:6}],
 ["moderator-fire",7,"gun","reload",{boss:true,hp:3,shotFor:7}],
 ["moderator-jet",7,"gun","jet",{boss:true,hp:3,anim:6}],
 ["moderator-hit",7,"gun","recover",{boss:true,hp:2,hurtAt:391}],
 ["moderator-down",7,"gun","dead",{boss:true,gone:true,hp:0,diedAt:385}],
 ["bouncer-stop",13,"bouncer","walk",{hp:3,near:true}],
 ["bouncer-throw",13,"bouncer","walk",{hp:3,threwAt:398}],
 ["head-bouncer-stop",14,"bouncer","walk",{boss:true,hp:5,near:true}],
 ["head-bouncer-hit",14,"bouncer","recover",{boss:true,hp:3,hurtAt:391}],
 ["backup-call",125,"gun","walk",{backup:true}],
 ["backup-arrives",125,"gun","jet",{arrival:true}],
 ["cloud-provider-ready",61,null,"walk",{provider:true,cool:8}],
 ["cloud-provider-handout",61,null,"walk",{provider:true,provisionFor:20,cool:116}],
 ["cloud-provider-descent",61,null,"fall",{provider:true,height:true}],
 ["drone-lock",6,"drone","hover",{}],
 ["operator-deploy",6,"operator","operate",{timer:170}],
 ["xeno-pursuit",7,"xeno","walk",{}],
 ["harpoon-aim",10,"harpoon","aim",{timer:36}]
]
function strip(w,c,x){
 for(let xx=x;xx<x+19;xx++)for(let yy=c.floorY-6;yy<=c.floorY;yy++)
  if((w.terrain[yy*w.k.COLS+xx]===w.k.EMPTY)!==(yy<c.floorY))return false
 return true
}
function spot(w){
 for(const c of w.corridors)for(let x=c.x0+3;x<c.x1-20;x++)if(strip(w,c,x))return{x:x+5,y:c.floorY-1}
 throw Error("No clear action fixture floor: "+w.level)
}
function agent(w,p,fields={}){
 const a=Object.assign(S.spawn(w),{...p,dir:-1,state:"walk",trait:"steady",special:false,anim:0,still:0},fields)
 w.agents.push(a);return a
}
function airSpot(w){
 for(let y=w.k.SKY+2;y<w.k.ROWS-12;y++)for(let x=3;x<w.k.COLS-9;x++){
  let clear=true
  for(let yy=y;yy<y+10;yy++)for(let xx=x;xx<x+8;xx++)if(w.terrain[yy*w.k.COLS+xx]!==w.k.EMPTY)clear=false
  if(clear)return{x:x+4,y:y+8}
 }
 throw Error("No clear descent fixture: "+w.level)
}
function provider(w,p,fields){
 w.special="cloudprovider";w.specialSpec=S.specialSpec(w.special)
 const a=agent(w,p,{special:w.special,dir:1,state:fields.height?"height":"walk",cool:fields.cool,provisionFor:fields.provisionFor})
 if(fields.height)Object.assign(a,{fall:15,heightMode:"brolly",heightTick:28,heightTicks:80,heightFromY:p.y-5})
 else agent(w,{x:p.x+9,y:p.y})
 if(fields.provisionFor)w.provisionFx={fromX:p.x,fromY:p.y,toX:p.x+9,toY:p.y,t:w.ticks-4}
 return a
}
export function fixture(entry){
 const[name,level,kind,state,fields]=entry,w=S.generate(level,0,3),p=spot(w)
 Object.assign(w,{ticks:400,agents:[],enemies:[],feed:[],particles:[],mirages:[],rateLimit:null,outage:null,duck:null,bossPost:false,reinforcements:0,backupAt:0})
 let target
 if(fields.provider)target=provider(w,fields.height?airSpot(w):p,fields)
 else {
  const a=agent(w,{x:p.x+(fields.near?3:11),y:p.y})
  const en={id:200,kind,state,x:p.x,y:p.y,dir:1,anim:0,timer:0,shotFor:0,lineTo:a.x,lineY:a.y-2,targetId:a.id,hp:1,...fields}
  if(kind==="drone")en.y-=2
  w.enemies=[en];target=en
  if(name==="ricochet")Object.assign(a,{brollyFor:w.k.BROLLY_HOLD-2,brollyDir:-1,ownBrolly:true})
  if(fields.threwAt)Object.assign(a,{x:p.x+5,state:"stunned",thrownAt:fields.threwAt,thrownFrom:p.x+2,stunFor:22})
  if(fields.backup||fields.arrival){
   w.enemyHatch={x:p.x,y:p.y-1,dir:1,biome:w.biome}
   if(fields.backup)Object.assign(w,{backupAt:430,reinforcements:2})
   else w.enemies.push({...en,id:201,x:p.x+5,y:p.y-1,anim:6})
  }else w.enemyHatch=null
 }
 return{w,target,box:{x:Math.max(0,Math.min(180,Math.round(target.x*4-65))),y:Math.max(0,Math.min(128,Math.round((target.y+1)*4-65))),width:220,height:120}}
}
export function terrain(D,w,res,theme="tokyo-night"){
 w.res=res;const pal=P.build(themeOf(theme).theme,w.level),img=canvas(400*res,248*res)
 D.drawTerrain(img.ctx,w,pal);return{img,pal}
}
export function picture(D,w,res,back){
 w.res=res;const img=canvas(back.img.W,back.img.H);copyPixels(img,back.img,0,0)
 D.drawActors(img.ctx,w,back.pal,{});return img
}
function source(base){
 try{return execFileSync("git",["show",base+":public/agents/Draw.js"],{cwd:ROOT,maxBuffer:4<<20,stdio:["ignore","pipe","pipe"]}).toString()}
 catch(e){throw Error("Cannot read cast baseline "+base+": "+(e.code||e.status))}
}
export function run(base,out,entries=CASES){
 const start=performance.now(),D=load("Draw.js"),old=renderer(source(base)),sheet=canvas(1760,278*entries.length,"#121822"),manifest=[]
 for(const[index,entry]of entries.entries()){
  const {w,box}=fixture(entry),images=[]
  for(const res of[1,2]){
   // Cast art has no terrain changes: cache one background for both versions.
   const back=terrain(D,w,res)
   for(const[tag,draw]of[["before",old],["after",D]]){
    const img=picture(draw,w,res,back),close=crop(img,box.x*res,box.y*res,box.width*res,box.height*res)
    writePNG(path.join(out,`${entry[0]}-${tag}-res${res}.png`),img)
    writePNG(path.join(out,`${entry[0]}-${tag}-crop-res${res}.png`),close)
    images.push(res===1?doublePixels(close):close)
   }
  }
  const row=sheetRow(D,entry[0],images);copyPixels(sheet,row,0,index*278)
  writePNG(path.join(out,entry[0]+"-comparison.png"),row)
  manifest.push({name:entry[0],level:w.level,seed:3,ticks:w.ticks,box})
 }
 writePNG(path.join(out,"contact-sheet.png"),sheet)
 const report={base,scenes:entries.length,frames:entries.length*4,seconds:+((performance.now()-start)/1000).toFixed(2),peakRssMB:+(process.resourceUsage().maxRSS/1024).toFixed(1),fixtures:"Staged action fields on unedited seeded terrain; no simulation changes.",manifest}
 fs.writeFileSync(path.join(out,"manifest.json"),JSON.stringify(report,null,2));return report
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),value=(key,d)=>args.includes(key)?args[args.indexOf(key)+1]:d
 const r=run(value("--base","codex/christmas-art"),path.resolve(value("--out","/tmp/codex-cast-art/final")))
 console.log(JSON.stringify({scenes:r.scenes,frames:r.frames,seconds:r.seconds,peakRssMB:r.peakRssMB}))
}
