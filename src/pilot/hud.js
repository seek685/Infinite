import { MathUtils, Vector3 } from 'three';
import { planetOccludes } from '../exploration-math.js';
import { KM_PER_UNIT, MISSION_TIME_SCALE } from '../immersion-math.js';
import './pilot.css';

const keys = new Set(['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','KeyF','KeyR','Escape']);
const km = new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
const dot = new Vector3(), projected = new Vector3(), planet = new Vector3();

export function createPilotHUD(targets, { interact, exit, cycle, acceptsInput }) {
  const root=document.createElement('section');
  root.className='pilot-hud'; root.hidden=true; root.setAttribute('aria-label','驾驶舱仪表');
  root.innerHTML=`
    <div class="pilot-contacts" aria-hidden="true"></div>
    <div class="pilot-sight" aria-hidden="true"><i></i><span></span><b></b></div>
    <div class="pilot-radar"><canvas aria-label="相对于机头的行星、空间站与文章信标方位图"></canvas>
      <button type="button" class="pilot-target" title="切换导航目标 · R" aria-label="切换导航目标">
        <small>NAV TARGET <i>↻</i></small><strong></strong><span></span>
      </button>
    </div>
    <div class="pilot-velocity"><small>VELOCITY</small><div><b>0.0</b> KM/S</div><i></i></div>
    <button type="button" class="pilot-action" hidden></button>
    <span class="pilot-feedback" role="status"></span>
    <div class="pilot-keys">W/S 推进·制动　 A/D 转向　 Q/E 俯仰　 SHIFT 加速　 R 选标</div>
    <div class="pilot-touch"><div class="pilot-stick" aria-label="方向摇杆"><i></i></div>
      <div class="pilot-throttle"><button data-drive="brake" aria-label="制动">BRAKE</button>
        <button data-drive="boost" aria-label="超频推进">BOOST</button>
        <button data-drive="thrust" aria-label="向前推进">THRUST ↑</button></div>
    </div>`;
  document.body.append(root);
  const find=s=>root.querySelector(s), action=find('.pilot-action'), notice=find('.pilot-feedback');
  const nav=find('.pilot-target'), name=nav.querySelector('strong'), range=nav.querySelector('span');
  const speed=find('.pilot-velocity b'), meter=find('.pilot-velocity i'), horizon=find('.pilot-sight span');
  const canvas=find('canvas'), ctx=canvas.getContext('2d'), stick=find('.pilot-stick'), knob=stick.firstElementChild;
  const labels=targets.map((target,i)=>{
    const label=document.createElement('span');
    label.textContent=i?target.title:'中继空间站'; label.hidden=true;
    find('.pilot-contacts').append(label); return label;
  });
  const events=new AbortController(), held=new Set(), touch=new Map();
  const listen=(node,type,fn)=>node.addEventListener(type,fn,{signal:events.signal});
  let stickId=null,stickX=0,stickY=0,lastPaint=-1,near=null,lastTarget=null,pixelRatio=0;
  let suspended=true;
  const input={yaw:0,pitch:0,thrust:false,brake:false,boost:false};
  const touchMode=()=>navigator.maxTouchPoints>0||matchMedia('(any-pointer: coarse)').matches;
  function reset() {
    held.clear(); touch.clear(); stickId=null; stickX=stickY=0;
    knob.style.transform=''; root.querySelectorAll('[data-held]').forEach(node=>node.removeAttribute('data-held'));
  }
  listen(window,'blur',reset);
  listen(document,'visibilitychange',()=>{if(document.hidden)reset();});
  listen(document,'keydown',event=>{
    if(root.hidden||suspended||event.defaultPrevented||event.altKey||event.metaKey||event.ctrlKey||!keys.has(event.code))return;
    if(event.code==='Escape'){event.preventDefault();if(!event.repeat)exit();return;}
    if(!acceptsInput())return;
    event.preventDefault();
    if(!event.repeat&&event.code==='KeyF')interact();
    if(!event.repeat&&event.code==='KeyR')cycle();
    held.add(event.code);
  });
  listen(document,'keyup',event=>held.delete(event.code));
  listen(nav,'click',()=>{if(acceptsInput())cycle();});
  listen(action,'click',()=>{if(acceptsInput())interact();});
  function moveStick(event) {
    const box=stick.getBoundingClientRect();
    const x=(event.clientX-box.left-box.width/2)/(box.width*.36), y=(event.clientY-box.top-box.height/2)/(box.height*.36);
    const divisor=Math.max(1,Math.hypot(x,y));
    stickX=x/divisor; stickY=y/divisor;
    knob.style.transform='translate('+stickX*box.width*.30+'px,'+stickY*box.height*.30+'px)';
  }
  listen(stick,'pointerdown',event=>{
    if(stickId!==null||!acceptsInput())return;
    event.preventDefault(); stickId=event.pointerId; stick.setPointerCapture(stickId); moveStick(event);
  });
  listen(stick,'pointermove',event=>{if(event.pointerId===stickId)moveStick(event);});
  const releaseStick=event=>{if(event.pointerId===stickId){stickId=null;stickX=stickY=0;knob.style.transform='';}};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(stick,type,releaseStick);
  for(const button of root.querySelectorAll('[data-drive]')){
    listen(button,'pointerdown',event=>{
      if(!acceptsInput())return;
      event.preventDefault();button.setPointerCapture(event.pointerId);
      touch.set(event.pointerId,button.dataset.drive);button.dataset.held='';
    });
    const release=event=>{touch.delete(event.pointerId);if(![...touch.values()].includes(button.dataset.drive))delete button.dataset.held;};
    for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(button,type,release);
  }
  function commands(){
    const left=held.has('KeyA')||held.has('ArrowLeft'), right=held.has('KeyD')||held.has('ArrowRight');
    const up=held.has('KeyQ')||held.has('ArrowUp'), down=held.has('KeyE')||held.has('ArrowDown');
    input.yaw=MathUtils.clamp(Number(left)-Number(right)-stickX,-1,1);
    input.pitch=MathUtils.clamp(Number(up)-Number(down)-stickY,-1,1);
    input.boost=held.has('ShiftLeft')||held.has('ShiftRight');
    input.thrust=held.has('KeyW');input.brake=held.has('KeyS');
    for(const drive of touch.values()){
      if(drive==='boost'){input.boost=true;input.thrust=true;}
      else input[drive]=true;
    }
    return input;
  }
  function drawRadar(state,selected) {
    const size=canvas.clientWidth;
    if(!size)return;
    const ratio=Math.min(2,window.devicePixelRatio||1);
    if(pixelRatio!==ratio||canvas.width!==Math.round(size*ratio)){
      pixelRatio=ratio; canvas.width=canvas.height=Math.round(size*ratio);
    }
    const c=size/2,r=c-3,cos=Math.cos(state.yaw),sin=Math.sin(state.yaw);
    ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,size,size);
    ctx.lineWidth=.75; ctx.strokeStyle='#94c8c44e';
    for(const ring of [r,r*.55]){ctx.beginPath();ctx.arc(c,c,ring,0,Math.PI*2);ctx.stroke();}
    ctx.strokeStyle='#94c8c431';
    ctx.beginPath();ctx.moveTo(c,3);ctx.lineTo(c,size-3);ctx.moveTo(3,c);ctx.lineTo(size-3,c);ctx.stroke();
    function contact(position,index){
      dot.subVectors(position,state.position);
      const x=dot.x*cos-dot.z*sin, y=dot.x*sin+dot.z*cos;
      const ground=Math.hypot(x,y);
      const scale=ground>0 ? r*.94*Math.min(1,Math.log1p(ground)/Math.log(17))/ground : 0;
      let px=c+x*scale,py=c+y*scale;
      ctx.strokeStyle=index<0?'#9dada599':index===0?'#efd1a5':'#88cecf';
      ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();
      if(index<0){ctx.arc(px,py,3,0,Math.PI*2);ctx.stroke();}
      else if(index===0){ctx.strokeRect(px-2,py-2,4,4);}
      else {ctx.moveTo(px,py-2.4);ctx.lineTo(px+2.4,py);ctx.lineTo(px,py+2.4);ctx.lineTo(px-2.4,py);ctx.fill();}
      if(targets[index]===selected||(index<0&&selected.id==='planet')){ctx.beginPath();ctx.arc(px,py,4.7,0,Math.PI*2);ctx.stroke();}
    }
    contact(planet,-1);targets.forEach((target,i)=>contact(target.position,i));
    ctx.fillStyle='#e6f6ed'; ctx.beginPath();ctx.moveTo(c,c-3.5);ctx.lineTo(c+2.6,c+2.6);ctx.lineTo(c,c+1.4);ctx.lineTo(c-2.6,c+2.6);ctx.fill();
  }
  function update(state,camera,selected,nearby,message,now) {
    horizon.style.transform='translateY('+Math.round(state.pitch*12)+'px) rotate('+(-state.bank*.68)+'rad)';
    if(now-lastPaint<.075&&lastTarget===selected&&near===nearby&&notice.textContent===message)return;
    lastPaint=now; near=nearby; lastTarget=selected;
    action.hidden=!nearby;
    if(nearby)action.textContent=(touchMode()?'':'PRESS [F] TO ')+(nearby.post?'SCAN  //  扫描日志':'DOCK  //  对接空间站');
    notice.textContent=message;
    speed.textContent=(state.velocity.length()*KM_PER_UNIT/MISSION_TIME_SCALE).toFixed(1);
    meter.style.transform='scaleX('+Math.min(1,state.velocity.length()/3.4)+')';
    dot.subVectors(selected.position,state.position);
    const bearing=MathUtils.euclideanModulo(Math.atan2(-dot.x,-dot.z)-state.yaw+Math.PI,2*Math.PI)-Math.PI;
    const elevation=Math.atan2(dot.y,Math.hypot(dot.x,dot.z))-state.pitch;
    name.textContent=selected.title;
    range.textContent=km.format(dot.length()*KM_PER_UNIT)+' KM  ·  '+(Math.abs(bearing)<.07?'│':bearing>0?'←':'→')+
      Math.round(Math.abs(bearing)*180/Math.PI)+'°  '+(elevation>=0?'↑':'↓')+Math.round(Math.abs(elevation)*180/Math.PI)+'°';
    drawRadar(state,selected);
    const bounds=[];
    targets.forEach((target,i)=>{
      const label=labels[i]; projected.copy(target.position).project(camera);
      const x=(.5+.5*projected.x)*innerWidth,y=(.5-.5*projected.y)*innerHeight;
      const width=Math.min(151,innerWidth*.32);
      const visible=projected.z<1&&projected.z>-1&&x>16&&x+width<innerWidth-10&&y>94&&y<innerHeight*.74
        &&!planetOccludes(camera.position,target.position)&&!bounds.some(b=>Math.abs(x-b.x)<width&&Math.abs(y-b.y)<21);
      label.hidden=!visible;
      if(visible){label.style.transform='translate3d('+Math.round(x)+'px,'+Math.round(y-13)+'px,0)';bounds.push({x,y});}
    });
  }
  function show(visible){
    root.hidden=!visible; suspended=!visible;root.classList.toggle('has-touch',touchMode());
    near=lastTarget=null;lastPaint=-1;notice.textContent='';action.hidden=true;
    labels.forEach(label=>label.hidden=true); reset();
  }
  return {commands,update,show,setMode(mode){root.dataset.mode=mode;reset();},suspend(value){suspended=value;root.inert=value;reset();},
    dispose(){events.abort();root.remove();}};
}
