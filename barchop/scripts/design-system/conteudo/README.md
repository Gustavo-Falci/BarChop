Agenda online e gestão para barbearias brasileiras: uma página pública onde o cliente agenda sozinho, um painel para o dono, os profissionais e a recepção, e lembrete automático por WhatsApp e e-mail. A promessa é **agenda cheia e menos faltas**.

Use os tokens pelos nomes das custom properties que o app já usa (`--cor-*`, `--raio-*`, `--espaco-*`, `--texto-*`, `--sombra-*`, `--borda-*`): o que for desenhado com eles vira código sem tradução. Nunca escreva um hex ou um px que um token já tem.

## Como usar num desenho

- Carregue, nesta ordem: `tokens.css`, `components/bundle.css` e `components/bundle.js`. O React 18 vem da página. O pacote expõe `window.BarChop`.
- `bundle.css` traz a base que o app dá a toda página: `--fonte-display`/`--fonte-corpo` (ligadas a `--font-display`/`--font-corpo`), os tempos e curvas de movimento, `box-sizing`, links sem sublinhado, o anel de foco.
- Monte os componentes de verdade, por exemplo `BarChop.Botao`, `BarChop.Campo` ou `BarChop.ListaDeHorarios`, em vez de redesenhá-los. Para ver as props de cada um, leia `components/<Nome>/README.md` e `components/index.d.ts`.
- Tema: `data-theme="dark"` no `<html>` troca para o escuro; sem ele, claro.
- Fonte: a Inter vem em `fonts/`. A Clash Grotesk não vem (ver Tipografia). Sem ela os títulos caem em `system-ui`.

## Quem usa e onde

- **Painel** (`painel.barchop.com.br`): ferramenta de trabalho aberta o dia todo, no celular do barbeiro e no computador da recepção. Densa, rápida e sem enfeite.
- **Página pública** (`<slug>.barchop.com.br`): a vitrine de cada barbearia. Segue a **Aparência** que a barbearia escolheu (cor da marca, fonte do texto, raio do botão). O ouro e a Inter são o padrão quando nada foi escolhido.
- **Site** (`barchop.com.br`): marketing, preços, termos.

O celular vem primeiro. Toda tela é conferida a 360px e 390px (claro e escuro) e a 1280px.

## Voz e texto

Português do Brasil, direto e de balcão. Quem lê é o barbeiro entre um corte e outro, ou o cliente agendando pelo WhatsApp.

- **Sem gênero:** "quem vende", "nesta conta", "a equipe". Nunca "o usuário" nem "o(a) profissional".
- **Botão é verbo com objeto:** "Confirmar agendamento", "Concluir e registrar pagamento", "Pedir outro link". Nada de "OK", "Enviar" ou "Salvar alterações" soltos.
- **Criar tem um botão só, no fim:** "Cadastrar". Sem "Cancelar" ao lado (o "← Voltar" do cabeçalho já faz isso).
- **Editar não tem botão no fim:** a `BarraDeMudancas` aparece quando algo muda e mostra antes → depois, com "Salvar" e "Descartar".
- **Estado escrito, não só pintado:** o selo diz "Configurado", "Faltando", "Inativo", "Conectada". A cor reforça o texto, nunca o substitui.
- **Ajuda curta, embaixo do título:** uma frase que diz a consequência. Por exemplo, "Depois de salvar, dá pra pôr a foto." Explicação longa vai numa folha de ajuda (`FolhaDeAjuda`), aberta por uma linha.
- **Vazio orienta:** diz o que falta e oferece a ação ("Nenhum serviço cadastrado ainda." e a ação logo abaixo).
- **Números à brasileira:** `R$ 35,00`, `09:30`, `05/11`. Mês abreviado abaixo de 400px.
- **Títulos de seção em h2, caixa normal:** "Como o cliente paga", não "PAGAMENTO".

## Fundamentos visuais

**Neutro quente com um ouro calmo.** O fundo é papel (`cor-paper`) descendo até `cor-paper-fim` num degradê fixo na janela. Cartões e folhas ficam em `cor-surface`, um branco quente, nunca `#fff`. O ouro (`cor-accent`) é a marca: aparece no botão principal, no item ativo e no bloco da agenda, e em pouco mais que isso. Desde 17/10 ele é menos saturado que o `#FFD900` antigo, que deixava pós-imagem.

- **Texto:** `cor-ink` nos títulos e no corpo, `cor-ink-soft` no apoio forte, `cor-muted` em legendas. Sobre o ouro, sempre `cor-on-accent`. O ouro como texto sobre fundo claro é `cor-accent-text`, porque o ouro puro some no creme.
- **Contorno, não moldura:** fio de 1px (`borda-padrao`) em `cor-line-strong` nos controles e cartões, e `cor-line` nas divisórias de lista. A moldura grossa de antes competia com o conteúdo.
- **Profundidade por sombra difusa:** `sombra-1` no cartão, `sombra-2` no que flutua (menu, janela, folha) e `sombra-botao` no botão, que afunda 2px ao apertar. No escuro a sombra é mais densa, e o cartão ganha um fio claro no topo.
- **Raios:** `raio-md` (14px) em botão e campo, `raio-lg` (20px) em cartão e folha, `raio-pill` em chip, filtro e selo.
- **Espaço em múltiplos de 4:** `espaco-xs` 4 · `sm` 8 · `md` 16 · `lg` 24 · `xl` 32 · `xxl` 48.
- **Estados:** `cor-ok`, `cor-atencao` e `cor-erro`, cada uma com o seu `*-fundo`. O texto usa a cor forte e o selo usa o fundo claro do mesmo estado. Todos os pares passam 4,5:1 nos dois temas (números nas notas de cada token).
- **Foco:** anel de 3px em `cor-foco` com 2px de afastamento, só em `:focus-visible`. É a tinta no claro e o ouro no escuro.
- **Dois temas, o mesmo desenho:** claro (`light`) e escuro (`dark`), trocados por `data-theme` no `<html>`. O escuro é neutro quente, sem o verde-oliva antigo.

