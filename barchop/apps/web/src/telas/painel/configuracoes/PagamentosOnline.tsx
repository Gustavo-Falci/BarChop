"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import { DIAS_PARA_CANCELAR } from "@barchop/formato";
import type { AssinaturaDoPainel, PagamentosOnline as Pagamentos, ProvedorDePagamento } from "@barchop/types";
import { Aviso } from "../../../componentes/Aviso";
import { Botao } from "../../../componentes/Botao";
import { CabecalhoDaPagina } from "../../../componentes/CabecalhoDaPagina";
import { Campo } from "../../../componentes/Campo";
import { Carregando } from "../../../componentes/Carregando";
import { Chip } from "../../../componentes/Chip";
import { FolhaDeAjuda } from "../../../componentes/FolhaDeAjuda";
import { SeletorEmPilulas } from "../../../componentes/SeletorEmPilulas";
import { PROVEDORES, comMaiuscula } from "../../../fluxo/provedores";
import { useRequisicao } from "../../../api/useRequisicao";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { usePainel } from "../../../painel/SessaoDoPainel";
import estilos from "./PagamentosOnline.module.css";

// Pagamentos online (Onda 2, marco 3, PR 11 do plano
// planos-de-assinatura; a Stripe no PR 6 do pagamentos-online-stripe; a
// InfinitePay no PR 7 do pagamentos-online-infinitepay): a conta de quem
// vende, onde cai a mensalidade de quem assina pela página. Cada um
// conecta a sua; a da casa recebe os planos da casa e é do dono. A chave
// nunca volta da API: a tela mostra só os 4 últimos caracteres.
//
// Sem conta, a página escolhe o provedor (pílulas) e mostra o guia dele.
// A conta conectada fala sempre pelo provedor dela, e não pela escolha.
//
// A InfinitePay não renova sozinha: o quadro "Como funciona" fica à vista
// enquanto ela é a escolhida ou a conectada, e a conta dela tem os dias
// sem pagamento até cancelar. Sem chave de teste, ela só conecta no modo
// real.
//
// Ver e desconectar não pedem o Completo nem a liberação pra vender: as
// assinaturas que existem seguem, e quem vendeu precisa enxergar e soltar
// a conta. Conectar pede os dois (o `planos()` diz se pode).

const VOLTAR = { href: "/painel/configuracoes", rotulo: "Configurações" };
const TITULO = "Pagamentos online";
const APOIO = "A conta do Asaas, da Stripe ou da InfinitePay onde cai a mensalidade de quem assina pela sua página.";

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// Onde o Asaas mora em cada modo: a conta de verdade e o sandbox são
// sites (e chaves) separados. Na Stripe, a mesma conta tem os dois modos.
const SITE_DO_ASAAS: Record<Pagamentos["modoAceito"], string> = {
  real: "https://www.asaas.com/",
  teste: "https://sandbox.asaas.com/",
};
const PAINEL_DA_STRIPE = "https://dashboard.stripe.com/";
const DOCUMENTACAO_DA_INFINITEPAY = "https://www.infinitepay.io/checkout-documentacao";

// As ajudas abrem numa folha, a partir de uma linha (redesenho das
// Configurações, PR 9): o título e, embaixo, o que tem lá dentro.
const AJUDA_DO_GUIA: Record<ProvedorDePagamento, { titulo: string; resumo: string }> = {
  asaas: { titulo: "Como pegar a chave no Asaas", resumo: "3 passos, com os links do Asaas" },
  stripe: { titulo: "Como pegar a chave na Stripe", resumo: "3 passos, com as permissões da chave restrita" },
  infinitepay: { titulo: "Como pegar a chave na InfinitePay", resumo: "3 passos, com o link da documentação" },
};
const AJUDA_DA_INFINITEPAY = {
  titulo: "Como funciona na InfinitePay",
  // O que pesa fica à vista mesmo com a folha fechada: ela não renova.
  resumo: "Não renova sozinha: um link por mensalidade, 3 dias antes do vencimento.",
};

const OPCOES_DE_PROVEDOR: { valor: ProvedorDePagamento; rotulo: string }[] = [
  { valor: "asaas", rotulo: PROVEDORES.asaas.nome },
  { valor: "stripe", rotulo: PROVEDORES.stripe.nome },
  { valor: "infinitepay", rotulo: PROVEDORES.infinitepay.nome },
];

