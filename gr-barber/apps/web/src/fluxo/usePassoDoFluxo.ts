"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { caminhoDoPasso, lerEscolhas, type Escolhas, type Passo } from "./passos";
import { ehPassado } from "../formato/datas";

// Pré-requisitos são cumulativos, não por campo: "dados" e "confirmar"
// precisam de serviço, dia e hora — tudo o que o passo "data" (que
// escolhe dia e horário na mesma tela) produz, mais o que ele próprio
// precisa. Checar cada campo isolado deixava combinação quebrada
// passar — .../dados?hora=09:00 sem serviço nem data renderizava um
// formulário que levava a uma tela de confirmação em branco. A ordem
// da lista é a ordem de checagem: a primeira que faltar decide o passo
// de volta.
//
// O passo "data" não exige data: sem ela (ou com uma passada) a tela
// abre no primeiro dia com vaga, em vez de mandar a pessoa de volta.
//
// A checagem de data passada mora aqui, não só na tela de horário: a
// API não tem noção de "hoje", aceita marcar num dia que já passou, e
// depois recusa cancelar ou remarcar esse mesmo agendamento — um link
// velho com `data` no passado não pode chegar em nenhum passo depois
// de "data".
interface Checagem {
  aplicaA: Passo[];
  falta: (escolhas: Escolhas, agora: Date) => boolean;
  volta: Passo;
}

const CHECAGENS: Checagem[] = [
  {
    aplicaA: ["data", "dados", "confirmar"],
    falta: (e) => e.servicoIds.length === 0,
    volta: "servicos",
  },
  {
    aplicaA: ["dados", "confirmar"],
    falta: (e) => !e.data,
    volta: "data",
  },
  {
    aplicaA: ["dados", "confirmar"],
    falta: (e, agora) => e.data !== undefined && ehPassado(e.data, agora),
    volta: "data",
  },
  {
    aplicaA: ["dados", "confirmar"],
    falta: (e) => !e.hora,
    volta: "data",
  },
];

function primeiraFalta(passo: Passo, escolhas: Escolhas, agora: Date): Passo | null {
  for (const checagem of CHECAGENS) {
    if (checagem.aplicaA.includes(passo) && checagem.falta(escolhas, agora)) {
      return checagem.volta;
    }
  }
  return null;
}

// `pronto` é falso enquanto o redirecionamento não aconteceu: a tela
// não deve chamar a API nem desenhar com dado faltando.
//
// `agora` é parâmetro com `new Date()` como padrão, mesma forma das
// telas que já recebem o instante (EscolhaDaData):
// é o que permite testar a checagem de data passada sem fake timers.
export function usePassoDoFluxo(
  passo: Passo,
  agora: Date = new Date()
): Escolhas & { slug: string; pronto: boolean } {
  const { slug } = useParams<{ slug: string }>();
  const query = useSearchParams();
  const router = useRouter();

  const escolhas = lerEscolhas(query);
  const volta = primeiraFalta(passo, escolhas, agora);
  const falta = volta !== null;

  useEffect(() => {
    // O `if` é a checagem de verdade que estreita `volta` de `Passo |
    // null` pra `Passo` — não uma asserção, então um `primeiraFalta`
    // futuro que devolva `null` por engano não engana o compilador.
    if (volta === null) return;
    // `replace` e não `push`: o passo incompleto não merece uma entrada
    // no histórico, senão voltar cairia nele de novo.
    router.replace(caminhoDoPasso(slug, volta, escolhas));
    // O array de dependências usa primitivos, não o objeto derivado:
    // `escolhas` é um novo objeto a cada render, logo [... escolhas]
    // dispararia o efeito sempre. Depender de seus campos individuais
    // garante que só muda quando a query muda de verdade — o mesmo
    // vale pra `falta`/`volta`: como a checagem de data passada é por
    // dia, não por milissegundo, o `agora` padrão não os faz oscilar
    // a cada render.
  }, [falta, slug, volta, router, escolhas.servicoIds.join(","), escolhas.data, escolhas.hora, escolhas.remarcar]);

  return { ...escolhas, slug, pronto: !falta };
}
