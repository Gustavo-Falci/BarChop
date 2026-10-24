"use client";

import { useId, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import {
  CICLOS_DO_CLIENTE,
  formatarReais,
  MAX_DIAS_DE_TESTE_DO_CLIENTE,
  type CicloDoCliente,
} from "@barchop/formato";
import type { NovoPlano, PlanoDoPainel } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Campo } from "../../componentes/Campo";
import { Carregando } from "../../componentes/Carregando";
import { CamposLadoALado } from "../../componentes/Colunas";
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
      return { servicos: "Um dos serviços foi desativado. Tire ele do plano ou reative em Serviços." };
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
  const [noBalcao, setNoBalcao] = useState(true);
  const [erros, setErros] = useState<Erros>({});
  const [aviso, setAviso] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  // Sincronizado na renderização, como em CadastroDeServico (o
  // comentário longo de lá explica por que não `useEffect`).
  const [sincronizado, setSincronizado] = useState<PlanoDoPainel | undefined>(undefined);
  if (atual && atual !== sincronizado) {
    setSincronizado(atual);
    setDaCasa(atual.daCasa);
    setNome(atual.nome);
    setDescricao(atual.descricao ?? "");
    setPreco(centavosNoCampo(atual.precoCentavos));
    setDias(String(atual.diasDeTeste));
    setCiclo(atual.ciclo);
    setFixo(atual.fixoPorAtendimentoCentavos === null ? "" : (atual.fixoPorAtendimentoCentavos / 100).toFixed(2).replace(".", ","));
    setEscolhas(
      Object.fromEntries(
        atual.servicos.map((s) => [
          s.servicoId,
          { ilimitado: s.usosPorCiclo === null, usos: String(s.usosPorCiclo ?? 1) },
        ])
      )
    );
    setNoBalcao(atual.aceitaNoBalcao);
  }
  // Quem só cria o próprio (o profissional, ou o dono que não pode o da
  // casa) não escolhe: o plano é dele.
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
    return <Aviso>Só o dono e quem ele libera pra vender planos mexem aqui.</Aviso>;
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

    const aceitaOnline = atual?.aceitaOnline ?? false;
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
    setAviso(undefined);
    setSalvando(true);
    try {
      await api.barbeiro.editarPlano(id, { ativo: !atual.ativo });
      planos.recarregar();
    } catch (causa) {
      setAviso(mensagemDoAviso(causa as ErroDaApi));
    }
    setSalvando(false);
  }

  // A frase do efeito, com os números digitados. Plano de barbeiro sem
  // número da casa: a parte da casa de cada um só o dono vê (Divisão).
  const precoDigitado = paraCentavos(preco);
  const fixoDigitado = fixo.trim() === "" ? null : paraCentavos(fixo);
  const efeito =
    precoDigitado === null || precoDigitado === 0
      ? "Escreva o preço pra ver pra onde vai a mensalidade."
      : daCasa
        ? `Cada mensalidade de ${formatarReais(precoDigitado)} fica com a casa.` +
          (fixoDigitado !== null
            ? ` Quem atender um assinante ganha ${formatarReais(fixoDigitado)} por atendimento.`
            : "")
        : `Cada mensalidade de ${formatarReais(precoDigitado)} é ${euVendo ? "sua" : `do ${nomeDoVendedor}`}, ` +
          `e a casa fica com a parte da casa, como no avulso. O plano vale só com ${euVendo ? "você" : "ele"}.`;

  const titulo = atual ? atual.nome : "Novo plano";
  const deQuem = atual ? (atual.daCasa ? "Plano da casa" : `Plano do ${atual.vendedor?.nome}`) : undefined;
  const mostraTipo = !id && podeCriarDaCasa && podeCriarProprio;

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina voltar={{ href: "/painel/planos", rotulo: "Planos" }} titulo={titulo} apoio={deQuem} />

      <div className={estilos.corpo}>
        <div className={estilos.formulario}>
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

          <CamposLadoALado>
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
            <Campo
              rotulo="Dias grátis"
              inputMode="numeric"
              apoio={`Até ${MAX_DIAS_DE_TESTE_DO_CLIENTE}. A primeira cobrança vem depois.`}
              valor={dias}
              onChange={(proximo) => {
                setDias(proximo);
                setErros((atuais) => ({ ...atuais, dias: undefined }));
              }}
              erro={erros.dias}
            />
          </CamposLadoALado>

          <SeletorEmPilulas
            nome={`${idDoForm}-ciclo`}
            legenda="Cobra a cada"
            opcoes={CICLOS_DO_CLIENTE.map((valor) => ({ valor, rotulo: ROTULO_DO_CICLO[valor] }))}
            valor={ciclo}
            aoTrocar={setCiclo}
          />

          <fieldset className={estilos.grupo} aria-describedby={`${idDoForm}-servicos-apoio`}>
            <legend className={estilos.rotulo}>Serviços incluídos</legend>
            <span className={estilos.apoio} id={`${idDoForm}-servicos-apoio`}>
              Quantas vezes por ciclo. Passou do limite, o serviço é cobrado à parte.
              {vendedor ? ` Só os que ${nomeDoVendedor} faz.` : null}
            </span>
            <ul className={estilos.servicos}>
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
                        <input
                          type="number"
                          min={1}
                          max={USOS_MAX}
                          className={estilos.numero}
                          aria-label={`Usos de ${servico.nome} por ciclo`}
                          value={escolha.ilimitado ? "" : escolha.usos}
                          disabled={escolha.ilimitado}
                          onChange={(evento) => mudarEscolha(servico.id, { usos: evento.target.value })}
                        />
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
          ) : null}

          <fieldset className={estilos.grupo}>
            <legend className={estilos.rotulo}>Como o cliente paga</legend>
            {/* Sem provedor ainda: o online chega com os pagamentos online
                (PR 9 do plano planos-de-assinatura). */}
            <span className={estilos.marca}>
              <input
                type="checkbox"
                id={`${idDoForm}-online`}
                checked={atual?.aceitaOnline ?? false}
                disabled
                aria-describedby={`${idDoForm}-online-apoio`}
              />
              <label htmlFor={`${idDoForm}-online`}>Online, na página</label>
            </span>
            <span className={estilos.apoio} id={`${idDoForm}-online-apoio`}>
              Pix ou cartão, direto na conta de quem vende. Chega com os pagamentos online.
            </span>
            <span className={estilos.marca}>
              <input
                type="checkbox"
                id={`${idDoForm}-balcao`}
                checked={noBalcao}
                onChange={(evento) => {
                  setNoBalcao(evento.target.checked);
                  setErros((atuais) => ({ ...atuais, formas: undefined }));
                }}
                aria-describedby={`${idDoForm}-balcao-apoio`}
              />
              <label htmlFor={`${idDoForm}-balcao`}>No balcão</label>
            </span>
            <span className={estilos.apoio} id={`${idDoForm}-balcao-apoio`}>
              Você cadastra o assinante no cliente e marca “Recebi” a cada ciclo.
            </span>
            {erros.formas ? (
              <span className={estilos.erro} role="alert">
                {erros.formas}
              </span>
            ) : null}
          </fieldset>

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
        </div>

        <aside className={estilos.lateral} aria-label="Pra onde vai o dinheiro">
          <p className={estilos.efeito}>{efeito}</p>
        </aside>
      </div>

      {aviso ? <Aviso>{aviso}</Aviso> : null}

      <div className={estilos.rodape}>
        <div className={estilos.acoes}>
          <Botao type="button" carregando={salvando} onClick={salvar}>
            Salvar plano
          </Botao>
          <Botao type="button" variante="contorno" onClick={() => router.push("/painel/planos")}>
            Cancelar
          </Botao>
        </div>

        {atual ? (
          <div className={estilos.acaoDoEstado} data-perigo={atual.ativo || undefined}>
            <p className={estilos.apoio}>
              {atual.ativo
                ? "Ninguém novo assina, e sai da sua página. Quem já assina continua."
                : "Fora da venda. Reativar volta o plano pra venda e pra sua página."}
            </p>
            <Botao type="button" variante="contorno" carregando={salvando} onClick={alternarAtivo}>
              {atual.ativo ? "Desativar" : "Reativar"}
            </Botao>
          </div>
        ) : null}
      </div>
    </div>
  );
}
