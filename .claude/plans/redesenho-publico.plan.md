# Plan: Redesenho da página pública (onda B)

**Fonte**: manual `barchop/docs/UI_UX_DESIGN_GUIDELINES.md` e o canvas do Claude Design, página "Página pública", 10 pranchas nos dois temas (https://claude.ai/artifact/LpMm9AAYAVzsQXsZB1w7Xb, versão `1793889414-5555`), feitas com o Design System do BarChop instalado no canvas (componentes reais compilados). O dono aprovou o desenho em 05/11 ("Aprovado"). O canvas é direção, não especificação: regra de negócio e decisão registrada no código valem mais que ele (manual §18.4–5).

Segunda de quatro ondas do pedido do dono de 01/11: A detalhes e cadastros do painel (feita, #280–#287) → **B o que o cliente vê** → C o resto do painel → D o site de divulgação.

## Telas da onda B (10 telas, 11 rotas)
- `/[slug]` → `PerfilDaBarbearia`
- `/[slug]/agendar` (passo 1) → `EscolhaDeServicos`
- `/[slug]/agendar/profissional` (passo 2) → `EscolhaDoProfissional`
- `/[slug]/agendar/data` (passo 3; `/horario` redireciona) → `EscolhaDaData`
- `/[slug]/agendar/confirmar` (passo 4; `/dados` redireciona) → `Confirmacao` (formulário e o estado "Agendamento confirmado")
- `/[slug]/entrar` → `Entrar`
- `/[slug]/minha-conta` → `MinhaConta` (+ `MinhasAssinaturas`)
- `/[slug]/planos` → `PlanosDaBarbearia`
- `/[slug]/lembrete/[token]` → `ConfirmarOuCancelar` (+ `AvisoDoPrazo`)
- Barra de cima de todas: `fluxo/BarraDaBarbearia` (no layout).

## O que o dono aprovou (05/11)
1. Perfil: categoria dos serviços como título normal ("Cabelo · 2 serviços"), não em CAIXA ALTA; "Equipe" no mesmo tamanho de "Serviços".
2. Profissional: iniciais de cada um, "Qualquer um" no topo, "← Serviços" e o resumo do que foi escolhido.
3. Confirmar: "Mudar" em cada linha do resumo, total destacado.
4. Entrar: título "Entrar" (hoje "Minha conta"); o código no e-mail num link abaixo; linha dizendo que pra agendar não precisa de conta.
5. Confirmado: a data num destaque ("Te esperamos na sexta, às 14:30"), endereço com "Mapa", "Adicionar à agenda" como ação principal.
6. Minha conta, Planos e Lembrete: títulos de seção no padrão do resto; horário em cartão com a data num bloco; Lembrete com selo de estado e "Marcar outro horário" depois de cancelar.

## Achados da conferência (05/11, 390px, escuro) — corrigidos depois de ler o código
- **Categoria em CAIXA ALTA** no perfil (`text-transform: uppercase` no `.subtitulo`), enquanto o passo 1 usa h2 com ícone.
- **"Equipe" menor** que "Serviços" no perfil.
- **Profissional** sem voltar, sem resumo e sem nada além do nome.
- **Confirmar** sem jeito de mudar uma linha só do resumo.
- **Entrar** com o título "Minha conta".
- ~~Dia e horário com a faixa e o calendário inteiro juntos~~: **errado**. O celular já esconde o calendário atrás de "Outra data" (`data-aberto`); ele só abre sozinho quando a faixa de 14 dias não tem vaga, que era o caso da semente. Nada a consertar.
- ~~"Como funciona" dos Planos é texto novo~~: **errado**. A seção existe em `PlanosDaBarbearia` (3 passos, com a regra do link por ciclo da InfinitePay). Fica o texto de hoje; muda só o visual.

## Decisões deste plano (o canvas não manda)
- **Toque avança, sem botão "Continuar" a mais.** Nas pranchas, Profissional e Dia e horário marcam a escolha e pedem "Ver horários"/"Continuar" numa barra presa. Hoje um toque já avança (`seguir()`, `router.push`). Recomendação: manter o toque que avança e trazer do canvas o voltar, o resumo e as iniciais. Isso é um toque a menos por passo e não muda o fluxo testado. (Se o dono preferir o botão, muda só PR 3 e PR 4.)
- **Cores seguem a Aparência de cada barbearia.** As pranchas usam `--cor-pale-yellow`, `--cor-dark`/`--cor-accent-on-dark`, `--cor-paper-soft`, `--cor-accent-text`. Todas estão em `CoresDaPagina` (`packages/formato/src/aparencia.ts`, as chaves de `colors.light`), então o `cssDaAparencia` reescreve todas. Nada de hex escrito no CSS das telas.
- **Computador fica como está.** `Confirmacao` e `EscolhaDaData` têm duas colunas a partir de 900px; o canvas só tem 390px. A estrutura do desktop não muda; só os detalhes que valem nas duas larguras.
- **O que o código já decide e a prancha não mostrou:**
  - "Ver meus agendamentos" no confirmado só aparece com `conta || remarcar`, e há um comentário no código explicando o porquê;
  - o CPF continua no "Assinar" online (`cpf_obrigatorio`);
  - no remarcar, o Confirmar não mostra o bloco "Quem vai ser atendido".
- **Fora da onda (pede API ou é recurso novo):**
  - o "Onde" no Lembrete: `AgendamentoDoLembrete` não traz endereço;
  - o "Sair" na Minha conta: não existe na página pública hoje;
  - o "Mapa" no Confirmado só entra se o endereço da barbearia já vier no perfil (vem: `endereco` é usado no "Onde").

## PRs
### PR 1 — Perfil, semente pública e este plano
- **Semente** (`apps/api/scripts/conferencia-visual.ts`), pra dar pra conferir as telas públicas:
  - horário de funcionamento com vagas nos próximos 14 dias;
  - endereço e WhatsApp da barbearia;
  - um serviço de Barba;
  - um plano à venda, online e no balcão.
  - Sem ids reais em fixture.
- **Perfil:**
  - categoria como título normal, com a contagem ("Cabelo · 2 serviços");
  - "Equipe" com o mesmo título das outras seções;
  - conferir o resto contra a prancha (horário com o "hoje" em destaque, Planos em cartão).
- **Feito (05/11, #291):**
  - semente com horário seg–sáb 09:00–23:30 (domingo fechado), endereço, WhatsApp, Instagram, comodidades, formas de pagamento, "Barba completa" e `vitrineDePlanos` ligada;
  - categoria em h3 normal (`--texto-lg`), com a contagem fora do h3 (o nome da região continua só a categoria);
  - todo h2 do perfil em `--texto-xl` no celular; a lateral menor só a partir de 900px, onde é coluna (decisão de antes, mantida);
  - "Planos de assinatura" no mesmo tamanho.
  - Ficou fora: o resumo dos planos em cartão amarelo da prancha (o dono não listou; o de hoje já tem "Conhecer os planos") e o rótulo "PRÓXIMOS:" em caixa alta.
  - 1665 testes verdes; conferido 390 escuro, 360 claro, 1280 escuro.

### ~~PR 2 — Passo 1: Serviços~~ (saiu, 05/11)
- Conferido com a semente: o passo 1 já bate com a prancha (categoria em h2 com ícone e contagem, resumo preso embaixo). O "← voltar" que estava aqui não vinha da prancha, e a barra de cima já leva ao perfil. Nada a mudar.

### PR 2 (era o 3) — Passo 2: Profissional
- Voltar "← Serviços".
- Resumo dos serviços (nomes, duração, total).
- Iniciais em cada linha; "Qualquer um" no topo com o apoio "mais opções".
- O toque segue avançando.
- **Feito (05/11, #292):**
  - voltar, resumo (`Resumo`, região "Sua escolha") e foto ou iniciais;
  - seta à direita dizendo que o toque já segue;
  - `Resumo` deixa o primeiro item crescer e quebrar linha, com os outros inteiros (antes "50 min" quebrava), e canto `--raio-lg`.
  - 1666 testes verdes; conferido 390 escuro, 360 claro, 1280 escuro.

### PR 3 (era o 4) — Passo 3: Dia e horário
- Voltar "← Com quem".
- Título "Dia e horário".
- Resumo do pedido acima da faixa.
- O dia escolhido por extenso ("Amanhã, 6 de novembro") acima dos horários.
- O toque no horário segue avançando.
- **Feito (05/11, #293):**
  - "← Com quem" só quando o passo do profissional existe (mais de uma pessoa faz tudo); senão, e no remarcar, "← Serviços" (voltar pro profissional com uma pessoa só pularia pra frente de novo);
  - o resumo do pedido virou o hook `fluxo/useResumoDaEscolha`, usado também no passo 2;
  - o dia escolhido é h2 (`formatarDataComSemana`, sem o "Amanhã" da prancha);
  - no desktop o voltar e o resumo ocupam as duas colunas.
  - 1669 testes verdes; conferido 390 escuro, 360 claro, 1280 escuro.

### PR 4 (era o 5) — Passo 4: Confirmar e Confirmado (`Confirmacao`)
- **Confirmar:**
  - resumo em lista com "Mudar" por linha (`aria-label` dizendo o quê). Cada link leva `servicoIds`, `data`, `hora`, `profissional` e `remarcar` por `caminhoDoPasso`. No remarcar, "Mudar" serviços só aparece se o remarcar deixar trocar serviço (conferir antes);
  - Total destacado;
  - "Já tem conta? Entrar" já existe; fica.
- **Confirmado:**
  - frase com o dia e a hora;
  - "Onde" com "Mapa";
  - "Adicionar à agenda" principal, "Voltar ao início" em contorno;
  - "Ver meus agendamentos" com a condição de hoje.
- **Feito (05/11, #294):**
  - "Mudar" em cada linha (`aria-label` "Mudar os serviços" / "o dia e o horário" / "o profissional"), levando o resto da escolha; o do profissional só quando o passo dele existe (mais de uma pessoa faz tudo, fora do remarcar). O remarcar aceita trocar serviços (`api.cliente.remarcar` recebe `servicoIds`), então "Mudar" serviços fica nele também;
  - Total sem linha embaixo, maior, com a fonte de título;
  - todo valor do resumo alinhado à direita, inclusive quando quebra;
  - Confirmado: frase "Te esperamos no sábado, 7 de novembro, às 14:30." ("no" sábado/domingo, "na" nos outros) e "Mapa" sublinhado ao lado do endereço, com o mesmo link do "Ver no mapa" do perfil. "Adicionar à agenda" principal e "Voltar ao início" em contorno já eram assim.
  - 1672 testes verdes; conferido 390 escuro, 360 claro (confirmado), 1280 escuro (confirmar).

### PR 5 (era o 6) — Entrar
- Título "Entrar" com apoio.
- "Primeira vez aqui, ou esqueceu a senha?" com o link do código abaixo do formulário.
- Linha "Pra agendar não precisa de conta".
- O modo código com "← Entrar com senha".
- **Feito (06/11, #296; liberado pelo dono em 06/11):**
  - h1 "Entrar" com apoio "Pra ver seus horários e seu plano.", sem o nome da barbearia (a barra logo acima já mostra);
  - pergunta e "Receber um código no e-mail" num bloco com linha em cima;
  - "Pra agendar não precisa de conta": "escolha um horário" leva ao passo 1. Vindo de um passo (`?voltar=`), vira "voltar ao agendamento" com as escolhas. No remarcar não aparece;
  - modo código: "← Entrar com senha" no topo nas duas etapas (desenho do voltar dos passos), explicação como apoio do título; saiu o "Voltar pra entrar" do fim. Botão segue "Enviar código";
  - texto do "sem conta" em `--cor-ink-soft` (o `--cor-muted` reprova contraste no claro); links de texto com alvo de 44px.
  - 1677 testes passando; conferido 390 escuro (login e código), 360 claro, 1280 escuro.

### PR 6 (era o 7) — Minha conta
- Títulos h2 (Horários marcados, Meu plano, Histórico).
- Horário em cartão com o bloco da data e o selo de situação.
- Remarcar e Cancelar lado a lado.
- Histórico em linhas com selo.
- **Feito (06/11, #297):**
  - Horários marcados, Meu plano e Histórico em h2 de título (`--texto-lg`), no lugar do rótulo pequeno em caixa alta. O "Neste ciclo" dentro do cartão do plano continua rótulo;
  - bloco do dia como na prancha: semana curta ("dom"), número e mês, em `--cor-pale-yellow` com `--cor-accent-text`, 56px (o "domingo" por extenso apertava);
  - no cartão, os serviços numa linha em negrito e "Com Fulano · até HH:MM" no apoio (antes "Corte com Fulano" numa linha só);
  - Remarcar e Cancelar lado a lado na mesma largura no celular (um botão só ocupa a linha); no desktop, ao lado do resumo, cada um na largura do texto;
  - histórico e cartão do plano já batiam (linhas com selo; plano mais completo que a prancha), sem mudança;
  - fora: o preço no cartão (com o plano cobrindo parte, o valor enganaria) e o "Sair" (já fora da onda);
  - semente: o cliente "Teste" entra com `cliente@exemplo.com` / `senha-forte-123`, com um horário daqui a 2 dias (Corte + Barba) e dois no histórico (concluído e cancelado);
  - 1679 testes passando; conferido 390 escuro, 360 claro, 1280 escuro.

### PR 7 (era o 8) — Planos
- Cartões com nome, com quem vale, preço grande, "Inclui a cada mês" com check, forma de pagar e Assinar.
- "Como funciona" com o texto de hoje, em passos numerados.
- **Feito (06/11), só CSS:**
  - "Inclui a cada mês" em texto normal, em negrito (antes em caixa alta), e os serviços em `--texto-sm`;
  - a linha do cartão saiu de cima do "Inclui" e foi pro pé (acima da forma de pagar e da ação), como na prancha;
  - "Como funciona" sem a linha em cima, com o número num círculo `--cor-pale-yellow` / `--cor-accent-text`;
  - fora: o check verde da prancha (`--cor-ok` não vem da Aparência; fica no tom do destaque) e o h2 "Escolha o plano" (os nomes dos planos são h2 hoje, e o apoio dele repete o passo 1 do "Como funciona");
  - conferido 390 escuro, 360 claro, 1280 escuro (a semente só tem plano no balcão).

### PR 8 (era o 9) — Lembrete
- Cartão do horário com o bloco da data e o selo (Presença confirmada / Cancelado).
- Ações por estado.
- "Marcar outro horário" depois de cancelar.
- WhatsApp no rodapé quando a barbearia tem (o dado já vem).

## Conferência visual
- Semente `apps/api/scripts/conferencia-visual.ts` (de `barchop/`) + `pnpm --filter web dev`; página em `localhost:3000/barbearia-teste`.
- A cada PR: 360, 390 e 1280px, nos dois temas (o tema da página segue o sistema, ou `localStorage["pagina.<slug>.modo"]`).
- Testes primeiro (TDD) no que muda comportamento ou texto; a suíte web inteira verde antes do PR.
