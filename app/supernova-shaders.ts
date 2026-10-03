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
uniform float uTime; uniform float uVoice; uniform vec4 uVoiceBands;
varying vec3 vPosition; varying vec3 vNormal; varying vec3 vView;
${noise}
// Gielis' superformula. The bands below drive its boundary conditions so
// the form stays organically unpredictable while remaining audio-derived.
float superRadius(float phi, float m, float n1, float n2, float n3, float a, float b){
  float c=pow(max(abs(cos(m*phi*.25)/a),.0001),n2);
  float s=pow(max(abs(sin(m*phi*.25)/b),.0001),n3);
  return pow(max(c+s,.0001),-1./n1);
}
void main(){
  vec3 p=position;
  float low=uVoiceBands.x, mid=uVoiceBands.y, presence=uVoiceBands.z, high=uVoiceBands.w;
  // TTS output is often quiet after browser smoothing, so open the voice gate
  // early enough for syllables to visibly move the field.
  float voiceGate=smoothstep(.004,.075,max(uVoice,max(mid,presence)*.72));
  float phi=atan(p.y,p.x)+uTime*(.035+mid*.075);
  // Keep the petal count continuous: quantizing it made the core jump at
  // every spectral threshold and looked like a rendering glitch.
  float m=5.+presence*3.25+mid*.65;
  float formula=superRadius(phi,m,.68+low*.48,.8+mid*1.25,.8+high*1.25,1.+low*.11,1.+high*.11);
  float lobe=clamp(formula-1.,-.34,.48);
  // Continuous seeded drift is the transformer field: it never flashes frame-to-frame.
  float transformer=fbm(normalize(p)*2.65+vec3(uTime*.09,mid*3.2,high*2.7));
  float n=fbm(p*3.2+vec3(uTime*.42,-uTime*.34,uTime*.25));
  // Keep the singularity anchored. Voice energy belongs to the escaping
  // particle field; the core only makes a quiet, slow surface response.
  float audioMorph=lobe*(.018+voiceGate*(.055+mid*.07))+(transformer-.5)*voiceGate*(.018+high*.025);
  p*=1.+(n-.5)*(.17+uVoice*.035)+audioMorph+.016*sin(uTime*(.72+uVoice*.35));
  vPosition=p; vNormal=normalize(normalMatrix*normal);
  vec4 mv=modelViewMatrix*vec4(p,1.); vView=normalize(-mv.xyz);
  gl_Position=projectionMatrix*mv;
}`;
export const coreFragment = /* glsl */ `
uniform float uTime; uniform float uVoice; uniform vec4 uVoiceBands; varying vec3 vPosition; varying vec3 vNormal; varying vec3 vView;
${noise}
void main(){
  vec3 p=vPosition*4.8+vec3(uTime*.28,-uTime*.46,uTime*.12);
  float n=fbm(p+fbm(p*1.9+vec3(uTime*.19)));
  float threads=pow(1.-abs(sin(n*19.+vPosition.y*2.)),7.);
  float facing=max(0.,dot(normalize(vNormal),vView));
  float rim=pow(1.-facing,2.);
  vec3 dark=vec3(.06,.002,.015);
  vec3 fire=mix(vec3(1.7,.14,.035),vec3(2.8,1.3,.18),smoothstep(.28,.7,n));
  fire=mix(fire,vec3(1.2,.36,.72),uVoiceBands.w*.2);
  // Shared fire field: the core hands its edge color directly to the escaping particles.
  // The same cyan → violet → amber math used by the shell makes the nova read as
  // one continuous flame instead of a warm ball surrounded by a separate effect.
  vec3 dir=normalize(vPosition);
  float palette=.5+.5*sin(dir.x*.72+dir.y*.53+dir.z*.64+uTime*.12);
  vec3 cyan=vec3(.18,.85,1.15), violet=vec3(.72,.42,1.1), amber=vec3(1.25,.62,.24);
  vec3 shared=mix(cyan,violet,palette);
  shared=mix(shared,amber,max(0.,sin(dir.y*.8+uTime*.09))*.32);
  float handoff=smoothstep(.24,.98,length(vPosition));
  vec3 col=mix(dark,fire*.4,smoothstep(.28,.72,n));
  col=mix(col,shared*(.45+.48*n),handoff*.72);
  col+=threads*mix(vec3(1.6,.65,.08),shared, handoff*.68)+rim*mix(vec3(1.5,.16,.02),shared, handoff*.86);
  col+=pow(facing,18.)*vec3(2.2,1.4,.6)*(1.+uVoice*.55+uVoiceBands.z*.22);
  float edge=1.-smoothstep(.72,1.42,length(vPosition));
  // The shell's edge dissolves into its particle corona instead of reading as
  // a hard translucent ball beneath the field.
  float dissolve=1.-smoothstep(.82,1.2,length(vPosition)+(n-.5)*.28);
  gl_FragColor=vec4(col,(.42+.14*edge+.035*uVoice)*dissolve);
}`;

export const shellVertex = /* glsl */ `
uniform float uTime; uniform float uPixelRatio; uniform float uVoice; uniform vec4 uVoiceBands;
attribute float aSeed; attribute float aSize;
varying vec3 vColor; varying float vAlpha;
${noise}
void main(){
  vec3 p=position; vec3 dir=normalize(p);
  float n=fbm(dir*3.4+vec3(uTime*.13,-uTime*.09,uTime*.07));
  float ripple=sin(n*13.+uTime*.45+length(p)*4.);
  float burst=smoothstep(.006,.09,max(uVoice,max(uVoiceBands.y,uVoiceBands.z)*.75));
  float wave=.35+.65*sin(uTime*(3.1+uVoiceBands.z*2.)+n*19.+dir.y*4.);
  p=dir*(length(p)+.4*ripple+.45*(n-.5)+burst*wave*(.14+n*.48));
  p+=vec3(sin(p.y*3.+uTime*.2),cos(p.z*3.-uTime*.2),sin(p.x*3.))* .045;
  vec4 mv=modelViewMatrix*vec4(p,1.);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp(aSize*uPixelRatio*(16.+burst*17.)/max(1.,-mv.z),.65,10.);
  float latitude=dir.y*.5+.5;
  vec3 gold=vec3(1.8,.85,.18), rose=vec3(1.5,.13,.46), ice=vec3(.25,.7,1.1);
  vColor=mix(gold,rose,smoothstep(.28,.82,n)*.78);
  vColor=mix(vColor,ice,smoothstep(1.8,2.5,length(p))*(1.-latitude)*.65);
  float palette=.5+.5*sin(dir.x*.72+dir.y*.53+dir.z*.64+uTime*.12);
  vec3 shared=mix(vec3(.18,.85,1.15),vec3(.72,.42,1.1),palette);
  shared=mix(shared,vec3(1.25,.62,.24),max(0.,sin(dir.y*.8+uTime*.09))*.32);
  vColor=mix(vColor,shared,.58);
  float filament=pow(1.-abs(ripple),2.);
  vAlpha=(.035+filament*.43+burst*.21)*(.65+.35*sin(aSeed*6.28+uTime*.5));
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
