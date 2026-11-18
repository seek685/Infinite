precision highp float;
uniform float uTime;
uniform vec3 uSun;
uniform vec3 uRingNormal;
varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vNormal;
#include <orbital_noise>

float annulus(float radius,float innerR,float outerR){return smoothstep(innerR-.025,innerR+.025,radius)*(1.0-smoothstep(outerR-.025,outerR+.025,radius));}
void main(){
  vec3 p=normalize(vLocal);
  float t=uTime*.012;
  // Latitude-dependent differential rotation makes the cloud belts shear.
  float drift=t*(.16+sin(p.y*9.0)*.07);
  p.xz=mat2(cos(drift),-sin(drift),sin(drift),cos(drift))*p.xz;
  float continent=fbm(p*3.2+vec3(0.0,t*.15,0.0));
  float jets=p.y*34.0+continent*3.9;
  vec3 warped=p*vec3(5.4,15.0,5.4);
  warped.x+=sin(jets)*.38; warped.z+=cos(jets*.8)*.35;
  warped.y+=continent*.8;
  float turbulence=fbm(warped+vec3(t*.08,0.0,t*.04));
  float detail=fbm(warped*7.2+vec3(t*.13,0.0,0.0));
  float filaments=snoise(warped*91.0)*.028;
  float belts=sin(jets+turbulence*2.4+detail*.5);
  vec3 low=vec3(.105,.16,.17), high=vec3(.63,.56,.43), cream=vec3(.92,.84,.65);
  vec3 albedo=mix(low,high,smoothstep(-.7,.7,belts));
  albedo=mix(albedo,cream,smoothstep(.3,.88,belts+turbulence*.6)*.72);
  albedo+=vec3(.21,.23,.22)*(turbulence*.52+detail*.28+filaments);
  // A large cyclonic oval with nested, turbulent filaments.
  vec3 center=normalize(vec3(.34,.13,.94));
  vec3 east=normalize(cross(vec3(0.0,1.0,0.0),center)), north=cross(center,east);
  vec2 local=vec2(dot(p,east),dot(p,north))*vec2(1.0,2.0);
  float radius=length(local), mask=(1.0-smoothstep(.11,.29,radius))*smoothstep(.6,.8,dot(p,center));
  float spiral=sin(atan(local.y,local.x)*2.0-radius*95.0+turbulence*3.0-t*.4);
  vec3 storm=mix(vec3(.21,.19,.14),vec3(.72,.59,.39),.5+.32*spiral+detail*.3);
  albedo=mix(albedo,storm,mask*.9);
  vec3 N=normalize(vNormal),L=normalize(uSun),V=normalize(cameraPosition-vWorld),H=normalize(L+V);
  float ndl=dot(N,L), day=smoothstep(-.07,.12,ndl);
  float diffuse=max(ndl,0.0)*.94;
  float ringShadow=1.0;
  float denom=dot(L,uRingNormal);
  if(abs(denom)>.001){
    float distanceToRing=-dot(vWorld,uRingNormal)/denom;
    if(distanceToRing>0.0){
      float r=length(vWorld+L*distanceToRing);
      float bands=annulus(r,3.8,4.55)+annulus(r,4.68,5.1)+annulus(r,5.22,5.75)+annulus(r,5.82,6.1);
      ringShadow=1.0-min(bands,1.0)*.56;
    }
  }
  float specular=pow(max(dot(N,H),0.0),58.0)*.065*day;
  float limb=pow(1.0-max(dot(N,V),0.0),4.0);
  vec3 sunlight=vec3(1.12,1.04,.9);
  vec3 color=max(albedo,vec3(.01))*(.004+diffuse*.82*ringShadow)*sunlight;
  color+=sunlight*specular;
  color+=vec3(.025,.10,.14)*limb*(.15+day*.85);
  gl_FragColor=vec4(max(color,vec3(0.0)),1.0);
}
