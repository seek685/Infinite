attribute float aAngle;
attribute float aRadius;
attribute float aPhase;
attribute float aSpeed;
uniform float uTime;
uniform float uJump;
uniform float uTravel;
uniform float uHeight;
varying vec2 vUv;
varying float vFade;
varying float vHeat;
void main(){
  vUv=uv;
  float phase=fract(aPhase+uTime*(.35+aSpeed*.28)+uTravel*9.0);
  float depth=1.8+(1.0-phase)*185.0;
  vec2 radial=vec2(cos(aAngle),sin(aAngle));
  vec2 tangent=vec2(-radial.y,radial.x);
  float lengthAlongFlight=mix(.35,8.0+aSpeed*16.0,uJump);
  float width=max(.022+aSpeed*.038,3.8*depth/(projectionMatrix[1][1]*uHeight));
  vec3 p=vec3(radial*aRadius+tangent*position.x*width,-depth+position.y*lengthAlongFlight);
  gl_Position=projectionMatrix*vec4(p,1.0);
  vFade=smoothstep(2.0,12.0,depth)*(1.0-smoothstep(100.0,187.0,depth))*uJump;
  vHeat=aSpeed;
}
