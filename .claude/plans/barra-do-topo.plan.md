# Plan: Barra de topo do painel (sino, menu "…", menu do usuário)

**Origem**: pedido de 2026-10-13 com 3 capturas de referência (sino, "…", usuário).
**Complexity**: Large (4 PRs)

## Summary
O painel ganha uma barra de topo com três botões no canto direito: sino de
notificações (agendamentos, pagamentos, avisos da plataforma), menu "…"
(Novidades, Central de ajuda, Aparência Claro/Escuro/Sistema, Idioma) e
menu do usuário (Minha conta, Faturas, Indique e ganhe, Sair). Tema e Sair
saem do rodapé da barra lateral.

## Decisões do dono (2026-10-13)
1. Central de ajuda = página nova no painel (`/painel/ajuda`).
2. Faturas e Indique e ganhe: visíveis, desabilitados, selo "EM BREVE".
3. Avisos da plataforma: o dono publica por uma TELA (na área do suporte).
4. Profissional recebe só notificações dos próprios agendamentos; dono e
   recepção recebem todas.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Shell | `apps/web/src/painel/LayoutDoPainel.tsx` | barra mora no shell, dentro do SessaoDoPainel |
| Contexto | `apps/web/src/painel/SessaoDoPainel.tsx` | `usePainel()` |
| Tema | `apps/web/src/painel/tema.ts` | atributo no `<html>` + script no `<head>` |
| Ícones | `apps/web/src/painel/icones.tsx` | SVG inline |
| Rota API | `apps/api/src/routers/me.ts` | resposta campo a campo, `additionalProperties: false` |
| Transação | `apps/api/src/lib/agendamento.ts` | `criarAgendamento(tx, …)` |
| Testes web | `apps/web/tests/painel/navegacao-do-painel.test.tsx` | Testing Library + `criarApiClientFalso` |
| Testes API | `apps/api/tests/routers/*.test.ts` | banco real + `tests/helpers` |

## PRs
### PR A — barra de topo, menu "…", menu do usuário, página de ajuda (sem migração)
- `src/painel/BarraDoTopo.tsx` no `LayoutDoPainel`; `componentes/MenuSuspenso.tsx`
  (disclosure, Esc/clique fora fecham, foco volta ao gatilho; folha no celular).
- Tema `claro | escuro | sistema`; script do `<head>` resolve o sistema; com
  sistema, acompanha o `matchMedia` ao vivo.
- Novidades: lista fixa `src/painel/novidades.ts`, janela; selo "N NOVAS" pelo
  `localStorage` (última vista); ponto no "…".
- Central de ajuda → `/painel/ajuda` (perguntas frequentes).
- Idioma: submenu só Português.
- Usuário: foto (`fotoUrl` no `/me`) ou iniciais; nome + barbearia no gatilho;
  Minha conta → `/painel/configuracoes/perfil`; Faturas/Indique "EM BREVE"; Sair.
- Tirar rodapé (tema + Sair) da `NavegacaoDoPainel`.

### PR B — notificações na API (MIGRAÇÃO)
- Tabela `notificacao` (fan-out por destinatário): barbeiro_id, barbearia_id,
  tipo (agendamento|pagamento|plataforma), titulo, texto, link, lida_em, criada_em;
  índice (barbeiro_id, lida_em, criada_em desc).
- Emissores (só ação do cliente, na mesma transação): agendamento novo pela
  página pública, cancelamento (área do cliente e link do lembrete),
  remarcação, presença confirmada. Destinatários: profissional do agendamento
  + donos e recepção ativos.
- Rotas: `GET /me/notificacoes?filtro=nao-lidas|todas|avisos`,
  `GET /me/notificacoes/contagem`, `POST /me/notificacoes/:id/lida`,
  `POST /me/notificacoes/ler-todas`; `POST /suporte/avisos` (fan-out pra todos
  os membros ativos). Pagamento: tipo existe, sem emissor até a Onda 2.

### PR C — sino no painel
- Popover com abas Não lidas / Todas / Avisos; contador; clique marca lida e
  abre o link; "Marcar todas como lidas"; vazio "Tudo em dia" + "Ver lidas".
- Contagem a cada 60 s e ao voltar o foco.

### PR D — tela de avisos no suporte
- Formulário (título, texto, link opcional) na área do suporte, chamando
  `POST /suporte/avisos`; lista dos avisos já publicados.

## Validation
Testes afetados (vitest) + `tsc` + lint; suíte inteira da API no PR B
(mexe em agendamento). Navegador em 375 e 1440 antes de pedir merge.

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Migração do PR B no deploy | Média | lembrar o `migrar` |
| Emissor dentro da transação do agendamento | Média | suíte inteira da API |
| Script anti-pisca com "sistema" | Baixa | `tema.test.ts` com os 3 valores |
| Popover no celular | Média | folha < 500px; ver em 375 |
