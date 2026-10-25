"use client";

import Link from "next/link";
import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { AssinaturaDoPainel, PagamentosOnline as Pagamentos } from "@barchop/types";
import { Aviso } from "../../../componentes/Aviso";
import { Botao } from "../../../componentes/Botao";
import { CabecalhoDaPagina } from "../../../componentes/CabecalhoDaPagina";
import { Campo } from "../../../componentes/Campo";
import { Carregando } from "../../../componentes/Carregando";
import { Chip } from "../../../componentes/Chip";
import { Secao } from "../../../componentes/Secao";
import { useRequisicao } from "../../../api/useRequisicao";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { usePainel } from "../../../painel/SessaoDoPainel";
import estilos from "./PagamentosOnline.module.css";

// Pagamentos online (Onda 2, marco 3, PR 11 do plano
// planos-de-assinatura): a conta do Asaas de quem vende, onde cai a
// mensalidade de quem assina pela página. Cada um conecta a sua; a da
// casa recebe os planos da casa e é do dono. A chave nunca volta da
// API: a tela mostra só os 4 últimos caracteres.
//
// Ver e desconectar não pedem o Completo nem a liberação pra vender: as
// assinaturas que existem seguem, e quem vendeu precisa enxergar e soltar
// a conta. Conectar pede os dois (o `planos()` diz se pode).

const VOLTAR = { href: "/painel/configuracoes", rotulo: "Configurações" };
const TITULO = "Pagamentos online";
const APOIO = "A conta do Asaas onde cai a mensalidade de quem assina pela sua página.";

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// O que a API respondeu, numa frase pra quem vende. O 503 fala da
// configuração do servidor (URL_DA_API), que não é com o dono.
function mensagemDoErro(erro: ErroDaApi): string {
  switch (erro.codigo) {
    case "pagamentos_online_sem_endereco":
      return "Os pagamentos online ainda não estão ligados no BarChop. Fale com o suporte.";
    case "recurso_do_plano":
      return "Conectar uma conta é do plano Completo.";
    default:
      return erro.mensagem || "Não foi possível falar com o Asaas agora.";
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

  const foraDoCompleto = planos.erro?.codigo === "recurso_do_plano";
  const erro = minha.erro ?? daCasa.erro ?? (foraDoCompleto ? undefined : planos.erro);
  if (erro) return <Aviso>{erro.mensagem || "Não foi possível carregar as contas agora."}</Aviso>;
  if (!minha.dados || (ehDono && !daCasa.dados) || (!planos.dados && !foraDoCompleto)) return <Carregando />;

  // O dono que não atende não vende plano próprio: a conta dele só
  // aparece se já existir.
  const vendeOProprio = planos.dados?.podeCriarProprio ?? false;
  const mostraMinha = vendeOProprio || minha.dados.conta !== null;

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina titulo={TITULO} apoio={APOIO} voltar={VOLTAR} />
      {foraDoCompleto ? (
        <Aviso>
          Conectar uma conta é do plano Completo. As assinaturas que existem seguem cobrando na conta conectada.{" "}
          <Link href="/painel/faturas">Ver os planos</Link>
        </Aviso>
      ) : null}
      <div className={estilos.contas}>
        {ehDono && daCasa.dados ? (
          <ContaOnline
            inicial={daCasa.dados}
            titulo="Conta da casa"
            descricao="Recebe as mensalidades dos planos da casa."
            podeConectar={!foraDoCompleto}
          />
        ) : null}
        {mostraMinha ? (
          <ContaOnline
            inicial={minha.dados}
            titulo="Sua conta"
            descricao="Recebe as mensalidades dos planos que você vende."
            podeConectar={!foraDoCompleto && vendeOProprio}
          />
        ) : null}
      </div>
      {!ehDono && !mostraMinha ? (
        <p>
          Quem vende planos conecta aqui a própria conta do Asaas. O dono libera a venda de planos na Equipe.
        </p>
      ) : null}
    </div>
  );
}

function ContaOnline({
  inicial,
  titulo,
  descricao,
  podeConectar,
}: {
  inicial: Pagamentos;
  titulo: string;
  descricao: string;
  podeConectar: boolean;
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
  const prefixo = modoAceito === "teste" ? "$aact_hmlg_" : "$aact_prod_";
  const apoioDaChave =
    modoAceito === "teste"
      ? `Use a chave do sandbox do Asaas (começa com ${prefixo}): aqui os pagamentos são de teste.`
      : `Gere a chave de API no Asaas, no menu Integrações, e cole aqui. Ela começa com ${prefixo}.`;

  function limpar() {
    setAviso(undefined);
    setErroDaChave(undefined);
    setFeito(undefined);
    setQuemTrava([]);
  }

  async function conectar() {
    limpar();
    if (chave.trim() === "") {
      setErroDaChave("Cole a chave de API do Asaas.");
      return;
    }
    setEnviando(true);
    try {
      const resposta = await api.barbeiro.conectarPagamentosOnline(daCasa, chave);
      setDados(resposta);
      setFeito(conta ? "Chave trocada." : "Conta conectada.");
      setTrocando(false);
    } catch (causa) {
      const falha = causa as ErroDaApi;
      // O que é da chave fica no campo; o resto, no aviso.
      if (["chave_invalida", "modo_errado", "chave_recusada", "outra_conta"].includes(falha.codigo)) {
        setErroDaChave(falha.mensagem);
      } else {
        setAviso(mensagemDoErro(falha));
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
      setFeito("Conta desconectada.");
    } catch (causa) {
      const falha = causa as ErroDaApi;
      setAviso(mensagemDoErro(falha));
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
        rotulo="Chave de API do Asaas"
        type="password"
        autoComplete="off"
        spellCheck={false}
        apoio={conta ? "Só vale uma chave da mesma conta do Asaas. Pra mudar de conta, desconecte antes." : apoioDaChave}
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
                <strong>Asaas</strong> · chave terminando em {conta.chaveFinal} · conectada em{" "}
                {dataCurta(conta.conectadaEm)}
              </span>
              {conta.modo === "teste" ? (
                <Chip tom="atencao" tamanho="pequeno">
                  Sandbox
                </Chip>
              ) : null}
            </p>
            {trocando ? (
              formulario
            ) : confirmando ? (
              <div className={estilos.confirmacao}>
                <p>
                  O Asaas para de avisar o BarChop dos pagamentos desta conta, e os planos que recebem por ela saem da
                  venda online.
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
