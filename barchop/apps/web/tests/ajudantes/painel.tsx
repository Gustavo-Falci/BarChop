import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { criarApiClientFalso } from "@barchop/api-client";
import { ProvedorDoPainel } from "../../src/painel/ProvedorDoPainel";
import { SessaoDoPainel } from "../../src/painel/SessaoDoPainel";
import { sessaoDaBarbearia, sessaoDoBarbeiro } from "../../src/sessao/armazenamento";

// Grava a sessão antes de renderizar: sem token o SessaoDoPainel
// redireciona e não renderiza filho nenhum, e todo teste de tela do
// painel morreria na primeira asserção.
//
// O slug vem do próprio `falso.estado.perfil.slug`, e não de uma string
// fixa: quem semeia um `perfil` diferente também muda o slug que o
// dublê aceita, e gravar outra coisa faria a sessão discordar do
// estado sem nada pra acusar — a tela de novo agendamento (Tarefa 8+)
// usa esse slug pra chamar disponibilidade, que é rota pública por
// slug.
export function montarPainel(
  tela: ReactElement,
  falso = criarApiClientFalso()
) {
  sessaoDoBarbeiro.gravar("jwt-falso-barbeiro");
  sessaoDaBarbearia.gravar(falso.estado.perfil.slug);

  render(
    <ProvedorDoPainel valor={{ barbeiro: falso.barbeiro, publico: falso.publico }}>
      <SessaoDoPainel>{tela}</SessaoDoPainel>
    </ProvedorDoPainel>
  );

  return falso;
}
