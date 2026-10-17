# Plan: Menos amarelo, menos moldura, mais respiro

**Fonte**: análise de UI/UX do dono no claude.ai/design (`Analise UI-UX BarChop.dc.html`, 17/10), feita a partir dos prints do painel e do código de `apps/web`.
**Complexidade**: Large (6 PRs, sem migração)
**Status**: PRs 1 a 3 abertos e empilhados: #162 (`paleta-e-base`) → #163 (`shell-e-hoje`) → #164 (`agenda-e-novo`). Próximo: PR 4, depois do OK do dono no #164.

## Summary
O painel fica mais calmo de olhar o dia inteiro:
- a paleta escura perde o verde-oliva e ganha um neutro quente;
- o amarelo fica num ouro mais calmo, usado só na ação principal, no progresso e no selecionado;
- a moldura clara de 2px com sombra deslocada vira fio de 1px com sombra difusa;
- menus, janelas, acordeões e trocas de vista ganham movimento curto (até 250ms).

Depois da base, cada grupo de telas segue o "depois" da análise:
- menos texto repetido;
- controle segmentado no lugar das fileiras de pílulas amarelas;
- um Salvar só, que aparece quando algo muda;
- barra inferior no celular.

## Decisões do dono (17/10)
- **A paleta vale para tudo:** painel, site de marketing e app mobile. Os valores mudam em `@barchop/design-tokens`, que os três leem.
- **Entrega em 6 PRs em sequência.** O dono confere cada um no navegador antes do próximo.
- **Os textos não mudam nos PRs de visual.** As sugestões de texto da seção 6 da análise só entram com OK do dono, num PR próprio.
- **Decisões de 17/10, depois do PR 1:**
  - a bolinha "Amarelo BarChop" da Aparência passa para o ouro novo (`#F0C93A`);
  - a descrição do tema BarChop ("O amarelo da casa sobre papel, com sombra marcada") **fica como está**;
  - o ícone do app ganha imagens novas: o "B" escuro sobre o ouro, como o selo da barra lateral. Antes eram os PNGs de exemplo do Expo;
  - **entra uma novidade em `novidades.ts`** para o redesenho, no último PR da série (PR 6).

## Regras que valem para todos os PRs
- Cor nova é hex `#rrggbb`. A página pública só aceita hex (`aparenciaDaPagina.ts`) e o mobile lê os mesmos objetos. As transparências da análise viram o hex equivalente sobre a surface.
- Contraste medido, não estimado. `tests/app/contraste-dos-tokens.test.ts` cobre os estados e ganha o texto de apoio (`muted`, `inkSoft`, `placeholder`) sobre surface, paper e paperSoft.
- Movimento: entrada `cubic-bezier(.2,.8,.2,1)`, saída `cubic-bezier(.4,0,1,1)` e 30% mais curta; nada acima de 250ms. O `prefers-reduced-motion` do `globals.css` continua valendo.
- Os dados dos mockups ("Rafael", "Lucas", 2 profissionais, R$ 70,00) são exemplo e não entram no código.
- Cada PR é conferido no navegador em 1440 e 375, nos dois temas.

## PR 1 — paleta e componentes base (`paleta-e-base`)
**Tokens** (`packages/design-tokens/src/index.ts`, espelhados em `docs/design-system.html`):

