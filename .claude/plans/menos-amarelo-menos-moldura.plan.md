# Plan: Menos amarelo, menos moldura, mais respiro

**Fonte**: análise de UI/UX do dono no claude.ai/design (`Analise UI-UX BarChop.dc.html`, 17/10), feita a partir dos prints do painel e do código de `apps/web`.
**Complexidade**: Large (6 PRs, sem migração)
**Status**: PRs 1 a 5 abertos e empilhados: #162 → #163 → #164 → #165 → #166 → PR 5 (`listas-e-apoio`). Próximo: PR 5b.

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
Feito (empilhado sobre o PR 3):
- **BarraDeMudancas** (componente novo):
  - fica presa no pé da tela e sobe quando algo muda;
  - diz o que mudou ("Intervalo entre horários: 15 min → 30 min") e oferece Descartar e Salvar;
  - enquanto a área não foi decidida, oferece salvar assim ("Ainda não decidido: salve pra manter assim.", **texto novo, pede OK do dono**);
  - o erro do salvar aparece dentro dela;
  - no celular, fica acima da barra de navegação.
- **Regras de agendamento:** as sete numa lista, com um Salvar só que grava as sete.
- **Índice das Configurações:** a linha faltando perde o fundo âmbar. A frase da consequência fica no cinza de apoio e o "Configurar" vira um selo âmbar; o texto é o mesmo.
- **Comodidades e formas de pagamento:** o marcado em tom suave com check.
- **Convidar/editar membro:** o papel em segmentado, com a descrição só da escolhida.
- **Mantidos como estão:**
  - Notificações e Comunicação: já têm um Salvar só cada uma;
  - "Pedir troca" dos Dados do negócio: é um pedido de troca do link, não um salvar.

## PR 4b — Aparência e Membro da equipe em abas (OK do dono no molde da barra em 17/10)
Feito:
- **Abas** (componente): todos os painéis ficam montados e os inativos vão com `hidden`; trocar de aba não perde o que não foi salvo.
- **Membro da equipe:** abas Dados (com foto e situação), Jornada e Serviços.
  - Jornada: segmentado por dia, sem os 7 selects, com a barra de mudanças ("Segunda: Horário da barbearia → Folga").
  - Dados: o salvar continua sendo o botão do grupo. É de propósito: é um formulário com Enviar convite e Cancelar.
- **Aparência:**
  - abas Tema, Cor, Letra, Serviços e Ajuste fino, com a loja acima e a publicação abaixo;
  - o Ajuste fino aparece direto na aba, e só as nove cores ficam atrás de "Editar".
- **Dados do negócio › Marca:** a capa vazia fica em 4 por 1.

Ficou pendente:
- a descrição do tema no hover;
- compactar "A cara da sua loja" numa linha: muda texto e é pergunta pro dono;
- a barra de mudanças nos Dados do negócio (Identidade): foi pro PR 5.

## PR 5 — listas, dados do negócio e texto de apoio
Feito (empilhado sobre o 4b):
- **Aparência:** "A cara da sua loja" numa linha (OK do dono). As medidas ficam na tela de envio.
- **Dados do negócio:** um Salvar só na barra de mudanças, para Identidade e Comodidades. Manda só o grupo que mudou.
- **Tabela:** no celular, cada linha vira cartão, com o rótulo antes de cada valor e as ações (WhatsApp, Agendar) no pé. Vale para Clientes, Equipe e Serviços.
- **Equipe:** a coluna Telefone some quando ninguém tem.
- **Serviços:** a inicial em tom suave, sem contorno, com a letra em ouro.
- **Ajudas sob os campos:** de 12px para 14px.
- **Compartilhar link:** Copiar em destaque, e as outras ações numa grade 2×2.

## PR 5b — Faturas, Caixa, Folgas e detalhe do cliente
- **Faturas:**
  - escolher o plano com 2 cartões lado a lado;
  - comparar planos e perguntas frequentes em acordeão.
- **Caixa:**
  - um número por pessoa, com selo "a receber", "a repassar" ou "acertado";
  - repasse como "De → Para · valor";
  - fechar o dia confirma numa janela com as pendências.
- **Folgas:** a lista primeiro, e "+ Bloquear" abre a mesma janela da Agenda.
- **Cliente:**
  - dados em leitura, com "Editar";
  - status com as mesmas cores do Detalhe.
- **Serviços:** "Desativar" separado como zona de perigo.

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
