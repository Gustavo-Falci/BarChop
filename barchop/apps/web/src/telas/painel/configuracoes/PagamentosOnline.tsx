"use client";

import Link from "next/link";
import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { AssinaturaDoPainel, PagamentosOnline as Pagamentos, ProvedorDePagamento } from "@barchop/types";
import { Aviso } from "../../../componentes/Aviso";
import { Botao } from "../../../componentes/Botao";
import { CabecalhoDaPagina } from "../../../componentes/CabecalhoDaPagina";
import { Campo } from "../../../componentes/Campo";
import { Carregando } from "../../../componentes/Carregando";
import { Chip } from "../../../componentes/Chip";
import { Secao } from "../../../componentes/Secao";
import { SeletorEmPilulas } from "../../../componentes/SeletorEmPilulas";
import { PROVEDORES, comMaiuscula } from "../../../fluxo/provedores";
import { useRequisicao } from "../../../api/useRequisicao";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { usePainel } from "../../../painel/SessaoDoPainel";
import estilos from "./PagamentosOnline.module.css";

// Pagamentos online (Onda 2, marco 3, PR 11 do plano
// planos-de-assinatura; a Stripe no PR 6 do pagamentos-online-stripe): a
// conta do Asaas ou da Stripe de quem vende, onde cai a mensalidade de
// quem assina pela página. Cada um conecta a sua; a da casa recebe os
// planos da casa e é do dono. A chave nunca volta da API: a tela mostra
// só os 4 últimos caracteres.
//
// Sem conta, a página escolhe o provedor (pílulas) e mostra o guia dele.
// A conta conectada fala sempre pelo provedor dela, e não pela escolha.
//
// Ver e desconectar não pedem o Completo nem a liberação pra vender: as
// assinaturas que existem seguem, e quem vendeu precisa enxergar e soltar
// a conta. Conectar pede os dois (o `planos()` diz se pode).

const VOLTAR = { href: "/painel/configuracoes", rotulo: "Configurações" };
const TITULO = "Pagamentos online";
const APOIO = "A conta do Asaas ou da Stripe onde cai a mensalidade de quem assina pela sua página.";

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

const OPCOES_DE_PROVEDOR: { valor: ProvedorDePagamento; rotulo: string }[] = [
  { valor: "asaas", rotulo: PROVEDORES.asaas.nome },
  { valor: "stripe", rotulo: PROVEDORES.stripe.nome },
];

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

  const [conectadas, setConectadas] = useState<{ casa?: boolean; minha?: boolean }>({});
  // O provedor das contas que ainda não conectaram.
  const [escolhido, setEscolhido] = useState<ProvedorDePagamento>("asaas");

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
  const conectada = (daCasaDela: boolean, inicial: Pagamentos | null) =>
    conectadas[daCasaDela ? "casa" : "minha"] ?? inicial?.conta != null;
  const mostraGuia =
    !foraDoCompleto &&
    ((ehDono && !conectada(true, daCasa.dados)) || (vendeOProprio && !conectada(false, minha.dados)));

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
          legenda="Onde você recebe"
          opcoes={OPCOES_DE_PROVEDOR}
          valor={escolhido}
          aoTrocar={setEscolhido}
          efeito={PROVEDORES[escolhido].efeito}
        />
      ) : null}
      <div className={estilos.contas}>
        {ehDono && daCasa.dados ? (
          <ContaOnline
            inicial={daCasa.dados}
            titulo="Conta da casa"
            descricao="Recebe as mensalidades dos planos da casa."
            escolhido={escolhido}
            podeConectar={!foraDoCompleto}
            aoMudar={(sim) => setConectadas((antes) => ({ ...antes, casa: sim }))}
          />
        ) : null}
        {mostraMinha ? (
          <ContaOnline
            inicial={minha.dados}
            titulo="Sua conta"
            descricao="Recebe as mensalidades dos planos que você vende."
            escolhido={escolhido}
            podeConectar={!foraDoCompleto && vendeOProprio}
            aoMudar={(sim) => setConectadas((antes) => ({ ...antes, minha: sim }))}
          />
        ) : null}
        {mostraGuia ? (
          escolhido === "stripe" ? (
            <GuiaDaStripe modo={minha.dados.modoAceito} />
          ) : (
            <GuiaDoAsaas modo={minha.dados.modoAceito} />
          )
        ) : null}
      </div>
      {!ehDono && !mostraMinha ? (
        <p>
          Quem vende planos conecta aqui a própria conta do Asaas ou da Stripe. O dono libera a venda de planos na
          Equipe.
        </p>
      ) : null}
    </div>
  );
}

