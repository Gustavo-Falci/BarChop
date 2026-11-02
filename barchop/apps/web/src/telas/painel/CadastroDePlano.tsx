"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import {
  CICLOS_DO_CLIENTE,
  formatarReais,
  MAX_DIAS_DE_TESTE_DO_CLIENTE,
  MINIMO_DA_INFINITEPAY_CENTAVOS,
  type CicloDoCliente,
} from "@barchop/formato";
import type { NovoPlano, PlanoDoPainel } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { BarraDeMudancas } from "../../componentes/BarraDeMudancas";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Campo } from "../../componentes/Campo";
import { Carregando } from "../../componentes/Carregando";
import { Chip } from "../../componentes/Chip";
import { Interruptor } from "../../componentes/Interruptor";
import { formatarPreco } from "../../componentes/ItemDeServico";
import { SeletorEmPilulas } from "../../componentes/SeletorEmPilulas";
import { useRequisicao } from "../../api/useRequisicao";
import { centavosNoCampo, paraCentavos } from "../../painel/caixa";
import { ROTULO_DO_CICLO } from "../../painel/planos";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import estilos from "./CadastroDePlano.module.css";

// O cadastro do plano que o cliente assina (Onda 2, marco 3). Os limites
// ESPELHAM o schema de apps/api/src/routers/planos.ts, e a conta do plano
// inteiro é a de problemaDoPlano (@barchop/formato), que a API repete:
// a tela confere antes pra marcar o campo, e o que escapar volta com o
// código `plano_*` e cai no mesmo campo.
const NOME_MIN = 2;
const NOME_MAX = 80;
const DESCRICAO_MAX = 300;
const USOS_MAX = 999;

type Campos = "nome" | "preco" | "dias" | "fixo" | "servicos" | "formas";
type Erros = Partial<Record<Campos, string>>;

// Por serviço marcado: ilimitado, ou quantos por ciclo (texto do campo).
type Escolha = { ilimitado: boolean; usos: string };

// O código da API vira a frase no campo certo. O que não está aqui cai
// no aviso de baixo, com a mensagem da própria API.
function erroDaApi(codigo: string, doVendedor: string): Erros | null {
  switch (codigo) {
    case "plano_preco":
      return { preco: "O preço precisa ser maior que zero." };
    case "plano_dias_de_teste":
      return { dias: `De 0 a ${MAX_DIAS_DE_TESTE_DO_CLIENTE} dias.` };
    case "plano_fixo":
      return { fixo: "Diga quanto quem atende ganha por atendimento (pode ser 0,00)." };
    case "plano_servicos":
      return { servicos: "Escolha pelo menos um serviço." };
    case "plano_usos":
      return { servicos: `Os usos por ciclo vão de 1 a ${USOS_MAX}, ou ficam ilimitados.` };
    case "plano_formas":
      return { formas: "Escolha como o cliente paga." };
    case "servico_repetido":
      return { servicos: "O mesmo serviço apareceu duas vezes. Recarregue a página." };
    case "servico_invalido":
      return { servicos: "Um dos serviços foi desativado. Tire-o do plano ou reative em Serviços." };
    case "servico_fora_do_vendedor":
      return { servicos: `No plano de barbeiro, só serviços que ${doVendedor} faz.` };
    default:
      return null;
  }
}

function mensagemDoAviso(falha: ErroDaApi): string {
  if (falha.codigo === "vendedor_nao_atende") {
    return "Só quem atende clientes vende plano próprio. Crie um plano da casa.";
  }
  return falha.mensagem || "Não foi possível salvar agora.";
}

// Os serviços do plano gravado, do jeito que a tela guarda as escolhas.
function escolhasDe(plano: PlanoDoPainel): Record<string, Escolha> {
  return Object.fromEntries(
    plano.servicos.map((s) => [
      s.servicoId,
      { ilimitado: s.usosPorCiclo === null, usos: String(s.usosPorCiclo ?? 1) },
    ])
  );
}

