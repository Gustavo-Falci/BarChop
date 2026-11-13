// O estúdio que o cromo da cadeira reflete (home nova, marco 3): uma sala
// preta com uma caixa de luz grande em cima (o canhão), tiras finas atrás
// e dos lados (os riscos brancos que desenham o volume do cromo) e um chão
// cinza escuro. Vira um mapa de ambiente (PMREM) uma vez só. Reescrito do
// template "Pente Fino" (src/gl/estudio.js).
import {
  CanvasTexture,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  SRGBColorSpace,
  Scene,
  type Texture,
  type WebGLRenderer,
} from "three";

export function estudio(renderer: WebGLRenderer): Texture {
  const sala = new Scene();
  sala.background = new Color(0x050505);
  const luz = (forca: number) =>
    new MeshBasicMaterial({ color: new Color(0xffffff).multiplyScalar(forca), side: DoubleSide });

  // O canhão: caixa de luz larga e forte (o brilho do assento e do encosto).
  const cima = new Mesh(new PlaneGeometry(4.6, 3.2), luz(6.5));
  cima.position.set(0, 6, 0.8);
  cima.rotation.x = Math.PI / 2;
  sala.add(cima);

  // Tiras verticais altas, atrás e dos lados: x, z, giro, largura, força.
  const tiras: [number, number, number, number, number][] = [
    [-4.2, -2.4, 0.55, 0.8, 4.2],
    [4.4, -1.6, -0.6, 0.8, 4.2],
    [-5.5, 2.5, 1.2, 1.4, 2.4],
    [5.6, 3.2, -1.1, 1.4, 2.4],
  ];
  for (const [x, z, giro, largura, forca] of tiras) {
    const tira = new Mesh(new PlaneGeometry(largura, 8), luz(forca));
    tira.position.set(x, 1.8, z);
    tira.rotation.y = giro;
    sala.add(tira);
  }

  // Recorte alto atrás: a borda do couro acende contra o preto.
  const atras = new Mesh(new PlaneGeometry(5, 1.2), luz(2.6));
  atras.position.set(0, 4.2, -5);
  sala.add(atras);

  // Rebatedor fraco na frente: o cromo não fica preto por baixo.
  const frente = new Mesh(new PlaneGeometry(7, 1.4), luz(0.9));
  frente.position.set(0, 0.5, 6);
  frente.rotation.y = Math.PI;
  sala.add(frente);

  const chao = new Mesh(new PlaneGeometry(30, 30), new MeshBasicMaterial({ color: 0x262626 }));
  chao.rotation.x = -Math.PI / 2;
  chao.position.y = -0.6;
  sala.add(chao);

  const pmrem = new PMREMGenerator(renderer);
  const mapa = pmrem.fromScene(sala, 0.035).texture;
  pmrem.dispose();
  sala.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      (o.material as MeshBasicMaterial).dispose();
    }
  });
  return mapa;
}

// O grão de poeira: um sprite redondo e macio.
export function bolinha(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.35, "rgba(255,255,255,0.45)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
