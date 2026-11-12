// A cadeira do topo da home, ao vivo no three.js (home nova, marco 3): o
// modelo sob o canhão de luz, com a poça de luz e a sombra de contato no
// chão, a poeira no feixe e a névoa clara que a dissolve na passagem pras
// seções de baixo. O canvas é transparente: o fundo, o feixe em CSS e as
// duas metades do nome ficam no DOM, atrás e na frente dele.
//
// Reescrito do template "Pente Fino" (src/gl/cadeira.js), com o couro
// conhaque fixo, sem cadeira provisória (quem segura o lugar é a imagem
// parada) e já acesa: a luz que a abertura acende fica pro marco 4.
//
// Este módulo só é importado por import(), depois do load, em aparelho
// que passou pelas portas de podeTer3D.
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  MathUtils,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  SpotLight,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { bolinha, estudio } from "./estudio";
import { NEVOA_DO_CLARO, type EstadoDaCena } from "./rolagem";

export const MODELO_DA_CADEIRA = "/home/cadeira.glb";

const COURO_CONHAQUE = 0x45200d;
/** A cadeira normalizada: do chão ao topo do apoio de cabeça. */
const ALTURA = 1.95;
/** Até aqui a tela é celular (a mesma quebra do CSS do topo). */
const CELULAR = 760;
/**
 * Onde a cadeira cai na largura da tela, em repouso: o mesmo pé do feixe
 * da imagem parada (`--foco-x` do TopoDaHome.module.css).
 */
const X_NO_COMPUTADOR = 0.505;
const X_NO_CELULAR = 0.5;

export type Cena = {
  /** Resolve quando o modelo carregou e o primeiro quadro foi desenhado. */
  pronta: Promise<void>;
  aplicar(estado: EstadoDaCena): void;
  destruir(): void;
};

type Opcoes = {
  /**
   * O intervalo entre um quadro e o seguinte, em ms: o que a pessoa vê,
   * com a GPU incluída (a CadeiraViva mede).
   */
  aoQuadro?: (ms: number) => void;
};