// O caminho de quem nunca mexeu no Asaas até a chave colada aqui. A
// chave aparece uma vez só no Asaas e não se recupera: o passo 3 avisa
// antes de fechar a janela de lá.
function GuiaDoAsaas({ modo }: { modo: Pagamentos["modoAceito"] }) {
  const site = SITE_DO_ASAAS[modo];
  const prefixo = modo === "teste" ? "$aact_hmlg_" : "$aact_prod_";
  return (
    <div className={estilos.guia}>
      <Secao titulo="Como pegar a chave no Asaas">
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
      </Secao>
    </div>
  );
}

// O mesmo caminho na Stripe. A chave é restrita, com só as permissões
// que o conector usa (o plano, "Diferenças" do PR 2): sem uma de
// leitura, o conectar recusa; sem uma de escrita, a chave conecta e o
// assinar falha. Os nomes das permissões ficam como no painel da Stripe.
function GuiaDaStripe({ modo }: { modo: Pagamentos["modoAceito"] }) {
  const chaves = `${PAINEL_DA_STRIPE}${modo === "teste" ? "test/" : ""}apikeys`;
  return (
    <div className={estilos.guia}>
      <Secao titulo="Como pegar a chave na Stripe">
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
      </Secao>
    </div>
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
  aoMudar: (conectada: boolean) => void;
}) {
  const api = useApiDoPainel();
  const { perfil } = usePainel();
  const [dados, setDados] = useState(inicial);
  const [chave, setChave] = useState("");
  const [trocando, setTrocando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroDaChave, setErroDaChave] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  const [feito, setFeito] = useState<string | undefined>();
  // Quem trava o desconectar: as online vivas nos planos desta conta.
  const [quemTrava, setQuemTrava] = useState<AssinaturaDoPainel[]>([]);

  const { daCasa, modoAceito, conta } = dados;
  // Conectada, a conta fala pelo provedor dela; sem conta, pelo da página.
  const provedor = conta?.provedor ?? escolhido;
  const textos = PROVEDORES[provedor];
  const prefixo = textos.prefixo[modoAceito];
  const apoioDaChave =
    modoAceito === "teste"
      ? `Use ${textos.chaveDeTeste} (começa com ${prefixo}): aqui os pagamentos são de teste.`
      : `Ela começa com ${prefixo}.`;

  function limpar() {
    setAviso(undefined);
    setErroDaChave(undefined);
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
      const resposta = await api.barbeiro.conectarPagamentosOnline(daCasa, provedor, chave);
      setDados(resposta);
      aoMudar(true);
      setFeito(conta ? "Chave trocada." : "Conta conectada.");
      setTrocando(false);
    } catch (causa) {
      const falha = causa as ErroDaApi;
      // O que é da chave fica no campo; o resto, no aviso.
      if (["chave_invalida", "modo_errado", "chave_recusada", "outra_conta"].includes(falha.codigo)) {
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

  async function desconectar() {
    limpar();
    setEnviando(true);
    try {
      await api.barbeiro.desconectarPagamentosOnline(daCasa);
      setDados({ ...dados, conta: null });
      aoMudar(false);
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

  const formulario = (
    <div className={estilos.formulario}>
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

  return (
    <Secao titulo={titulo} descricao={descricao}>
      <div className={estilos.conta}>
        {conta ? (
          <>
            <p className={estilos.linha}>
              {/* Um item só no flex: o texto quebra como texto, e o chip vem depois. */}
              <span>
                <strong>{textos.nome}</strong> · chave terminando em {conta.chaveFinal} · conectada em{" "}
                {dataCurta(conta.conectadaEm)}
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
    </Secao>
  );
}
