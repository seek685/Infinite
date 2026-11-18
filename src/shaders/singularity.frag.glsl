precision highp float;
uniform sampler2D tDiffuse;
uniform mat4 uInverseProjection;
uniform mat4 uCameraWorld;
uniform mat3 uWorldToDisk;
uniform mat3 uDiskToWorld;
uniform vec3 uObserver;
uniform float uTime;
uniform float uReveal;
varying vec2 vUv;

float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
vec3 sky(vec3 ray){
  vec2 spherical=vec2(atan(ray.z,ray.x),asin(clamp(ray.y,-1.0,1.0)))*230.0;
  vec2 cell=floor(spherical),f=fract(spherical)-.5;
  float seed=hash(vec3(cell,19.7));
  float star=step(.996,seed)*exp(-dot(f,f)*100.0)*(1.0+(seed-.996)*450.0);
  float cloud=noise(ray*5.0)*noise(ray*13.0);
  return vec3(.001,.002,.004)+vec3(.013,.016,.035)*pow(cloud,2.0)+mix(vec3(.68,.81,1.0),vec3(1.0,.75,.46),hash(vec3(cell,8.0)))*star;
}
vec4 disk(vec3 p,vec3 ray){
  float r=length(p.xz);
  float envelope=smoothstep(2.95,3.2,r)*(1.0-smoothstep(6.8,8.5,r));
  if(envelope<=.0001)return vec4(0);
  float angle=atan(p.z,p.x)-uTime*1.6*pow(3.0/r,1.5);
  vec3 q=vec3(cos(angle)*r*3.0,sin(angle)*r*3.0,r*9.0);
  float clouds=noise(q)*.57+noise(q*2.13)*.28+noise(q*5.1)*.15;
  float filaments=.5+.5*sin(r*78.0+clouds*7.0+sin(angle*11.0+r*3.0)*.8);
  float fine=.5+.5*sin(r*211.0+clouds*12.0);
  float temperature=pow(3.0/r,.75);
  vec3 ember=vec3(1.8,.24,.025),gold=vec3(3.0,1.15,.25),white=vec3(3.7,4.0,4.3);
  vec3 color=mix(ember,gold,smoothstep(.42,.77,temperature));
  color=mix(color,white,pow(smoothstep(.68,1.0,temperature),2.0));
  vec3 orbitalVelocity=normalize(vec3(-p.z,0,p.x));
  float doppler=1.0/(1.0-.32*dot(orbitalVelocity,normalize(-ray)));
  color*=pow(doppler,2.5);
  float density=(.3+clouds*.9+pow(filaments,3.0)*.66+fine*.15)*envelope;
  float radial=pow(3.0/r,1.65);
  return vec4(color*density*radial*.55,envelope*.91);
}
vec3 acceleration(vec3 p,float angularMomentumSquared){
  float r2=max(dot(p,p),.2);
  return -1.5*angularMomentumSquared*p/(r2*r2*sqrt(r2));
}
void main(){
  vec3 original=texture2D(tDiffuse,vUv).rgb;
  vec4 view=uInverseProjection*vec4(vUv*2.0-1.0,1.0,1.0);
  vec3 worldRay=normalize((uCameraWorld*vec4(normalize(view.xyz/view.w),0.0)).xyz);
  vec3 p=uWorldToDisk*uObserver,velocity=uWorldToDisk*worldRay;
  vec3 angularMomentum=cross(p,velocity);
  float h2=dot(angularMomentum,angularMomentum),impact=sqrt(h2);
  // Begin at the finite lens volume; the sky outside remains the original 3D star field.
  float b=dot(p,velocity),c=dot(p,p)-100.0,discriminant=b*b-c;
  if(discriminant<0.0||b>0.0){gl_FragColor=vec4(original,0);return;}
  float entry=max(0.0,-b-sqrt(discriminant));p+=velocity*entry;
  vec3 radiance=vec3(0);float transmission=1.0;bool captured=false;
  // Midpoint integration of an effective Schwarzschild null-ray orbit (Rs = 1).
  // This is a real 3D curved ray intersecting the rotating disc, including repeat images.
  for(int i=0;i<MAX_STEPS;i++){
    float radius=length(p);
    if(radius<1.015){captured=true;break;}
    if(radius>11.5&&dot(p,velocity)>0.0)break;
    float stepSize=clamp(radius*.105,.045,1.1);
    vec3 midpoint=p+velocity*stepSize*.5;
    vec3 midpointVelocity=velocity+acceleration(p,h2)*stepSize*.5;
    vec3 next=p+midpointVelocity*stepSize;
    vec3 nextVelocity=velocity+acceleration(midpoint,h2)*stepSize;
    if(p.y*next.y<0.0){
      float crossing=clamp(p.y/(p.y-next.y),0.0,1.0);
      vec4 gas=disk(mix(p,next,crossing),midpointVelocity);
      radiance+=transmission*gas.rgb*gas.a;
      transmission*=1.0-gas.a;
    }
    p=next;velocity=nextVelocity;
    if(transmission<.008)break;
  }
  if(!captured){
    float distortion=1.0-smoothstep(3.0,8.0,impact);
    vec3 background=mix(original,sky(normalize(uDiskToWorld*velocity)),distortion);
    radiance+=transmission*background;
  }
  // Keep an explicit capture mask so optical bloom cannot fill the empty horizon.
  gl_FragColor=vec4(mix(original,radiance,uReveal),captured?pow(transmission,8.0)*uReveal:0.0);
}
