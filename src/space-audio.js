import { MathUtils } from 'three';

export function createSpaceAudio(button){
  let context,master,filter,panner,analyser,enabled=false,suspendTimer,lastUpdate=0,error=null;
  const sources=[];
  let samples,engine,engineGain,lastEngineUpdate=0,shieldHits=0;
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  if(!AudioContext){button.disabled=true;button.setAttribute('aria-label','此浏览器不支持空间音效');}

  function build(){
    context=new AudioContext();
    const mix=context.createGain();
    filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=160;filter.Q.value=.7;
    panner=context.createStereoPanner();
    master=context.createGain();master.gain.value=0;
    const compressor=context.createDynamicsCompressor();compressor.threshold.value=-18;compressor.ratio.value=4;
    analyser=context.createAnalyser();analyser.fftSize=512;samples=new Float32Array(analyser.fftSize);
    mix.connect(filter);filter.connect(panner);
    const dry=context.createGain();dry.gain.value=.75;panner.connect(dry);dry.connect(master);
    const reverb=context.createConvolver(),wet=context.createGain();wet.gain.value=.28;
    const impulse=context.createBuffer(2,Math.floor(context.sampleRate*2.6),context.sampleRate);
    for(let channel=0;channel<2;channel++){
      const data=impulse.getChannelData(channel);
      for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,3.4);
    }
    reverb.buffer=impulse;panner.connect(reverb);reverb.connect(wet);wet.connect(master);
    master.connect(compressor);compressor.connect(analyser);analyser.connect(context.destination);
    for(const [frequency,level,pan,type]of [[37,.26,-.5,'sine'],[55.55,.15,.5,'sine'],[111,.045,-.2,'triangle'],[148.4,.035,.3,'triangle']]){
      const oscillator=context.createOscillator(),gain=context.createGain(),spread=context.createStereoPanner();
      oscillator.type=type;oscillator.frequency.value=frequency;gain.gain.value=level;spread.pan.value=pan;
      oscillator.connect(gain);gain.connect(spread);spread.connect(mix);oscillator.start();sources.push(oscillator);
    }
    const noise=context.createBuffer(1,context.sampleRate*4,context.sampleRate),data=noise.getChannelData(0);
    let brown=0;
    for(let i=0;i<data.length;i++){brown=(brown+(Math.random()*2-1)*.02)/1.02;data[i]=brown*3.5;}
    // A short seam crossfade keeps the looping procedural noise click-free.
    for(let i=0;i<2048;i++)data[data.length-2048+i]=MathUtils.lerp(data[data.length-2048+i],data[i],i/2048);
    const source=context.createBufferSource(),noiseGain=context.createGain();
    source.buffer=noise;source.loop=true;noiseGain.gain.value=.24;
    source.connect(noiseGain);noiseGain.connect(mix);source.start();sources.push(source);
  }
  function reflect(){
    button.setAttribute('aria-pressed',String(enabled));
    button.setAttribute('aria-label',enabled?'关闭空间音效':'开启空间音效');
  }
  async function setEnabled(value){
    enabled=value;reflect();clearTimeout(suspendTimer);
    try{
      if(enabled&&!context)build();
      if(!context)return;
      if(enabled){await context.resume();if(!enabled)return;}
      const now=context.currentTime;
      master.gain.cancelScheduledValues(now);master.gain.setTargetAtTime(enabled?.16:0,now,.12);
      if(!enabled){pilotDrive(null);suspendTimer=setTimeout(()=>{if(!enabled&&context.state==='running')context.suspend();},650);}
    }catch(reason){error=reason.message;enabled=false;reflect();button.setAttribute('aria-label','音频暂不可用，点击重试');}
  }
  const toggle=()=>setEnabled(!enabled);
  const visibility=()=>{
    if(!context)return;
    if(document.hidden){clearTimeout(suspendTimer);context.suspend();}
    else if(enabled)setEnabled(true);
  };
  button.addEventListener('click',toggle);document.addEventListener('visibilitychange',visibility);reflect();
  function update(thrust,cameraPosition,elapsed){
    if(!context||!enabled||context.state!=='running'||context.currentTime-lastUpdate<.06)return;
    lastUpdate=context.currentTime;
    filter.frequency.setTargetAtTime(160+MathUtils.clamp(thrust,0,1)*1240,lastUpdate,.2);
    const azimuth=Math.atan2(cameraPosition.x,cameraPosition.z);
    panner.pan.setTargetAtTime(Math.sin(azimuth)*.35+Math.sin(elapsed*.08)*.12,lastUpdate,.35);
  }
  function pilotDrive(load){
    if(load===null){
      if(!engine)return;
      const now=context.currentTime;
      engineGain.gain.setTargetAtTime(0,now,.035);engine.stop(now+.18);
      engine=null;engineGain=null;return;
    }
    if(!enabled||context?.state!=='running')return;
    const now=context.currentTime;
    if(!engine){
      const source=context.createOscillator(),gain=context.createGain();
      source.type='triangle';source.frequency.value=32;gain.gain.value=0;
      source.connect(gain);gain.connect(master);source.start();
      source.onended=()=>{source.disconnect();gain.disconnect();};
      engine=source;engineGain=gain;lastEngineUpdate=-1;
    }
    if(now-lastEngineUpdate<.055)return;
    lastEngineUpdate=now;
    engine.frequency.setTargetAtTime(32+load*68,now,.14);
    engineGain.gain.setTargetAtTime(.10+load*.26,now,.11);
  }
  function shieldImpact(){
    if(!enabled||context?.state!=='running')return;
    const now=context.currentTime,source=context.createOscillator(),gain=context.createGain();
    source.frequency.setValueAtTime(116,now);source.frequency.exponentialRampToValueAtTime(29,now+.29);
    gain.gain.setValueAtTime(.001,now);gain.gain.exponentialRampToValueAtTime(.72,now+.012);
    gain.gain.exponentialRampToValueAtTime(.001,now+.36);
    source.connect(gain);gain.connect(master);source.onended=()=>{source.disconnect();gain.disconnect();};
    source.start(now);source.stop(now+.38);shieldHits++;
  }
  function diagnostics(){
    let rms=0,peak=0;
    if(analyser&&context.state==='running'){
      analyser.getFloatTimeDomainData(samples);
      for(const sample of samples){rms+=sample*sample;peak=Math.max(peak,Math.abs(sample));}
      rms=Math.sqrt(rms/samples.length);
    }
    return {created:!!context,enabled,state:context?.state||'uninitialized',gain:master?.gain.value||0,frequency:filter?.frequency.value||160,rms,peak,error,sources:sources.length,engineHz:engine?.frequency.value||0,shieldHits};
  }
  function dispose(){pilotDrive(null);clearTimeout(suspendTimer);button.removeEventListener('click',toggle);document.removeEventListener('visibilitychange',visibility);sources.forEach(source=>source.stop());context?.close();}
  return {update,pilotDrive,shieldImpact,diagnostics,dispose};
}
