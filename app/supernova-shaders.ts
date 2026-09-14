// Continuous fields, no per-frame random noise: the plasma moves without flashing.
export const noise = /* glsl */ `
float hash3(vec3 p) { p = fract(p * .3183099 + vec3(.1,.2,.3)); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise3(vec3 x) {
  vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p) { float n=0.; float a=.55; for(int i=0;i<4;i++){ n+=a*noise3(p); p=p*2.03+vec3(7.1,3.8,5.4); a*=.48; } return n; }
`;

export const coreVertex = /* glsl */ `
uniform float uTime; uniform float uVoice;
varying vec3 vPosition; varying vec3 vNormal; varying vec3 vView;
${noise}
void main(){
  vec3 p=position;
  float n=fbm(p*3.2+vec3(uTime*.42,-uTime*.34,uTime*.25));
  p*=1.+(n-.5)*(.52+uVoice*.32)+.045*sin(uTime*(1.45+uVoice*2.6));
  vPosition=p; vNormal=normalize(normalMatrix*normal);
  vec4 mv=modelViewMatrix*vec4(p,1.); vView=normalize(-mv.xyz);
  gl_Position=projectionMatrix*mv;
}`;
export const coreFragment = /* glsl */ `
uniform float uTime; uniform float uVoice; varying vec3 vPosition; varying vec3 vNormal; varying vec3 vView;
${noise}
void main(){
  vec3 p=vPosition*4.8+vec3(uTime*.28,-uTime*.46,uTime*.12);
  float n=fbm(p+fbm(p*1.9+vec3(uTime*.19)));
  float threads=pow(1.-abs(sin(n*19.+vPosition.y*2.)),7.);
  float facing=max(0.,dot(normalize(vNormal),vView));
  float rim=pow(1.-facing,2.);
  vec3 dark=vec3(.06,.002,.015);
  vec3 fire=mix(vec3(1.7,.14,.035),vec3(2.8,1.3,.18),smoothstep(.28,.7,n));
  vec3 col=mix(dark,fire*.4,smoothstep(.28,.72,n));
  col+=threads*vec3(1.6,.65,.08)+rim*vec3(1.5,.16,.02);
  col+=pow(facing,18.)*vec3(2.2,1.4,.6)*(1.+uVoice*.55);
  float edge=1.-smoothstep(.72,1.42,length(vPosition));
  gl_FragColor=vec4(col,.76+.18*edge+.04*uVoice);
}`;

export const shellVertex = /* glsl */ `
uniform float uTime; uniform float uPixelRatio;
attribute float aSeed; attribute float aSize;
varying vec3 vColor; varying float vAlpha;
${noise}
void main(){
  vec3 p=position; vec3 dir=normalize(p);
  float n=fbm(dir*3.4+vec3(uTime*.13,-uTime*.09,uTime*.07));
  float ripple=sin(n*13.+uTime*.45+length(p)*4.);
  p=dir*(length(p)+.4*ripple+.45*(n-.5));
  p+=vec3(sin(p.y*3.+uTime*.2),cos(p.z*3.-uTime*.2),sin(p.x*3.))* .045;
  vec4 mv=modelViewMatrix*vec4(p,1.);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp(aSize*uPixelRatio*16./max(1.,-mv.z),.65,7.);
  float latitude=dir.y*.5+.5;
  vec3 gold=vec3(1.8,.85,.18), rose=vec3(1.5,.13,.46), ice=vec3(.25,.7,1.1);
  vColor=mix(gold,rose,smoothstep(.28,.82,n)*.78);
  vColor=mix(vColor,ice,smoothstep(1.8,2.5,length(p))*(1.-latitude)*.65);
  float filament=pow(1.-abs(ripple),2.);
  vAlpha=(.035+filament*.43)*(.65+.35*sin(aSeed*6.28+uTime*.5));
}`;
export const particleFragment = /* glsl */ `
varying vec3 vColor; varying float vAlpha;
void main(){ float r=length(gl_PointCoord-.5)*2.; if(r>1.) discard;
  float a=exp(-r*r*4.5)*(1.-smoothstep(.5,1.,r));
  gl_FragColor=vec4(vColor,a*vAlpha);
}`;
export const dustVertex = /* glsl */ `
uniform float uTime; uniform float uPixelRatio;
attribute vec3 color; attribute float aSize; attribute float aSeed;
varying vec3 vColor; varying float vAlpha;
void main(){ vec3 p=position; p.y+=sin(uTime*.07+aSeed*12.)*.08;
  vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp(aSize*uPixelRatio*13./max(1.,-mv.z),.7,7.);
  vColor=color; vAlpha=.4+.25*sin(aSeed*35.+uTime*.4);
}`;
export const haloVertex = /* glsl */ `
varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }
`;
export const haloFragment = /* glsl */ `
varying vec2 vUv; uniform float uTime;
void main(){vec2 p=(vUv-.5)*2.; float r=length(p); float glow=exp(-r*r*6.);
 float ray=exp(-abs(p.y)*95.)*exp(-abs(p.x)*2.6);
 vec3 c=mix(vec3(.65,.08,.12),vec3(1.6,.7,.15),exp(-r*r*18.));
 gl_FragColor=vec4(c,glow*.055+ray*.12);
}`;