## Tipografia

- **Clash Grotesk 700** (`--fonte-display`) em títulos, números e botões. É a voz da marca: larga e firme. O 600 aparece no título menor.
- **Inter 400/600** (`--fonte-corpo`) no corpo, rótulos e listas.
- Títulos com entrelinha 1.15 e `letter-spacing: -0.02em`. Corpo com 1.5.
- Escala: `texto-display` 40 · `texto-xl` 28 (h1 da página) · `texto-lg` 20 (h2) · `texto-md` 16 (corpo, botão) · `texto-sm` 14 (o mais usado: apoio, linhas, rótulos) · `texto-xs` 12 (selo pequeno).

> **Fonte não incluída aqui:** a Clash Grotesk é da Fontshare (licença ITF FFL), que não permite disponibilizá-la em plataforma ou ferramenta de terceiros. Este sistema só cita o nome dela. As prévias caem na fonte de reserva (`system-ui`). Quem tiver a licença baixa a fonte em fontshare.com. A Inter (OFL) está em `fonts/`, com a licença em `licencas/Inter-OFL.txt`.

## Marca

Não há arquivo de logo. A marca é o nome **BarChop** escrito em Clash Grotesk 700, em `cor-ink`, sobre um bloco em `cor-accent` ou ao lado dele, como na imagem de compartilhamento do site. Não desenhar um símbolo.

## Ícones

Não há biblioteca de ícones. Cada ícone é um SVG inline de 24×24, só traço (`stroke-width` 2, pontas redondas), em `currentColor`, sempre ao lado de um rótulo. Ícone sem texto só em ação universal (fechar ×, voltar ←), e mesmo assim com `aria-label`.

## Componentes

**No pacote** (compilados do código real, com prévia): estes 15 são os da página pública e do agendamento.

- **Ações:** `Botao`, `BotaoLink`.
- **Formulário:** `Campo`.
- **Agendar:** `IndicadorDePasso`, `ItemDeServico`, `CartaoDeServico`, `FaixaDeDias`, `Calendario`, `ListaDeHorarios`, `Resumo`, `MarcaDeConfirmado`.
- **Retorno:** `Aviso`, `Carregando`, `Chip`.
- **Marca:** `LogoDaBarbearia`.

**Ainda só no código** (`apps/web/src/componentes`): as peças do painel. Ao desenhar uma tela que precise delas, redesenhe-as seguindo a descrição abaixo e os tokens. As que mais aparecem:

- **CabecalhoDaPagina:** "← voltar", título h1 (`texto-xl`), uma frase de apoio, ação e selo. Pode ter `acaoLargaNoCelular`.
- **Cartao e Secao:** blocos com título h2. No celular a lista vira linhas.
- **CampoDeBusca, CampoDeImagem:** o mesmo esqueleto do `Campo` (rótulo acima, erro embaixo em `cor-erro`).
- **Interruptor:** liga/desliga (`role="switch"`). A caixinha fica só pra escolher itens de uma lista (serviços incluídos, "Ilimitado").
- **Folha, FolhaDeEscolha, FolhaDeAjuda:** sobem de baixo no celular e abrem no meio acima de 720px. A escolha só vale ao tocar "Usar esta".
- **BarraDeMudancas:** presa ao pé quando há mudança, com "Descartar" (`Botao` fantasma) e "Salvar". No celular mostra só a contagem.
- **SeletorEmPilulas, PilulasDeFiltro, Abas, Vazio, Tabela.**

## Movimento

O movimento serve pra orientar, nunca pra enfeitar. Nada passa de 280ms, porque o painel é aberto o dia todo:

- **Durações:** `instante` 100ms, `curta` 160ms, `media` 200ms, `longa` 280ms.
- **Curvas:** de entrada `cubic-bezier(.2,.8,.2,1)` (desacelera ao chegar) e de saída `cubic-bezier(.4,0,1,1)` (acelera ao ir embora).
- **Janela:** entra com fade e escala de 0.98.
- **Seção que abre:** desce 4px.
- **`prefers-reduced-motion`:** corta tudo.

## Não sincronizado

- **Clash Grotesk:** só o nome, sem arquivo (licença).
- **Componentes do painel** (cerca de 23: Interruptor, Folha, FolhaDeEscolha, FolhaDeAjuda, BarraDeMudancas, CabecalhoDaPagina, Cartao, Secao, SecaoNumerada, Tabela, Abas, SeletorEmPilulas, PilulasDeFiltro, Vazio, GradeDeTempo, GradeDoMes, MenuSuspenso…): ficam fora do pacote por enquanto.
- **Movimento** (`apps/web/src/movimento/tokens.ts`): sem família de tokens (o formato não tem uma). Os valores estão em `bundle.css`.
- **Aparência da página pública:** `--botao-fundo`, `--botao-texto`, `--botao-borda`, `--raio-botao`, `--raio-campo`, `--raio-cartao`, `--cartao-*`. Cada barbearia define os seus. Sem eles, os componentes caem nos tokens da casa.
- **`shadowOffset`:** deslocamento da sombra neobrutalista antiga. Está no pacote mas o CSS não emite, então ficou de fora.
- **Fontes da Aparência** (Roboto, Poppins, Montserrat, Open Sans, Lato): opções da página pública de cada barbearia, não da marca BarChop.
