import { div, PathBuilder } from 'gpui-kit';

function lines(sets,color,width=0.5){
  const p=PathBuilder.stroke(width);
  for(const pts of sets)pts.forEach(([x,y],i)=>p[i?'line_to':'move_to'](`${x}%`,`${y}%`));
  return window.paint_path(p.build(),color).absolute().inset_0().size_full();
}
export function frame(t){
  const dots=[],rails=[];
  for(let x=3;x<100;x+=7)for(let y=3;y<100;y+=5)dots.push([[x,y],[x+.12,y]]);
  rails.push([[0,5],[0,0],[17,0]],[[83,0],[100,0],[100,5]],[[0,95],[0,100],[17,100]],[[83,100],[100,100],[100,95]]);
  return div().absolute().inset_0().size_full()
    .child(lines(dots,t.border,.55)).child(lines(rails,t.input,.7));
}
export function network(t,agents){
  const rows=Math.max(1,Math.min(agents.length,4));
  const wire=[[[50,8],[50,22]],[[15,22],[85,22]],[[7,91],[93,91]],[[50,78],[50,91]]],marks=[],lit=[];
  for(let i=0;i<rows;i++){
    const x=rows===1?50:17+i*66/(rows-1);
    wire.push([[x,22],[x,47]],[[x,59],[50,78]]);
    marks.push([[x-6,47],[x+6,47],[x+6,59],[x-6,59],[x-6,47]]);
    if(agents[i]?.status==='working')lit.push([[x-3,53],[x+3,53]],[[x,50],[x,56]]);
    else marks.push([[x-2,53],[x+2,53]]);
  }
  for(const [x,y]of [[50,8],[50,78],[7,91],[93,91]])marks.push([[x-1,y-1],[x+1,y-1],[x+1,y+1],[x-1,y+1],[x-1,y-1]]);
  for(let i=0;i<19;i++)wire.push([[5+i*5,95],[5+i*5,97+(i%3===0?2:0)]]);
  return div().relative().w_full().h_full().child(lines(wire,t.input,.5)).child(lines(marks,t.accent,.7)).child(lines(lit,t.working,1.5));
}
export function bus(t){
  const paths=[],points=[];
  for(let j=0;j<3;j++){
    const y=28+j*18;
    paths.push([[0,y],[12+j*5,y],[20+j*5,y+13],[55-j*4,y+13],[65-j*4,y],[100,y]]);
    for(const x of [7,40,80])points.push([[x,y-1],[x+.5,y+1]]);
  }
  return div().relative().w_full().h(23).child(lines(paths,t.input,.45)).child(lines(points,t.accent,1.2));
}
