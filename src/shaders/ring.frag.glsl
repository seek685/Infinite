precision highp float;
uniform vec3 uSun;
uniform vec3 uRingNormal;
varying vec3 vWorld;
varying float vSeed;
void main(){
  vec2 point=gl_PointCoord-.5;
  float d=length(point);
  if(d>.5)discard;
  float shape=1.0-smoothstep(.22,.5,d);
  float along=dot(vWorld,uSun), axis=length(vWorld-uSun*along);
  float shadow=mix(1.0,smoothstep(2.72,2.92,axis),step(along,0.0));
  float incident=.18+.82*abs(dot(uRingNormal,uSun));
  vec3 view=normalize(cameraPosition-vWorld);
  float forward=pow(max(dot(view,-uSun),0.0),8.0);
  vec3 ice=mix(vec3(.08,.12,.14),vec3(.44,.38,.29),vSeed);
  float sparkle=pow(vSeed,96.0)*8.0;
  vec3 color=ice*(incident*.9+forward*1.4+sparkle)*(.025+.975*shadow);
  gl_FragColor=vec4(color,shape*(.25+vSeed*.5));
}
