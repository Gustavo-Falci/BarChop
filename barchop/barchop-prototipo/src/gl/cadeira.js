// A cadeira do hero, ao vivo no Three.js: o modelo (public/modelos/cadeira.glb) sob um canhão de luz, com a poça de
// luz e a sombra de contato no chão, a poeira no feixe e a névoa clara que a dissolve na passagem para a seção de baixo.
// O canvas é transparente: o fundo, o feixe em CSS e as duas metades do nome ficam no DOM, atrás e na frente dele.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { estudio, bolinha } from './estudio.js';
import { CELULAR, REDUZIDO, clamp, lerp } from '../motion/ease.js';

// couro da cadeira por tema (?tema=preto | vinho | conhaque); o resto da página não muda
export const COUROS = { preto: 0x060606, vinho: 0x3a0608, conhaque: 0x45200d };
const ALTURA = 1.95; // a cadeira normalizada: do chão ao topo do apoio de cabeça

export function criarCadeira(canvas, { tema = 'preto', modelo = 'modelos/cadeira.glb' } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const cena = new THREE.Scene();
  cena.environment = estudio(renderer);
  cena.environmentIntensity = 0.0;
  const nevoa = new THREE.FogExp2(0xf7f4ee, 0); // o papel do site do BarChop
  cena.fog = nevoa;

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 60);

  // estado que a abertura e a rolagem mexem (0..1, menos o giro em radianos)
  const e = { luz: 0, contorno: 0, giro: 0, zoom: 0, nevoa: 0, poeira: 0, chao: 0, x: CELULAR() ? 0.5 : 0.505 };
  const mouse = { x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0 };

  // ---- luzes ----
  const foco = new THREE.SpotLight(0xfff1d8, 0, 0, 0.36, 0.8, 1.6); // luz quente, a do feixe em CSS
  foco.position.set(0, 7.2, 1.6);
  cena.add(foco, foco.target);
  const recorte = new THREE.DirectionalLight(0xdfe6ff, 0);
  recorte.position.set(-1.5, 3.2, -5);
  cena.add(recorte);
  const recorte2 = new THREE.DirectionalLight(0xffffff, 0);
  recorte2.position.set(3, 2.2, -3.5);
  cena.add(recorte2);

  // ---- palco: a cadeira gira dentro dele; o palco fica onde o feixe cai ----
  const palco = new THREE.Group();
  cena.add(palco);
  const pivo = new THREE.Group();
  palco.add(pivo);

  // ---- chão: poça de luz do canhão + sombra de contato da base ----
  const chao = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uPoca: { value: 0 }, uSombra: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `varying vec2 vUv; uniform float uPoca, uSombra;
        void main(){
          vec2 p = (vUv - .5) * 9.;
          float poca = pow(smoothstep(2.9, 0., length(p * vec2(.95, 1.25))), 1.6) * .3 * uPoca;
          float sombra = smoothstep(.95, .1, length(p * vec2(1., 1.2))) * .9 * uSombra;
          float a = clamp(poca + sombra, 0., 1.);
          float claro = poca / max(poca + sombra, 1e-4);
          gl_FragColor = vec4(vec3(.92, .87, .76) * claro, a);
        }`,
    }),
  );
  chao.rotation.x = -Math.PI / 2;
  chao.position.y = 0.002;
  palco.add(chao);

  // ---- poeira no feixe ----
  const N = CELULAR() ? 140 : 260;
  const pos = new Float32Array(N * 3), fase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const y = 0.15 + Math.random() * 4.6;
    const raio = (0.25 + (5.2 - y) * 0.36) * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    pos.set([Math.cos(a) * raio, y, Math.sin(a) * raio * 0.6 + 0.3], i * 3);
    fase[i] = Math.random() * 100;
  }
  const geoPo = new THREE.BufferGeometry();
  geoPo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geoPo.setAttribute('aFase', new THREE.BufferAttribute(fase, 1));
  const poeira = new THREE.Points(geoPo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uA: { value: 0 }, uMapa: { value: bolinha() }, uEscala: { value: 1 } },
    vertexShader: `attribute float aFase; uniform float uT, uEscala; varying float vA;
      void main(){
        vec3 p = position;
        float t = uT * .05 + aFase;
        p.x += sin(t * 1.3 + aFase) * .18; p.z += cos(t * .9 + aFase * 1.7) * .12;
        p.y = mod(p.y + uT * .035 + aFase, 4.8) + .15;
        float raio = .25 + (5.2 - p.y) * .36;
        vA = (1. - smoothstep(raio * .55, raio, length(p.xz - vec2(0., .3)))) * smoothstep(.1, .8, p.y) * (.35 + .65 * fract(aFase * 7.31));
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_PointSize = (1.5 + 2.5 * fract(aFase * 3.7)) * uEscala * (6. / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform sampler2D uMapa; uniform float uA; varying float vA;
      void main(){ float m = texture2D(uMapa, gl_PointCoord).a; gl_FragColor = vec4(vec3(1., .93, .78), m * vA * uA * .8); }`,
  }));
  palco.add(poeira);

  // ---- materiais ----
  const couro = new THREE.MeshPhysicalMaterial({ color: COUROS[tema] ?? COUROS.preto, roughness: 0.42, metalness: 0, clearcoat: 0.85, clearcoatRoughness: 0.2, sheen: 0.18, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x3a3a3a) });
  const cromo = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.1 });
  const borracha = new THREE.MeshPhysicalMaterial({ color: 0x080808, metalness: 0, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 });

  let cadeira = null;
  const pronto = carregar().then((c) => { cadeira = c; pivo.add(c); precisa = true; return c; });

  async function carregar() {
    try {
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(new URL(modelo, document.baseURI).href);
      const raiz = gltf.scene;
      raiz.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material;
        const nome = `${o.name} ${m?.name ?? ''}`.toLowerCase();
        const metal = (m?.metalness ?? 0) > 0.5 || /chrom|metal|steel|silver|cromo|inox|alum/.test(nome);
        if (metal) o.material = cromo;
        else if (/rubber|borracha|plastic|black_plastic/.test(nome)) o.material = borracha;
        else {
          const c = couro.clone();
          if (m?.normalMap) { c.normalMap = m.normalMap; c.normalScale = m.normalScale?.clone() ?? new THREE.Vector2(1, 1); }
          if (m?.roughnessMap) c.roughnessMap = m.roughnessMap;
          o.material = c;
          o.userData.couro = true;
        }
      });
      return normalizar(raiz);
    } catch (erro) {
      console.warn('[cadeira] sem o modelo, usando a provisória:', erro?.message ?? erro);
      return normalizar(provisoria());
    }
  }

  function normalizar(obj) {
    const caixa = new THREE.Box3().setFromObject(obj);
    const tam = caixa.getSize(new THREE.Vector3());
    const s = ALTURA / tam.y;
    obj.scale.setScalar(s);
    const c2 = new THREE.Box3().setFromObject(obj);
    const centro = c2.getCenter(new THREE.Vector3());
    obj.position.x -= centro.x;
    obj.position.z -= centro.z;
    obj.position.y -= c2.min.y;
    const g = new THREE.Group();
    g.add(obj);
    return g;
  }

  // cadeira feita em código, só até o modelo chegar (mesma silhueta: base redonda, pistão, assento, encosto em gomos)
  function provisoria() {
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m; };
    add(new THREE.CylinderGeometry(0.62, 0.66, 0.06, 64), cromo, 0, 0.03, 0);
    add(new THREE.CylinderGeometry(0.2, 0.26, 0.12, 48), cromo, 0, 0.12, 0);
    add(new THREE.CylinderGeometry(0.1, 0.12, 0.42, 32), cromo, 0, 0.38, 0);
    add(new RoundedBoxGeometry(0.88, 0.09, 0.82, 4, 0.03), cromo, 0, 0.62, 0.02);
    add(new RoundedBoxGeometry(0.84, 0.2, 0.78, 6, 0.08), couro, 0, 0.76, 0.04);
    for (let i = 0; i < 5; i++) add(new RoundedBoxGeometry(0.15, 0.82, 0.12, 5, 0.055), couro, -0.32 + i * 0.16, 1.27, -0.36, -0.12);
    add(new RoundedBoxGeometry(0.86, 0.86, 0.06, 4, 0.025), cromo, 0, 1.26, -0.44, -0.12);
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 16), cromo, 0, 1.76, -0.46, -0.12);
    add(new RoundedBoxGeometry(0.46, 0.17, 0.12, 5, 0.06), couro, 0, 1.88, -0.47, -0.12);
    for (const lado of [-1, 1]) {
      add(new RoundedBoxGeometry(0.12, 0.08, 0.6, 4, 0.035), couro, lado * 0.5, 1.02, 0.05);
      const curva = new THREE.CatmullRomCurve3([new THREE.Vector3(lado * 0.48, 0.66, 0.3), new THREE.Vector3(lado * 0.52, 0.86, 0.32), new THREE.Vector3(lado * 0.5, 0.98, 0.26), new THREE.Vector3(lado * 0.5, 0.98, -0.2), new THREE.Vector3(lado * 0.47, 0.7, -0.32)]);
      add(new THREE.TubeGeometry(curva, 48, 0.022, 12, false), cromo, 0, 0, 0);
    }
    add(new RoundedBoxGeometry(0.62, 0.05, 0.28, 4, 0.02), cromo, 0, 0.3, 0.62, 0.35);
    return g;
  }

  // ---- tamanho e enquadramento ----
  let w = 1, h = 1, precisa = true, visivel = true, t0 = performance.now();
  const alvo = new THREE.Vector3();
  function redimensiona() {
    w = canvas.clientWidth || innerWidth; h = canvas.clientHeight || innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, CELULAR() ? 1.6 : 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    poeira.material.uniforms.uEscala.value = h / 900 * Math.min(devicePixelRatio, 2);
    e.x = CELULAR() ? 0.5 : 0.505;
    precisa = true;
  }

  // a câmera fica parada; o palco anda até o x da tela pedido (e.x) e o zoom aproxima a câmera
  function enquadra() {
    const cel = CELULAR();
    const dist = lerp(cel ? 11.2 : 7.9, cel ? 8.4 : 6.0, e.zoom);
    const alturaOlho = lerp(2.15, 1.75, e.zoom);
    camera.position.set(0, alturaOlho, dist);
    alvo.set(0, lerp(cel ? 0.5 : 1.4, cel ? 0.8 : 1.0, e.zoom), 0);
    camera.lookAt(alvo);
    // x do palco para cair em e.x da largura (meio da tela no zoom)
    const fx = lerp(e.x, 0.5, e.zoom);
    const meiaLarg = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist * camera.aspect;
    palco.position.x = (fx - 0.5) * 2 * meiaLarg;
    foco.position.set(palco.position.x - 0.3, 7.2, 1.6);
    foco.target.position.set(palco.position.x, 0.5, 0);
  }

  // x do pé do feixe na tela, em px (o CSS desenha o feixe e acende as letras a partir dele)
  const v = new THREE.Vector3();
  function focoNaTela() {
    enquadra();
    camera.updateMatrixWorld();
    v.set(palco.position.x, 2.2, 0).project(camera);
    return (v.x * 0.5 + 0.5) * w;
  }

  // ---- mouse: a cadeira olha um pouco para o cursor, com mola (não com "reduzir movimento") ----
  addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse' || REDUZIDO) return;
    mouse.ax = (ev.clientX / innerWidth - 0.5) * 2;
    mouse.ay = (ev.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });

  function quadro(agora) {
    const dt = Math.min(0.05, (agora - t0) / 1000);
    t0 = agora;
    // mola subamortecida no olhar
    for (const k of ['x', 'y']) {
      const alvoM = k === 'x' ? mouse.ax : mouse.ay;
      const vk = `v${k}`;
      mouse[vk] += ((alvoM - mouse[k]) * 26 - mouse[vk] * 7.5) * dt;
      mouse[k] += mouse[vk] * dt;
    }
    enquadra();
    pivo.rotation.y = 0.28 + e.giro + mouse.x * 0.16 * (1 - e.zoom * 0.5);
    pivo.rotation.x = mouse.y * 0.025;

    const luz = e.luz;
    foco.intensity = 380 * luz;
    cena.environmentIntensity = 0.05 + 1.25 * luz;
    recorte.intensity = 2.2 * e.contorno + 0.6 * luz;
    recorte2.intensity = 1.4 * e.contorno;
    chao.material.uniforms.uPoca.value = luz * e.chao;
    chao.material.uniforms.uSombra.value = Math.max(e.contorno, luz) * e.chao;
    poeira.material.uniforms.uA.value = e.poeira * luz;
    poeira.material.uniforms.uT.value = REDUZIDO ? 0 : agora / 1000; // a poeira fica parada no feixe

    // névoa clara calibrada pela distância da cadeira: o quanto ela some acompanha e.nevoa (0..1) por igual
    const n = Math.min(0.997, clamp(e.nevoa));
    nevoa.density = Math.sqrt(-Math.log(1 - n)) / camera.position.distanceTo(alvo);

    renderer.render(cena, camera);
    precisa = false;
  }

  let rodando = false;
  function laco(agora) {
    if (!visivel) { rodando = false; return; }
    quadro(agora);
    requestAnimationFrame(laco);
  }
  function liga() { if (!rodando) { rodando = true; t0 = performance.now(); requestAnimationFrame(laco); } }

  new IntersectionObserver(([en]) => { visivel = en.isIntersecting; if (visivel) liga(); }, { rootMargin: '10% 0px' }).observe(canvas);
  addEventListener('resize', redimensiona);
  redimensiona();
  liga();

  function definirTema(nome) {
    const cor = COUROS[nome];
    if (cor == null) return;
    cadeira?.traverse((o) => { if (o.userData.couro) o.material.color.setHex(cor); });
    couro.color.setHex(cor);
  }

  return { e, pronto, focoNaTela, redimensiona, definirTema, renderer };
}
