// Review sheets use the game's uppercase-only ROM font. Reject unsupported
// glyphs here rather than silently rendering a row of fallback question marks.
export function sheetLabel(ctx,draw,text,cx,y,size=2){
 const label=String(text).toUpperCase().replace(/[–—]/g,'-').replace(/×/g,'X')
 for(const char of label)if(!Object.hasOwn(draw.TRANSITION_GLYPHS,char))throw Error('Unsupported sheet glyph '+JSON.stringify(char)+' in '+JSON.stringify(label))
 draw.drawTransitionText(ctx,label,cx,y,size)
 return label
}
