"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { PerfilBarbeiro } from "@barchop/types";
import {
  encerrarSessaoDoBarbeiro,
  EVENTO_DE_SESSAO,
  sessaoDaBarbearia,
  sessaoDoBarbeiro,
} from "../sessao/armazenamento";
import { registrarSaidaDoPainel } from "../sessao/cliente-da-api";
import { useApiDoPainel } from "./ProvedorDoPainel";

interface Painel {
  perfil: PerfilBarbeiro;
  slug: string;
  sair: () => void;
  // O perfil é lido uma vez, ao abrir o painel. Quem muda o próprio
  // papel (Equipe) relê, senão a barra seguiria mostrando o que o papel
  // novo já não pode — e cada clique ali voltaria 403.
  recarregarPerfil: () => Promise<void>;
}

const Contexto = createContext<Painel | null>(null);

// A guarda vive aqui e não em cada tela: guarda por repetição depende de
// ninguém esquecer o hook, e quem esquecesse publicaria a tela sem
// sessão em silêncio. É o mesmo motivo de o app.ts da API usar escopo
// com onRequest em vez de pendurar o hook rota a rota.
export function SessaoDoPainel({ children }: { children: ReactNode }) {
  const router = useRouter();
  const api = useApiDoPainel();
  const [perfil, setPerfil] = useState<PerfilBarbeiro | null>(null);
  // Estado, e não leitura solta no render: o layout do painel não
  // remonta entre telas, e trocar o link em Configurações regrava o
  // slug — sem acompanhar o evento, o novo agendamento seguiria
  // consultando a disponibilidade pelo endereço que acabou de morrer.
  const [slug, setSlug] = useState(() => sessaoDaBarbearia.ler() ?? "");

  useEffect(() => {
    const acompanhar = () => setSlug(sessaoDaBarbearia.ler() ?? "");
    window.addEventListener(EVENTO_DE_SESSAO, acompanhar);
    return () => window.removeEventListener(EVENTO_DE_SESSAO, acompanhar);
  }, []);

  const sair = useCallback(() => {
    encerrarSessaoDoBarbeiro();
    router.replace("/painel/entrar");
  }, [router]);

  // `apiDoPainel` monta o client de verdade uma vez, em `ProvedorDoPainel`,
  // sem router — um 401 que chegue de uma tela já montada (não da
  // checagem abaixo) precisa de um jeito de navegar mesmo assim. Este
  // efeito empresta o `sair` de cima pra esse handler chamar; roda antes
  // do guard de `!perfil` mais abaixo, então o registro existe mesmo
  // enquanto o perfil ainda está carregando.
  useEffect(() => {
    registrarSaidaDoPainel(sair);
    return () => registrarSaidaDoPainel(null);
  }, [sair]);

  useEffect(() => {
    if (!sessaoDoBarbeiro.ler()) {
      router.replace("/painel/entrar");
      return;
    }

    let vivo = true;
    api.barbeiro
      .meuPerfil()
      .then((resposta) => {
        if (vivo) setPerfil(resposta);
      })
      .catch(() => {
        if (!vivo) return;
        // Qualquer falha ao provar quem é o chamador termina do mesmo
        // jeito: sem perfil não há painel. O 401 é o caso comum — o
        // token vale 7 dias e o hook da API consulta o banco a cada
        // requisição, então desativar um barbeiro invalida na hora.
        sair();
      });

    return () => {
      vivo = false;
    };
  }, [api, router, sair]);

  // Mesmo desfecho da carga inicial: perfil que não se prova é sessão
  // que acabou — inclusive o membro que se desativou.
  const recarregarPerfil = useCallback(async () => {
    try {
      setPerfil(await api.barbeiro.meuPerfil());
    } catch {
      sair();
    }
  }, [api, sair]);

  // Nada renderiza antes do perfil: uma tela que aparecesse e sumisse
  // seria pior do que uma que demora.
  if (!perfil) return null;

  return (
    <Contexto.Provider
      value={{ perfil, slug, sair, recarregarPerfil }}
    >
      {children}
    </Contexto.Provider>
  );
}

export function usePainel(): Painel {
  const painel = useContext(Contexto);
  if (!painel) {
    throw new Error("usePainel precisa estar dentro de um SessaoDoPainel");
  }
  return painel;
}
