"use client";

import Link from "next/link";
import { useState } from "react";
import { dividirPagamento } from "@barchop/formato";
import type { ErroDaApi } from "@barchop/api-client";
import type { DivisaoDoDinheiro as Divisao, MembroDaDivisao } from "@barchop/types";
import { Aviso } from "../../../componentes/Aviso";
import { BarraDeMudancas } from "../../../componentes/BarraDeMudancas";
import { CabecalhoDaPagina } from "../../../componentes/CabecalhoDaPagina";
import { useRequisicao } from "../../../api/useRequisicao";
import { fraseDaDivisao } from "../../../painel/caixa";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { usePainel } from "../../../painel/SessaoDoPainel";
import { useMidia } from "../../../painel/useTelaDeCelular";
import estilos from "./DivisaoDoDinheiro.module.css";
import { Carregando } from "../../../componentes/Carregando";

// A divisão do dinheiro (Onda 2, marco 2, PR 8 do plano caixa-do-dia):
// quanto de cada atendimento fica com a casa e, quando o cliente é de
// outro profissional, quanto vai pra ele. É da barbearia mas não entra
// no "X de N decididas": começar em 0 (quem atendeu fica com tudo) é uma
// escolha válida, não algo esquecido. Só o dono.

const VOLTAR = { href: "/painel/configuracoes", rotulo: "Configurações" };
const TITULO = "Divisão do dinheiro";
const APOIO = "Quanto de cada atendimento fica com a casa e com o profissional de quem o cliente é.";

// Um exemplo redondo: R$ 100,00, sem desconto nem gorjeta.
const EXEMPLO = 10_000;

// No celular, a tabela vira lista (redesenho das Configurações, PR 8,
// decisão 2): o corte do celular das Configurações.
const CONSULTA_DA_LISTA = "(max-width: 720px)";

type Valores = Record<string, string>;

function chave(donoDoClienteId: string, atendenteId: string) {
  return `${donoDoClienteId}:${atendenteId}`;
}

// "60" vale; "150", "2,5" e "abc", não. Vazio é 0.
function paraPercentual(digitado: string): number | null {
  const limpo = digitado.trim();
  if (limpo === "") return 0;
  if (!/^\d{1,3}$/.test(limpo)) return null;
  const numero = Number(limpo);
  return numero <= 100 ? numero : null;
}

function valoresDaCasa(divisao: Divisao): Valores {
  return Object.fromEntries(divisao.membros.map((m) => [m.id, String(m.parteDaCasa)]));
}

function valoresDaMatriz(divisao: Divisao): Valores {
  const valores: Valores = {};
  for (const dono of divisao.membros) {
    for (const atendente of divisao.membros) {
      if (dono.id !== atendente.id) valores[chave(dono.id, atendente.id)] = "0";
    }
  }
  for (const regra of divisao.matriz) valores[chave(regra.donoDoClienteId, regra.atendenteId)] = String(regra.percentual);
  return valores;
}

// O exemplo do efeito, com a mesma conta da API (dividirPagamento): o
// primeiro par com regra; sem par, o primeiro com parte da casa; sem
// nada, a frase do padrão.
function exemplo(membros: MembroDaDivisao[], casa: Record<string, number>, matriz: Record<string, number>): string {
  const nome = (id: string) => membros.find((m) => m.id === id)?.nome ?? "";
  const regras = {
    ativos: membros.map((m) => m.id),
    parteDaCasa: casa,
    matriz: Object.entries(matriz).map(([par, percentual]) => {
      const [donoDoCliente, atendente] = par.split(":");
      return { donoDoCliente, atendente, percentual };
    }),
  };
  const par = regras.matriz.find((r) => r.percentual > 0);
  const atendente = par?.atendente ?? membros.find((m) => (casa[m.id] ?? 0) > 0)?.id;
  if (!atendente) return "Hoje, quem atende fica com tudo o que recebe.";
  const donoDoCliente = par?.donoDoCliente ?? atendente;
  const partes = dividirPagamento(
    { atendente, donoDoCliente, servicosCentavos: EXEMPLO, descontoCentavos: 0, gorjetaCentavos: 0 },
    regras
  ).map((parte) => ({
    beneficiario: parte.beneficiario === null ? null : { id: parte.beneficiario, nome: nome(parte.beneficiario) },
    motivo: parte.motivo,
    valorCentavos: parte.valorCentavos,
  }));
  // O valor do exemplo já está no título do bloco ("Num corte de R$ 100").
  const deQuem = donoDoCliente === atendente ? "dele" : `de ${nome(donoDoCliente)}`;
  return `${nome(atendente)} atende um cliente ${deQuem}. ${fraseDaDivisao(partes)}`;
}

export function DivisaoDoDinheiro() {
  const { perfil } = usePainel();
  if (perfil.papel !== "dono") {
    return (
      <div className={estilos.pagina}>
        <CabecalhoDaPagina titulo={TITULO} apoio={APOIO} voltar={VOLTAR} />
        <p>Só o dono vê e muda a divisão do dinheiro. No Caixa, você vê o seu acerto de cada dia.</p>
      </div>
    );
  }
  return <DivisaoDoDono />;
}

