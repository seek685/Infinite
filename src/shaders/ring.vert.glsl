attribute float aSize;
attribute float aSeed;
uniform float uPixelRatio;
uniform float uHeight;
varying vec3 vWorld;
varying float vSeed;
void main(){
  vWorld=(modelMatrix*vec4(position,1.0)).xyz;
  vSeed=aSeed;
  vec4 mv=viewMatrix*vec4(vWorld,1.0);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp(aSize*uHeight*uPixelRatio/max(-mv.z,.1),.5,7.0);
}