// Mesma escolha? A ordem das chaves não conta, e o número digitado só
// conta quando não é ilimitado.
function mesmasEscolhas(a: Record<string, Escolha>, b: Record<string, Escolha>) {
  const chaves = Object.keys(a);
  if (chaves.length !== Object.keys(b).length) return false;
  return chaves.every((chave) => {
    const outra = b[chave];
    if (!outra || a[chave].ilimitado !== outra.ilimitado) return false;
    return a[chave].ilimitado || Number(a[chave].usos) === Number(outra.usos);
  });
}

export function CadastroDePlano() {
  const { id } = useParams<{ id?: string }>();
  const router = useRouter();
  const api = useApiDoPainel();
  const { perfil } = usePainel();
  const idDoForm = useId();

  // Não existe GET de um plano: a lista basta, e traz as permissões.
  const planos = useRequisicao(() => api.barbeiro.planos(), []);
  const servicos = useRequisicao(() => api.barbeiro.servicos(), []);
  const atual = id ? planos.dados?.planos.find((p) => p.id === id) : undefined;

  const [daCasa, setDaCasa] = useState(true);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [preco, setPreco] = useState("");
  const [dias, setDias] = useState("0");
  const [ciclo, setCiclo] = useState<CicloDoCliente>("mensal");
  const [fixo, setFixo] = useState("");
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});
  // O plano novo nasce só no balcão: o online depende da conta de quem
  // vende, e marcar sozinho esconderia isso.
  const [online, setOnline] = useState(false);
  const [noBalcao, setNoBalcao] = useState(true);
  const [erros, setErros] = useState<Erros>({});
  const [aviso, setAviso] = useState<string | undefined>();
  const [avisoDaSituacao, setAvisoDaSituacao] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);
  // Separado do `salvando`: desativar não é salvar o formulário, e o
  // Salvar da barra não pode girar por causa dele (nem o contrário).
  const [mexendo, setMexendo] = useState(false);

  // Sincronizado na renderização, como em CadastroDeServico (o
  // comentário longo de lá explica por que não `useEffect`).
  const [sincronizado, setSincronizado] = useState<PlanoDoPainel | undefined>(undefined);
  if (atual && atual !== sincronizado) {
    setSincronizado(atual);
    preencherCom(atual);
  }

  function preencherCom(plano: PlanoDoPainel) {
    setDaCasa(plano.daCasa);
    setNome(plano.nome);
    setDescricao(plano.descricao ?? "");
    setPreco(centavosNoCampo(plano.precoCentavos));
    setDias(String(plano.diasDeTeste));
    setCiclo(plano.ciclo);
    setFixo(plano.fixoPorAtendimentoCentavos === null ? "" : (plano.fixoPorAtendimentoCentavos / 100).toFixed(2).replace(".", ","));
    setEscolhas(escolhasDe(plano));
    setOnline(plano.aceitaOnline);
    setNoBalcao(plano.aceitaNoBalcao);
  }
  // Quem só cria o próprio (o profissional, ou o dono que não pode o da
  // casa) não escolhe: o plano é próprio.
  const [tipoAcertado, setTipoAcertado] = useState(false);
  if (!id && planos.dados && !tipoAcertado) {
    setTipoAcertado(true);
    setDaCasa(planos.dados.podeCriarDaCasa);
  }

  // O plano de barbeiro só cobre o que o vendedor faz (a API recusa o
  // resto com `servico_fora_do_vendedor`): a lista já vem cortada.
  const vendedor = atual ? atual.vendedor : daCasa ? null : { id: perfil.id, nome: perfil.nome };
  const doVendedor = useRequisicao(
    () => (vendedor ? api.barbeiro.servicosDoMembro(vendedor.id) : Promise.resolve(null)),
    [vendedor?.id]
  );

  if (planos.erro || servicos.erro) {
    const erro = planos.erro ?? servicos.erro!;
    return <Aviso>{erro.mensagem || "Não foi possível carregar o plano agora."}</Aviso>;
  }
  if (!planos.dados || !servicos.dados) return <Carregando />;
  if (id && !atual) return <Aviso>Plano não encontrado.</Aviso>;

  const { podeCriarDaCasa, podeCriarProprio } = planos.dados;
  if (!podeCriarDaCasa && !podeCriarProprio) {
    return <Aviso>Só o dono e quem tem a liberação pra vender planos mexem aqui.</Aviso>;
  }

  const euVendo = vendedor?.id === perfil.id;
  const nomeDoVendedor = euVendo ? "você" : (vendedor?.nome ?? "");
  // Os ativos que o vendedor faz, mais o que o plano já tem (pra dar pra
  // tirar), na ordem da tela de Serviços.
  const oferecidos = servicos.dados.filter(
    (s) =>
      s.id in escolhas ||
      (s.ativo && (vendedor === null || doVendedor.dados === null || doVendedor.dados.includes(s.id)))
  );

  function alternarServico(servicoId: string, marcado: boolean) {
    setErros((atuais) => ({ ...atuais, servicos: undefined }));
    setEscolhas((atuais) => {
      const proximas = { ...atuais };
      if (marcado) proximas[servicoId] = { ilimitado: false, usos: "1" };
      else delete proximas[servicoId];
      return proximas;
    });
  }

  function mudarEscolha(servicoId: string, mudanca: Partial<Escolha>) {
    setErros((atuais) => ({ ...atuais, servicos: undefined }));
    setEscolhas((atuais) => ({ ...atuais, [servicoId]: { ...atuais[servicoId], ...mudanca } }));
  }

  // Todos os campos sempre, e não até o primeiro que falha.
  function validar(): NovoPlano | null {
    const novos: Erros = {};
    const limpo = nome.trim();
    if (limpo.length < NOME_MIN) novos.nome = "Escreva o nome do plano.";
    else if (limpo.length > NOME_MAX) novos.nome = `No máximo ${NOME_MAX} caracteres.`;

    const precoCentavos = paraCentavos(preco);
    if (precoCentavos === null || precoCentavos === 0) novos.preco = "Use um valor como 120,00";

    const diasDeTeste = /^\d+$/.test(dias.trim()) ? Number(dias.trim()) : NaN;
    if (!(diasDeTeste >= 0 && diasDeTeste <= MAX_DIAS_DE_TESTE_DO_CLIENTE)) {
      novos.dias = `De 0 a ${MAX_DIAS_DE_TESTE_DO_CLIENTE} dias.`;
    }

    // No da casa, vazio não é zero: é esquecer de dizer.
    const fixoCentavos = daCasa ? (fixo.trim() === "" ? null : paraCentavos(fixo)) : null;
    if (daCasa && fixoCentavos === null) {
      novos.fixo = "Diga quanto quem atende ganha por atendimento (pode ser 0,00).";
    }

    const escolhidos = servicos.dados!.filter((s) => s.id in escolhas);
    const comUsos = escolhidos.map((s) => {
      const escolha = escolhas[s.id];
      const usos = Number(escolha.usos);
      return {
        servicoId: s.id,
        usosPorCiclo: escolha.ilimitado ? null : Number.isInteger(usos) && usos >= 1 && usos <= USOS_MAX ? usos : NaN,
      };
    });
    if (escolhidos.length === 0) novos.servicos = "Escolha pelo menos um serviço.";
    else if (comUsos.some((s) => Number.isNaN(s.usosPorCiclo))) {
      novos.servicos = `Os usos por ciclo vão de 1 a ${USOS_MAX}, ou ficam ilimitados.`;
    }

    const aceitaOnline = online;
    if (!aceitaOnline && !noBalcao) novos.formas = "Escolha como o cliente paga.";

    setErros(novos);
    if (Object.values(novos).some(Boolean)) return null;
    return {
      daCasa,
      nome: limpo,
      descricao: descricao.trim() || null,
      ciclo,
      precoCentavos: precoCentavos!,
      diasDeTeste,
      fixoPorAtendimentoCentavos: fixoCentavos,
      aceitaOnline,
      aceitaNoBalcao: noBalcao,
      servicos: comUsos,
    };
  }

  async function salvar() {
    setAviso(undefined);
    const plano = validar();
    if (!plano) return;
    setSalvando(true);
    try {
      if (id) {
        const { daCasa: _tipo, ...mudanca } = plano;
        await api.barbeiro.editarPlano(id, mudanca);
      } else {
        await api.barbeiro.criarPlano(plano);
      }
      router.push("/painel/planos");
    } catch (causa) {
      const falha = causa as ErroDaApi;
      const doCampo = erroDaApi(falha.codigo, nomeDoVendedor);
      if (doCampo) setErros(doCampo);
      else setAviso(mensagemDoAviso(falha));
    }
    setSalvando(false);
  }

  async function alternarAtivo() {
    if (!id || !atual) return;
    setAvisoDaSituacao(undefined);
    setMexendo(true);
    try {
      await api.barbeiro.editarPlano(id, { ativo: !atual.ativo });
      planos.recarregar();
    } catch (causa) {
      setAvisoDaSituacao(mensagemDoAviso(causa as ErroDaApi));
    }
    setMexendo(false);
  }

  // Na edição, o que difere do gravado, pra barra de mudanças (redesenho
  // dos detalhes, PR 8). Os números comparam o valor, e não o que foi
  // digitado: "80" por cima de "80,00" não é mudança.
  const ligado = (valor: boolean) => (valor ? "ligado" : "desligado");
  const mudancas: string[] = [];
  if (atual) {
    if (nome.trim() !== atual.nome) mudancas.push("Nome");
    const precoNovo = paraCentavos(preco);
    if (precoNovo === null) mudancas.push("Preço");
    else if (precoNovo !== atual.precoCentavos) {
      mudancas.push(`Preço: ${formatarReais(atual.precoCentavos)} → ${formatarReais(precoNovo)}`);
    }
    if (dias.trim() !== String(atual.diasDeTeste)) {
      mudancas.push(/^\d+$/.test(dias.trim()) ? `Dias grátis: ${atual.diasDeTeste} → ${Number(dias.trim())}` : "Dias grátis");
    }
    if (ciclo !== atual.ciclo) {
      mudancas.push(`Cobra a cada: ${ROTULO_DO_CICLO[atual.ciclo]} → ${ROTULO_DO_CICLO[ciclo]}`);
    }
    if (atual.daCasa) {
      const fixoNovo = fixo.trim() === "" ? null : paraCentavos(fixo);
      if (fixoNovo !== atual.fixoPorAtendimentoCentavos) {
        mudancas.push(
          fixoNovo !== null && atual.fixoPorAtendimentoCentavos !== null
            ? `Quem atende ganha: ${formatarReais(atual.fixoPorAtendimentoCentavos)} → ${formatarReais(fixoNovo)}`
            : "Quem atende ganha"
        );
      }
    }
    if (!mesmasEscolhas(escolhas, escolhasDe(atual))) mudancas.push("Serviços incluídos");
    if (online !== atual.aceitaOnline) {
      mudancas.push(`Online: ${ligado(atual.aceitaOnline)} → ${ligado(online)}`);
    }
    if (noBalcao !== atual.aceitaNoBalcao) {
      mudancas.push(`No balcão: ${ligado(atual.aceitaNoBalcao)} → ${ligado(noBalcao)}`);
    }
    if (descricao.trim() !== (atual.descricao ?? "")) mudancas.push("Descrição");
  }

  function descartar() {
    if (!atual) return;
    preencherCom(atual);
    setErros({});
    setAviso(undefined);
  }

  // A frase do efeito, com os números digitados. Plano de barbeiro sem
  // número da casa: a parte da casa de cada um só o dono vê (Divisão).
  const precoDigitado = paraCentavos(preco);
  // A InfinitePay não cria link abaixo de R$ 1,00. O cadastro não sabe o
  // provedor de quem vende (o dono editando o plano de outro não lê a
  // conta dele), então avisa sempre que o online vem com o preço abaixo.
  const abaixoDoMinimo =
    online && precoDigitado !== null && precoDigitado > 0 && precoDigitado < MINIMO_DA_INFINITEPAY_CENTAVOS;
  const fixoDigitado = fixo.trim() === "" ? null : paraCentavos(fixo);
  const efeito =
    precoDigitado === null || precoDigitado === 0
      ? "Escreva o preço pra ver pra onde vai a mensalidade."
      : daCasa
        ? `Cada mensalidade de ${formatarReais(precoDigitado)} fica com a casa.` +
          (fixoDigitado !== null
            ? ` Quem atender um assinante ganha ${formatarReais(fixoDigitado)} por atendimento.`
            : "")
        : `Cada mensalidade de ${formatarReais(precoDigitado)} é ${euVendo ? "sua" : `de ${nomeDoVendedor}`}, ` +
          `e a casa fica com a parte da casa, como no avulso. O plano vale só com ${euVendo ? "você" : "quem vende"}.`;

  const titulo = atual ? atual.nome : "Novo plano";
  const deQuem = atual ? (atual.daCasa ? "Plano da casa" : `Plano de ${atual.vendedor?.nome}`) : undefined;
  const mostraTipo = !id && podeCriarDaCasa && podeCriarProprio;

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        voltar={{ href: "/painel/planos", rotulo: "Planos" }}
        titulo={titulo}
        selo={
          atual && !atual.ativo ? (
            <Chip tom="neutro" tamanho="pequeno">
              Inativo
            </Chip>
          ) : undefined
        }
        apoio={deQuem}
      />

      <div className={estilos.corpo}>
        <div className={estilos.principal}>
          <div className={`${estilos.cartao} ${estilos.recheio}`}>
            {/* De quem é só no cadastro: depois, tipo e vendedor não mudam. */}
            {mostraTipo ? (
              <SeletorEmPilulas
                nome={`${idDoForm}-tipo`}
                legenda="De quem é o plano"
                opcoes={[
                  { valor: "casa", rotulo: "Da casa" },
                  { valor: "meu", rotulo: `Meu (${perfil.nome})` },
                ]}
                valor={daCasa ? "casa" : "meu"}
                aoTrocar={(valor) => {
                  setDaCasa(valor === "casa");
                  setErros({});
                }}
                efeito={
                  daCasa
                    ? "Vale com qualquer profissional, e a mensalidade é da casa."
                    : "Vale só com você, e a mensalidade é sua."
                }
              />
            ) : null}

            <Campo
              rotulo="Nome"
              placeholder="Corte ilimitado"
              valor={nome}
              maxLength={NOME_MAX}
              onChange={(proximo) => {
                setNome(proximo);
                setErros((atuais) => ({ ...atuais, nome: undefined }));
              }}
              erro={erros.nome}
            />
            <div className={estilos.dupla}>
              <Campo
                rotulo="Preço"
                inputMode="decimal"
                placeholder="120,00"
                valor={preco}
                onChange={(proximo) => {
                  setPreco(proximo);
                  setErros((atuais) => ({ ...atuais, preco: undefined }));
                }}
                erro={erros.preco}
              />
              {/* O apoio embaixo dos dois, e não dentro do campo: dentro, ele
                  empurrava o "Dias grátis" pra baixo do "Preço". Com erro,
                  o campo aponta pro erro, que já diz o limite. */}
              <Campo
                rotulo="Dias grátis"
                inputMode="numeric"
                valor={dias}
                onChange={(proximo) => {
                  setDias(proximo);
                  setErros((atuais) => ({ ...atuais, dias: undefined }));
                }}
                erro={erros.dias}
                {...(erros.dias ? {} : { "aria-describedby": `${idDoForm}-dias-apoio` })}
              />
            </div>
            <span className={estilos.apoioDosDias} id={`${idDoForm}-dias-apoio`}>
              Dias grátis: até {MAX_DIAS_DE_TESTE_DO_CLIENTE}. A primeira cobrança vem depois.
            </span>

            <SeletorEmPilulas
              nome={`${idDoForm}-ciclo`}
              legenda="Cobra a cada"
              opcoes={CICLOS_DO_CLIENTE.map((valor) => ({ valor, rotulo: ROTULO_DO_CICLO[valor] }))}
              valor={ciclo}
              aoTrocar={setCiclo}
            />
          </div>

          {/* Escolher itens segue na caixinha (decisão 1 do canvas): dá
              pra marcar mais de um. */}
          <fieldset className={estilos.secao} aria-describedby={`${idDoForm}-servicos-apoio`}>
            <legend className={estilos.titulo}>Serviços incluídos</legend>
            <span className={estilos.apoioDaSecao} id={`${idDoForm}-servicos-apoio`}>
              Quantas vezes por ciclo. Passou do limite, o serviço é cobrado à parte.
              {vendedor ? ` Só os que ${nomeDoVendedor} faz.` : null}
            </span>
            <ul className={`${estilos.cartao} ${estilos.servicos}`}>
              {oferecidos.map((servico) => {
                const escolha = escolhas[servico.id];
                const idDoServico = `${idDoForm}-servico-${servico.id}`;
                return (
                  <li key={servico.id} className={estilos.servico}>
                    <span className={estilos.marca}>
                      <input
                        type="checkbox"
                        id={idDoServico}
                        checked={Boolean(escolha)}
                        onChange={(evento) => alternarServico(servico.id, evento.target.checked)}
                      />
                      <label htmlFor={idDoServico}>
                        {servico.nome} <span className={estilos.apoio}>· {formatarPreco(servico.preco)}</span>
                      </label>
                    </span>
                    {escolha ? (
                      <span className={estilos.usos}>
                        {/* Ilimitado, o número some: uma caixa vazia e
                            apagada parecia campo esquecido. */}
                        {escolha.ilimitado ? null : (
                          <input
                            type="number"
                            min={1}
                            max={USOS_MAX}
                            className={estilos.numero}
                            aria-label={`Usos de ${servico.nome} por ciclo`}
                            value={escolha.usos}
                            onChange={(evento) => mudarEscolha(servico.id, { usos: evento.target.value })}
                          />
                        )}
                        <span className={estilos.marca}>
                          <input
                            type="checkbox"
                            id={`${idDoServico}-ilimitado`}
                            checked={escolha.ilimitado}
                            aria-label={`${servico.nome} ilimitado`}
                            onChange={(evento) => mudarEscolha(servico.id, { ilimitado: evento.target.checked })}
                          />
                          <label htmlFor={`${idDoServico}-ilimitado`}>
                            Ilimitado
                          </label>
                        </span>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {erros.servicos ? (
              <span className={estilos.erro} role="alert">
                {erros.servicos}
              </span>
            ) : null}
          </fieldset>

          {/* O fixo é do plano da casa: o de barbeiro já paga ao vendedor. */}
          {daCasa ? (
            <div className={`${estilos.cartao} ${estilos.recheio}`}>
              <Campo
                rotulo="Quem atende ganha, por atendimento"
                inputMode="decimal"
                placeholder="25,00"
                apoio="Entra no acerto do dia: quem está com o dinheiro da casa repassa."
                valor={fixo}
                onChange={(proximo) => {
                  setFixo(proximo);
                  setErros((atuais) => ({ ...atuais, fixo: undefined }));
                }}
                erro={erros.fixo}
              />
            </div>
          ) : null}

          {/* Liga e desliga no Interruptor (decisão 1 do canvas), cada forma
              numa linha com o que ela faz. */}
          <section className={estilos.secao} aria-labelledby={`${idDoForm}-formas`}>
            <h2 id={`${idDoForm}-formas`} className={estilos.titulo}>
              Como o cliente paga
            </h2>
            <div className={estilos.cartao}>
              <div className={estilos.linha}>
                <span className={estilos.texto}>
                  <span className={estilos.nome} aria-hidden="true">
                    Online, na página
                  </span>
                  {/* A conta não é conferida aqui: o dono editando o plano
                      de outro não lê a conta dele. A vitrine é que só
                      oferece o online com a conta de quem vende conectada. */}
                  <span id={`${idDoForm}-online-apoio`} className={estilos.descricao}>
                    Na fatura do Asaas (Pix, cartão ou boleto), da Stripe (cartão) ou no link da InfinitePay (Pix
                    ou cartão), direto na conta de quem vende. Sem a conta conectada em{" "}
                    <Link href="/painel/configuracoes/pagamentos-online">Pagamentos online</Link>, a página
                    oferece só o balcão.
                  </span>
                  {/* Só no plano salvo: a lista diz se a conta de quem vende
                      recebe (o dono editando o plano de outro não lê a conta
                      dele). */}
                  {atual?.onlineIndisponivel && online ? (
                    <span className={estilos.indisponivel}>
                      <strong>Pagamento online indisponível.</strong> Quem vende ainda não conectou a conta de
                      pagamento online, ou o preço fica abaixo do mínimo dela: a página mostra o plano com esse
                      aviso, sem o Assinar.
                    </span>
                  ) : null}
                  {abaixoDoMinimo ? (
                    <span className={estilos.indisponivel} role="status">
                      Na InfinitePay, o mínimo é {formatarReais(MINIMO_DA_INFINITEPAY_CENTAVOS)}: abaixo disso, a
                      página mostra o plano sem o pagamento online.
                    </span>
                  ) : null}
                </span>
                <Interruptor
                  rotulo="Online, na página"
                  rotuloOculto
                  ligado={online}
                  aoTrocar={(proximo) => {
                    setOnline(proximo);
                    setErros((atuais) => ({ ...atuais, formas: undefined }));
                  }}
                  descritoPor={`${idDoForm}-online-apoio`}
                />
              </div>
              <div className={estilos.linha}>
                <span className={estilos.texto}>
                  <span className={estilos.nome} aria-hidden="true">
                    No balcão
                  </span>
                  <span id={`${idDoForm}-balcao-apoio`} className={estilos.descricao}>
                    Você cadastra o assinante no cliente e marca “Recebi” a cada ciclo.
                  </span>
                </span>
                <Interruptor
                  rotulo="No balcão"
                  rotuloOculto
                  ligado={noBalcao}
                  aoTrocar={(proximo) => {
                    setNoBalcao(proximo);
                    setErros((atuais) => ({ ...atuais, formas: undefined }));
                  }}
                  descritoPor={`${idDoForm}-balcao-apoio`}
                />
              </div>
            </div>
            {erros.formas ? (
              <span className={estilos.erro} role="alert">
                {erros.formas}
              </span>
            ) : null}
          </section>

          <div className={estilos.campoLongo}>
            <label className={estilos.rotulo} htmlFor={`${idDoForm}-descricao`}>
              Descrição (opcional)
            </label>
            <textarea
              id={`${idDoForm}-descricao`}
              className={estilos.area}
              rows={2}
              maxLength={DESCRICAO_MAX}
              value={descricao}
              onChange={(evento) => setDescricao(evento.target.value)}
            />
          </div>

          {/* O criar tem um botão só, sem Cancelar (decisão 2): volta pelo
              "← Planos". */}
          {!id ? (
            <>
              {aviso ? <Aviso>{aviso}</Aviso> : null}
              <div className={estilos.acoes}>
                <Botao type="button" carregando={salvando} onClick={salvar}>
                  Cadastrar
                </Botao>
              </div>
            </>
          ) : null}
        </div>

        <div className={estilos.lateral}>
          <aside aria-label="Pra onde vai o dinheiro">
            <p className={estilos.efeito}>{efeito}</p>
          </aside>

          {/* Por último e longe do Salvar: mudar o estado do plano não é
              editar os dados. A frase diz o efeito antes do botão. */}
          {atual ? (
            <section className={estilos.secao} aria-labelledby={`${idDoForm}-situacao`}>
              <h2 id={`${idDoForm}-situacao`} className={estilos.titulo}>
                Situação
              </h2>
              <div className={`${estilos.cartao} ${estilos.recheio}`}>
                <p className={estilos.descricao}>
                  {atual.ativo
                    ? "Ninguém novo assina, e sai da sua página. Quem já assina continua."
                    : "Fora da venda. Reativar volta o plano pra venda e pra sua página."}
                </p>
                {avisoDaSituacao ? <Aviso>{avisoDaSituacao}</Aviso> : null}
                <div className={estilos.acaoDoEstado} data-perigo={atual.ativo || undefined}>
                  <Botao type="button" variante="contorno" carregando={mexendo} onClick={alternarAtivo}>
                    {atual.ativo ? "Desativar" : "Reativar"}
                  </Botao>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {/* Na edição, um Salvar só, na barra do pé (decisão 2), filha
          direta da página pra ficar presa no pé. */}
      {atual ? (
        <BarraDeMudancas
          mudancas={mudancas}
          aviso={aviso}
          salvando={salvando}
          aoSalvar={() => void salvar()}
          aoDescartar={descartar}
        />
      ) : null}
    </div>
  );
}
