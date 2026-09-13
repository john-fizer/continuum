import * as THREE from 'three';
import type { AttentionSignal } from './attention/events';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  coreVertex,
  coreFragment,
  shellVertex,
  particleFragment,
  dustVertex,
  haloVertex,
  haloFragment,
  noise,
} from './supernova-shaders';

export type GraphData = {
  nodes: {
    id: string;
    title: string;
    x: number;
    y: number;
    phase: number;
    color: string;
  }[];
  edges: { source_a: string; source_b: string; status: string }[];
};
export type SceneControls = {
  zoom: number;
  paused: boolean;
  cinematic: boolean;
  attentionMode?: boolean;
  activatedIds?: string[];
  focusId?: string;
  signal?: AttentionSignal;
};
export type Nova = {
  update: (controls: SceneControls) => void;
  dispose: () => void;
};
function random(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function mountSupernova(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  data: GraphData,
  buttons: Map<string, HTMLButtonElement>,
  initial: SceneControls,
  status: (value: string) => void,
): Nova {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor('#010308');
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.78;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 80);
  const universe = new THREE.Group();
  scene.add(universe);
  const compact = matchMedia('(pointer: coarse)').matches;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let controls = initial,
    reduced = motion.matches,
    width = 1,
    height = 1,
    pixelRatio = 1;
  let disposed = false,
    lost = false,
    visible = true,
    frame = 0,
    previous = 0,
    time = 3.2;
  let slowFrames = 0,
    qualityScale = 1;
  const pointer = new THREE.Vector2(),
    smoothed = new THREE.Vector2();
  const uniforms = { uTime: { value: time }, uPixelRatio: { value: 1 } };
  let signalStarted = time;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.32, 1.05);
  const output = new OutputPass();
  composer.addPass(bloom);
  composer.addPass(output);

  const coreMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: coreVertex,
    fragmentShader: coreFragment,
  });
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.94, 72, 48),
    coreMaterial,
  );
  universe.add(core);
  const particles = compact ? 22000 : 52000;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particles * 3),
    seeds = new Float32Array(particles),
    sizes = new Float32Array(particles);
  const rand = random(8753);
  for (let i = 0; i < particles; i++) {
    const y = rand() * 2 - 1,
      a = rand() * Math.PI * 2,
      r = Math.sqrt(1 - y * y);
    const layer = rand();
    const radius = layer < 0.62 ? 1.48 + rand() * 0.075 : 2.12 + rand() * 0.09;
    positions.set(
      [Math.cos(a) * r * radius, y * radius, Math.sin(a) * r * radius],
      i * 3,
    );
    seeds[i] = rand();
    sizes[i] = 0.45 + Math.pow(rand(), 4) * 1.9;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const shell = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: shellVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  universe.add(shell);

  // Multiple inclined, irregular magnetic loops surround the entire sphere.
  const filamentPositions: number[] = [],
    filamentColors: number[] = [];
  for (let i = 0; i < 24; i++) {
    const tilt = new THREE.Euler(
      rand() * Math.PI,
      rand() * Math.PI,
      rand() * Math.PI,
    );
    let last: THREE.Vector3 | undefined;
    const col = new THREE.Color(
      i % 5 === 0 ? '#a14ec8' : i % 3 === 0 ? '#ff6237' : '#ffa939',
    );
    for (let j = 0; j <= 180; j++) {
      const a = (j / 180) * Math.PI * 2,
        r =
          1.23 + 0.09 * Math.sin(a * 5 + i) + 0.055 * Math.cos(a * 9 + i * 0.6);
      const p = new THREE.Vector3(
        Math.cos(a) * r,
        Math.sin(a) * r,
        0.1 * Math.sin(a * 3 + i),
      ).applyEuler(tilt);
      if (last) {
        filamentPositions.push(...last.toArray(), ...p.toArray());
        filamentColors.push(...col.toArray(), ...col.toArray());
      }
      last = p;
    }
  }
  // Keep the orbital loops available for the source scene, but the primary
  // resting composition starts at the branching geometry below. This avoids
  // a flat, hand-drawn-looking squiggle across the field.
  const branchVertexStart = filamentPositions.length / 3;
  // Forked 3D axons carry waves out through the distant particle field.
  function grow(
    start: THREE.Vector3,
    direction: THREE.Vector3,
    length: number,
    depth: number,
    col: THREE.Color,
  ) {
    const end = start.clone().addScaledVector(direction, length);
    const parts = 9;
    let last = start;
    for (let i = 1; i <= parts; i++) {
      const u = i / parts,
        p = start.clone().lerp(end, u);
      p.add(
        new THREE.Vector3(
          rand() - 0.5,
          rand() - 0.5,
          rand() - 0.5,
        ).multiplyScalar(0.13 * Math.sin(u * Math.PI)),
      );
      filamentPositions.push(...last.toArray(), ...p.toArray());
      filamentColors.push(...col.toArray(), ...col.toArray());
      last = p;
    }
    if (depth > 0)
      for (let i = 0; i < 2; i++)
        grow(
          end,
          direction
            .clone()
            .add(
              new THREE.Vector3(
                rand() - 0.5,
                rand() - 0.5,
                rand() - 0.5,
              ).multiplyScalar(0.8),
            )
            .normalize(),
          length * 0.64,
          depth - 1,
          col,
        );
  }
  for (let arm = 0; arm < 9; arm++) {
    const a = (arm / 9) * Math.PI * 2;
    const d = new THREE.Vector3(
      Math.cos(a),
      Math.sin(a) * 0.85,
      (rand() - 0.5) * 0.95,
    ).normalize();
    grow(
      d.clone().multiplyScalar(1.62),
      d,
      0.8,
      4,
      new THREE.Color(
        ['#3ca8e8', '#a260e8', '#e450a1', '#f69738'][arm % 4],
      ).multiplyScalar(0.5),
    );
  }
  const filamentsGeometry = new THREE.BufferGeometry();
  filamentsGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(filamentPositions, 3),
  );
  filamentsGeometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(filamentColors, 3),
  );
  const filamentMaterial = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `${noise}
      uniform float uTime; attribute vec3 color; varying vec3 vColor; varying float vPulse;
      void main(){vec3 p=position; float r=length(p); p+=normalize(p)*.04*sin(r*5.-uTime*.7);
        float wave=pow(.5+.5*sin(r*7.-uTime*2.8),12.);
        vColor=color*(.6+wave*3.); vPulse=.55+wave*.45;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:
      'varying vec3 vColor; varying float vPulse; void main(){gl_FragColor=vec4(vColor,vPulse);}',
  });
  const filaments = new THREE.LineSegments(filamentsGeometry, filamentMaterial);
  universe.add(filaments);

  // The synthesis point has its own magnetic corona in attention mode. It is
  // a breathing stellar body inside the field, not another graph node.
  const plasmaCorona = new THREE.Group();
  const coronaColors = ['#ffcf78', '#ff743f', '#e64a9e', '#ffdcb0'];
  for (let ring = 0; ring < 9; ring++) {
    const loop = new THREE.Mesh(
      new THREE.TorusGeometry(1.16 + ring * 0.045, 0.007 + (ring % 3) * 0.003, 5, 96),
      new THREE.MeshBasicMaterial({
        color: coronaColors[ring % coronaColors.length],
        transparent: true,
        opacity: 0.16 + (ring % 3) * 0.035,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    loop.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    loop.userData = { spin: (ring % 2 ? -1 : 1) * (0.05 + ring * 0.012), phase: rand() * Math.PI * 2 };
    plasmaCorona.add(loop);
  }
  plasmaCorona.visible = initial.attentionMode === true;
  universe.add(plasmaCorona);

  const starCount = compact ? 1800 : 4500,
    starGeometry = new THREE.BufferGeometry();
  const starPositions = new Float32Array(starCount * 3),
    starColors = new Float32Array(starCount * 3),
    starSizes = new Float32Array(starCount),
    starSeeds = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const dir = new THREE.Vector3(
      rand() - 0.5,
      rand() - 0.5,
      rand() - 0.5,
    ).normalize();
    const distance = 2.4 + Math.pow(rand(), 0.7) * 7;
    starPositions.set(dir.multiplyScalar(distance).toArray(), i * 3);
    starColors.set(
      new THREE.Color(
        i % 7 === 0 ? '#ffb86c' : i % 3 === 0 ? '#b183dd' : '#83c8e4',
      )
        .multiplyScalar(0.34 + rand() * 0.34)
        .toArray(),
      i * 3,
    );
    starSizes[i] = 0.35 + Math.pow(rand(), 9) * 3;
    starSeeds[i] = rand();
  }
  starGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(starPositions, 3),
  );
  starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  starGeometry.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));
  starGeometry.setAttribute('aSeed', new THREE.BufferAttribute(starSeeds, 1));
  const dust = new THREE.Points(
    starGeometry,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: dustVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(dust);

  // The attention view is a volumetric neural atlas. It is deliberately an
  // organism-like field rather than a conventional graph diagram.
  const cortex = new THREE.Group();
  const cortexCount = compact ? 260 : 540;
  const cortexPoints: THREE.Vector3[] = [];
  const cortexColors: number[] = [];
  for (let i = 0; i < cortexCount; i++) {
    const u = (i + 0.5) / cortexCount;
    const phi = Math.acos(1 - 2 * u);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const lobe = 1 + 0.17 * Math.sin(theta * 3. + phi * 5.) + 0.08 * Math.sin(theta * 9.);
    const p = new THREE.Vector3(
      Math.cos(theta) * Math.sin(phi) * lobe * 2.52,
      Math.cos(phi) * lobe * 1.72,
      Math.sin(theta) * Math.sin(phi) * lobe * 1.15,
    );
    cortexPoints.push(p);
    const color = new THREE.Color(i % 5 === 0 ? '#ff9d48' : i % 3 === 0 ? '#c36ae5' : '#40d9f4');
    cortexColors.push(...color.toArray());
  }
  const cortexNodeGeometry = new THREE.BufferGeometry().setFromPoints(cortexPoints);
  cortexNodeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(cortexColors, 3));
  const cortexNodes = new THREE.Points(
    cortexNodeGeometry,
    new THREE.PointsMaterial({
      size: compact ? 0.027 : 0.022,
      transparent: true,
      opacity: 0.38,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  cortex.add(cortexNodes);
  const cortexLines: number[] = [];
  const cortexLineColors: number[] = [];
  for (let i = 0; i < cortexPoints.length; i++) {
    const closest: { index: number; distance: number }[] = [];
    for (let j = 0; j < cortexPoints.length; j++) {
      if (i === j) continue;
      const distance = cortexPoints[i].distanceToSquared(cortexPoints[j]);
      if (distance > 0.32) continue;
      closest.push({ index: j, distance });
    }
    closest.sort((a, b) => a.distance - b.distance).slice(0, 3).forEach(({ index }) => {
      if (index < i) return;
      cortexLines.push(...cortexPoints[i].toArray(), ...cortexPoints[index].toArray());
      const a = new THREE.Color().fromArray(cortexColors, i * 3);
      const b = new THREE.Color().fromArray(cortexColors, index * 3);
      cortexLineColors.push(...a.toArray(), ...b.toArray());
    });
  }
  const cortexLineGeometry = new THREE.BufferGeometry();
  cortexLineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cortexLines, 3));
  cortexLineGeometry.setAttribute('color', new THREE.Float32BufferAttribute(cortexLineColors, 3));
  cortex.add(new THREE.LineSegments(
    cortexLineGeometry,
    new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.075,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  ));
  cortex.visible = initial.attentionMode === true;
  universe.add(cortex);

  // Attention is rendered as a travelling field: cool paths retrieve evidence
  // into the synthesis core while warm paths carry novel associations back out.
  // These are deliberately continuous trajectories, never a node-link diagram.
  const signalField = new THREE.Group();
  const streamStarts: number[] = [], streamEnds: number[] = [], streamColors: number[] = [], streamSeeds: number[] = [];
  const trailPositions: number[] = [], trailColors: number[] = [];
  const streamCount = compact ? 1500 : 4300;
  const paths: { curve: THREE.CatmullRomCurve3; color: THREE.Color; outward: boolean }[] = [];
  for (let arm = 0; arm < 14; arm++) {
    const angle = (arm / 14) * Math.PI * 2 + rand() * 0.18;
    const warm = arm % 4 === 0;
    const color = new THREE.Color(warm ? '#ff9e55' : '#46dcff');
    const edge = new THREE.Vector3(
      Math.cos(angle) * (3.7 + rand() * 1.5),
      Math.sin(angle) * (2.0 + rand() * 1.05),
      (rand() - 0.5) * 2.4,
    );
    const bend = edge.clone().multiplyScalar(0.48).add(new THREE.Vector3(
      Math.sin(angle * 3. + arm) * 0.9,
      Math.cos(angle * 2. + arm) * 0.52,
      (rand() - 0.5) * 1.05,
    ));
    const corePoint = new THREE.Vector3(
      (rand() - 0.5) * 0.5,
      (rand() - 0.5) * 0.42,
      (rand() - 0.5) * 0.45,
    );
    const curve = new THREE.CatmullRomCurve3([edge, bend, corePoint], false, 'centripetal');
    paths.push({ curve, color, outward: warm });
    const points = curve.getPoints(54);
    for (let p = 1; p < points.length; p++) {
      trailPositions.push(...points[p - 1].toArray(), ...points[p].toArray());
      trailColors.push(...color.clone().multiplyScalar(warm ? 0.42 : 0.34).toArray(), ...color.clone().multiplyScalar(warm ? 0.42 : 0.34).toArray());
    }
  }
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.Float32BufferAttribute(trailPositions, 3));
  trailGeometry.setAttribute('color', new THREE.Float32BufferAttribute(trailColors, 3));
  const streamTrails = new THREE.LineSegments(trailGeometry, new THREE.LineBasicMaterial({
    transparent: true, opacity: 0.065, vertexColors: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  signalField.add(streamTrails);
  for (let i = 0; i < streamCount; i++) {
    const path = paths[i % paths.length];
    const u = rand();
    const p = path.curve.getPointAt(u);
    const next = path.curve.getPointAt(Math.min(.999, u + .008));
    streamStarts.push(...p.toArray());
    streamEnds.push(...next.toArray());
    const intensity = 0.7 + rand() * 1.6;
    streamColors.push(...path.color.clone().multiplyScalar(intensity).toArray());
    streamSeeds.push(rand() + (path.outward ? 0.5 : 0));
  }
  const streamGeometry = new THREE.BufferGeometry();
  streamGeometry.setAttribute('position', new THREE.Float32BufferAttribute(streamStarts, 3));
  streamGeometry.setAttribute('aEnd', new THREE.Float32BufferAttribute(streamEnds, 3));
  streamGeometry.setAttribute('color', new THREE.Float32BufferAttribute(streamColors, 3));
  streamGeometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(streamSeeds, 1));
  const streamParticles = new THREE.Points(streamGeometry, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uTime; uniform float uPixelRatio; attribute vec3 aEnd; attribute vec3 color; attribute float aSeed;
      varying vec3 vColor; varying float vAlpha;
      void main(){ float velocity=.12+fract(aSeed*17.)*.18; float wave=fract(aSeed+uTime*velocity); vec3 p=mix(position,aEnd,wave);
        float breath=.65+.35*sin(uTime*1.3+aSeed*40.); vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(uPixelRatio*(8.+fract(aSeed*91.)*18.)/max(1.,-mv.z),1.,7.); vColor=color*(.75+breath); vAlpha=.18+breath*.62; }`,
    fragmentShader: particleFragment,
  }));
  signalField.add(streamParticles);
  signalField.visible = initial.attentionMode === true;
  universe.add(signalField);

  const electronGeometry = new THREE.BufferGeometry();
  const electronStarts: number[] = [],
    electronEnds: number[] = [],
    electronColors: number[] = [],
    electronSeeds: number[] = [];
  const branchStart = 24 * 180 * 6;
  for (let i = 0; i < (compact ? 600 : 1500); i++) {
    const segment =
      branchStart +
      Math.floor(rand() * ((filamentPositions.length - branchStart) / 6)) * 6;
    electronStarts.push(...filamentPositions.slice(segment, segment + 3));
    electronEnds.push(...filamentPositions.slice(segment + 3, segment + 6));
    electronColors.push(
      ...filamentColors.slice(segment, segment + 3).map((v) => v * 3),
    );
    electronSeeds.push(rand());
  }
  electronGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(electronStarts, 3),
  );
  electronGeometry.setAttribute(
    'aEnd',
    new THREE.Float32BufferAttribute(electronEnds, 3),
  );
  electronGeometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(electronColors, 3),
  );
  electronGeometry.setAttribute(
    'aSeed',
    new THREE.Float32BufferAttribute(electronSeeds, 1),
  );
  const decorativeElectrons = new THREE.Points(
    electronGeometry,
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uTime; uniform float uPixelRatio;
      attribute vec3 aEnd; attribute vec3 color; attribute float aSeed;
      varying vec3 vColor; varying float vAlpha;
      void main(){float u=fract(aSeed+uTime*.35); vec3 p=mix(position,aEnd,u);
        p+=normalize(p)*.04*sin(length(p)*5.-uTime*.7);
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(uPixelRatio*22./max(1.,-mv.z),1.,5.);
        vColor=color;vAlpha=sin(u*3.14159)*.65;}`,
      fragmentShader: particleFragment,
    }),
  );
  universe.add(decorativeElectrons);

  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 7),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: haloVertex,
      fragmentShader: haloFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(halo);
  // Actual source nodes are separate from decorative particles and retain source IDs.
  const nodeGroup = new THREE.Group();
  universe.add(nodeGroup);
  const nodeMeshes = new Map<
    string,
    THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  >();
  const nodeGeometry = new THREE.SphereGeometry(0.057, 12, 8);
  for (const n of [...data.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    const mesh = new THREE.Mesh(
      nodeGeometry,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(n.color).multiplyScalar(2.5),
        transparent: true,
      }),
    );
    mesh.position.set(n.x / 83, -n.y / 83, Math.sin(n.phase) * 0.65 + 0.35);
    // Give small source hit targets room; decorative particles never intercept them.
    for (let attempt = 0; attempt < 36; attempt++) {
      if (n.id === initial.focusId) break;
      const overlap = Array.from(nodeMeshes.values()).some(
        (other) =>
          Math.hypot(
            other.position.x - mesh.position.x,
            other.position.y - mesh.position.y,
          ) < 0.82,
      );
      if (!overlap) break;
      mesh.position.applyAxisAngle(new THREE.Vector3(0, 0, 1), 0.23);
      if (attempt % 12 === 11) {
        mesh.position.x *= 1.07;
        mesh.position.y *= 1.07;
      }
    }
    nodeMeshes.set(n.id, mesh);
    nodeGroup.add(mesh);
  }
  // A focused concept is a small recursive field, not a labeled endpoint on a wire.
  // The geometry makes the working graph read as nested attention around the core.
  const conceptFields = new THREE.Group();
  for (const n of data.nodes.filter((node) => node.id.startsWith('term:'))) {
    const anchor = nodeMeshes.get(n.id);
    if (!anchor) continue;
    const field = new THREE.Group();
    field.position.copy(anchor.position);
    for (let layer = 0; layer < 3; layer++) {
      const points: THREE.Vector3[] = [];
      const count = 42;
      for (let step = 0; step < count; step++) {
        const a = (step / count) * Math.PI * 2;
        const ripple = 1 + Math.sin(a * (3 + layer) + n.phase) * 0.16;
        const radius = (0.17 + layer * 0.115) * ripple;
        points.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, Math.sin(a * 2 + layer) * 0.05));
      }
      const loop = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: new THREE.Color(n.color).multiplyScalar(1.8),
          transparent: true,
          opacity: 0.22 - layer * 0.045,
          blending: THREE.AdditiveBlending,
        }),
      );
      loop.rotation.z = layer * 0.9;
      field.add(loop);
    }
    conceptFields.add(field);
  }
  nodeGroup.add(conceptFields);
  for (const edge of data.edges) {
    const a = nodeMeshes.get(edge.source_a),
      b = nodeMeshes.get(edge.source_b);
    if (!a || !b) continue;
    const curve = new THREE.QuadraticBezierCurve3(
      a.position,
      a.position
        .clone()
        .lerp(b.position, 0.5)
        .multiplyScalar(0.7)
        .add(new THREE.Vector3(0, 0, 0.45)),
      b.position,
    );
    const material = new THREE.LineBasicMaterial({
      color: edge.status === 'accepted' ? '#7adcf2' : '#f0bb7b',
      transparent: true,
      opacity: controls.attentionMode ? 0.16 : 0.38,
      blending: THREE.AdditiveBlending,
    });
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(curve.getPoints(32)),
      material,
    );
    nodeGroup.add(line);
  }
  // Event trails represent retrieval/write traffic for actual source IDs.
  const trafficGeometry = new THREE.BufferGeometry();
  const trafficPositions = new Float32Array(120 * 12 * 3);
  trafficGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(trafficPositions, 3),
  );
  const trafficMaterial = new THREE.PointsMaterial({
    color: '#78dfff',
    size: 0.032,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const traffic = new THREE.Points(trafficGeometry, trafficMaterial);
  traffic.frustumCulled = false;
  universe.add(traffic);
  const projected = new THREE.Vector3();
  function draw() {
    if (disposed || lost) return;
    const t = reduced ? 3.2 : time;
    uniforms.uTime.value = t;
    decorativeElectrons.visible = true;
    cortex.visible = controls.attentionMode === true;
    signalField.visible = controls.attentionMode === true;
    signalField.rotation.z = Math.sin(t * 0.12) * 0.06;
    signalField.rotation.y = t * 0.035;
    streamTrails.material.opacity = controls.attentionMode ? 0.065 + Math.sin(t * 1.1) * 0.018 : 0;
    filaments.visible = !controls.attentionMode;
    plasmaCorona.visible = controls.attentionMode === true;
    plasmaCorona.scale.setScalar(0.76 + Math.sin(t * 1.18) * 0.07 + Math.sin(t * 0.31) * 0.035);
    plasmaCorona.children.forEach((loop) => {
      loop.rotation.z += loop.userData.spin * (reduced ? 0.012 : 0.026);
      loop.rotation.x += Math.sin(t * 0.62 + loop.userData.phase) * 0.0018;
    });
    cortex.rotation.y = t * 0.09;
    cortex.rotation.z = Math.sin(t * 0.13) * 0.12;
    cortex.scale.setScalar(1 + Math.sin(t * 0.6) * 0.018);
    filamentsGeometry.setDrawRange(
      controls.attentionMode ? 0 : branchVertexStart,
      controls.attentionMode ? 0 : Infinity,
    );
    conceptFields.rotation.z = t * 0.14;
    conceptFields.rotation.x = Math.sin(t * 0.21) * 0.08;
    core.scale.setScalar(
      (controls.attentionMode ? 0.86 : controls.focusId ? 0.68 : 1) *
        (1 + Math.sin(t * 1.18) * 0.07 + Math.sin(t * 0.31) * 0.025),
    );
    shell.scale.setScalar(controls.attentionMode ? 0.8 + Math.sin(t * 1.18) * 0.045 : 1);
    core.position.z = controls.focusId ? -0.3 : 0;
    const signal = controls.signal;
    const progress = reduced
      ? 1
      : Math.min(1, Math.max(0, (time - signalStarted) / 3.2));
    trafficMaterial.opacity =
      signal && progress < 1 ? Math.sin(progress * Math.PI) * 0.85 : 0;
    trafficMaterial.color.set(
      signal?.type === 'knowledge.commit' ? '#ffce79' : '#7bdfff',
    );
    let count = 0;
    for (const id of signal?.sourceIds.slice(0, 120) || []) {
      const target = nodeMeshes.get(id);
      if (!target) continue;
      for (let i = 0; i < 12; i++) {
        const p = Math.max(0, Math.min(1, progress - i * 0.017));
        const factor = signal?.type === 'knowledge.commit' ? p : 1 - p;
        const arc = Math.sin(factor * Math.PI);
        trafficPositions[count++] = target.position.x * factor + arc * 0.19;
        trafficPositions[count++] = target.position.y * factor + arc * 0.15;
        trafficPositions[count++] = target.position.z * factor + arc * 0.42;
      }
    }
    trafficGeometry.setDrawRange(0, count / 3);
    trafficGeometry.attributes.position.needsUpdate = true;
    const aiming =
      host.querySelector('.living-node:hover, .living-node:focus-visible') !==
      null;
    if (!aiming) smoothed.lerp(pointer, reduced ? 1 : 0.06);
    const distance = 10.8 / Math.min(1, width / height) / controls.zoom;
    camera.position.set(smoothed.x * 1.8, -smoothed.y * 1.24, distance);
    camera.lookAt(0, 0, 0);
    core.rotation.set(t * 0.023, t * 0.075, 0.2);
    shell.rotation.set(0.16 + Math.sin(t * 0.06) * 0.08, t * 0.033, 0.2);
    if (!aiming)
      universe.rotation.set(
        -0.06 + smoothed.y * 0.1,
        smoothed.x * 0.16,
        0.06 * Math.sin(t * 0.07),
      );
    halo.quaternion.copy(camera.quaternion);
    dust.rotation.y = t * 0.006;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    for (const n of data.nodes) {
      const mesh = nodeMeshes.get(n.id)!,
        button = buttons.get(n.id);
      if (!button) continue;
      mesh.getWorldPosition(projected).project(camera);
      const inside =
        Math.abs(projected.x) < 0.96 &&
        Math.abs(projected.y) < 0.9 &&
        projected.z < 1;
      button.style.left = `${(projected.x * 0.5 + 0.5) * width}px`;
      button.style.top = `${(-projected.y * 0.5 + 0.5) * height}px`;
      button.style.visibility = inside ? 'visible' : 'hidden';
      const active =
        button.matches(':hover,:focus-visible') ||
        controls.activatedIds?.includes(n.id) ||
        controls.focusId === n.id;
      mesh.scale.setScalar(active ? 1.8 : 1);
      mesh.material.color
        .set(n.color)
        .multiplyScalar(active ? 3.2 : controls.attentionMode ? 0.6 : 2.5);
      mesh.material.opacity = controls.attentionMode ? (active ? 1 : 0.06) : 1;
    }
    composer.render();
  }
  function report() {
    status(
      lost
        ? 'Graphics interrupted'
        : reduced
          ? 'Reduced motion'
          : controls.paused
            ? 'Motion paused'
            : controls.cinematic
              ? 'Cinematic · 3D'
              : 'Live · 3D',
    );
  }
  function resize() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    const pixelBudget = controls.cinematic
      ? 8294400
      : compact
        ? 1100000
        : 2800000;
    pixelRatio =
      Math.min(
        devicePixelRatio || 1,
        controls.cinematic ? 2.5 : 1.75,
        Math.sqrt(pixelBudget / (width * height)),
      ) * qualityScale;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    uniforms.uPixelRatio.value = pixelRatio;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    draw();
  }
  function tick(now: number) {
    if (disposed || lost) return;
    const dt = previous ? now - previous : 16.7;
    if (dt >= 1000 / (compact ? 30 : 60) - 1) {
      time += Math.min(dt / 1000, 0.055);
      previous = now;
      draw();
      if (!controls.cinematic && dt > 48) {
        slowFrames++;
      } else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames > 60 && qualityScale > 0.6) {
        qualityScale *= 0.85;
        slowFrames = 0;
        resize();
      }
    }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame);
    previous = 0;
    report();
    if (disposed || lost) return;
    draw();
    if (visible && !document.hidden && !controls.paused && !reduced)
      frame = requestAnimationFrame(tick);
  }
  function move(e: PointerEvent) {
    if (reduced) return;
    const r = host.getBoundingClientRect();
    pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      ((e.clientY - r.top) / r.height) * 2 - 1,
    );
    if (controls.paused) draw();
  }
  function leave() {
    pointer.set(0, 0);
    if (controls.paused) draw();
  }
  function motionChange() {
    reduced = motion.matches;
    if (reduced) {
      pointer.set(0, 0);
      smoothed.set(0, 0);
    }
    sync();
  }
  function contextLost(e: Event) {
    e.preventDefault();
    lost = true;
    cancelAnimationFrame(frame);
    report();
  }
  function contextRestored() {
    lost = false;
    resize();
    sync();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const visibilityObserver = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    sync();
  });
  visibilityObserver.observe(host);
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerleave', leave);
  host.addEventListener('focusin', draw);
  host.addEventListener('focusout', draw);
  motion.addEventListener('change', motionChange);
  document.addEventListener('visibilitychange', sync);
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);
  resize();
  sync();
  return {
    update(next) {
      const qualityChanged = controls.cinematic !== next.cinematic;
      if (controls.signal?.id !== next.signal?.id) signalStarted = time;
      controls = next;
      if (qualityChanged) {
        qualityScale = 1;
        resize();
      }
      sync();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerleave', leave);
      host.removeEventListener('focusin', draw);
      host.removeEventListener('focusout', draw);
      motion.removeEventListener('change', motionChange);
      document.removeEventListener('visibilitychange', sync);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', contextRestored);
      const geometries = new Set<THREE.BufferGeometry>([nodeGeometry]),
        materials = new Set<THREE.Material>();
      scene.traverse((obj) => {
        if (
          obj instanceof THREE.Mesh ||
          obj instanceof THREE.Points ||
          obj instanceof THREE.Line
        ) {
          geometries.add(obj.geometry);
          (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(
            (m) => materials.add(m),
          );
        }
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      bloom.dispose();
      output.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