| token | claro hoje → novo | escuro hoje → novo |
|---|---|---|
| paper | #F3F0E7 → #F7F4EE | #17160F → #1C1A17 |
| paperFim (novo, fim do degradê do fundo) | — → #EFEAE1 | — → #151412 |
| paperSoft | #FAF8F3 → #F7F3EB | #252419 → #28251F |
| surface | #FFFFFF → #FFFDF9 | #2C2A1F → #211F1B |
| ink | #202020 → #26221C | #F3F0E7 → #ECE6DA |
| inkSoft | #514c42 → #5B544A | #cbc4b3 → #B8B0A2 |
| muted | #8a8375 → #6F6759 | #B0A890 → #968F82 |
| line | #e6e0d3 → #E9E2D5 | #3d3b2e → #322F29 |
| lineStrong (novo) | — → #DAD1C1 | — → #403D36 |
| accent / accentOnDark | #FFD900 → #F0C93A | #FFD900 → #E8C547 |
| paleYellow (o "selecionado") | #FFF3B8 → #FAEFC8 | #3d3410 → #3B3521 |
| shadow | #000000 | #F3F0E7 → #000000 |
| ok / okFundo (escuro) | igual | #6fd88a → #86C99E / #173a22 → #2D332B |
| atencao / atencaoFundo (escuro) | igual | #ffb547 → #E3A862 / #3f2c0b → #382F24 |
| erro / erroFundo (escuro) | igual | #FF6B5E → #E8918A / #45201b → #392D28 |
| placeholder (escuro) | igual | #9e9681 → #9A9284 |

Medido: no escuro, `muted` dá 5,13:1 sobre a surface e 4,76:1 sobre o paperSoft; os estados passam de 5,6:1 sobre o fundo do selo. No claro, `muted` dá 5,50:1 sobre a surface e 5,05:1 sobre o paperSoft.

**Moldura e sombra** (`app/tokens-css.ts` e os `*.module.css`):
- `borderWidth.padrao` passa de 2 para 1.
- Borda de contorno (`solid var(--cor-ink)`, 142 ocorrências em 67 arquivos) vira `solid var(--cor-line-strong)`. Ficam com `--cor-ink` só os contornos que marcam estado: o passo atual dos Primeiros passos, o check da Aparência e as regras `border-color` de hover e de item escolhido, que o script não tocou. O botão secundário (Contorno) usa o fio, como na proposta.
- A sombra deslocada (`0 Npx 0 var(--cor-shadow)`) vira sombra difusa por custom property, com valor por tema: `--sombra-1` (cartão), `--sombra-2` (menu e janela), `--sombra-3` (destaque).
- O fundo do `body` ganha o degradê `paper → paperFim`.
- O foco visível usa `--cor-accent` no escuro.

**Componentes:**
- **`Botao`.** Continua afundando, que é a assinatura da casa, mas 2px em 120ms, com sombra preta translúcida nos dois temas.
- **`Cartao`.** Fio de 1px com `--sombra-1`. As variáveis `--cartao-*` da Aparência continuam valendo.
- **`MenuSuspenso`.** Entra com fade e 4px de deslocamento em 160ms, com `--sombra-2`.
- **`SeletorEmPilulas` e `SeletorDeVista`.** Viram controle segmentado: trilho em `paperSoft`, a opção escolhida com fundo `surface` elevado, sem amarelo. O indicador desliza em 200ms.
- **Hover de linhas e itens.** O fundo muda em 160ms.

**Mobile:** `apps/mobile/App.tsx` só lê `colors`, então ganha a paleta sem código novo.

**Testes:**
- o contraste do texto de apoio entra no teste de tokens;
- `cssDeTokens` com `--cor-line-strong`, `--cor-paper-fim` e as sombras por tema;
- o `aparencia.test.ts` segue igual: o tema BarChop é a própria paleta.

## PR 2 — shell, Hoje e celular
- Marca vira monograma + nome. Item ativo em tom suave (`paleYellow`) com ícone em ouro.
- Hoje:
  - Primeiros passos numa faixa: concluídos em uma linha de checks, o próximo ganha o espaço;
  - os três números num cartão só com divisórias;
  - estado vazio sem moldura tracejada.
- Celular (<900px):
  - barra inferior com Hoje, Agenda, "+ Novo", Caixa e Mais, com alvos de 44px ou mais.
  - (O próximo atendimento primeiro no Hoje, com WhatsApp a um toque, foi pro PR 3, junto do detalhe do agendamento no celular.)
- Menus (opções, conta, sino) e janelas (Bloquear, Novidades):
  - janela entra com fade de 180ms e escala de .98 para 1, com véu de 40% atrás;
  - Claro/Escuro/Sistema em segmentado.
