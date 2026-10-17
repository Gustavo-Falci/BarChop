import estilos from "./Carregando.module.css";

// Enquanto a tela busca os dados, um esqueleto com a forma de uma tela
// do painel (título, linha de apoio, cartões) no lugar do "Carregando…"
// solto: quando o conteúdo chega, ele cai no mesmo lugar em vez de
// empurrar tudo. O texto continua pro leitor de tela, no status.
export function Carregando() {
  return (
    <div className={estilos.esqueleto} role="status" aria-live="polite">
      <span className={estilos.textoOculto}>Carregando…</span>
      <span className={`${estilos.bloco} ${estilos.titulo}`} aria-hidden="true" />
      <span className={`${estilos.bloco} ${estilos.apoio}`} aria-hidden="true" />
      <span className={`${estilos.bloco} ${estilos.cartao}`} aria-hidden="true" />
      <span className={`${estilos.bloco} ${estilos.cartao} ${estilos.menor}`} aria-hidden="true" />
    </div>
  );
}
