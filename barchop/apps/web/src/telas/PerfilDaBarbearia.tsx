"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Botao } from "../componentes/Botao";
import { LogoDaBarbearia } from "../componentes/LogoDaBarbearia";
import { formatarPreco } from "../componentes/ItemDeServico";
import { agruparPorCategoria } from "../fluxo/categorias";
import { agruparSemana, situacaoAgora } from "../fluxo/funcionamento";
import { rotuloDoProximoHorario } from "../formato/datas";
import { iniciais } from "../formato/iniciais";
import { rotuloDaComodidade, rotuloDoPagamento } from "../formato/pagina";
import { caminhoDoPasso } from "../fluxo/passos";
import { LinkDaConta } from "../fluxo/LinkDaConta";
import { IconeCamera, IconeConversa, IconeMapa } from "../painel/icones";
import estilos from "./PerfilDaBarbearia.module.css";
import { useNoHost } from "../tenant/ProvedorDoHost";

// `agora` é prop com padrão, como nas telas do fluxo: é o que deixa o
// teste fixar "terça às dez" pra conferir o "aberto agora".
export function PerfilDaBarbearia({ agora = new Date() }: { agora?: Date }) {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const noHost = useNoHost();
  const api = useApi();

  const { dados, carregando, erro } = useRequisicao(
    () => api.publico.perfilDaBarbearia(slug),
    [slug]
  );

  // Segunda requisição, e não um campo a mais no perfil: a lista de
  // serviços já tem rota pública própria (que filtra os inativos), e o
  // primeiro passo do agendamento usa a mesma. Como as duas chamadas
  // partem do mesmo render, elas correm em paralelo — não há cascata.
  const servicos = useRequisicao(() => api.publico.servicos(slug), [slug]);

  // Os próximos horários de cada serviço, em paralelo com as outras duas.
  // Se falhar, a página continua sem eles: são atalho, não conteúdo.
  const proximos = useRequisicao(() => api.publico.proximosHorarios(slug), [slug]);
  const proximosDe = new Map(
    (proximos.dados ?? []).map((item) => [item.servicoId, item.horarios])
  );

  if (carregando) return <main className={estilos.pagina}>Carregando…</main>;

  // 404 é o caso comum aqui, não excepcional: o link circula por
  // WhatsApp e o slug pode ter mudado.
  if (erro) {
    return (
      <main className={estilos.pagina}>
        <h1>
          {erro.codigo === "nao_encontrado"
            ? "Não encontramos essa barbearia"
            : "Não foi possível abrir esta página"}
        </h1>
      </main>
    );
  }

  const horarios = dados?.horarios ?? [];
  // A seção de horário só existe se algum dia abre: uma semana inteira
  // de "Fechado" numa barbearia recém-criada leria como fechada de vez.
  const temDiaAberto = horarios.some((dia) => !dia.fechado);
  const situacao = situacaoAgora(horarios, agora);
  const temLogo = Boolean(dados?.logoUrl && dados.logoFormato);

  // O nome de cada serviço ativo, pra dizer o que cada profissional faz.
  // Serviço inativo não está na lista pública, e por isso some daqui
  // também — a equipe não anuncia o que a barbearia não oferece.
  const nomeDoServico = new Map((servicos.dados ?? []).map((s) => [s.id, s.nome]));

  return (
    <>
      {/* A fachada: de quem é, se está aberto e onde fica, antes de
          qualquer lista. Fora do <main>, como cabeçalho da página — é o
          que a faz valer como banner. Sem capa, que é o caso de toda
          barbearia recém-criada, o monograma ocupa o lugar dela: a
          página não abre com um buraco no topo. */}
      {dados ? (
        <header className={estilos.fachada}>
          <div className={`${estilos.vitrine} ${dados.capaUrl ? "" : estilos.semCapa}`}>
            {/* <img> simples: vem do bucket, e o otimizador do Next
                exigiria liberar o domínio dele. */}
            {dados.capaUrl ? (
              <img className={estilos.capa} src={dados.capaUrl} alt={`Capa da ${dados.nome}`} />
            ) : (
              // Com logo, a trama fica sem as iniciais: a marca já está
              // logo abaixo, e as duas juntas diriam o mesmo duas vezes.
              <div className={estilos.monograma} aria-hidden="true">
                {temLogo ? null : <span>{iniciais(dados.nome)}</span>}
              </div>
            )}
          </div>
          <div className={estilos.identidade} data-com-logo={temLogo ? "" : undefined}>
            {/* A logo encaixada na borda de baixo da capa, como foto de
                perfil — com moldura (redonda ou quadrada), metade sobre a
                capa; sem moldura, inteira aqui embaixo, que uma logo solta
                sobre a foto brigaria com ela. Decorativa: o nome é o <h1>. */}
            {temLogo ? (
              <LogoDaBarbearia
                url={dados.logoUrl!}
                formato={dados.logoFormato!}
                nome={dados.nome}
                decorativa
                className={estilos.logo}
              />
            ) : null}
            {/* Aqui a barra da barbearia não aparece (o nome já é o
                título), então o caminho até a conta mora na fachada. */}
            <nav className={estilos.conta} aria-label="Sua conta">
              <LinkDaConta slug={slug} />
            </nav>
            <h1 className={estilos.nome}>{dados.nome}</h1>
            {/* Situação e endereço numa linha só de informação, logo sob o
                nome: o "está aberto?" e o "onde fica?" são lidos juntos.
                O estado sai do texto de situacaoAgora, que é a fonte única:
                "Aberto agora…" ou "Fechado agora…". O atributo é só o que
                o CSS lê pra pintar o selo. */}
            {situacao || dados.endereco ? (
              <div className={estilos.meta}>
                {situacao ? (
                  <p
                    className={estilos.selo}
                    data-estado={situacao.startsWith("Aberto") ? "aberto" : "fechado"}
                  >
                    {situacao}
                  </p>
                ) : null}
                {dados.endereco ? <p className={estilos.endereco}>{dados.endereco}</p> : null}
              </div>
            ) : null}
            {/* Mapa e contatos juntos — no desktop, à direita, na linha da
                situação; no celular, logo abaixo dela. É onde quem chegou
                pelo link procura "onde fica" e "como falo". Links
                montados aqui, de dados que a API validou — o mapa é uma
                busca pelo endereço, o WhatsApp é o telefone normalizado,
                o Instagram é só o @ (nunca uma URL digitada). Outra aba,
                sem referrer. */}
            {dados.endereco || dados.whatsapp || dados.instagram ? (
              <ul className={estilos.atalhos} aria-label="Como chegar e falar com a barbearia">
                {dados.endereco ? (
                  <li>
                    <a
                      className={estilos.atalho}
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dados.endereco)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <IconeMapa width={16} height={16} />
                      Ver no mapa
                    </a>
                  </li>
                ) : null}
                {dados.whatsapp ? (
                  <li>
                    <a
                      className={estilos.atalho}
                      href={`https://wa.me/55${dados.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <IconeConversa width={16} height={16} />
                      WhatsApp
                    </a>
                  </li>
                ) : null}
                {dados.instagram ? (
                  <li>
                    <a
                      className={estilos.atalho}
                      href={`https://instagram.com/${dados.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <IconeCamera width={16} height={16} />@{dados.instagram}
                    </a>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        </header>
      ) : null}

      <main className={`${estilos.pagina} ${estilos.duasColunas}`}>
        {/* Duas colunas a partir de 900px: o que a barbearia oferece à
            esquerda, quando abre e o botão de agendar à direita. No
            celular os dois wrappers somem (`display: contents`) e os
            filhos voltam a ser itens do grid da página — é o que mantém
            o "Agendar agora" grudado no rodapé da tela, e não só no
            rodapé da coluna. */}
        <div className={estilos.principal}>
          {/* Texto puro: ele é filho de um elemento React, que escapa por
            padrão. O `white-space: pre-line` do CSS é o que preserva as
            quebras de linha que o barbeiro digitou — a alternativa seria
            interpretar HTML, e aí este campo, que qualquer barbeiro
            escreve, viraria XSS na página mais pública do produto. */}
          {dados?.sobre ? <p className={estilos.sobre}>{dados.sobre}</p> : null}

          {/* As seções aparecem só quando têm o que dizer. Uma barbearia
            recém-criada não tem serviço nem horário, e "Serviços
            (nenhum)" na própria página pública é pior do que não ter a
            seção: quem chegou pelo link leria como barbearia fechada, e
            quem acabou de criar a conta leria como produto quebrado. O
            lugar de cobrar o cadastro é o painel, não a vitrine. */}
          {servicos.dados && servicos.dados.length > 0 ? (
            <section className={estilos.secao}>
              <h2 className={estilos.titulo}>Serviços</h2>
              {/* Por categoria quando o dono as cadastrou; sem nenhuma, a
                  lista é uma só, sem subtítulo. */}
              {agruparPorCategoria(servicos.dados).map((grupo) => {
                const lista = (
                  <ul className={estilos.servicos}>
                    {grupo.servicos.map((servico) => {
                      const horariosDoServico = proximosDe.get(servico.id) ?? [];
                      return (
                        <li key={servico.id} className={estilos.cartaoDeServico}>
                          {/* Link pro agendamento com este serviço já
                            marcado — no passo de serviços, e não direto no
                            de data: corte e barba juntos é combinação
                            comum, e quem tocou no corte ainda pode somar a
                            barba. Um <a> de verdade, que abre em outra aba
                            se a pessoa quiser. */}
                          <Link
                            className={estilos.servico}
                            href={noHost(caminhoDoPasso(slug, "servicos", {
                              servicoIds: [servico.id],
                            }))}
                          >
                            <span className={estilos.servicoNome}>
                              {servico.nome}
                              <span className={estilos.duracao}>
                                {servico.duracaoMinutos} min
                              </span>
                            </span>
                            <span className={estilos.valor}>
                              {formatarPreco(servico.preco)}
                            </span>
                            <span className={estilos.seta} aria-hidden="true">
                              →
                            </span>
                          </Link>
                          {/* Os próximos horários, fora do link do serviço
                            (link dentro de link não existe em HTML). Cada
                            um leva direto à confirmação, com "qualquer
                            um": a lista é a união de quem faz o serviço, e
                            a confirmação já trata o horário que expirou no
                            meio do caminho. */}
                          {horariosDoServico.length > 0 ? (
                            <div className={estilos.proximosLinha}>
                              <span className={estilos.proximosRotulo}>Próximos:</span>
                              <ul
                                className={estilos.proximos}
                                aria-label={`Próximos horários de ${servico.nome}`}
                              >
                                {horariosDoServico.map((horario) => (
                                  <li key={`${horario.data} ${horario.horaInicio}`}>
                                    <Link
                                      className={estilos.proximo}
                                      href={noHost(caminhoDoPasso(slug, "confirmar", {
                                        servicoIds: [servico.id],
                                        data: horario.data,
                                        hora: horario.horaInicio,
                                      }))}
                                    >
                                      {rotuloDoProximoHorario(horario.data, horario.horaInicio, agora)}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                );
                return grupo.titulo ? (
                  <section key={grupo.titulo} className={estilos.grupo} aria-label={grupo.titulo}>
                    <h3 className={estilos.subtitulo}>{grupo.titulo}</h3>
                    {lista}
                  </section>
                ) : (
                  <div key="todos">{lista}</div>
                );
              })}
            </section>
          ) : null}
        </div>

        <div className={estilos.lateral}>
          {temDiaAberto ? (
            <section className={estilos.secao}>
              <h2 className={estilos.titulo}>Horário de funcionamento</h2>
              <ul className={estilos.lista}>
                {agruparSemana(horarios, agora).map((linha) => (
                  <li
                    key={linha.dias}
                    className={`${estilos.linha} ${linha.hoje ? estilos.hoje : ""}`}
                    aria-current={linha.hoje ? "date" : undefined}
                  >
                    <span>{linha.dias}</span>
                    <span className={estilos.valor}>{linha.horario}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Quem atende, logo abaixo do horário (pedido do dono): quando
              abre e com quem, juntos na lateral. Com foto quando o dono pôs
              uma; sem foto, as iniciais no lugar (decorativas: o nome vem
              ao lado). */}
          {dados && dados.barbeiros.length > 0 ? (
            <section className={estilos.secao} aria-label="Equipe">
              <h2 className={estilos.titulo}>Equipe</h2>
              <ul className={estilos.equipe}>
                {dados.barbeiros.map((barbeiro) => {
                  const faz = barbeiro.servicoIds
                    .map((id) => nomeDoServico.get(id))
                    .filter((nome): nome is string => Boolean(nome));
                  return (
                    <li key={barbeiro.id} className={estilos.membro}>
                      {barbeiro.fotoUrl ? (
                        <img className={estilos.foto} src={barbeiro.fotoUrl} alt={barbeiro.nome} />
                      ) : (
                        <span className={estilos.foto} aria-hidden="true">
                          {iniciais(barbeiro.nome)}
                        </span>
                      )}
                      <span className={estilos.membroTexto}>
                        <span className={estilos.membroNome}>{barbeiro.nome}</span>
                        {faz.length > 0 ? (
                          <span className={estilos.membroFaz}>{faz.join(" · ")}</span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* Só quando há o que dizer, pelo mesmo motivo de Serviços. */}
          {dados && dados.comodidades.length > 0 ? (
            <section className={estilos.secao} aria-label="Comodidades">
              <h2 className={estilos.titulo}>Comodidades</h2>
              <ul className={estilos.etiquetas}>
                {dados.comodidades.map((comodidade) => (
                  <li key={comodidade}>{rotuloDaComodidade(comodidade)}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {dados && dados.formasDePagamento.length > 0 ? (
            <section className={estilos.secao} aria-label="Formas de pagamento">
              <h2 className={estilos.titulo}>Formas de pagamento</h2>
              <ul className={estilos.etiquetas}>
                {dados.formasDePagamento.map((forma) => (
                  <li key={forma}>{rotuloDoPagamento(forma)}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Por último no DOM e grudado no rodapé da tela: `sticky` com
            `bottom: 0` só gruda enquanto o lugar natural do elemento está
            abaixo da janela, então ele precisa vir depois de tudo. Assim o
            "Agendar" fica à vista desde a primeira tela e não some quando
            a pessoa rola pra ler serviços e horários — e no fim da página
            assenta no próprio lugar. No desktop o CSS o sobe pro topo da
            coluna lateral com `order`, sem mudar o DOM. */}
          <div className={estilos.acao}>
            <Botao
              onClick={() =>
                router.push(noHost(caminhoDoPasso(slug, "servicos", { servicoIds: [] })))
              }
            >
              Agendar agora
            </Botao>
          </div>
        </div>
      </main>
    </>
  );
}
