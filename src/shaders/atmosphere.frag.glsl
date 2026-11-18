precision highp float;
uniform vec3 uSun;
uniform float uStrength;
uniform float uPower;
varying vec3 vWorld;
varying vec3 vNormal;
void main(){
  vec3 N=normalize(vNormal),V=normalize(cameraPosition-vWorld);
  float angle=abs(dot(N,V));
  float rim=pow(1.0-angle,uPower)*smoothstep(0.0,.16,angle);
  float day=smoothstep(-.3,.65,dot(N,uSun));
  float eclipse=pow(max(dot(normalize(cameraPosition),-uSun),0.0),12.0);
  vec3 tint=mix(vec3(.08,.20,.66),vec3(.26,.73,.92),day);
  tint=mix(tint,vec3(.66,.74,.78),eclipse*.5);
  float scatter=(.045+day*.95+eclipse*1.15)*rim*uStrength;
  gl_FragColor=vec4(tint*scatter,1.0);
}