// O que é da chave fica no campo dela; o que é da tag, no da tag.
const ERROS_DA_CHAVE = ["chave_invalida", "modo_errado", "chave_recusada", "outra_conta"];
const ERROS_DA_TAG = ["tag_obrigatoria", "tag_invalida"];

// O que a API respondeu, numa frase pra quem vende. O 503 fala da
// configuração do servidor (URL_DA_API), que não é com o dono.
function mensagemDoErro(erro: ErroDaApi, provedor: ProvedorDePagamento): string {
  switch (erro.codigo) {
    case "pagamentos_online_sem_endereco":
      return "Os pagamentos online ainda não estão ligados no BarChop. Fale com o suporte.";
    case "recurso_do_plano":
      return "Conectar uma conta é do plano Completo.";
    default:
      return erro.mensagem || `Não foi possível falar com ${PROVEDORES[provedor].o} agora.`;
  }
}

export function PagamentosOnline() {
  const { perfil } = usePainel();
  if (perfil.papel === "recepcao") {
    return (
      <div className={estilos.pagina}>
        <CabecalhoDaPagina titulo={TITULO} apoio={APOIO} voltar={VOLTAR} />
        <p>Quem vende planos conecta aqui a própria conta. A recepção não recebe mensalidades.</p>
      </div>
    );
  }
  return <ContasDeQuemVende />;
}

type ProvedorDaConta = ProvedorDePagamento | null;

