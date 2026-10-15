// Mostruário 3D do Corolla: arrastar para girar (com inércia), ângulos de câmera e faróis que acendem.
// Carregado sob demanda pelo botão "3D" da seção O carro; three.js vem do import map do index.html.
// Modelo: "2023 Toyota Corolla Hybrid" por tonielpro520 (CC BY 4.0), comprimido com gltf-transform (meshopt + webp).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const PAINT = new THREE.MeshPhysicalMaterial({
  color: 0xf5f5f3, metalness: 0.3, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05,
  sheen: 0.35, sheenColor: new THREE.Color(0xdfe7ff), side: THREE.DoubleSide,
});
const HEAD = /Refletor_Farol/;
const TAIL = /Lanterna|Vidros_Vermelhos/;

export async function mount(container, { url, onProgress, onReady, onError } = {}) {
  const host = container.querySelector('.car-3d-canvas');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    onError?.(err);
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(4, 7, 3);
  scene.add(key, new THREE.HemisphereLight(0xc7d6ff, 0x16161a, 0.5));

  const camera = new THREE.PerspectiveCamera(32, 1, 0.02, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.8;
  controls.enablePan = false;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.autoRotate = !reduce;
  controls.autoRotateSpeed = 0.55;

  // carrega o modelo
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  let gltf;
  try {
    gltf = await loader.loadAsync(url, (e) => e.total && onProgress?.(e.loaded / e.total));
  } catch (err) {
    onError?.(err);
    renderer.dispose();
    renderer.domElement.remove();
    return null;
  }
  const car = gltf.scene;

  // pintura branco perolado e materiais das luzes (cada luz ganha um material próprio para acender)
  const lights = { head: [], tail: [] };
  car.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.material?.name || '';
    if (/Pintura/.test(name)) o.material = PAINT;
    else if (HEAD.test(name) || TAIL.test(name)) {
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color(HEAD.test(name) ? 0xf2f6ff : 0xff2a1a);
      o.material.emissiveIntensity = 0;
      (HEAD.test(name) ? lights.head : lights.tail).push(o);
      o.userData.light = true;
    }
  });

  // centraliza e normaliza (comprimento ~4,6)
  let box = new THREE.Box3().setFromObject(car);
  const raw = box.getSize(new THREE.Vector3());
  car.scale.setScalar(4.6 / Math.max(raw.x, raw.z));
  box.setFromObject(car);
  const c0 = box.getCenter(new THREE.Vector3());
  car.position.sub(new THREE.Vector3(c0.x, box.min.y, c0.z));
  scene.add(car);
  box = new THREE.Box3().setFromObject(car);
  const size = box.getSize(new THREE.Vector3());
  const L = size.x >= size.z ? 'x' : 'z';
  const W = L === 'x' ? 'z' : 'x';
  // frente = lado oposto às lanternas vermelhas (o material do farol aparece nas duas pontas)
  const tailBox = new THREE.Box3();
  car.traverse((o) => { if (o.isMesh && /Vidros_Vermelhos/.test(o.material?.name || '')) tailBox.expandByObject(o); });
  const front = tailBox.isEmpty() ? 1 : -Math.sign(tailBox.getCenter(new THREE.Vector3())[L]) || 1;
  const vec = (along, across, up) => { const v = new THREE.Vector3(); v[L] = along * front; v[W] = across; v.y = up; return v; };

  // vitrine: disco escuro, aro azul fino e sombra de contato
  const radius = Math.max(size.x, size.z) * 0.62;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 96), new THREE.MeshStandardMaterial({ color: 0x0b0b0e, metalness: 0.15, roughness: 0.7, envMapIntensity: 0.35 }));
  disc.rotation.x = -Math.PI / 2;
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.995, radius * 1.01, 128), new THREE.MeshBasicMaterial({ color: 0x5b8cff, transparent: true, opacity: 0.4 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.001;
  const shadowTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d'); const r = g.createRadialGradient(128, 128, 8, 128, 128, 128);
    r.addColorStop(0, 'rgba(0,0,0,0.8)'); r.addColorStop(0.55, 'rgba(0,0,0,0.4)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(cv);
  })();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 1.2, size.z * 1.2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  scene.add(disc, ring, shadow);

  const len = Math.max(size.x, size.z), h = size.y;

  // brilho dos faróis e lanternas: sprites aditivos que acompanham o acendimento
  const glowTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(cv);
  })();
  const glows = [];
  const addGlow = (pos, color, scale) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.position.copy(pos); sp.scale.setScalar(scale); scene.add(sp); glows.push(sp);
  };
  for (const side of [-1, 1]) {
    addGlow(vec(len * 0.47, side * size[W] * 0.33, h * 0.5), 0xe8f0ff, len * 0.11);
    addGlow(vec(-len * 0.48, side * size[W] * 0.38, h * 0.62), 0xff3020, len * 0.11);
  }

  // ângulos de câmera
  const VIEWS = {
    tres: { pos: vec(len * 1.15, len * 1.05, h * 1.35), target: new THREE.Vector3(0, h * 0.4, 0), outside: true },
    frente: { pos: vec(len * 1.45, 0, h * 0.9), target: new THREE.Vector3(0, h * 0.45, 0), outside: true },
    lado: { pos: vec(0, len * 1.45, h * 0.8), target: new THREE.Vector3(0, h * 0.42, 0), outside: true },
    traseira: { pos: vec(-len * 1.45, len * 0.25, h * 1.0), target: new THREE.Vector3(0, h * 0.45, 0), outside: true },
  };
  const setLimits = (outside) => {
    if (outside) {
      controls.minDistance = len * 0.75; controls.maxDistance = len * 2.2;
      controls.minPolarAngle = Math.PI * 0.16; controls.maxPolarAngle = Math.PI * 0.49;
    } else {
      controls.minDistance = 0.05; controls.maxDistance = len * 0.12;
      controls.minPolarAngle = Math.PI * 0.3; controls.maxPolarAngle = Math.PI * 0.62;
    }
  };
  let fly = null;
  const goTo = (name) => {
    const v = VIEWS[name]; if (!v) return;
    stopAuto();
    setLimits(true); // libera a transição; aplica os limites do destino ao chegar
    controls.minDistance = 0; controls.maxDistance = Infinity; controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI;
    fly = { fromP: camera.position.clone(), fromT: controls.target.clone(), toP: v.pos.clone(), toT: v.target.clone(), t: 0, outside: v.outside };
    controls.autoRotate = false;
  };
  camera.position.copy(VIEWS.tres.pos);
  controls.target.copy(VIEWS.tres.target);
  setLimits(true);
  controls.update();

  // faróis: clique nas luzes do modelo ou no botão
  let lightsOn = false, glow = 0;
  const setLights = (on) => { lightsOn = on; container.dispatchEvent(new CustomEvent('car3d:lights', { detail: on })); };

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  const pick = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(car, true)[0];
    return hit?.object.userData.light;
  };
  renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; stopAuto(); fly = null; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && pick(e)) setLights(!lightsOn);
    down = null;
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || down) return;
    renderer.domElement.style.cursor = pick(e) ? 'pointer' : 'grab';
  });

  let idle;
  function stopAuto() {
    controls.autoRotate = false;
    clearTimeout(idle);
    if (!reduce) idle = setTimeout(() => { if (!fly && camera.position.distanceTo(controls.target) > len * 0.5) controls.autoRotate = true; }, 7000);
  }
  controls.addEventListener('start', stopAuto);

  const resize = () => {
    const w = host.clientWidth, hh = host.clientHeight;
    if (!w || !hh) return;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    camera.fov = camera.aspect < 1.1 ? 44 : 32; // tela estreita: abre o campo para o carro caber
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(host);
  resize();

  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(container);
  const clock = new THREE.Clock();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visible || document.hidden || container.hidden) return;
    if (fly) {
      fly.t = Math.min(1, fly.t + dt / 1.1);
      const k = ease(fly.t);
      camera.position.lerpVectors(fly.fromP, fly.toP, k);
      controls.target.lerpVectors(fly.fromT, fly.toT, k);
      if (fly.t >= 1) { setLimits(fly.outside); fly = null; }
    }
    glow += ((lightsOn ? 1 : 0) - glow) * (1 - Math.exp(-dt * 8));
    lights.head.forEach((m) => { m.material.emissiveIntensity = glow * 2.2; });
    lights.tail.forEach((m) => { m.material.emissiveIntensity = glow * 1.6; });
    glows.forEach((g) => { g.material.opacity = glow * 0.9; });
    controls.update();
    renderer.render(scene, camera);
  });

  onReady?.();
  return { goTo, setLights: (on) => setLights(on), get lightsOn() { return lightsOn; } };
}
