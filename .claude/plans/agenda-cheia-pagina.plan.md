# Plan: Aviso de agenda cheia na página pública

**Source PRD**: `.claude/prds/agenda-cheia.prd.md`
**Selected Milestone**: 1 — Aviso na página pública
**Complexity**: Medium

## Summary
Uma regra nova na API diz se a barbearia está com a agenda cheia: janela definida, nenhum horário que o link ofereceria até o fim dela e pelo menos um agendamento no período. Uma rota pública pequena expõe isso. A home da barbearia lê a rota e, quando está cheia, mostra o aviso da variante C logo abaixo do topo e troca o "Agendar agora" pelo contato (WhatsApp → telefone → nada). A regra fica numa função própria porque os marcos 2 e 3 (e-mail e sininho) vão reusá-la.

## Decisões deste plano (conferir com o dono)
- **"Cheia" = nenhum serviço ativo tem horário no link até o fim da janela.** É o "nenhum horário pro serviço mais curto" do PRD, só que exato: se o serviço mais curto é feito só por um profissional que lotou, mas outro ainda tem horário pra corte, a barbearia não está cheia. A conta começa pelo serviço mais curto e para no primeiro horário que achar.
- **Sem nenhum agendamento no período, não é "cheia".** Uma barbearia com a janela toda fechada (férias, bloqueio, horário sem dia aberto) também não tem horário, mas "todos os horários estão reservados" seria mentira. Nesse caso o aviso não aparece.
- **Rota separada** (`GET /barbearias/:slug/agenda-cheia` → `{ cheia }`), e não um campo a mais em `/proximos-horarios`. Assim o cliente e os testes de quem já usa os próximos horários (página e escolha de serviços) não mudam, e os marcos 2 e 3 chamam a mesma função sem passar pela rota.
- **Onde o aviso aparece:** no topo da coluna principal, logo abaixo da fachada, no celular e no computador. É o "logo abaixo do topo" da variante C.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Regra de disponibilidade | `apps/api/src/lib/proximos-horarios.ts:21-84` | Serviços ativos + quem pode atender (`PODE_ATENDER`) menos `foraDoLink`; `agendaDoPeriodo` com `gradeDe(regras, true)`; união do "qualquer um" por dia; `descartarPassados` aplica antecedência, mesmo dia e janela |
| Janela | `packages/formato/src/regras.ts:78-95` | `regraQueRecusa`: `janelaDias` null = sem limite; o último dia é hoje + `janelaDias` |
| Rota pública | `apps/api/src/routers/disponibilidade.ts:184-200` | `paramsSlug`, `preHandler: limites.*`, `findUniqueOrThrow` por slug (P2025 → 404), `agoraNaBarbearia()` |
| Limite por IP | `apps/api/src/lib/limites.ts:387-393` | `contador(app, { max, janela: MINUTO, chave: ip })` |
| Cliente da API | `packages/api-client/src/publico.ts:141-148` | Método que desembrulha o envelope; o falso tem a semente (`falso.ts:254`, `:529`, `:1658`) |
| Tela | `apps/web/src/telas/PerfilDaBarbearia.tsx:43-47` | `useRequisicao` em paralelo; se falhar, a página segue sem (atalho, não conteúdo) |
| Links de contato | `apps/web/src/telas/PerfilDaBarbearia.tsx:168-180` | `https://wa.me/55${whatsapp sem não-dígitos}`, outra aba, `noopener noreferrer` |
| Telefone na tela | `packages/formato/src/telefone.ts:63` | `formatarTelefoneParcial` monta "(11) 98765-4321" |
| Testes da API | `apps/api/tests/routers/pagina-da-barbearia.test.ts:228-328` + `tests/helpers/agenda.ts:13` | `buildApp()`, `prepararAgenda`, `app.inject`, banco de teste real |
| Testes da tela | `apps/web/tests/telas/perfil.test.tsx:1-23` | `criarApiClientFalso({...semente})`, `montar(falso, agora)`, Testing Library por papel e nome |

## Files to Change
| File | Action | Why |
|---|---|---|
| `apps/api/src/lib/agenda-cheia.ts` | CREATE | `agendaCheia(db, { barbeariaId, agora })` → `{ cheia: boolean }`. Reusada nos marcos 2 e 3 |
| `apps/api/src/lib/proximos-horarios.ts` | UPDATE | Extrair "serviços + quem está no link e o que faz" pra uma função que as duas regras usam, sem copiar a conta |
| `apps/api/src/routers/disponibilidade.ts` | UPDATE | `GET /barbearias/:slug/agenda-cheia` |
| `apps/api/src/lib/limites.ts` | UPDATE | `limites.agendaCheia`, igual ao dos próximos horários |
| `apps/api/tests/routers/agenda-cheia.test.ts` | CREATE | Os casos da regra, pela rota |
| `packages/api-client/src/publico.ts` | UPDATE | `publico.agendaCheia(slug): Promise<boolean>` |
| `packages/api-client/src/falso.ts` | UPDATE | Semente `agendaCheia?: boolean` (padrão `false`) |
| `packages/api-client/tests/pagina.test.ts` | UPDATE | O método novo bate na rota certa e desembrulha |
| `apps/web/src/telas/PerfilDaBarbearia.tsx` | UPDATE | Lê a rota; mostra o aviso; troca o botão |
| `apps/web/src/telas/PerfilDaBarbearia.module.css` | UPDATE | `.agendaCheia` com `--cor-atencao` / `--cor-atencao-fundo`, `--raio-md` (como a variante C do canvas) |
| `apps/web/tests/telas/perfil.test.tsx` | UPDATE | Os estados do aviso e do botão |

## Tasks

