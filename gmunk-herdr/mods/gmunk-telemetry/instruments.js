import { div, svg, PathBuilder } from 'gpui-kit';
import { h_flex, v_flex } from 'gpui-base';

export const txt = (s, size, color) => div().text_size(size).text_color(color).child(String(s));
export const clamp = n => Math.max(0, Math.min(100, n));

// Native vector geometry, normalized to a 320 × 180 drawing surface.
// Colors always come from the selected theme, including every decorative mark.
export function strokes(lines, color, width=0.65, box=null) {
  const p=PathBuilder.stroke(width);
  for (const points of lines) {
    p.add_polygon(points.map(([x,y])=>{
      if(box){const scale=Math.min(box.width/320,box.height/180);x=((x-160)*scale+box.width/2)/box.width*320;y=((y-90)*scale+box.height/2)/box.height*180;}
      return [`${x/3.2}%`,`${y/1.8}%`];
    }),false);
  }
  return window.paint_path(p.build(),color).absolute().inset_0().size_full();
}
function arc(x,y,r,start,end,steps=60,sy=1) {
  return Array.from({length:steps+1},(_,i)=>{
    const a=(start+(end-start)*i/steps)*Math.PI/180;
    return [x+Math.cos(a)*r,y+Math.sin(a)*r*sy];
  });
}
// Layered activity diagram: an abstract double helix and triangulated network.
// Its motion is decorative state feedback; only the labelled % is a measured value.
export function core(t, working, percent, phase=0) {
  const frame=working?Math.floor(phase)%24:0;
  const asset=(name,color,animated=false)=>svg('mods/gmunk-telemetry/art/'+name+(animated?'-'+frame:'')+'.svg')
    .absolute().inset_0().size_full().text_color(color);
  return div().relative().w_full().h_full().overflow_hidden()
    .tooltip('Abstract activity topology; animation follows agent state. CTX is measured context usage.')
    .child(asset('grid',t.border)).child(asset('frame',t.input))
    .child(asset('mesh',t.dim,true)).child(asset('light',t.accent,true))
    .child(asset('points',t.foreground,true)).child(asset('hot',working?t.working:t.dim,true))
    .child(txt('SESSION / ACTIVITY TOPOLOGY',6.5,t.muted).absolute().left(8).top(3))
    .child(txt(percent==null?'CTX —':'CTX '+percent+'%',7,t.accent).absolute().right(8).top(17))
    .child(txt(working?'PROCESSING':'STANDBY',6,t.dim).absolute().right(8).bottom(2));
}

export function tower(t, name, value, suffix, color, compact) {
  const ticks=[], bars=[], active=[], accents=[];
  // Narrow columns leave room for framing, micro ticks and the readout.
  for(let i=0;i<30;i++){
    const y=169-i*5.1;
    ticks.push([[20,y],[i%5===0?34:27,y]],[[286,y],[i%5===0?300:293,y]]);
    for(let j=0;j<5;j++){
      const x=78+j*29, segment=[[x,y],[x+23,y]];
      (value!=null&&(i+0.5)/30*100<=clamp(value)?active:bars).push(segment);
    }
  }
  accents.push([[52,15],[52,7],[88,7]],[[220,7],[255,7],[255,15]],
    [[52,162],[52,176],[88,176]],[[220,176],[255,176],[255,162]]);
  const indicator=value==null?null:169-clamp(value)*1.53;
  if(indicator!=null)accents.push([[262,indicator-3],[268,indicator],[262,indicator+3]]);
  return v_flex().flex_1().min_w(0).gap(2)
    .child(h_flex().w_full().justify_between().items_center()
      .child(txt(name,7,t.muted)).child(txt(value==null?'—':value+'%',23,value==null?t.dim:color).font_family('Monaspace Krypton')))
    .child(div().relative().w_full().h(compact?52:74).flex_none()
      .child(strokes(ticks,t.dim,0.45)).child(strokes(bars,t.border,1.1))
      .child(strokes(active,color,1.1)).child(strokes(accents,t.accent,0.55)))
    .child(h_flex().justify_between().child(txt(suffix,6.5,t.dim)).child(txt(value==null?'NO DATA':'0 ─ 100',6,t.dim)));
}

export function history(t, samples, height) {
  const lines=[];
  for(let y=20;y<=160;y+=35)lines.push([[0,y],[320,y]]);
  for(let x=0;x<=320;x+=32)lines.push([[x,15],[x,165]]);
  const values=[];
  // Missing reads break the trace. The graph is observed context, not animation.
  let segment=[];
  samples.forEach((s,i)=>{
    if(s.value==null){if(segment.length>1)values.push(segment);segment=[];return;}
    segment.push([320-(samples.length-1-i)*320/59,160-clamp(s.value)*1.4]);
  });
  if(segment.length>1)values.push(segment);
  return div().relative().w_full().h(height).flex_none()
    .child(strokes(lines,t.border,0.3))
    .when(values.length>0,el=>el.child(strokes(values,t.accent,1.3)))
    .when(values.length===0,el=>el.child(txt('ACQUIRING SAMPLES',7,t.dim).absolute().left(8).top(12)));
}
