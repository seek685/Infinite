varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vNormal;
void main(){
  vLocal=normalize(position);
  vWorld=(modelMatrix*vec4(position,1.0)).xyz;
  vNormal=normalize(mat3(modelMatrix)*normal);
  gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);
}