### Task 1: A regra (API, com teste primeiro)
- **Action**: `agendaCheia` devolve `cheia: false` quando:
  - `janelaDias` é null;
  - não há serviço ativo com pelo menos um profissional do link;
  - algum serviço tem horário (do mais curto ao mais longo, de hoje até hoje + `janelaDias`, parando no primeiro);
  - não há nenhum agendamento não cancelado de quem está no link no período.

  Senão, devolve `true`. Reusa `agendaDoPeriodo` e `descartarPassados`, sem uma segunda conta de horário.
- **Mirror**: `proximos-horarios.ts` (mesmas consultas, `Promise.all`, `UM_DIA`). Extrair a parte comum.
- **Validate**: `tests/routers/agenda-cheia.test.ts` (Task 2) vermelho antes, verde depois; `pagina-da-barbearia.test.ts` continua verde (a extração não muda os próximos horários).

### Task 2: A rota pública
- **Action**: `GET /barbearias/:slug/agenda-cheia` → `{ cheia }`. Sem login, com limite por IP, 404 pra slug inexistente.
- **Mirror**: `/proximos-horarios` (`disponibilidade.ts:184`), `limites.proximosHorarios`.
- **Validate**: os casos de teste abaixo. A fixture enche a janela com agendamentos gravados direto no banco, num funcionamento curto pra precisar de poucos.
  - Sem limite: `false`.
  - Janela com horário livre: `false`.
  - Janela toda ocupada: `true`.
  - Um buraco que cabe o serviço mais curto: `false`.
  - Só bloqueio, sem agendamento: `false`.
  - O horário livre é de um profissional fora do link: `true`.
  - Slug inexistente: 404.

### Task 3: Cliente e falso
- **Action**: `publico.agendaCheia(slug)` devolve o booleano. No falso, a semente `agendaCheia` tem padrão `false`.
- **Mirror**: `publico.proximosHorarios` e a semente `proximosHorarios`.
- **Validate**: `packages/api-client/tests/pagina.test.ts`.

### Task 4: O aviso na home (teste primeiro)
- **Action**:
  - **Leitura**: em `PerfilDaBarbearia`, a quarta `useRequisicao` em paralelo. Erro conta como não cheia.
  - **O aviso**: com `cheia`, logo no topo da coluna principal, um `<section aria-labelledby>`. O título é "Todos os horários estão reservados." O texto é "Para mais informações, mande mensagem para a barbearia no número {número}." O número é um link: WhatsApp (`wa.me`, outra aba), senão telefone (`tel:`). Sem nenhum dos dois, fica só o título.
  - **O botão**: o "Agendar agora" vira "Chamar no WhatsApp" (`BotaoLink externo`), ou "Ligar para a barbearia" (`tel:`), ou some.
  - **Próximos horários**: já vêm vazios (não há horário), então nada muda neles.
  - **Link do WhatsApp**: a montagem do `wa.me` sai pra uma função, pra o atalho do topo e o aviso não divergirem.
- **Mirror**: atalhos de contato (`PerfilDaBarbearia.tsx:153-194`), `.acao` sticky, os tokens de estado do design system (atenção).
- **Validate**: casos novos em `perfil.test.tsx`:
  - Cheia com WhatsApp: o texto, o link `wa.me` e o "Chamar no WhatsApp", sem o "Agendar agora".
  - Cheia só com telefone: o link `tel:` e o "Ligar para a barbearia".
  - Cheia sem contato: o título, sem número e sem botão.
  - Não cheia: igual a hoje.
  - Erro na rota: igual a hoje.

### Task 5: Conferência no navegador
- **Action**: subir API e web locais (Postgres 17 nativo do PC do trabalho), encher a agenda de uma barbearia de teste e conferir a home:
  - a 360, 390 e 1280 px;
  - nos temas claro e escuro;
  - com a Aparência de outra cor da marca;
  - com o console limpo.

  Também conferir o tempo da home antes e depois (risco do PRD).
- **Validate**: print de cada largura no PR.

## Validation
```bash
# API: só os afetados
pnpm --filter @barchop/api test -- tests/routers/agenda-cheia.test.ts tests/routers/pagina-da-barbearia.test.ts tests/routers/limites-publicos.test.ts
# Cliente
pnpm --filter @barchop/api-client test -- tests/pagina.test.ts
# Web
pnpm --filter @barchop/web test -- tests/telas/perfil.test.tsx tests/telas/perfil-fachada.test.tsx tests/telas/pagina-rica.test.tsx
# Tipos e lint
pnpm --filter @barchop/api exec tsc --noEmit
pnpm --filter @barchop/web exec tsc --noEmit
pnpm --filter @barchop/api-client exec tsc --noEmit
pnpm lint
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Janela de 90 dias deixa a rota pesada | Média | Uma consulta por tabela pro período (`agendaDoPeriodo`), parada no primeiro horário livre; limite por IP; medir na Task 5 |
| Extrair a parte comum muda os próximos horários sem querer | Baixa | `pagina-da-barbearia.test.ts` e `escolha-de-servicos.test.tsx` seguem verdes sem mudança |
| Aviso diz "reservados" com a barbearia fechada | Baixa | Regra do "pelo menos um agendamento no período" + teste do bloqueio |
| Cor do aviso some na Aparência de outra marca ou no escuro | Baixa | Tokens de estado (`--cor-atencao*`), que não dependem da cor da marca; conferir os dois temas |
| A página pisca o "Agendar agora" antes de saber que está cheia | Média | Enquanto a rota não respondeu, o botão fica como hoje; trocar só quando a resposta chega (sem esconder o botão no carregamento). Conferir na Task 5 se incomoda |

## Acceptance
- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] Prints a 360, 390 e 1280 px (claro e escuro) aprovados pelo dono
