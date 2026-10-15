#!/usr/bin/env node
// Christmas before/after in every biome, plus native frames and crops.
// node --max-old-space-size=256 tools/christmas-art.js --base REF --out DIR
import fs from "node:fs"
import path from "node:path"
import {execFileSync} from "node:child_process"
import {fileURLToPath} from "node:url"
import {load,canvas,crop,writePNG,themeOf} from "./render.js"
import {renderer,season,copyPixels,doublePixels,sheetRow,fixture,cropBox} from "./gag-art.js"
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."), S=load("Sim.js"), P=load("Palette.js")
export function christmasWorld(level, api) {
  const random=Math.random; let w
  try {Math.random=()=>0.5;w=S.generate(level,0,3);for(let i=0;i<400;i++)S.step(w)} finally {Math.random=random}
  api.dress(w);return w
}
export function christmasFrame(D, api, w, res, theme="tokyo-night") {
  w.res=res;const pal=P.build(themeOf(theme).theme,w.level);api.tint(pal)
  const img=canvas(400*res,248*res);D.drawTerrain(img.ctx,w,pal);D.drawActors(img.ctx,w,pal,{});api.paint(img.ctx,w);return img
}
export function run(base,out) {
  const source=file=>{try{return execFileSync("git",["show",`${base}:public/agents/${file}`],{cwd:ROOT,maxBuffer:4*1024*1024,stdio:["ignore","pipe","pipe"]}).toString()}catch(e){throw Error("Cannot read "+file+" at "+base+": "+(e.code||e.status))}}
  const before=renderer(source("Draw.js")),after=load("Draw.js"),old=source("season.js"),now=fs.readFileSync(path.join(ROOT,"public/agents/season.js"),"utf8")
  const versions=[["before",before,season(old,"?season=christmas")],["after",after,season(now,"?season=christmas")]]
  const sheet=canvas(1760,19*278,"#121822"),details=canvas(1760,19*278,"#121822"),trees=canvas(1760,19*278,"#121822"),umbrellas=canvas(1760,19*278,"#121822")
  for(let level=1;level<=19;level++) {
    const shots=[],exits=[],hatches=[],canopies=[];let name
    const world=christmasWorld(level,season(now,"?season=none"))
    for(const res of [1,2])for(const[tag,D,api]of versions) {
      for(const key of Object.keys(world))if(key.startsWith("season"))delete world[key]
      const w=world;api.dress(w);const img=christmasFrame(D,api,w,res);name=w.biome
      writePNG(path.join(out,`level-${level}-${tag}-res${res}.png`),img)
      const ag=w.agents.find(a=>a.floater&&!a.gone)||w.agents.find(a=>!a.gone)||{x:25,y:25}
      const view=crop(img,Math.max(0,Math.min(180,Math.round(ag.x*4-80)))*res,Math.max(28,Math.min(128,Math.round(ag.y*4-65)))*res,220*res,120*res),e=w.exit
      const c=w.corridors[0],hx=(c.startX+c.dir*8)*4
      const tree=crop(img,Math.max(0,Math.min(180,hx-100))*res,Math.max(0,Math.min(128,c.floorY*4-75))*res,220*res,120*res)
      const close=crop(img,Math.max(0,Math.min(180,e.x*4-50))*res,Math.max(0,Math.min(128,e.y*4-45))*res,220*res,120*res)
      writePNG(path.join(out,`exit-${level}-${tag}-res${res}.png`),close)
      const f=fixture("bat",api,level),fimg=christmasFrame(D,api,f,res),box=cropBox("bat",f)
      const canopy=crop(fimg,box.x*res,box.y*res,box.width*res,box.height*res)
      writePNG(path.join(out,`umbrella-${level}-${tag}-res${res}.png`),canopy)
      shots.push(res===1?doublePixels(view):view);exits.push(res===1?doublePixels(close):close);hatches.push(res===1?doublePixels(tree):tree);canopies.push(res===1?doublePixels(canopy):canopy)
    }
    copyPixels(sheet,sheetRow(after,`${level} ${name}`,shots),0,(level-1)*278)
    copyPixels(details,sheetRow(after,`${level} ${name} EXIT`,exits),0,(level-1)*278)
    copyPixels(trees,sheetRow(after,`${level} ${name} HATCH`,hatches),0,(level-1)*278)
    copyPixels(umbrellas,sheetRow(after,`${level} ${name} UMBRELLA`,canopies),0,(level-1)*278)
  }
  writePNG(path.join(out,"contact-sheet.png"),sheet);writePNG(path.join(out,"exits-sheet.png"),details);writePNG(path.join(out,"hatches-sheet.png"),trees);writePNG(path.join(out,"umbrellas-sheet.png"),umbrellas)
  return {base,biomes:19,frames:76,peakRssMB:Math.round(process.resourceUsage().maxRSS/1024)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const args=process.argv.slice(2),get=(n,d)=>args.includes(n)?args[args.indexOf(n)+1]:d
 console.log(JSON.stringify(run(get("--base","HEAD"),path.resolve(get("--out","/tmp/christmas-art")))))
}
