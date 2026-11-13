import { View, div, svg, image } from 'gpui-kit';
import { h_flex, v_flex } from 'gpui-base';
import { agents, panes, props, spaces, theme, run, home, layout, placement } from 'herdr';
import { frame, network, bus } from './details.js';

const tx=(s,n,c)=>div().text_size(n).text_color(c).child(String(s));
const findNode=(n,id)=>n?.id===id?n:(n?.children??[]).map(c=>findNode(c,id)).find(Boolean);
const short=s=>s?.startsWith(home())?'~'+s.slice(home().length):s??'';
function action(id,label,tip,cmd,args,t) {
  return h_flex().id(id).h(21).px(7).items_center().justify_center().border_b(1).border_color(t.border)
    .cursor_pointer().hover(s=>s.bg(t.hover).border_color(t.accent)).tooltip(tip)
    .on_mouse_down('left',(_e,cx)=>{cx.stop_propagation();run(cmd,args);})
    .on_click((_e,cx)=>cx.stop_propagation()).child(tx(label,9,t.accent));
}
export default class CommandShell extends View {
  init(_props,cx){this.cx=cx;cx.timer.every(1000,cx=>cx.notify());this.navHeight=720;this.navPage=0;this.agentPage=0;}
  render(){
    const t=theme(),role=props()?.role??'pane';
    const all=spaces(),sp=all.find(s=>s.active),tab=sp?.tabs.find(s=>s.active);
    const live=agents(),lead=live.find(a=>a.focused),ps=panes();
    const base=()=>h_flex().size_full().font_family('Monaspace Krypton').items_center();
    const sidebarShown=!findNode(layout(),'sidebar')?.hidden;
    if(role==='drawer'){
      // Keep the gutter paired with the sidebar even when Cmd+B changes it.
      const gutterShown=!findNode(layout(),'drawer-gutter')?.hidden;
      if(sidebarShown===gutterShown&&!this.syncing){
        this.syncing=true;
        // A layout command belongs in an event/timer, never during render.
        this.cx.timer.after(0,cx=>{run(sidebarShown?'layout.hide':'layout.show',{id:'drawer-gutter'});this.syncing=false;cx.notify();});
      }
      if(sidebarShown)return div();
      const right=placement()?.edge==='right';
      const edge=(content)=>h_flex().w(36).h_full().flex_none().items_center().justify_center().child(content);
      const row=(id,icon,body,command,args,active=false)=>{
        const e=edge(icon),b=h_flex().w(184).h_full().px(8).items_center().min_w(0).child(body);
        const r=h_flex().id(id).h(32).flex_none().w_full().bg(active?t.surface:t.canvas)
          .cursor_pointer().hover(s=>s.bg(t.hover)).on_click(()=>run(command,args));
        return right?r.child(b).child(e):r.child(e).child(b);
      };
      const group=(name)=>h_flex().h(22).w_full().items_center().child(edge(div().w(12).h(1).bg(t.border))).child(tx(name,7,t.dim));
      return v_flex().id('gmunk-hover-drawer').w(220).py(4).font_family('Monaspace Krypton').bg(t.canvas).gap(3)
        .child(row('gmunk-pin',svg('mods/gmunk-shell/mark.svg').size(17).text_color(t.accent),
          h_flex().w_full().justify_between().child(tx('NAVIGATION',9,t.accent)).child(tx('PIN →',8,t.working)),
          'layout.show',{id:'sidebar'}))
        .child(row('gmunk-new-drawer',tx('+',18,t.working),tx('NEW SECTOR',9,t.accent),'space.new',{}))
        .child(group('SECTORS'))
        .children(all.slice(0,8).map(s=>row('gmunk-drawer-space-'+s.id,tx(s.name.slice(0,1).toUpperCase(),12,s.active?t.working:t.muted),
          tx(s.name,10,s.active?t.foreground:t.muted).truncate(),'space.select',{id:s.id},s.active)))
        .child(group('AGENTS'))
        .children(live.slice(0,8).map(a=>row('gmunk-drawer-agent-'+a.address,
          a.program?.icon?(a.program.tint?svg(a.program.icon).size(15).text_color(a.status==='working'?t.working:t.accent):image(a.program.icon).size(15)):tx('◇',13,t.accent),
          h_flex().w_full().min_w(0).gap(5).child(tx(a.program?.name??'Agent',10,t.foreground).flex_1().truncate()).child(tx(a.status,7,a.status==='working'?t.working:t.dim)),
          'agent.focus',{terminal:a.address},a.focused)))
        .child(row('gmunk-drawer-settings',tx('⚙',13,t.dim),tx('CONFIGURATION',8,t.muted),'app.settings',{}));
    }
    if(role==='tabs')return base().gap(3).pl(sidebarShown?0:28)
      .child(h_flex().flex_1().min_w(0).overflow_x_scroll().gap(3).children((sp?.tabs??[]).map(s=>
        h_flex().id('gmunk-tab-'+s.id).h(27).px(10).gap(7).items_center().flex_none()
          .bg(s.active?t.surface:t.canvas).border_t(1).border_color(s.active?t.accent:t.border)
          .cursor_pointer().hover(s=>s.bg(t.hover)).on_click(()=>run('tab.select',{id:s.id}))
          .child(tx(String(s.index).padStart(2,'0'),9,s.active?t.accent:t.dim))
          .child(tx(s.named?s.name:s.status??'terminal',9,s.active?t.foreground:t.dim).max_w(140).truncate())
          .when(s.status==='working',el=>el.child(div().size(3).bg(t.working).loop('opacity',{from:0.3,to:1,period:1400}))))))
      .child(action('gmunk-tab-add','+','New terminal','tab.new',{},t))
      .child(action('gmunk-panel-toggle','FILES','Toggle files','layout.toggle',{id:'panel'},t));
    if(role==='pane'){
      const p=ps.find(p=>p.pane===props()?.pane)??ps.find(p=>p.focused);
      if(!p)return div();
      return base().px(8).gap(8).bg(t.chrome).border_b(1).border_color(t.border)
        .child(tx('⌜',13,t.working)).child(tx(p.program?.name??'TERMINAL',9,t.accent))
        .child(tx(short(p.cwd),8,t.dim).flex_1().min_w(0).truncate())
        .child(action('gmunk-split-r','┊','Split right','pane.split',{pane:p.pane,direction:'right'},t))
        .child(action('gmunk-split-d','━','Split down','pane.split',{pane:p.pane,direction:'down'},t))
        .child(action('gmunk-zoom','□','Zoom pane','pane.zoom',{pane:p.pane},t))
        .child(action('gmunk-close','×','Close pane','pane.close',{pane:p.pane},t));
    }
    if(role==='diagnostics')return base().relative().gap(14).px(10).border_b(1).border_color(t.border)
      .child(frame(t))
      .child(v_flex().w(126).flex_none().gap(4).child(tx('PROCESS MATRIX',7,t.accent))
        .child(tx('AGENT STATE / SNAPSHOT',5.5,t.dim)).child(bus(t)))
      .child(h_flex().flex_1().gap(12).children(['working','blocked','idle','done'].map((state,i)=>{
        const count=live.filter(a=>a.status===state).length;
        return v_flex().flex_1().gap(3).child(h_flex().justify_between()
          .child(tx(state.toUpperCase(),6,t.dim)).child(tx(String(count).padStart(2,'0'),16,state==='working'?t.working:t.accent).font_family('Monaspace Krypton')))
          .child(h_flex().gap(2).children(Array.from({length:12},(_,j)=>div().flex_1().h(2).bg(j<count?t.accent:t.border))))
          .child(tx('CH / 0'+(i+1),5,t.dim));
      })))
      .child(v_flex().w(110).flex_none().gap(4).child(tx('ACTIVE SECTOR',6,t.dim))
        .child(tx(sp?.name??'—',10,t.foreground).truncate()).child(tx(sp?.machine??'LOCAL HOST',6,t.dim)));
    if(role==='footer')return base().px(14).gap(12).justify_between()
      .child(tx(sp?.machine?'LINK / '+sp.machine:'LINK / LOCAL',8,t.accent))
      .child(tx(`${ps.length} TERMINALS  /  ${live.filter(a=>a.status==='working').length} ACTIVE`,8,t.dim))
      .child(div().h(1).flex_1().bg(t.border))
      .child(tx('TERMINAL BUS / LOCAL TIME',6,t.dim))
      .child(tx(new Date().toLocaleTimeString('en-GB',{hour12:false}),9,t.muted));
    const compact=this.navHeight<620;
    const spaceLimit=compact?3:6,agentLimit=compact?2:4;
    const pages=Math.max(1,Math.ceil(all.length/spaceLimit)),page=Math.min(this.navPage,pages-1);
    const agentPages=Math.max(1,Math.ceil(live.length/agentLimit)),agentPage=Math.min(this.agentPage,agentPages-1);
    return v_flex().id('gmunk-nav').size_full().min_h(0).overflow_hidden().font_family('Monaspace Krypton').pt(28).gap(compact?5:8).border_t(1).border_color(t.border)
      .on_size_change((size,cx)=>{if(Math.abs(this.navHeight-size.height)>1){this.navHeight=size.height;cx.notify();}})
      .child(h_flex().h(29).flex_none().items_center().justify_between().child(tx('SECTOR INDEX',8,t.accent)).child(action('gmunk-collapse','«','收起导航 / Cmd+B','layout.hide',{id:'sidebar'},t)))
      .child(v_flex().gap(4).flex_none().children(all.slice(page*spaceLimit,(page+1)*spaceLimit).map((s,i)=>
        v_flex().id('gmunk-space-'+s.id).w_full().h(compact?40:48).px(8).justify_center().gap(4)
          .relative().bg(s.active?t.surface:t.canvas).border_l(1).border_color(s.active?t.working:t.border).child(frame(t))
          .cursor_pointer().hover(s=>s.bg(t.hover)).on_click(()=>run('space.select',{id:s.id}))
          .child(h_flex().justify_between().child(tx('S / '+String(page*spaceLimit+i+1).padStart(2,'0'),8,s.active?t.working:t.dim))
            .child(tx(s.status==='working'?'ACTIVE':s.status==='blocked'?'INPUT':'READY',7,s.status==='working'?t.working:t.dim)))
          .child(tx(s.name,11,s.active?t.foreground:t.muted).truncate()))))
      .when(pages>1,el=>el.child(tx(`${page+1}/${pages} NEXT →`,8,t.accent).id('gmunk-spaces-next').cursor_pointer()
        .on_click((_e,cx)=>{this.navPage=(page+1)%pages;cx.notify();})))
      .child(action('gmunk-space-add','+ NEW SECTOR','New space','space.new',{},t))
      .child(h_flex().h(29).flex_none().border_t(1).border_color(t.border).items_center().justify_between()
        .child(tx('AGENT NETWORK',8,t.accent)).child(tx(String(live.length).padStart(2,'0'),10,t.working)))
      .child(v_flex().gap(3).flex_none().children(live.slice(agentPage*agentLimit,(agentPage+1)*agentLimit).map(a=>
        v_flex().id('gmunk-nav-agent-'+a.address).h(40).px(6).gap(4).justify_center().bg(a.focused?t.surface:t.canvas)
          .cursor_pointer().hover(s=>s.bg(t.hover)).tooltip(a.title??a.address).on_click(()=>run('agent.focus',{terminal:a.address}))
          .child(h_flex().gap(6).items_center().child(div().size(4).bg(a.status==='working'?t.working:t.dim))
            .child(tx(a.program?.name??'Agent',10,t.foreground)).child(tx(a.address,7,t.dim)))
          .child(tx(a.title??a.status,8,t.dim).truncate()))))
      .when(agentPages>1,el=>el.child(tx(`${agentPage+1}/${agentPages} NEXT →`,8,t.accent).id('gmunk-agents-next').cursor_pointer()
        .on_click((_e,cx)=>{this.agentPage=(agentPage+1)%agentPages;cx.notify();})))
      .child(v_flex().flex_1().min_h(0).justify_end().gap(6)
        .when(!compact,el=>el
          .child(h_flex().justify_between().border_t(1).border_color(t.input).pt(5)
            .child(tx('LINK TOPOLOGY',7,t.muted)).child(tx('LOCAL',6,t.dim)))
          .child(div().w_full().h(108).child(network(t,live)))
          .child(h_flex().justify_between().child(tx('TERMINALS',7,t.dim)).child(tx(ps.length,13,t.accent).font_family('Monaspace Krypton')))
          .child(h_flex().justify_between().child(tx('PROCESSING',7,t.dim)).child(tx(live.filter(a=>a.status==='working').length,13,t.working).font_family('Monaspace Krypton')))))
      .child(bus(t))
      .child(h_flex().h(22).flex_none().items_center().justify_between().border_t(1).border_color(t.border)
        .child(tx(sp?.machine?'REMOTE LINK':'LOCAL LINK',7,t.muted))
        .child(tx('CONNECTED',6,t.accent)));
  }
}
