import { assinanteUsaOPlano } from "@barchop/formato";
import type { AssinaturaNoPagamento, PagamentoDoAgendamento } from "@barchop/types";
import { emLista } from "./assinatura";
import { fraseDoCiclo } from "./planos";

// O plano de assinatura no pagamento do atendimento (Onda 2, marco 3, PR
// 7c do plano planos-de-assinatura). A conta de verdade é da API
// (conferirOPlano): aqui a tela mostra a mesma coisa antes de mandar —
// cada linha do atendimento que o plano tem gasta um uso, até os do
// ciclo; o resto é avulso.

export interface LinhaDoAtendimento {
  servicoId: string;
  nome: string;
  precoCentavos: number;
}

export interface LinhaComPlano extends LinhaDoAtendimento {
  peloPlano: boolean;
  // "2º uso de 2 no ciclo", "sem limite no ciclo"; null quando a conta
  // já foi feita (o pagamento gravado diz o que cobriu, não o uso).
  uso: string | null;
}

export function cobertura(
  assinatura: AssinaturaNoPagamento,
  linhas: readonly LinhaDoAtendimento[]
): { linhas: LinhaComPlano[]; esgotou: boolean } {
  const restantes = new Map(assinatura.servicos.map((s) => [s.servicoId, { ...s }]));
  let esgotou = false;
  const comPlano = linhas.map((linha) => {
    const regra = restantes.get(linha.servicoId);
    if (!regra) return { ...linha, peloPlano: false, uso: null };
    if (regra.usosRestantes === 0) {
      esgotou = true;
      return { ...linha, peloPlano: false, uso: null };
    }
    const uso =
      regra.usosPorCiclo === null || regra.usosRestantes === null
        ? "sem limite no ciclo"
        : `${regra.usosPorCiclo - regra.usosRestantes + 1}º uso de ${regra.usosPorCiclo} no ciclo`;
    if (regra.usosRestantes !== null) regra.usosRestantes -= 1;
    return { ...linha, peloPlano: true, uso };
  });
  return { linhas: comPlano, esgotou };
}

// O que o pagamento gravado cobriu: a primeira linha de cada serviço
// usado, uma por uso.
export function coberturaGravada(
  servicosPeloPlano: PagamentoDoAgendamento["servicosPeloPlano"],
  linhas: readonly LinhaDoAtendimento[]
): LinhaComPlano[] {
  const faltam = servicosPeloPlano.map((s) => s.id);
  return linhas.map((linha) => {
    const indice = faltam.indexOf(linha.servicoId);
    if (indice < 0) return { ...linha, peloPlano: false, uso: null };
    faltam.splice(indice, 1);
    return { ...linha, peloPlano: true, uso: null };
  });
}

// Por que o plano não vale neste atendimento, pra completar `O plano
// "X" …`; null = vale. Na ordem das recusas da API.
export function porQueNaoVale(assinatura: AssinaturaNoPagamento, linhas: readonly LinhaDoAtendimento[]): string | null {
  const { plano } = assinatura;
  if (!assinatura.valeComOAtendente && plano.vendedor) {
    return `é de ${plano.vendedor.nome} e vale só nos atendimentos de ${plano.vendedor.nome}`;
  }
  if (assinatura.situacao === "em_atraso") return "está em atraso: volta a valer quando a mensalidade entrar";
  if (!assinanteUsaOPlano(assinatura.situacao)) return "espera o 1º pagamento";
  if (!assinatura.noCiclo) return "não vale no dia deste atendimento";
  const { linhas: comPlano, esgotou } = cobertura(assinatura, linhas);
  if (comPlano.some((linha) => linha.peloPlano)) return null;
  return esgotou ? "já usou neste ciclo tudo o que cobre" : "não cobre os serviços deste atendimento";
}

export interface OpcaoDoPlano {
  id: string;
  nome: string;
  apoio: string;
  linhas: LinhaComPlano[];
}

// As opções do "Usar o plano" e as notas dos planos que não valem.
// Editando um pagamento pelo plano, a assinatura gravada fica sempre na
// lista, escolhida, mesmo cancelada ou de outro ciclo: a API não confere
// de novo a mesma assinatura, e sumir com ela regravaria tudo avulso.
export function planosDoAtendimento(
  assinaturas: readonly AssinaturaNoPagamento[],
  linhas: readonly LinhaDoAtendimento[],
  atual: PagamentoDoAgendamento | null
): { opcoes: OpcaoDoPlano[]; notas: string | null } {
  const gravada = atual?.assinatura ?? null;
  const opcoes: OpcaoDoPlano[] = [];
  const notas: string[] = [];
  if (atual && gravada) {
    opcoes.push({
      id: gravada.id,
      nome: gravada.plano.nome,
      apoio: "Usado neste pagamento",
      linhas: coberturaGravada(atual.servicosPeloPlano, linhas),
    });
  }
  for (const assinatura of assinaturas) {
    if (assinatura.id === gravada?.id) continue;
    const motivo = porQueNaoVale(assinatura, linhas);
    if (motivo) {
      notas.push(`O plano "${assinatura.plano.nome}" ${motivo}.`);
      continue;
    }
    const comPlano = cobertura(assinatura, linhas).linhas;
    const cobertos = comPlano.filter((linha) => linha.peloPlano).map((linha) => linha.nome);
    opcoes.push({
      id: assinatura.id,
      nome: assinatura.plano.nome,
      apoio: `${fraseDoCiclo(assinatura)} · cobre ${emLista(cobertos)}`,
      linhas: comPlano,
    });
  }
  if (notas.length === 0) return { opcoes, notas: null };
  return { opcoes, notas: `${notas.join(" ")}${opcoes.length === 0 ? " Este atendimento é avulso." : ""}` };
}

// O valor a cobrar com a escolha: as linhas avulsas, ou tudo sem plano.
export function somaAvulsa(linhas: readonly LinhaDoAtendimento[], opcao: OpcaoDoPlano | null): number {
  return (opcao ? opcao.linhas.filter((linha) => !linha.peloPlano) : linhas).reduce(
    (soma, linha) => soma + linha.precoCentavos,
    0
  );
}
