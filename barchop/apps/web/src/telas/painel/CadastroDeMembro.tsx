"use client";

import { useId, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import { normalizarTelefoneObrigatorio, TelefoneInvalido } from "@barchop/formato";
import type { PapelMembro } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Campo } from "../../componentes/Campo";
import { Chip } from "../../componentes/Chip";
import { CamposLadoALado } from "../../componentes/Colunas";
import { BarraDeMudancas } from "../../componentes/BarraDeMudancas";
import { Interruptor } from "../../componentes/Interruptor";
import { useRequisicao } from "../../api/useRequisicao";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { situacaoDoMembro } from "../../painel/listas";
import { usePainel } from "../../painel/SessaoDoPainel";
import { CampoDeImagem } from "../../componentes/CampoDeImagem";
import { JornadaDoMembro } from "./JornadaDoMembro";
import { ROTULO_DO_PAPEL, SELO_DA_SITUACAO } from "./ListaDaEquipe";
import { ServicosDoMembro } from "./ServicosDoMembro";
import estilos from "./CadastroDeMembro.module.css";
import { Abas } from "../../componentes/Abas";
import { Carregando } from "../../componentes/Carregando";
import { SeletorEmPilulas } from "../../componentes/SeletorEmPilulas";

// Os limites ESPELHAM o schema de apps/api/src/routers/equipe.ts — o
// que passar daqui e a API recusar volta como 400 de ajv, numa frase
// que o dono não tem como agir.
const NOME_MIN = 2;
const NOME_MAX = 120;
const EMAIL_MAX = 160;
// O mesmo PADRAO_EMAIL da API.
const PADRAO_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// O que cada papel pode, dito onde se escolhe — é a matriz de
// auth-papeis.test.ts em uma linha cada.
const PAPEIS: { valor: PapelMembro; descricao: string }[] = [
  { valor: "dono", descricao: "Tudo, inclusive equipe, serviços e configurações." },
  { valor: "profissional", descricao: "Atende e vê só a própria agenda." },
  { valor: "recepcao", descricao: "Marca na agenda de todos; não muda a configuração." },
];

// Vazio vira null, que é o que a API aceita pra limpar; o resto passa
// pelo mesmo normalizador da API, que lança TelefoneInvalido.
function telefoneOuNulo(digitado: string): string | null {
  return digitado.trim() ? normalizarTelefoneObrigatorio(digitado) : null;
}

const ABAS_DO_MEMBRO = [
  { id: "dados", rotulo: "Dados" },
  { id: "jornada", rotulo: "Jornada" },
  { id: "servicos", rotulo: "Serviços" },
] as const;

type AbaDoMembro = (typeof ABAS_DO_MEMBRO)[number]["id"];

