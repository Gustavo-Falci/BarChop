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
import { Grupo } from "../../componentes/Grupo";
import { useRequisicao } from "../../api/useRequisicao";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { situacaoDoMembro } from "../../painel/listas";
import { usePainel } from "../../painel/SessaoDoPainel";
import { CampoDeImagem } from "../../componentes/CampoDeImagem";
import { JornadaDoMembro } from "./JornadaDoMembro";
import { ROTULO_DO_PAPEL, SELO_DA_SITUACAO } from "./ListaDaEquipe";
import { ServicosDoMembro } from "./ServicosDoMembro";
import estilos from "./CadastroDeMembro.module.css";

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
  const [atende, setAtende] = useState(true);
  // Enquanto o dono não mexe no "atende", ele acompanha o papel: a
  // recepção nasce sem atender, como na API. Depois do primeiro toque,
  // a escolha é dele.
  const [atendeTocado, setAtendeTocado] = useState(false);
  const [erro, setErro] = useState<Record<string, string | undefined>>({});
  const [aviso, setAviso] = useState<string | undefined>();
  // O que sai do Reenviar e do Desativar mora na Situação, junto dos
  // botões; o aviso dos dados é só do Salvar.
  const [avisoDaSituacao, setAvisoDaSituacao] = useState<string | undefined>();
  const [confirmacao, setConfirmacao] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

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
  }

  if (equipe.erro) {
    return <Aviso>{equipe.erro.mensagem || "Não foi possível carregar a equipe agora."}</Aviso>;
  }
  if (id && !equipe.dados) return <p>Carregando…</p>;
  if (id && !atual) return <Aviso>Membro não encontrado.</Aviso>;

  // Na edição, Salvar e Descartar só aparecem quando os dados diferem do
  // que está gravado (o combinado das telas sem caixas). No convite, o
  // Enviar fica sempre à vista: não há o que comparar.
  const mudou =
    !atual ||
    nome !== atual.nome ||
    telefone !== (atual.telefone ?? "") ||
    papel !== atual.papel ||
    atende !== atual.atende;

  function descartar() {
    if (!atual) return;
    setNome(atual.nome);
    setTelefone(atual.telefone ?? "");
    setPapel(atual.papel);
    setAtende(atual.atende);
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

  async function alternarAtivo() {
    if (!id || !atual) return;
    setAvisoDaSituacao(undefined);
    setConfirmacao(undefined);
    setSalvando(true);
    try {
      await api.barbeiro.atualizarMembro(id, { ativo: !atual.ativo });
      // Desativar a si mesmo (com outro dono ativo) encerra a própria
      // sessão — o recarregar descobre isso e sai.
      if (id === perfil.id) await recarregarPerfil();
      equipe.recarregar();
    } catch (causa) {
      const falha = causa as ErroDaApi;
      setAvisoDaSituacao(
        falha.codigo === "ultimo_dono"
          ? "A barbearia precisa de pelo menos um dono ativo. Promova outra pessoa antes de desativar este."
          : falha.mensagem || "Não foi possível salvar agora."
      );
    } finally {
      setSalvando(false);
    }
  }

  async function reenviar() {
    if (!id || !atual) return;
    setAvisoDaSituacao(undefined);
    setConfirmacao(undefined);
    setSalvando(true);
    try {
      await api.barbeiro.reenviarConvite(id);
      setConfirmacao(`Convite reenviado para ${atual.email}. O código anterior deixou de valer.`);
    } catch (causa) {
      setAvisoDaSituacao((causa as ErroDaApi).mensagem || "Não foi possível reenviar agora.");
    } finally {
      setSalvando(false);
    }
  }

  const selo = atual ? SELO_DA_SITUACAO[situacaoDoMembro(atual)] : undefined;

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

      {/* Sem caixas (pedido do dono): o que se edita à esquerda e largo —
          os dados e a jornada, a mais larga das linhas —; foto, serviços
          e situação à direita. No celular, um embaixo do outro. Cada
          grupo salva sozinho, com o botão colado nele. */}
      {/* No convite não há lateral (foto, serviços e situação pedem o
          membro gravado): uma coluna só, com os campos na largura toda. */}
      <div className={atual ? estilos.corpo : undefined}>
        <div className={estilos.principal}>
          <form
            className={estilos.formulario}
            noValidate
            onSubmit={(evento) => {
              evento.preventDefault();
              void salvar();
            }}
          >
            <Grupo
              titulo="Dados"
              acao={
                mudou ? (
                  <>
                    <Botao type="submit" carregando={salvando}>
                      {id ? "Salvar" : "Enviar convite"}
                    </Botao>
                    {/* Sem `carregando`: desistir funciona mesmo com o envio
                        pendurado. `type="button"` porque está dentro do <form>. */}
                    {id ? (
                      <Botao type="button" variante="contorno" onClick={descartar}>
                        Descartar
                      </Botao>
                    ) : (
                      <Botao
                        type="button"
                        variante="contorno"
                        onClick={() => router.push("/painel/equipe")}
                      >
                        Cancelar
                      </Botao>
                    )}
                  </>
                ) : undefined
              }
            >
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

              <fieldset className={estilos.grupo}>
                <legend className={estilos.rotulo}>Papel</legend>
                {/* As três opções lado a lado: a coluna é larga, e em pilha
                    elas empurravam a jornada pra baixo. */}
                <div className={estilos.papeis}>
                  {PAPEIS.map(({ valor, descricao }) => (
                    <div className={estilos.opcao} key={valor}>
                      {/* A descrição fica fora do <label>: dentro, ela entraria
                          no nome acessível, e "Marca na agenda de todos" do
                          rádio da recepção não deve soar como o nome dele. */}
                      <input
                        type="radio"
                        id={`${idDoGrupo}-${valor}`}
                        name="papel"
                        value={valor}
                        checked={papel === valor}
                        onChange={() => escolherPapel(valor)}
                        aria-describedby={`${idDoGrupo}-${valor}-descricao`}
                      />
                      <label htmlFor={`${idDoGrupo}-${valor}`}>{ROTULO_DO_PAPEL[valor]}</label>
                      <span id={`${idDoGrupo}-${valor}-descricao`} className={estilos.descricao}>
                        {descricao}
                      </span>
                    </div>
                  ))}
                </div>
              </fieldset>

              {/* Logo abaixo do papel, que decide o padrão dele. */}
              <div className={estilos.opcao}>
                <input
                  type="checkbox"
                  id={`${idDoGrupo}-atende`}
                  checked={atende}
                  onChange={(evento) => {
                    setAtende(evento.target.checked);
                    setAtendeTocado(true);
                  }}
                  aria-describedby={`${idDoGrupo}-atende-descricao`}
                />
                <label htmlFor={`${idDoGrupo}-atende`}>Atende clientes</label>
                <span id={`${idDoGrupo}-atende-descricao`} className={estilos.descricao}>
                  Aparece na agenda e pode receber agendamentos.
                </span>
              </div>

              {aviso ? <Aviso>{aviso}</Aviso> : null}
            </Grupo>
          </form>

          {/* Só na edição: o membro precisa existir pra ter semana e
              serviços (nascem com ele, pelo banco). */}
          {atual ? <JornadaDoMembro membroId={atual.id} /> : null}
        </div>

        {atual ? (
          <div className={estilos.lateral}>
            {/* A foto que a página pública mostra na equipe. Salva sozinha,
                como a jornada e os serviços. */}
            <CampoDeImagem
              rotulo="Foto"
              alt={`Foto de ${atual.nome}`}
              urlAtual={atual.fotoUrl}
              formato="retrato"
              enviar={(arquivo) => api.barbeiro.enviarFotoDoMembro(atual.id, arquivo)}
              remover={() => api.barbeiro.removerFotoDoMembro(atual.id)}
            />
            <ServicosDoMembro membroId={atual.id} />

            {/* Por último e longe do Salvar: mudar o estado do membro não é
                editar os dados. A frase diz o efeito antes do botão. */}
            <Grupo titulo="Situação">
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
              {confirmacao ? <Aviso tom="sucesso">{confirmacao}</Aviso> : null}
              <div className={estilos.acaoDoEstado}>
                {atual.convitePendente && atual.ativo ? (
                  <Botao type="button" variante="contorno" carregando={salvando} onClick={reenviar}>
                    Reenviar convite
                  </Botao>
                ) : null}
                <Botao type="button" variante="contorno" carregando={salvando} onClick={alternarAtivo}>
                  {atual.ativo ? "Desativar" : "Reativar"}
                </Botao>
              </div>
            </Grupo>
          </div>
        ) : null}
      </div>
    </div>
  );
}