- Recolher a barra lateral com transição de largura (`@property`).
- Carregando: esqueleto com o formato da tela.
- Faixa da assinatura: fechar por 24h, voltando nos últimos 3 dias. **Muda comportamento: RED/GREEN.**

## PR 3 — Agenda e Novo agendamento
- **Agenda:**
  - só a hora cheia no eixo; o livre de 15 em 15 continua clicável, com a hora no hover ou no toque longo;
  - agendamento em fundo tingido com um ponto da cor, e um matiz por profissional;
  - Dia/Semana/Mês em segmentado, com "Agora" como botão de texto;
  - linha do "agora" em vermelho suave;
  - no Mês, chips discretos.
- **Novo agendamento:**
  - Profissional vira o passo 1, em chips com "Qualquer um", no lugar do select nativo;
  - passos concluídos ficam numa linha com "Trocar", sem fechar os outros;
  - data na `FaixaDeDias`, com o calendário só sob demanda;
  - "Agendar" desabilitado neutro, com o motivo embaixo.
- **Detalhe do agendamento no celular:** "Concluir e registrar pagamento" fixo no rodapé e "Cancelar" afastado dele.
- **Hoje no celular:** o próximo atendimento vem primeiro, com WhatsApp a um toque (veio do PR 2).
- **Muda comportamento (ordem dos passos): RED/GREEN.**

## PR 4 — Configurações em lista com um Salvar só
- Regras de agendamento: as 7 regras numa lista (rótulo, efeito e segmentado), com um Salvar só numa barra que sobe quando algo muda e mostra o que mudou. O mesmo molde vale para Notificações, Comunicação e o Ajuste fino.
- Aparência:
  - abas Tema, Cor, Letra, Serviços e Ajuste fino, ao lado da prévia;
  - descrição do tema no hover;
  - as nove cores fechadas atrás de "Editar".
- Dados do negócio: um Salvar só para "Salvar dados" e "Pedir troca", e a aba Marca sem as áreas vazias.
- Membro da equipe: abas Dados, Jornada e Serviços; jornada em grade semanal com Folga, Horário da barbearia e Próprio, sem os 7 selects nativos.
- Configurações (índice):
  - selo "Faltando" e resumo curto;
  - o "X de N decididas" com o progresso fino.
- Comodidades: tom suave com check.
- Convidar: papel em segmentado.
- **Muda comportamento (salvar): RED/GREEN.**

## PR 5 — Clientes, Serviços, Equipe, Faturas, Caixa e Folgas
- **Clientes:** filtros em segmentado com contagem e lista que vira cartão no celular.
- **Cliente:** dados em leitura com "Editar", e status com as mesmas cores do Detalhe.
- **Serviços:**
  - avatar em tom suave;
  - ajudas em 13px;
  - "Desativar" separado como zona de perigo.
- **Equipe:** a coluna Telefone some quando está vazia.
- **Faturas:**
  - escolher o plano com 2 cartões lado a lado;
  - comparar planos e perguntas frequentes em acordeão;
  - a lista de faturas vira lista no celular.
- **Caixa:**
  - um número por pessoa com selo "a receber", "a repassar" ou "acertado";
  - repasse como "De → Para · valor";
  - fechar o dia confirma numa janela com as pendências.
- **Folgas:** a lista primeiro, e "+ Bloquear" abre a mesma janela da Agenda.
- **Compartilhar link:** Copiar em destaque e os outros 4 numa grade 2×2.
- Texto de apoio de 11–12px sobe para 13–14px.

## PR 6 — página pública
- Nos outros 16 temas da Aparência, entra só a regra de fio de 1px com sombra difusa.
- Página:
  - os 3 próximos horários por serviço ficam clicáveis e levam ao passo 4;
  - "Agendar agora" com um degradê de saída.
- Fluxo:
  - indicador de passo em 4 segmentos;
  - resumo fixo no rodapé desde o passo 3;
  - horários em grade de 4 colunas de 46px.

## Fora deste plano
- As sugestões de texto da seção 6, que esperam o OK do dono.
- A tela de Novidades: fica como está, só com a paleta nova.
