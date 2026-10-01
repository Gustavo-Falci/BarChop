import { useSyncExternalStore } from "react";
import { EVENTO_DE_SESSAO, sessaoDoCliente } from "./armazenamento";

function assinar(aoMudar: () => void) {
  window.addEventListener(EVENTO_DE_SESSAO, aoMudar);
  // `storage` cobre o login e o logout feitos em outra aba.
  window.addEventListener("storage", aoMudar);
  return () => {
    window.removeEventListener(EVENTO_DE_SESSAO, aoMudar);
    window.removeEventListener("storage", aoMudar);
  };
}

// Se o cliente tem sessão nesta barbearia, acompanhando login e logout
// sem precisar remontar quem pergunta.
//
// `undefined` enquanto não dá pra saber: no servidor não há
// localStorage, e responder `false` ali faria o HTML vir com "Entrar" e
// a hidratação trocar por "Meus agendamentos" — um piscar, e um aviso de
// hidratação. Quem usa desenha nada até ter a resposta.
export function useTemSessaoDoCliente(slug: string): boolean | undefined {
  const token = useSyncExternalStore(
    assinar,
    () => sessaoDoCliente(slug).ler(),
    () => undefined
  );
  return token === undefined ? undefined : token !== null;
}
