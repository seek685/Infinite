precision highp float;
uniform vec3 uSun;
uniform vec3 uRingNormal;
varying vec3 vWorld;
float annulus(float r,float a,float b){return smoothstep(a,a+.015,r)*(1.0-smoothstep(b-.015,b,r));}
void main(){
  float r=length(vWorld);
  float rings=annulus(r,3.8,4.55)*.65+annulus(r,4.68,5.1)+annulus(r,5.22,5.75)*.65+annulus(r,5.82,6.1)*.25;
  if(rings<.01)discard;
  float bands=.45+.25*sin(r*180.0)+.15*sin(r*490.0)+.15*sin(r*61.0);
  float along=dot(vWorld,uSun),axis=length(vWorld-uSun*along);
  float shadow=mix(1.0,smoothstep(2.73,2.93,axis),step(along,0.0));
  vec3 V=normalize(cameraPosition-vWorld);
  float forward=pow(max(dot(V,-uSun),0.0),8.0);
  vec3 color=mix(vec3(.17,.26,.29),vec3(.55,.49,.37),bands)*(.04+shadow*(.85+forward*2.0));
  gl_FragColor=vec4(color,rings*(.18+bands*.32));
}