function ContasDeQuemVende() {
  const api = useApiDoPainel();
  const { perfil } = usePainel();
  const ehDono = perfil.papel === "dono";
  // Só pra saber se pode conectar: fora do Completo é 403, e isso não é
  // erro da tela.
  const planos = useRequisicao(() => api.barbeiro.planos(), []);
  const minha = useRequisicao(() => api.barbeiro.pagamentosOnline(false), []);
  const daCasa = useRequisicao(
    () => (ehDono ? api.barbeiro.pagamentosOnline(true) : Promise.resolve(null)),
    [ehDono]
  );

  // O provedor de cada conta depois de conectar ou desconectar aqui
  // (null = sem conta); antes disso, vale o que a API respondeu.
  const [mudadas, setMudadas] = useState<{ casa?: ProvedorDaConta; minha?: ProvedorDaConta }>({});
  // O provedor das contas que ainda não conectaram.
  const [escolhido, setEscolhido] = useState<ProvedorDePagamento>("asaas");
  // A ajuda aberta na folha.
  const [ajudaAberta, setAjudaAberta] = useState<"guia" | "infinitepay" | null>(null);

  const foraDoCompleto = planos.erro?.codigo === "recurso_do_plano";
  const erro = minha.erro ?? daCasa.erro ?? (foraDoCompleto ? undefined : planos.erro);
  if (erro) return <Aviso>{erro.mensagem || "Não foi possível carregar as contas agora."}</Aviso>;
  if (!minha.dados || (ehDono && !daCasa.dados) || (!planos.dados && !foraDoCompleto)) return <Carregando />;

  // O dono que não atende não vende plano próprio: a conta dele só
  // aparece se já existir.
  const vendeOProprio = planos.dados?.podeCriarProprio ?? false;
  const mostraMinha = vendeOProprio || minha.dados.conta !== null;
  // O guia vale enquanto alguma conta que dá pra conectar está sem
  // conexão; conectar ou desconectar aqui muda a resposta sem recarregar.
  const provedorDa = (daCasaDela: boolean, inicial: Pagamentos | null): ProvedorDaConta => {
    const mudada = mudadas[daCasaDela ? "casa" : "minha"];
    return mudada !== undefined ? mudada : (inicial?.conta?.provedor ?? null);
  };
  const daCasaConectada = ehDono && provedorDa(true, daCasa.dados) !== null;
  const minhaConectada = provedorDa(false, minha.dados) !== null;
  const mostraGuia = !foraDoCompleto && ((ehDono && !daCasaConectada) || (vendeOProprio && !minhaConectada));
  // Como funciona na InfinitePay: enquanto é a escolha do guia, ou é a
  // de uma conta à vista.
  const naInfinitePay =
    (mostraGuia && escolhido === "infinitepay") ||
    (ehDono && provedorDa(true, daCasa.dados) === "infinitepay") ||
    (mostraMinha && provedorDa(false, minha.dados) === "infinitepay");

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina titulo={TITULO} apoio={APOIO} voltar={VOLTAR} />
      {foraDoCompleto ? (
        <Aviso>
          Conectar uma conta é do plano Completo. As assinaturas que existem seguem cobrando na conta conectada.{" "}
          <Link href="/painel/faturas">Ver os planos</Link>
        </Aviso>
      ) : null}
      {mostraGuia ? (
        <SeletorEmPilulas
          nome="provedor"
          preencher
          legenda="Onde você recebe"
          opcoes={OPCOES_DE_PROVEDOR}
          valor={escolhido}
          aoTrocar={setEscolhido}
          efeito={PROVEDORES[escolhido].efeito}
        />
      ) : null}
      {/* As contas num cartão só (redesenho, PR 9), uma embaixo da outra
          no celular e lado a lado no computador. */}
      {(ehDono && daCasa.dados) || mostraMinha ? (
        <div className={estilos.contas}>
          {ehDono && daCasa.dados ? (
            <ContaOnline
              inicial={daCasa.dados}
              titulo="Conta da casa"
              descricao="Recebe as mensalidades dos planos da casa."
              escolhido={escolhido}
              podeConectar={!foraDoCompleto}
              aoMudar={(provedor) => setMudadas((antes) => ({ ...antes, casa: provedor }))}
            />
          ) : null}
          {mostraMinha ? (
            <ContaOnline
              inicial={minha.dados}
              titulo="Sua conta"
              descricao="Recebe as mensalidades dos planos que você vende."
              escolhido={escolhido}
              podeConectar={!foraDoCompleto && vendeOProprio}
              aoMudar={(provedor) => setMudadas((antes) => ({ ...antes, minha: provedor }))}
            />
          ) : null}
        </div>
      ) : null}
      {mostraGuia || naInfinitePay ? (
        <section className={estilos.ajuda} aria-labelledby="pagamentos-ajuda">
          <h2 id="pagamentos-ajuda" className={estilos.tituloDaAjuda}>
            Ajuda
          </h2>
          <ul className={estilos.ajudas}>
            {mostraGuia ? (
              <li>
                <LinhaDeAjuda {...AJUDA_DO_GUIA[escolhido]} aoAbrir={() => setAjudaAberta("guia")} />
              </li>
            ) : null}
            {naInfinitePay ? (
              <li>
                <LinhaDeAjuda {...AJUDA_DA_INFINITEPAY} aoAbrir={() => setAjudaAberta("infinitepay")} />
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
      {ajudaAberta === "guia" && mostraGuia ? (
        <FolhaDeAjuda titulo={AJUDA_DO_GUIA[escolhido].titulo} aoFechar={() => setAjudaAberta(null)}>
          <Guia provedor={escolhido} modo={minha.dados.modoAceito} />
        </FolhaDeAjuda>
      ) : null}
      {ajudaAberta === "infinitepay" && naInfinitePay ? (
        <FolhaDeAjuda titulo={AJUDA_DA_INFINITEPAY.titulo} aoFechar={() => setAjudaAberta(null)}>
          <ComoFuncionaNaInfinitePay />
        </FolhaDeAjuda>
      ) : null}
      {!ehDono && !mostraMinha ? (
        <p>
          Quem vende planos conecta aqui a própria conta do Asaas, da Stripe ou da InfinitePay. O dono libera a venda de
          planos na Equipe.
        </p>
      ) : null}
    </div>
  );
}

// Uma linha que abre a folha da ajuda: o título é o nome do botão, e o
// resumo, a descrição.
function LinhaDeAjuda({ titulo, resumo, aoAbrir }: { titulo: string; resumo: string; aoAbrir: () => void }) {
  const id = useId();
  return (
    <button
      type="button"
      className={estilos.linhaDeAjuda}
      aria-haspopup="dialog"
      aria-labelledby={`${id}-titulo`}
      aria-describedby={`${id}-resumo`}
      onClick={aoAbrir}
    >
      <span className={estilos.textoDaAjuda}>
        <span id={`${id}-titulo`} className={estilos.nomeDaAjuda}>
          {titulo}
        </span>
        <span id={`${id}-resumo`} className={estilos.apoio}>
          {resumo}
        </span>
      </span>
      <svg className={estilos.seta} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}

function Guia({ provedor, modo }: { provedor: ProvedorDePagamento; modo: Pagamentos["modoAceito"] }) {
  if (provedor === "stripe") return <GuiaDaStripe modo={modo} />;
  if (provedor === "infinitepay") return <GuiaDaInfinitePay />;
  return <GuiaDoAsaas modo={modo} />;
}

// O caminho de quem nunca mexeu no Asaas até a chave colada aqui. A
// chave aparece uma vez só no Asaas e não se recupera: o passo 3 avisa
// antes de fechar a janela de lá.
function GuiaDoAsaas({ modo }: { modo: Pagamentos["modoAceito"] }) {
  const site = SITE_DO_ASAAS[modo];
  const prefixo = modo === "teste" ? "$aact_hmlg_" : "$aact_prod_";
  return (
    <ol className={estilos.passos}>
      <li>
        <strong>Crie a conta {modo === "teste" ? "no sandbox do Asaas" : "no Asaas"}.</strong>{" "}
        {modo === "teste"
          ? "É uma conta de teste, separada da de verdade, e não pede documentos."
          : "Com o CPF ou CNPJ de quem recebe. O Asaas pede documentos pra aprovar a conta, e o dinheiro só vai pro seu banco depois da aprovação."}{" "}
        <a href={site} target="_blank" rel="noreferrer">
          Criar a conta
        </a>
      </li>
      <li>
        <strong>Gere a chave.</strong> No computador (o aplicativo do Asaas não gera), entre como administrador e vá
        em Integrações › Chaves de API. Dê o nome BarChop e deixe sem data pra expirar.{" "}
        <a href={`${site}customerApiAccessToken/index`} target="_blank" rel="noreferrer">
          Abrir as chaves de API no Asaas
        </a>
      </li>
      <li>
        <strong>Copie e cole aqui.</strong> O Asaas mostra a chave uma vez só: copie antes de fechar a janela. Ela
        começa com <code>{prefixo}</code>. O BarChop guarda a chave cifrada, mostra só o final e avisa o Asaas
        sozinho pra onde mandar os pagamentos.
      </li>
    </ol>
  );
}

// O mesmo caminho na Stripe. A chave é restrita, com só as permissões
// que o conector usa (o plano, "Diferenças" do PR 2): sem uma de
// leitura, o conectar recusa; sem uma de escrita, a chave conecta e o
// assinar falha. Os nomes das permissões ficam como no painel da Stripe.
function GuiaDaStripe({ modo }: { modo: Pagamentos["modoAceito"] }) {
  const chaves = `${PAINEL_DA_STRIPE}${modo === "teste" ? "test/" : ""}apikeys`;
  return (
    <ol className={estilos.passos}>
      <li>
        <strong>Crie a conta na Stripe.</strong>{" "}
        {modo === "teste"
          ? "No modo de teste, a Stripe não pede documentos e nada é cobrado de verdade."
          : "Com os dados de quem recebe. A Stripe pede documentos pra ativar a conta, e o dinheiro só vai pro seu banco depois da ativação."}{" "}
        <a href={`${PAINEL_DA_STRIPE}register`} target="_blank" rel="noreferrer">
          Criar a conta
        </a>
      </li>
      <li>
        <strong>Crie a chave restrita.</strong> No painel da Stripe
        {modo === "teste" ? ", no modo de teste," : ""} vá em Desenvolvedores › Chaves de API e crie uma chave
        restrita com o nome BarChop. Dê escrita em Customers, Products, Prices, Subscriptions e Webhook Endpoints, e
        leitura em Invoices, Invoice Payments e PaymentIntents. O resto fica sem acesso.{" "}
        <a href={chaves} target="_blank" rel="noreferrer">
          Abrir as chaves de API na Stripe
        </a>
      </li>
      <li>
        <strong>Copie e cole aqui.</strong> Copie a chave assim que a Stripe mostrar: ela pode não aparecer de novo.
        Ela começa com <code>{PROVEDORES.stripe.prefixo[modo]}</code>. O BarChop guarda a chave cifrada, mostra só o
        final e avisa a Stripe sozinho pra onde mandar os pagamentos.
      </li>
    </ol>
  );
}

// Na InfinitePay (a documentação do checkout, conferida em 31/10/2026):
// sem o checkout integrado ligado, a conta não cria link; a chave
// aparece uma vez só; e a InfiniteTag diz de qual conta é a chave.
function GuiaDaInfinitePay() {
  return (
    <ol className={estilos.passos}>
      <li>
        <strong>Ligue o checkout integrado.</strong> Nas configurações da sua conta na InfinitePay, ligue o checkout
        integrado. Sem ele, a InfinitePay não cria os links de pagamento.
      </li>
      <li>
        <strong>Crie a chave de API.</strong> Nas mesmas configurações, crie uma chave de API. A InfinitePay deixa até
        5 por conta.{" "}
        <a href={DOCUMENTACAO_DA_INFINITEPAY} target="_blank" rel="noreferrer">
          Ver a documentação da InfinitePay
        </a>
      </li>
      <li>
        <strong>Cole aqui a InfiniteTag e a chave.</strong> A InfiniteTag é o seu nome de usuário na InfinitePay, com
        ou sem o $. A chave começa com <code>{PROVEDORES.infinitepay.prefixo.real}</code> e aparece uma vez só: copie
        antes de fechar. O BarChop guarda a chave cifrada e mostra só o final.
      </li>
    </ol>
  );
}

// A InfinitePay não tem assinatura: o BarChop toca o ciclo (a varredura
// diária, PR 5 do plano).
function ComoFuncionaNaInfinitePay() {
  return (
    <ul className={estilos.passos}>
      <li>
        <strong>Não renova sozinha.</strong> A InfinitePay não tem cobrança automática: o BarChop manda um link de
        pagamento a cada mensalidade, por Pix ou cartão.
      </li>
      <li>
        <strong>O link sai 3 dias antes do vencimento,</strong> por e-mail para quem assina. No painel, a assinatura
        tem o botão de mandar o mesmo link pelo WhatsApp.
      </li>
      <li>
        <strong>Vencido sem pagar, fica Em atraso,</strong> e o link vai de novo.
      </li>
      <li>
        <strong>Passados os dias sem pagamento que você escolher na conta,</strong> a assinatura é cancelada, e você e
        quem assina recebem o aviso. Sem mudar, são {DIAS_PARA_CANCELAR.padrao} dias.
      </li>
      <li>
        <strong>Não há conta de teste:</strong> todo pagamento é de verdade, a partir de R$ 1,00. Estorno, só no app da
        InfinitePay.
      </li>
    </ul>
  );
}

function ContaOnline({
  inicial,
  titulo,
  descricao,
  escolhido,
  podeConectar,
  aoMudar,
}: {
  inicial: Pagamentos;
  titulo: string;
  descricao: string;
  // O provedor da página, pra quando esta conta não está conectada.
  escolhido: ProvedorDePagamento;
  podeConectar: boolean;
  aoMudar: (provedor: ProvedorDaConta) => void;
}) {
  const api = useApiDoPainel();
  const { perfil } = usePainel();
  const idDoTitulo = useId();
  const [dados, setDados] = useState(inicial);
  const [chave, setChave] = useState("");
  const [tag, setTag] = useState("");
  const [dias, setDias] = useState(String(inicial.conta?.diasParaCancelar ?? DIAS_PARA_CANCELAR.padrao));
  const [trocando, setTrocando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroDaChave, setErroDaChave] = useState<string | undefined>();
  const [erroDaTag, setErroDaTag] = useState<string | undefined>();
  const [erroDosDias, setErroDosDias] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  const [feito, setFeito] = useState<string | undefined>();
  // Quem trava o desconectar: as online vivas nos planos desta conta.
  const [quemTrava, setQuemTrava] = useState<AssinaturaDoPainel[]>([]);

  const { daCasa, modoAceito, conta } = dados;
  // Conectada, a conta fala pelo provedor dela; sem conta, pelo da página.
  const provedor = conta?.provedor ?? escolhido;
  const textos = PROVEDORES[provedor];
  const prefixo = textos.prefixo[modoAceito];
  const ehInfinitePay = provedor === "infinitepay";
  // Sem chave de teste, a InfinitePay não conecta no modo de teste (a API
  // responde `modo_errado`): a tela diz antes.
  const semModoDeTeste = ehInfinitePay && modoAceito === "teste";
  const apoioDaChave =
    modoAceito === "teste"
      ? `Use ${textos.chaveDeTeste} (começa com ${prefixo}): aqui os pagamentos são de teste.`
      : `Ela começa com ${prefixo}.`;

  function limpar() {
    setAviso(undefined);
    setErroDaChave(undefined);
    setErroDaTag(undefined);
    setErroDosDias(undefined);
    setFeito(undefined);
    setQuemTrava([]);
  }

  async function conectar() {
    limpar();
    if (chave.trim() === "") {
      setErroDaChave(`Cole a ${textos.chave}.`);
      return;
    }
    setEnviando(true);
    try {
      // Trocar a chave da InfinitePay vale só na mesma conta: a tag é a
      // gravada.
      const tagEnviada = ehInfinitePay ? (conta?.infiniteTag ?? tag) : undefined;
      const resposta = await api.barbeiro.conectarPagamentosOnline(daCasa, provedor, chave, tagEnviada);
      setDados(resposta);
      setDias(String(resposta.conta?.diasParaCancelar ?? DIAS_PARA_CANCELAR.padrao));
      aoMudar(resposta.conta?.provedor ?? null);
      setFeito(conta ? "Chave trocada." : "Conta conectada.");
      setTrocando(false);
      setTag("");
    } catch (causa) {
      const falha = causa as ErroDaApi;
      if (ERROS_DA_TAG.includes(falha.codigo)) {
        setErroDaTag(falha.mensagem);
      } else if (ERROS_DA_CHAVE.includes(falha.codigo)) {
        setErroDaChave(falha.mensagem);
      } else {
        setAviso(mensagemDoErro(falha, provedor));
      }
    }
    // A chave sai da tela, deu certo ou não: não fica no estado mais do
    // que o necessário.
    setChave("");
    setEnviando(false);
  }

  async function salvarDias() {
    limpar();
    const escolhidos = Number(dias);
    if (
      !Number.isInteger(escolhidos) ||
      escolhidos < DIAS_PARA_CANCELAR.minimo ||
      escolhidos > DIAS_PARA_CANCELAR.maximo
    ) {
      setErroDosDias(`Escolha de ${DIAS_PARA_CANCELAR.minimo} a ${DIAS_PARA_CANCELAR.maximo} dias.`);
      return;
    }
    setEnviando(true);
    try {
      setDados(await api.barbeiro.mudarDiasParaCancelar(daCasa, escolhidos));
      setFeito("Dias salvos.");
    } catch (causa) {
      setAviso(mensagemDoErro(causa as ErroDaApi, provedor));
    }
    setEnviando(false);
  }

  async function desconectar() {
    limpar();
    setEnviando(true);
    try {
      await api.barbeiro.desconectarPagamentosOnline(daCasa);
      setDados({ ...dados, conta: null });
      aoMudar(null);
      setFeito("Conta desconectada.");
    } catch (causa) {
      const falha = causa as ErroDaApi;
      setAviso(mensagemDoErro(falha, provedor));
      if (falha.codigo === "assinaturas_ativas") {
        // A API diz quantas; a lista diz quem.
        const { assinantes } = await api.barbeiro.assinantes().catch(() => ({ assinantes: [] }));
        setQuemTrava(
          assinantes.filter(
            (a) =>
              a.forma === "online" &&
              a.situacao !== "cancelada" &&
              (daCasa ? a.plano.daCasa : a.plano.vendedor?.id === perfil.id)
          )
        );
      }
    }
    setConfirmando(false);
    setEnviando(false);
  }

  const formulario = semModoDeTeste ? (
    <p className={estilos.apoio}>
      A InfinitePay não tem chave de teste: ela só conecta no BarChop de produção, onde os pagamentos são de verdade.
    </p>
  ) : (
    <div className={estilos.formulario}>
      {ehInfinitePay && !conta ? (
        <Campo
          rotulo="InfiniteTag"
          autoComplete="off"
          spellCheck={false}
          apoio="O seu nome de usuário na InfinitePay, com ou sem o $."
          valor={tag}
          onChange={(proxima) => {
            setTag(proxima);
            setErroDaTag(undefined);
          }}
          erro={erroDaTag}
        />
      ) : null}
      <Campo
        rotulo={comMaiuscula(textos.chave)}
        type="password"
        autoComplete="off"
        spellCheck={false}
        apoio={
          conta ? `Só vale uma chave da mesma conta ${textos.do}. Pra mudar de conta, desconecte antes.` : apoioDaChave
        }
        valor={chave}
        onChange={(proxima) => {
          setChave(proxima);
          setErroDaChave(undefined);
        }}
        erro={erroDaChave}
      />
      <div className={estilos.botoes}>
        {conta ? (
          <Botao variante="fantasma" onClick={() => setTrocando(false)} disabled={enviando}>
            Manter a chave
          </Botao>
        ) : null}
        <Botao onClick={conectar} carregando={enviando}>
          {conta ? "Salvar a chave nova" : "Conectar"}
        </Botao>
      </div>
    </div>
  );

  // Os dias valem para os links novos: o que já saiu segue com a validade
  // dele (a do PR 4 do plano).
  const diasParaCancelar =
    conta?.provedor === "infinitepay" ? (
      <div className={estilos.formulario}>
        <Campo
          rotulo="Dias sem pagamento até cancelar"
          type="number"
          inputMode="numeric"
          min={DIAS_PARA_CANCELAR.minimo}
          max={DIAS_PARA_CANCELAR.maximo}
          apoio={`Entre ${DIAS_PARA_CANCELAR.minimo} e ${DIAS_PARA_CANCELAR.maximo}, contados do vencimento. Vale para os próximos links.`}
          valor={dias}
          onChange={(proximo) => {
            setDias(proximo);
            setErroDosDias(undefined);
          }}
          erro={erroDosDias}
        />
        <div className={estilos.botoes}>
          <Botao variante="contorno" onClick={salvarDias} carregando={enviando}>
            Salvar os dias
          </Botao>
        </div>
      </div>
    ) : null;

  return (
    <section className={estilos.conta} aria-labelledby={idDoTitulo}>
      <div className={estilos.topoDaConta}>
        <span className={estilos.textoDaConta}>
          <h2 id={idDoTitulo} className={estilos.nomeDaConta}>
            {titulo}
          </h2>
          <span className={estilos.apoio}>{descricao}</span>
        </span>
        {/* Fora do título: o nome da região segue só "Conta da casa". */}
        {conta ? (
          <Chip tom="ok" tamanho="pequeno">
            Conectada
          </Chip>
        ) : (
          <Chip tom="neutro" tamanho="pequeno">
            Não conectada
          </Chip>
        )}
      </div>
      <div className={estilos.corpoDaConta}>
        {conta ? (
          <>
            <p className={estilos.linha}>
              {/* Um item só no flex: o texto quebra como texto, e o chip vem depois. */}
              <span>
                <strong>{textos.nome}</strong>
                {conta.infiniteTag ? ` · $${conta.infiniteTag}` : ""} · chave terminando em {conta.chaveFinal} ·
                conectada em {dataCurta(conta.conectadaEm)}
              </span>
              {conta.modo === "teste" ? (
                <Chip tom="atencao" tamanho="pequeno">
                  {textos.seloDeTeste}
                </Chip>
              ) : null}
            </p>
            {trocando ? (
              formulario
            ) : confirmando ? (
              <div className={estilos.confirmacao}>
                <p>
                  {comMaiuscula(textos.o)} para de avisar o BarChop dos pagamentos desta conta, e os planos que recebem
                  por ela saem da venda online.
                </p>
                <div className={estilos.botoes}>
                  <Botao variante="fantasma" onClick={() => setConfirmando(false)} disabled={enviando}>
                    Manter
                  </Botao>
                  <Botao onClick={desconectar} carregando={enviando}>
                    Sim, desconectar
                  </Botao>
                </div>
              </div>
            ) : (
              <>
                {diasParaCancelar}
                <div className={estilos.botoes}>
                  <Botao
                    variante="fantasma"
                    onClick={() => {
                      limpar();
                      setConfirmando(true);
                    }}
                  >
                    Desconectar
                  </Botao>
                  {podeConectar ? (
                    <Botao
                      variante="contorno"
                      onClick={() => {
                        limpar();
                        setTrocando(true);
                      }}
                    >
                      Trocar a chave
                    </Botao>
                  ) : null}
                </div>
              </>
            )}
          </>
        ) : podeConectar ? (
          formulario
        ) : (
          <p className={estilos.apoio}>Nenhuma conta conectada.</p>
        )}

        {aviso ? <Aviso>{aviso}</Aviso> : null}
        {quemTrava.length > 0 ? (
          <div className={estilos.quemTrava}>
            <p className={estilos.apoio}>Cancele estas assinaturas antes de desconectar:</p>
            <ul>
              {quemTrava.map((assinatura) => (
                <li key={assinatura.id}>
                  <Link href={`/painel/clientes/${assinatura.cliente.id}`}>{assinatura.cliente.nome}</Link> ·{" "}
                  {assinatura.plano.nome}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {feito ? (
          <p className={estilos.feito} role="status">
            ✓ {feito}
          </p>
        ) : null}
      </div>
    </section>
  );
}