export function CadastroDeMembro() {
  const { id } = useParams<{ id?: string }>();
  const router = useRouter();
  const api = useApiDoPainel();
  const { perfil, recarregarPerfil } = usePainel();
  const idDoGrupo = useId();

  // Não existe GET /equipe/:id: a lista basta, e traz os inativos.
  const equipe = useRequisicao(() => api.barbeiro.equipe(), []);
  const atual = id ? equipe.dados?.find((m) => m.id === id) : undefined;

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [papel, setPapel] = useState<PapelMembro>("profissional");
  const [aba, setAba] = useState<AbaDoMembro>("dados");
  const [atende, setAtende] = useState(true);
  // Enquanto o dono não mexe no "atende", ele acompanha o papel: a
  // recepção nasce sem atender, como na API. Depois do primeiro toque,
  // a escolha é dele.
  const [atendeTocado, setAtendeTocado] = useState(false);
  // Só o profissional precisa da liberação: o dono vende sem ela, e a
  // recepção não vende (Onda 2, marco 3).
  const [podeVender, setPodeVender] = useState(false);
  const [erro, setErro] = useState<Record<string, string | undefined>>({});
  const [aviso, setAviso] = useState<string | undefined>();
  // O que sai do Reenviar e do Desativar mora na Situação, junto dos
  // botões; o aviso dos dados é só do Salvar.
  const [avisoDaSituacao, setAvisoDaSituacao] = useState<string | undefined>();
  const [confirmacao, setConfirmacao] = useState<string | undefined>();
  // Desativar quem tem assinante nos planos próprios volta 422
  // `assinaturas_ativas`: a frase do efeito, e o segundo botão confirma.
  const [cancelarAssinaturas, setCancelarAssinaturas] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);
  // O Reenviar e o Desativar giram sozinhos: com o Salvar na barra, os
  // dois ficam na tela juntos, e um `salvando` só girava os três.
  const [mexendo, setMexendo] = useState(false);

  // Sincronizado durante a renderização, como em CadastroDeServico (o
  // comentário longo de lá explica por que não `useEffect` nem booleano).
  const [atualSincronizado, setAtualSincronizado] = useState<typeof atual>(undefined);
  if (atual && atual !== atualSincronizado) {
    setAtualSincronizado(atual);
    setNome(atual.nome);
    setTelefone(atual.telefone ?? "");
    setPapel(atual.papel);
    setAtende(atual.atende);
    setAtendeTocado(true);
    setPodeVender(atual.podeVenderPlanos);
  }

  if (equipe.erro) {
    return <Aviso>{equipe.erro.mensagem || "Não foi possível carregar a equipe agora."}</Aviso>;
  }
  if (id && !equipe.dados) return <Carregando />;
  if (id && !atual) return <Aviso>Membro não encontrado.</Aviso>;

  // Na edição, o que difere do gravado, pra barra de mudanças
  // (redesenho dos detalhes, PR 5): os campos de texto pelo nome, as
  // escolhas com o antes e o depois. No convite não há barra: não há o
  // que comparar, e o Enviar fica sempre à vista.
  const ligado = (valor: boolean) => (valor ? "ligado" : "desligado");
  const mudancas: string[] = [];
  if (atual) {
    if (nome !== atual.nome) mudancas.push("Nome");
    if (telefone !== (atual.telefone ?? "")) mudancas.push("Telefone");
    if (papel !== atual.papel) {
      mudancas.push(`Papel: ${ROTULO_DO_PAPEL[atual.papel]} → ${ROTULO_DO_PAPEL[papel]}`);
    }
    if (atende !== atual.atende) {
      mudancas.push(`Atende clientes: ${ligado(atual.atende)} → ${ligado(atende)}`);
    }
    if (podeVender !== atual.podeVenderPlanos) {
      mudancas.push(`Pode vender planos: ${ligado(atual.podeVenderPlanos)} → ${ligado(podeVender)}`);
    }
  }

  function descartar() {
    if (!atual) return;
    setNome(atual.nome);
    setTelefone(atual.telefone ?? "");
    setPapel(atual.papel);
    setAtende(atual.atende);
    setPodeVender(atual.podeVenderPlanos);
    setErro({});
    setAviso(undefined);
  }

  function escolherPapel(proximo: PapelMembro) {
    setPapel(proximo);
    if (!atendeTocado) setAtende(proximo !== "recepcao");
  }

  // Todos os campos sempre, e não até o primeiro que falha: quem errou
  // dois descobre os dois de uma vez.
  function validar(): { telefone: string | null } | null {
    const novos: Record<string, string | undefined> = {};
    const limpo = nome.trim();
    if (limpo.length < NOME_MIN) novos.nome = "Escreva o nome do membro.";
    else if (limpo.length > NOME_MAX) novos.nome = `No máximo ${NOME_MAX} caracteres.`;

    if (!id) {
      const digitado = email.trim();
      if (!PADRAO_EMAIL.test(digitado) || digitado.length > EMAIL_MAX) {
        novos.email = "Use um e-mail como nome@exemplo.com — é por ele que o convite chega.";
      }
    }

    let normalizado: string | null = null;
    try {
      normalizado = telefoneOuNulo(telefone);
    } catch (causa) {
      if (!(causa instanceof TelefoneInvalido)) throw causa;
      novos.telefone = "Informe o DDD e o número, como (11) 99999-8888";
    }

    setErro(novos);
    return Object.values(novos).some(Boolean) ? null : { telefone: normalizado };
  }

  async function salvar() {
    setAviso(undefined);
    setConfirmacao(undefined);
    const validado = validar();
    if (!validado) return;

    setSalvando(true);
    try {
      if (!id) {
        await api.barbeiro.convidarMembro({
          nome: nome.trim(),
          email: email.trim(),
          papel,
          atende,
          ...(validado.telefone ? { telefone: validado.telefone } : {}),
        });
        router.push("/painel/equipe");
        return;
      }

      await api.barbeiro.atualizarMembro(id, {
        nome: nome.trim(),
        telefone: validado.telefone,
        papel,
        atende,
        podeVenderPlanos: podeVender,
      });

      // O próprio dono mudou de papel: a barra e as guardas leem o perfil
      // da sessão, que precisa ser relido. Navega ANTES de reler: com o
      // perfil novo primeiro, o SoDoDono desta rota trocaria a tela pelo
      // aviso de "só o dono" — um alerta logo depois de salvar certo. O
      // recarregar vem do layout, que não desmonta na navegação.
      if (id === perfil.id) {
        router.push(papel === "dono" ? "/painel/equipe" : "/painel");
        await recarregarPerfil();
        return;
      }
      router.push("/painel/equipe");
    } catch (causa) {
      const falha = causa as ErroDaApi;
      if (falha.codigo === "email_em_uso") {
        setErro({ email: "Esse e-mail já tem conta no BarChop." });
      } else if (falha.codigo === "ultimo_dono") {
        setAviso(
          "A barbearia precisa de pelo menos um dono ativo. Promova outra pessoa antes de sair desse papel."
        );
      } else {
        setAviso(falha.mensagem || "Não foi possível salvar agora.");
      }
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(comCancelamento = false) {
    if (!id || !atual) return;
    setAvisoDaSituacao(undefined);
    setConfirmacao(undefined);
    setCancelarAssinaturas(undefined);
    setMexendo(true);
    try {
      await api.barbeiro.atualizarMembro(
        id,
        comCancelamento ? { ativo: false, cancelarAssinaturas: true } : { ativo: !atual.ativo }
      );
      // Desativar a si mesmo (com outro dono ativo) encerra a própria
      // sessão — o recarregar descobre isso e sai.
      if (id === perfil.id) await recarregarPerfil();
      equipe.recarregar();
    } catch (causa) {
      const falha = causa as ErroDaApi;
      if (falha.codigo === "assinaturas_ativas") {
        // A contagem vem na frase da API ("tem 3 assinantes nos planos
        // que vende"); sem ela, a frase fica sem o número.
        const quantas = /(\d+) assinantes?/.exec(falha.mensagem)?.[1];
        setCancelarAssinaturas(
          quantas === "1"
            ? `${atual.nome} tem 1 assinante nos planos próprios. Desativar cancela a assinatura: o cliente deixa de usar o plano.`
            : `${atual.nome} tem ${quantas ?? "clientes"} assinantes nos planos próprios. Desativar cancela as assinaturas: os clientes deixam de usar os planos.`
        );
        return;
      }
      setAvisoDaSituacao(
        falha.codigo === "ultimo_dono"
          ? "A barbearia precisa de pelo menos um dono ativo. Promova outra pessoa antes de desativar este."
          : falha.mensagem || "Não foi possível salvar agora."
      );
    } finally {
      setMexendo(false);
    }
  }

  async function reenviar() {
    if (!id || !atual) return;
    setAvisoDaSituacao(undefined);
    setConfirmacao(undefined);
    setMexendo(true);
    try {
      await api.barbeiro.reenviarConvite(id);
      setConfirmacao(`Convite reenviado para ${atual.email}. O código anterior deixou de valer.`);
    } catch (causa) {
      setAvisoDaSituacao((causa as ErroDaApi).mensagem || "Não foi possível reenviar agora.");
    } finally {
      setMexendo(false);
    }
  }

  const selo = atual ? SELO_DA_SITUACAO[situacaoDoMembro(atual)] : undefined;

  // Os dados do membro: o formulário do convite e a aba Dados da edição.
  // Seções com título e o conteúdo num cartão (redesenho dos detalhes,
  // PR 5), como o detalhe do cliente.
  const formulario = (
    <form
      className={estilos.formulario}
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        void salvar();
      }}
    >
      <section className={estilos.secao} aria-labelledby={`${idDoGrupo}-dados`}>
        <h2 id={`${idDoGrupo}-dados`} className={estilos.titulo}>
          Dados
        </h2>
        <div className={`${estilos.cartao} ${estilos.recheio}`}>
          {/* Nome, e-mail e telefone numa linha: as telas usam a largura (pedido do dono). */}
          <CamposLadoALado>
            <Campo
              rotulo="Nome"
              name="nome"
              autoComplete="off"
              maxLength={NOME_MAX}
              valor={nome}
              onChange={(proximo) => {
                setNome(proximo);
                setErro((anterior) => ({ ...anterior, nome: undefined }));
              }}
              erro={erro.nome}
            />

            {atual ? null : (
              <Campo
                rotulo="E-mail"
                type="email"
                name="email"
                autoComplete="off"
                maxLength={EMAIL_MAX}
                valor={email}
                onChange={(proximo) => {
                  setEmail(proximo);
                  setErro((anterior) => ({ ...anterior, email: undefined }));
                }}
                erro={erro.email}
              />
            )}

            <Campo
              rotulo="Telefone (opcional)"
              formato="telefone"
              name="telefone"
              valor={telefone}
              onChange={(proximo) => {
                setTelefone(proximo);
                setErro((anterior) => ({ ...anterior, telefone: undefined }));
              }}
              erro={erro.telefone}
            />
          </CamposLadoALado>

          {/* Na edição o e-mail é só leitura, embaixo dos campos: é a
              chave do login, e a API não deixa trocá-lo por aqui. Sem
              <label>, porque não é campo. */}
          {atual ? (
            <p className={estilos.email}>
              <span className={estilos.rotulo}>E-mail de acesso</span>
              <span>{atual.email}</span>
            </p>
          ) : null}

          {/* O papel num segmentado, com a descrição só da escolhida
              embaixo (análise de 17/10): as três descrições soltas,
              com o rádio nativo, eram texto demais pra uma escolha. */}
          <SeletorEmPilulas
            nome={`${idDoGrupo}-papel`}
            legenda="Papel"
            preencher
            opcoes={PAPEIS.map(({ valor }) => ({ valor, rotulo: ROTULO_DO_PAPEL[valor] }))}
            valor={papel}
            aoTrocar={escolherPapel}
            efeito={PAPEIS.find((opcao) => opcao.valor === papel)?.descricao}
          />
        </div>
      </section>

      {/* O que liga e desliga no dia a dia, no Interruptor (decisão 1 do
          canvas), logo abaixo do papel, que decide o padrão do "atende". */}
      <section className={estilos.secao} aria-labelledby={`${idDoGrupo}-dia`}>
        <h2 id={`${idDoGrupo}-dia`} className={estilos.titulo}>
          No dia a dia
        </h2>
        <div className={estilos.cartao}>
          <div className={estilos.linha}>
            <span className={estilos.texto}>
              <span className={estilos.nome} aria-hidden="true">
                Atende clientes
              </span>
              <span id={`${idDoGrupo}-atende-descricao`} className={estilos.descricao}>
                Aparece na agenda e pode receber agendamentos.
              </span>
            </span>
            <Interruptor
              rotulo="Atende clientes"
              rotuloOculto
              ligado={atende}
              aoTrocar={(proximo) => {
                setAtende(proximo);
                setAtendeTocado(true);
              }}
              descritoPor={`${idDoGrupo}-atende-descricao`}
            />
          </div>

          {/* A liberação dos planos, só na edição do profissional. */}
          {atual && papel === "profissional" ? (
            <div className={estilos.linha}>
              <span className={estilos.texto}>
                <span className={estilos.nome} aria-hidden="true">
                  Pode vender planos
                </span>
                <span id={`${idDoGrupo}-vende-descricao`} className={estilos.descricao}>
                  Cria planos próprios: valem só com quem vende, e a mensalidade fica com quem vende.
                </span>
              </span>
              <Interruptor
                rotulo="Pode vender planos"
                rotuloOculto
                ligado={podeVender}
                aoTrocar={setPodeVender}
                descritoPor={`${idDoGrupo}-vende-descricao`}
              />
            </div>
          ) : null}
        </div>
      </section>

      {/* O convite: um botão só no fim (decisão 2 do canvas). Desistir é o
          "← Equipe" do topo. Na edição, quem salva é a barra. */}
      {atual ? null : (
        <>
          {aviso ? <Aviso>{aviso}</Aviso> : null}
          <div className={estilos.acoes}>
            <Botao type="submit" carregando={salvando}>
              Enviar convite
            </Botao>
          </div>
        </>
      )}
    </form>
  );

  return (
    <div className={estilos.pagina}>
      {/* O desenho do detalhe do cliente: o caminho de volta, quem é e a
          situação no topo; o resumo do que está gravado embaixo do nome. */}
      <CabecalhoDaPagina
        voltar={{ href: "/painel/equipe", rotulo: "Equipe" }}
        titulo={atual ? atual.nome : "Convidar membro"}
        selo={
          selo ? (
            <Chip tom={selo.tom} tamanho="pequeno">
              {selo.rotulo}
            </Chip>
          ) : undefined
        }
        apoio={
          atual
            ? `${ROTULO_DO_PAPEL[atual.papel]} · ${atual.atende ? "atende clientes" : "não atende"}`
            : "O convite chega por e-mail, com um código que vale 7 dias. A pessoa define a própria senha e já entra no painel."
        }
      />

      {/* Na edição, abas (análise de 17/10): a tela do membro era a mais
          longa do painel — dados, papel, jornada, serviços e situação
          empilhados. Dados leva a foto e a situação; jornada e serviços
          ganham a própria aba, cada uma com o seu salvar. No convite não
          há abas: só os dados existem antes de a pessoa entrar. */}
      {atual ? (
        <Abas
          rotulo="Membro da equipe"
          abas={ABAS_DO_MEMBRO}
          atual={aba}
          aoTrocar={setAba}
          paineis={{
            dados: (
              <div className={estilos.corpo}>
                <div className={estilos.principal}>{formulario}</div>
                <div className={estilos.lateral}>
                  {/* A foto que a página pública mostra na equipe. Salva
                      sozinha, como a jornada e os serviços. Sem região
                      nomeada: o rótulo "Foto" é do campo, e o título só
                      o mostra. */}
                  <div className={estilos.secao}>
                    <h2 className={estilos.titulo} aria-hidden="true">
                      Foto
                    </h2>
                    <div className={`${estilos.cartao} ${estilos.recheio}`}>
                      <CampoDeImagem
                        rotulo="Foto"
                        rotuloOculto
                        alt={`Foto de ${atual.nome}`}
                        urlAtual={atual.fotoUrl}
                        formato="retrato"
                        enviar={(arquivo) => api.barbeiro.enviarFotoDoMembro(atual.id, arquivo)}
                        remover={() => api.barbeiro.removerFotoDoMembro(atual.id)}
                      />
                    </div>
                  </div>

                  {/* Por último e longe do Salvar: mudar o estado do
                      membro não é editar os dados. A frase diz o efeito
                      antes do botão. */}
                  <section className={estilos.secao} aria-labelledby={`${idDoGrupo}-situacao`}>
                    <h2 id={`${idDoGrupo}-situacao`} className={estilos.titulo}>
                      Situação
                    </h2>
                    <div className={`${estilos.cartao} ${estilos.recheio}`}>
                      {atual.convitePendente && atual.ativo ? (
                        <p className={estilos.efeito}>
                          Ainda não aceitou o convite. Reenviar manda um código novo, e o anterior
                          deixa de valer.
                        </p>
                      ) : null}
                      <p className={estilos.efeito}>
                        {atual.ativo
                          ? "Desativar: para de receber agendamentos e perde o acesso ao painel. Dá pra reativar depois."
                          : "Não recebe agendamentos nem entra no painel. Reativar devolve os dois."}
                      </p>
                      {avisoDaSituacao ? <Aviso>{avisoDaSituacao}</Aviso> : null}
                      {cancelarAssinaturas ? (
                        <Aviso tom="atencao">
                          <p className={estilos.efeito}>{cancelarAssinaturas}</p>
                          <div className={estilos.acaoDoEstado}>
                            <Botao
                              type="button"
                              variante="contorno"
                              carregando={mexendo}
                              onClick={() => alternarAtivo(true)}
                            >
                              Desativar e cancelar as assinaturas
                            </Botao>
                            <Botao
                              type="button"
                              variante="contorno"
                              onClick={() => setCancelarAssinaturas(undefined)}
                            >
                              Manter ativo
                            </Botao>
                          </div>
                        </Aviso>
                      ) : null}
                      {confirmacao ? <Aviso tom="sucesso">{confirmacao}</Aviso> : null}
                      <div className={estilos.acaoDoEstado}>
                        {atual.convitePendente && atual.ativo ? (
                          <Botao type="button" variante="contorno" carregando={mexendo} onClick={reenviar}>
                            Reenviar convite
                          </Botao>
                        ) : null}
                        <Botao
                          type="button"
                          variante="contorno"
                          carregando={mexendo}
                          onClick={() => alternarAtivo()}
                        >
                          {atual.ativo ? "Desativar" : "Reativar"}
                        </Botao>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            ),
            jornada: <JornadaDoMembro membroId={atual.id} />,
            servicos: <ServicosDoMembro membroId={atual.id} />,
          }}
        />
      ) : (
        formulario
      )}

      {/* Um Salvar só pros dados, na barra do pé (decisão 2 do canvas),
          filha direta da página pra ficar presa no pé. Só na aba Dados:
          a jornada e os serviços salvam por conta própria. O que mudou e
          não foi salvo continua guardado ao trocar de aba. */}
      {atual && aba === "dados" ? (
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
