import { render } from "@testing-library/react";
import { useEffect, useLayoutEffect, useState, type ReactElement } from "react";
import type { criarApiClientFalso } from "@barchop/api-client";
import { ProvedorDoPainel } from "../../src/painel/ProvedorDoPainel";
import { SessaoDoPainel } from "../../src/painel/SessaoDoPainel";
import { sessaoDaBarbearia, sessaoDoBarbeiro } from "../../src/sessao/armazenamento";

// A sonda existe pra provar a corrida de sincronização em telas cuja
// árvore pós-carregamento é pequena demais pra o commit que traz os
// dados e o efeito de preenchimento se separarem em macrotarefas
// distintas (ver o relatório: CadastroDeServico e DetalheDoAgendamento
// colapsam os dois num só turno de JavaScript sob polling de
// temporizador — a mesma técnica que funciona pra DetalheDoCliente,
// que tem uma <Tabela> maior, não enxerga nada aqui). Contar
// macrotarefas não fecha essa janela porque ela existe (ou não) dentro
// de UM ciclo de eventos, não entre dois.
//
// A saída é não depender de temporizador nenhum: o React garante que,
// dentro de UM commit, todo `useLayoutEffect` roda antes de qualquer
// `useEffect` (que é sempre passivo, sempre adiado) — essa ordem é
// parte do contrato do React, não uma coincidência de agendamento.
// Renderizamos esta sonda como IRMÃ da tela, com um `useLayoutEffect`
// sem array de dependências (roda em toda renderização SUA). O
// gatilho pra essa renderização vem de fora: a função mockada da API
// chama `disparar()` de forma síncrona, no exato ponto em que ela
// retoma de um `await` travado — antes de qualquer outro `await`
// depois disso. Como a atualização da sonda e a atualização
// (`setDados`) que a tela eventualmente dispara entram no mesmo lote
// de trabalho pendente do React (agendado via microtarefa, antes de
// qualquer macrotarefa), as duas costumam commitar juntas — e quando
// isso acontece, o layout effect da sonda vê o DOM exatamente como
// ficou depois do commit da tela, antes do efeito passivo dela rodar.
// Verificado empiricamente contra CadastroDeServico.tsx: com a versão
// `useEffect` (bug), a sonda vê o campo ainda vazio; com a versão
// corrigida (sincronizada durante a renderização, sem efeito passivo
// pra rodar depois), a sonda já vê o valor certo — porque não existe
// mais commit intermediário pra observar.
function Sonda({
  registrarGatilho,
  aoRenderizar,
}: {
  registrarGatilho: (disparar: () => void) => void;
  aoRenderizar: () => void;
}) {
  const [, forcar] = useState(0);
  useEffect(() => {
    registrarGatilho(() => forcar((n) => n + 1));
  }, [registrarGatilho]);
  useLayoutEffect(() => {
    aoRenderizar();
  });
  return null;
}

export interface PainelComSonda {
  falso: ReturnType<typeof criarApiClientFalso>;
  // Chame de dentro da função mockada da API, síncrona, no ponto em
  // que ela retoma de um `await` travado — antes de qualquer outro
  // `await`. Dispara uma renderização própria da sonda, cujo
  // useLayoutEffect (síncrono) roda `aoRenderizar` antes de qualquer
  // efeito passivo pendente da tela nesse mesmo lote.
  disparar: () => void;
}

// Mesmo formato de `montarPainel`, com a sonda montada como irmã da
// tela. `aoRenderizar` roda uma vez no mount (a tela ainda carregando,
// sem dados) e de novo a cada `disparar()` chamado — quem usa isto
// normalmente ignora a primeira chamada.
export function montarPainelComSonda(
  tela: ReactElement,
  falso: ReturnType<typeof criarApiClientFalso>,
  aoRenderizar: () => void
): PainelComSonda {
  sessaoDoBarbeiro.gravar("jwt-falso-barbeiro");
  sessaoDaBarbearia.gravar(falso.estado.perfil.slug);

  let disparoRegistrado: () => void = () => {};

  render(
    <ProvedorDoPainel valor={{ barbeiro: falso.barbeiro, publico: falso.publico }}>
      <SessaoDoPainel>
        {tela}
        <Sonda
          registrarGatilho={(fn) => {
            disparoRegistrado = fn;
          }}
          aoRenderizar={aoRenderizar}
        />
      </SessaoDoPainel>
    </ProvedorDoPainel>
  );

  return {
    falso,
    disparar: () => disparoRegistrado(),
  };
}
