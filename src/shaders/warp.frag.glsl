precision highp float;
varying vec2 vUv;
varying float vFade;
varying float vHeat;
uniform vec2 uViewport;
void main(){
  float edge=exp(-pow((vUv.x-.5)*5.0,2.0));
  float tip=smoothstep(0.0,.14,vUv.y)*(1.0-smoothstep(.6,1.0,vUv.y));
  vec3 color=mix(vec3(.22,1.15,1.9),vec3(2.7,3.6,3.8),vHeat);
  vec2 screen=gl_FragCoord.xy/uViewport;
  float quietArea=uViewport.x/uViewport.y<.85?1.0-smoothstep(.24,.45,screen.y):
    (1.0-smoothstep(.25,.45,screen.x))*smoothstep(.25,.36,screen.y)*(1.0-smoothstep(.65,.78,screen.y));
  gl_FragColor=vec4(color*edge*tip,vFade*edge*tip*(1.0-quietArea*.76));
}
