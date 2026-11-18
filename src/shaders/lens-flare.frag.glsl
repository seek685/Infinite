precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uSunUV;
uniform float uAspect;
uniform float uVisibility;
varying vec2 vUv;

float ghost(vec2 p,vec2 center,float radius){
  float d=length((p-center)*vec2(uAspect,1.0));
  return exp(-pow((d-radius)*160.0,2.0))*.35+exp(-d*d/(radius*radius))*.08;
}
void main(){
  vec3 color=texture2D(tDiffuse,vUv).rgb;
  if(uVisibility>.0001){
    vec2 p=(vUv-uSunUV)*vec2(uAspect,1.0);
    float r=length(p),angle=atan(p.y,p.x);
    float core=exp(-r*r*5400.0)*2.5;
    float halo=exp(-r*29.0)*.28;
    float beam=exp(-abs(p.y)*620.0)*exp(-abs(p.x)*4.8)*1.45;
    float softBeam=exp(-abs(p.y)*150.0)*exp(-abs(p.x)*8.0)*.12;
    float star=pow(abs(cos(angle*3.0+.3)),24.0)*exp(-r*42.0)*.3;
    vec3 light=vec3(1.0,.86,.66)*(core+halo+star)+vec3(.38,.64,1.0)*(beam+softBeam);
    vec2 axis=vec2(.5)-uSunUV;
    light+=vec3(.035,.10,.11)*ghost(vUv,vec2(.5)+axis*.38,.047);
    light+=vec3(.065,.04,.10)*ghost(vUv,vec2(.5)+axis*.85,.075);
    color+=light*sqrt(uVisibility);
  }
  gl_FragColor=vec4(color,1.0);
}