export function criarCena(canvas: HTMLCanvasElement, { aoQuadro }: Opcoes = {}): Cena {
  const celular = () => window.innerWidth <= CELULAR;

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const cena = new Scene();
  const ambiente = estudio(renderer);
  cena.environment = ambiente;
  const nevoa = new FogExp2(NEVOA_DO_CLARO, 0);
  cena.fog = nevoa;

  const camera = new PerspectiveCamera(26, 1, 0.1, 60);

  // O estado que a rolagem mexe; a luz já nasce acesa.
  const e: EstadoDaCena = { giro: 0, zoom: 0, nevoa: 0, poeira: 1, chao: 1 };
  const mouse = { x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0 };

  // ---- luzes ----
  const foco = new SpotLight(0xffffff, 380, 0, 0.36, 0.8, 1.6);
  foco.position.set(0, 7.2, 1.6);
  cena.add(foco, foco.target);
  const recorte = new DirectionalLight(0xdfe6ff, 2.8);
  recorte.position.set(-1.5, 3.2, -5);
  cena.add(recorte);
  const recorte2 = new DirectionalLight(0xffffff, 1.4);
  recorte2.position.set(3, 2.2, -3.5);
  cena.add(recorte2);
  cena.environmentIntensity = 1.3;

  // ---- palco: a cadeira gira dentro dele; o palco fica onde o feixe cai ----
  const palco = new Group();
  cena.add(palco);
  const pivo = new Group();
  palco.add(pivo);

  // ---- chão: poça de luz do canhão + sombra de contato da base ----
  const chao = new Mesh(
    new PlaneGeometry(9, 9),
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uPoca: { value: 1 }, uSombra: { value: 1 } },
      vertexShader:
        "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
      fragmentShader: `varying vec2 vUv; uniform float uPoca, uSombra;
        void main(){
          vec2 p = (vUv - .5) * 9.;
          float poca = pow(smoothstep(2.9, 0., length(p * vec2(.95, 1.25))), 1.6) * .3 * uPoca;
          float sombra = smoothstep(.95, .1, length(p * vec2(1., 1.2))) * .9 * uSombra;
          float a = clamp(poca + sombra, 0., 1.);
          float claro = poca / max(poca + sombra, 1e-4);
          gl_FragColor = vec4(vec3(.86) * claro, a);
        }`,
    })
  );
  chao.rotation.x = -Math.PI / 2;
  chao.position.y = 0.002;
  palco.add(chao);

  // ---- poeira no feixe ----
  const N = celular() ? 140 : 260;
  const pos = new Float32Array(N * 3);
  const fase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const y = 0.15 + Math.random() * 4.6;
    const raio = (0.25 + (5.2 - y) * 0.36) * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    pos.set([Math.cos(a) * raio, y, Math.sin(a) * raio * 0.6 + 0.3], i * 3);
    fase[i] = Math.random() * 100;
  }
  const geoPo = new BufferGeometry();
  geoPo.setAttribute("position", new BufferAttribute(pos, 3));
  geoPo.setAttribute("aFase", new BufferAttribute(fase, 1));
  const mapaDaPoeira = bolinha();
  const poeira = new Points(
    geoPo,
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uT: { value: 0 }, uA: { value: 1 }, uMapa: { value: mapaDaPoeira }, uEscala: { value: 1 } },
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
        void main(){ float m = texture2D(uMapa, gl_PointCoord).a; gl_FragColor = vec4(vec3(1.), m * vA * uA * .8); }`,
    })
  );
  palco.add(poeira);

  // ---- materiais ----
  const couro = new MeshPhysicalMaterial({
    color: COURO_CONHAQUE,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.85,
    clearcoatRoughness: 0.2,
    sheen: 0.18,
    sheenRoughness: 0.5,
    sheenColor: new Color(0x3a3a3a),
  });
  const cromo = new MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.1 });
  const borracha = new MeshPhysicalMaterial({
    color: 0x080808,
    metalness: 0,
    roughness: 0.38,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
  });

  function vestir(raiz: Object3D) {
    raiz.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const m = o.material as MeshStandardMaterial | undefined;
      const nome = `${o.name} ${m?.name ?? ""}`.toLowerCase();
      const metal = (m?.metalness ?? 0) > 0.5 || /chrom|metal|steel|silver|cromo|inox|alum/.test(nome);
      if (metal) o.material = cromo;
      else if (/rubber|borracha|plastic/.test(nome)) o.material = borracha;
      else {
        const c = couro.clone();
        if (m?.normalMap) {
          c.normalMap = m.normalMap;
          c.normalScale = m.normalScale?.clone() ?? new Vector2(1, 1);
        }
        if (m?.roughnessMap) c.roughnessMap = m.roughnessMap;
        o.material = c;
      }
      m?.dispose();
    });
  }

  // Põe a cadeira em pé no chão, centrada, com a altura de referência.
  function normalizar(obj: Object3D) {
    const tam = new Box3().setFromObject(obj).getSize(new Vector3());
    obj.scale.setScalar(ALTURA / tam.y);
    const caixa = new Box3().setFromObject(obj);
    const centro = caixa.getCenter(new Vector3());
    obj.position.x -= centro.x;
    obj.position.z -= centro.z;
    obj.position.y -= caixa.min.y;
  }

  // ---- tamanho e enquadramento ----
  let w = 1;
  let h = 1;
  const alvo = new Vector3();
  function redimensiona() {
    w = canvas.clientWidth || window.innerWidth;
    h = canvas.clientHeight || window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(Math.min(dpr, celular() ? 1.6 : 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    poeira.material.uniforms.uEscala!.value = (h / 900) * Math.min(dpr, 2);
  }

  // A câmera fica parada; o palco anda até o x pedido e o zoom aproxima.
  function enquadra() {
    const cel = celular();
    const dist = MathUtils.lerp(cel ? 11.2 : 7.9, cel ? 8.4 : 6.0, e.zoom);
    camera.position.set(0, MathUtils.lerp(2.15, 1.75, e.zoom), dist);
    alvo.set(0, MathUtils.lerp(cel ? 0.5 : 1.4, cel ? 0.8 : 1.0, e.zoom), 0);
    camera.lookAt(alvo);
    const fx = MathUtils.lerp(cel ? X_NO_CELULAR : X_NO_COMPUTADOR, 0.5, e.zoom);
    const meiaLargura = Math.tan(MathUtils.degToRad(camera.fov / 2)) * dist * camera.aspect;
    palco.position.x = (fx - 0.5) * 2 * meiaLargura;
    foco.position.set(palco.position.x - 0.3, 7.2, 1.6);
    foco.target.position.set(palco.position.x, 0.5, 0);
  }

  // ---- mouse: no computador, a cadeira olha um pouco pro cursor, com mola ----
  const olhaOMouse = window.matchMedia?.("(pointer: fine)").matches ?? false;
  function aoMoverOMouse(ev: PointerEvent) {
    if (ev.pointerType !== "mouse") return;
    mouse.ax = (ev.clientX / window.innerWidth - 0.5) * 2;
    mouse.ay = (ev.clientY / window.innerHeight - 0.5) * 2;
  }
  if (olhaOMouse) window.addEventListener("pointermove", aoMoverOMouse, { passive: true });

  let ultimo = performance.now();
  function quadro(agora: number) {
    const dt = Math.min(0.05, (agora - ultimo) / 1000);
    ultimo = agora;
    for (const k of ["x", "y"] as const) {
      const v = k === "x" ? "vx" : "vy";
      const alvoDoMouse = k === "x" ? mouse.ax : mouse.ay;
      mouse[v] += ((alvoDoMouse - mouse[k]) * 26 - mouse[v] * 7.5) * dt;
      mouse[k] += mouse[v] * dt;
    }
    enquadra();
    pivo.rotation.y = 0.28 + e.giro + mouse.x * 0.16 * (1 - e.zoom * 0.5);
    pivo.rotation.x = mouse.y * 0.025;

    chao.material.uniforms.uPoca!.value = e.chao;
    chao.material.uniforms.uSombra!.value = e.chao;
    poeira.material.uniforms.uA!.value = e.poeira;
    poeira.material.uniforms.uT!.value = agora / 1000;

    // A névoa calibrada pela distância da cadeira: o quanto ela some
    // acompanha e.nevoa (0..1) por igual, perto ou longe.
    const n = Math.min(0.997, Math.max(0, e.nevoa));
    nevoa.density = Math.sqrt(-Math.log(1 - n)) / camera.position.distanceTo(alvo);

    renderer.render(cena, camera);
  }

  // ---- laço: só roda com o modelo pronto e o canvas na tela ----
  let carregada = false;
  let visivel = true;
  let pedido = 0;
  let destruida = false;
  let anterior = 0;
  function laco(agora: number) {
    pedido = 0;
    if (destruida || !visivel || !carregada) return;
    if (anterior) aoQuadro?.(agora - anterior);
    anterior = agora;
    quadro(agora);
    pedido = requestAnimationFrame(laco);
  }
  function liga() {
    if (pedido || destruida) return;
    anterior = 0;
    ultimo = performance.now();
    pedido = requestAnimationFrame(laco);
  }

  const observador = new IntersectionObserver(
    ([entrada]) => {
      visivel = entrada?.isIntersecting ?? true;
      if (visivel) liga();
    },
    { rootMargin: "10% 0px" }
  );
  observador.observe(canvas);
  window.addEventListener("resize", redimensiona);
  redimensiona();

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const pronta = loader.loadAsync(MODELO_DA_CADEIRA).then(
    (gltf) =>
      new Promise<void>((resolve) => {
        if (destruida) return resolve();
        const raiz = gltf.scene;
        vestir(raiz);
        normalizar(raiz);
        pivo.add(raiz);
        // Compila os shaders antes do primeiro quadro, fora do laço.
        renderer.compile(cena, camera);
        carregada = true;
        requestAnimationFrame((agora) => {
          quadro(agora);
          resolve();
          liga();
        });
      })
  );

  return {
    pronta,
    aplicar(estado) {
      Object.assign(e, estado);
    },
    destruir() {
      destruida = true;
      if (pedido) cancelAnimationFrame(pedido);
      observador.disconnect();
      window.removeEventListener("resize", redimensiona);
      window.removeEventListener("pointermove", aoMoverOMouse);
      cena.traverse((o) => {
        if (o instanceof Mesh || o instanceof Points) {
          o.geometry.dispose();
          const materiais = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of materiais) m.dispose();
        }
      });
      mapaDaPoeira.dispose();
      ambiente.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