function DivisaoDoDono() {
  const api = useApiDoPainel();
  const divisao = useRequisicao(() => api.barbeiro.divisao(), []);
  const [casa, setCasa] = useState<Valores>({});
  const [matriz, setMatriz] = useState<Valores>({});
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | undefined>();
  const emLista = useMidia(CONSULTA_DA_LISTA);

  // Sincronizado na renderização, como nas outras subtelas: a resposta
  // fresca (ao abrir e depois de salvar) repõe os campos.
  const [sincronizada, setSincronizada] = useState<Divisao | null>(null);
  if (divisao.dados && divisao.dados !== sincronizada) {
    setSincronizada(divisao.dados);
    setCasa(valoresDaCasa(divisao.dados));
    setMatriz(valoresDaMatriz(divisao.dados));
  }

  if (divisao.erro?.codigo === "recurso_do_plano") {
    return (
      <div className={estilos.pagina}>
        <CabecalhoDaPagina titulo={TITULO} apoio={APOIO} voltar={VOLTAR} />
        <div className={estilos.convite}>
          <p>A divisão do dinheiro e o caixa do dia são dos planos Essencial e Completo.</p>
          <Link className={estilos.verPlanos} href="/painel/faturas">
            Ver os planos
          </Link>
        </div>
      </div>
    );
  }
  if (divisao.erro) return <Aviso>{divisao.erro.mensagem || "Não foi possível carregar a divisão agora."}</Aviso>;
  if (!divisao.dados || divisao.dados !== sincronizada) return <Carregando />;

  const atual = divisao.dados;
  const membros = atual.membros;
  const casaNumeros = Object.fromEntries(Object.entries(casa).map(([id, v]) => [id, paraPercentual(v)]));
  const matrizNumeros = Object.fromEntries(Object.entries(matriz).map(([par, v]) => [par, paraPercentual(v)]));
  const valido = [...Object.values(casaNumeros), ...Object.values(matrizNumeros)].every((v) => v !== null);
  const original = { casa: valoresDaCasa(atual), matriz: valoresDaMatriz(atual) };
  const nome = (id: string) => membros.find((m) => m.id === id)?.nome ?? "";
  // O "o que mudou" da barra, no jeito das Regras: "nome: antes → depois".
  // O inválido entra como foi digitado; o campo diz o que corrigir.
  const comoFicou = (digitado: string) => {
    const numero = paraPercentual(digitado);
    return numero === null ? digitado.trim() : `${numero}%`;
  };
  const mudancas = [
    ...membros
      .filter((m) => paraPercentual(casa[m.id] ?? "") !== paraPercentual(original.casa[m.id]))
      .map((m) => `Parte da casa de ${m.nome}: ${comoFicou(original.casa[m.id])} → ${comoFicou(casa[m.id] ?? "")}`),
    ...Object.keys(original.matriz)
      .filter((par) => paraPercentual(matriz[par] ?? "") !== paraPercentual(original.matriz[par]))
      .map((par) => {
        const [dono, atendente] = par.split(":");
        const antes = comoFicou(original.matriz[par]);
        const depois = comoFicou(matriz[par] ?? "");
        return `${nome(atendente)} atende cliente de ${nome(dono)}: ${antes} → ${depois}`;
      }),
  ];

  async function salvar() {
    if (salvando || !valido) return;
    setAviso(undefined);
    setSalvando(true);
    try {
      await api.barbeiro.salvarDivisao({
        parteDaCasa: membros.map((m) => ({ membroId: m.id, percentual: casaNumeros[m.id] ?? 0 })),
        matriz: membros.flatMap((dono) =>
          membros
            .filter((atendente) => atendente.id !== dono.id)
            .map((atendente) => ({
              donoDoClienteId: dono.id,
              atendenteId: atendente.id,
              percentual: matrizNumeros[chave(dono.id, atendente.id)] ?? 0,
            }))
        ),
      });
      divisao.recarregar();
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    }
    setSalvando(false);
  }

  function descartar() {
    setCasa(original.casa);
    setMatriz(original.matriz);
    setAviso(undefined);
  }

  const casaValida = Object.fromEntries(Object.entries(casaNumeros).map(([id, v]) => [id, v ?? 0]));
  const matrizValida = Object.fromEntries(Object.entries(matrizNumeros).map(([par, v]) => [par, v ?? 0]));

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina titulo={TITULO} apoio={APOIO} voltar={VOLTAR} />

      {/* Lado a lado no desktop: a parte da casa (uma coluna estreita) e a
          grade entre os profissionais, com o exemplo embaixo dela. */}
      <div className={estilos.corpo}>
        <fieldset className={estilos.casa}>
          <legend className={estilos.rotulo}>Parte da casa</legend>
          <p className={estilos.apoio}>% de tudo o que cada um atende que fica com a barbearia.</p>
          {membros.map((membro) => {
            const id = `casa-${membro.id}`;
            const erro = casaNumeros[membro.id] === null;
            return (
              <div key={membro.id} className={estilos.linhaDaCasa}>
                <label htmlFor={id}>{membro.nome}</label>
                <span className={estilos.percentual}>
                  <input
                    id={id}
                    className={estilos.entrada}
                    inputMode="numeric"
                    aria-invalid={erro || undefined}
                    value={casa[membro.id] ?? ""}
                    onChange={(evento) => setCasa((atuais) => ({ ...atuais, [membro.id]: evento.target.value }))}
                  />
                  %
                </span>
                {erro ? <span className={estilos.erro}>De 0 a 100</span> : null}
              </div>
            );
          })}
        </fieldset>

        <section className={estilos.grade} aria-labelledby="divisao-grade">
          <h2 id="divisao-grade" className={estilos.rotulo}>
            Cliente de outro profissional
          </h2>
          {membros.length < 2 ? (
            <p className={estilos.apoio}>
              Com uma pessoa só na equipe, não há o que dividir entre profissionais. A grade aparece quando entrar mais
              alguém que atende.
            </p>
          ) : (
            <>
              <p className={estilos.apoio}>
                Quando alguém atende o cliente de outro, quanto vai pro profissional de quem o cliente é — do que sobra
                depois da parte da casa. A gorjeta é sempre de quem atendeu.
              </p>
              {emLista ? (
                // Uma linha por par, como no canvas: quem atende, de quem é o
                // cliente e pra quem vai o percentual. O campo tem o mesmo
                // nome acessível da célula da tabela.
                <ul className={estilos.pares} aria-labelledby="divisao-grade">
                  {membros.flatMap((dono) =>
                    membros
                      .filter((atendente) => atendente.id !== dono.id)
                      .map((atendente) => {
                        const par = chave(dono.id, atendente.id);
                        const erro = matrizNumeros[par] === null;
                        return (
                          <li key={par} className={estilos.par}>
                            <span className={estilos.textoDoPar}>
                              <span className={estilos.nomeDoPar}>
                                {atendente.nome} atende cliente de {dono.nome}
                              </span>
                              <span className={estilos.apoio}>vai pra {dono.nome}</span>
                            </span>
                            <span className={estilos.percentual}>
                              <input
                                className={estilos.entrada}
                                inputMode="numeric"
                                aria-label={`Cliente de ${dono.nome} atendido por ${atendente.nome}`}
                                aria-invalid={erro || undefined}
                                value={matriz[par] ?? ""}
                                onChange={(evento) => setMatriz((atuais) => ({ ...atuais, [par]: evento.target.value }))}
                              />
                              %
                            </span>
                            {erro ? <span className={estilos.erro}>De 0 a 100</span> : null}
                          </li>
                        );
                      })
                  )}
                </ul>
              ) : (
                <div className={estilos.rolagem}>
                  <table className={estilos.tabela}>
                    <thead>
                      <tr>
                        <th scope="col" className={estilos.canto}>
                          Cliente de ↓ · atendeu →
                        </th>
                        {membros.map((atendente) => (
                          <th key={atendente.id} scope="col">
                            {atendente.nome}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {membros.map((dono) => (
                        <tr key={dono.id}>
                          <th scope="row">{dono.nome}</th>
                          {membros.map((atendente) => {
                            if (dono.id === atendente.id) {
                              return (
                                <td key={atendente.id} className={estilos.diagonal} title="Com o próprio cliente, quem atende fica com tudo">
                                  —
                                </td>
                              );
                            }
                            const par = chave(dono.id, atendente.id);
                            const erro = matrizNumeros[par] === null;
                            return (
                              <td key={atendente.id}>
                                <span className={estilos.percentual}>
                                  <input
                                    className={estilos.entrada}
                                    inputMode="numeric"
                                    aria-label={`Cliente de ${dono.nome} atendido por ${atendente.nome}`}
                                    aria-invalid={erro || undefined}
                                    value={matriz[par] ?? ""}
                                    onChange={(evento) => setMatriz((atuais) => ({ ...atuais, [par]: evento.target.value }))}
                                  />
                                  %
                                </span>
                                {erro ? <span className={estilos.erro}>De 0 a 100</span> : null}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* O exemplo fecha a página (redesenho, PR 8), com a conta da API. */}
      <section className={estilos.exemplo} aria-labelledby="divisao-exemplo">
        <h2 id="divisao-exemplo" className={estilos.tituloDoExemplo}>
          Num corte de R$ 100
        </h2>
        <p aria-live="polite">{exemplo(membros, casaValida, matrizValida)}</p>
      </section>

      {/* Um Salvar só, na barra do pé, como nas outras áreas. A divisão
          não é área: sem mudança, a barra não aparece. */}
      <BarraDeMudancas
        mudancas={mudancas}
        aviso={aviso}
        salvando={salvando}
        podeSalvar={valido}
        aoSalvar={() => void salvar()}
        aoDescartar={descartar}
      />
    </div>
  );
}
