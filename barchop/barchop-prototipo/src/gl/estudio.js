// O estúdio que o cromo reflete: uma sala preta com uma caixa de luz grande em cima (o canhão), duas tiras finas atrás
// (os riscos brancos que desenham o volume do cromo) e um chão cinza escuro. Vira um mapa de ambiente (PMREM) uma vez só.
import * as THREE from 'three';

export function estudio(renderer, { claro = false } = {}) {
  const cena = new THREE.Scene();
  cena.background = new THREE.Color(claro ? 0x8a8987 : 0x050505);
  const luz = (cor, forca) => new THREE.MeshBasicMaterial({ color: new THREE.Color(cor).multiplyScalar(forca), side: THREE.DoubleSide });

  // canhão de cima: caixa de luz larga, bem forte (desenha o brilho do assento e do encosto)
  const cima = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.2), luz(0xffffff, claro ? 3.4 : 6.5));
  cima.position.set(0, 6, 0.8);
  cima.rotation.x = Math.PI / 2;
  cena.add(cima);

  // tiras verticais altas atrás e dos lados: os riscos brancos que desenham o volume do cromo
  for (const [x, z, r, lg, f] of [[-4.2, -2.4, 0.55, 0.8, 4.2], [4.4, -1.6, -0.6, 0.8, 4.2], [-5.5, 2.5, 1.2, 1.4, 2.4], [5.6, 3.2, -1.1, 1.4, 2.4]]) {
    const tira = new THREE.Mesh(new THREE.PlaneGeometry(lg, 8), luz(0xffffff, claro ? f * 0.6 : f));
    tira.position.set(x, 1.8, z);
    tira.rotation.y = r;
    cena.add(tira);
  }
  // recorte alto atrás (a borda do couro acende contra o preto)
  const atras = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.2), luz(0xffffff, claro ? 1.6 : 2.6));
  atras.position.set(0, 4.2, -5);
  cena.add(atras);
  // rebatedor baixo na frente, fraco (o cromo não fica preto por baixo)
  const frente = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.4), luz(0xffffff, claro ? 1.3 : 0.9));
  frente.position.set(0, 0.5, 6);
  frente.rotation.y = Math.PI;
  cena.add(frente);
  // chão
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), luz(claro ? 0xbdbcb9 : 0x262626, 1));
  chao.rotation.x = -Math.PI / 2;
  chao.position.y = -0.6;
  cena.add(chao);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const mapa = pmrem.fromScene(cena, 0.035).texture;
  pmrem.dispose();
  cena.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return mapa;
}

// sprite redondo e macio (poeira no feixe)
export function bolinha() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
