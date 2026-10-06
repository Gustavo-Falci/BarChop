# Plan: Painel v2 — Configurações em decisões

**Source PRD**: `.claude/prds/painel-v2.prd.md`
**Selected Milestone**: 2 — Configurações em decisões
**Complexity**: Large

## Summary
A tela única de Configurações (`ConfiguracoesDaBarbearia.tsx`, 723 linhas, seis `Secao` numa grade) vira um **índice de áreas** com "X de N decididas" e subtelas próprias. Cada linha do índice mostra o que vale hoje ou, se a área nunca foi salva, a consequência em âmbar + "Configurar →". **Decidida = salva pelo menos uma vez, mesmo com o valor padrão** (decisão do usuário, 2026-10-06), registrada pela API numa coluna nova. As subtelas reaproveitam os formulários de hoje com as peças do marco 1; Horários e Comodidades/Notificações ganham o desenho novo em PRs próprios.

Áreas deste marco (N = 4): **Horários**, **Dados do negócio** (abas Identidade · Marca · Comodidades), **Comunicação**, **Notificações**. "Seu perfil" vira linha do índice sem selo (é de cada pessoa, não da barbearia) e continua sendo a única coisa que recepção/profissional veem. Regras de agendamento entra no marco 3 e vira a 5ª área.

## Decisões tomadas aqui (mudam o PRD)
- **Pausa do almoço e exceções por dia saem deste marco** → marco 3, junto com Regras: o horário hoje é um intervalo por dia (`HorarioFuncionamento.horaAbertura/horaFechamento`), e a pausa exige mudar o modelo e o cálculo de disponibilidade (`packages/scheduling`). Aqui Horários ganha só a rotina com atalhos e a semana.
- **"Avisos da equipe" sai**: não existe aviso de equipe no sistema hoje; Notificações = o lembrete por e-mail (ligado/desligado + antecedência).
- **Prévia do que o cliente vê** (celular com horários) fica fora deste marco — TBD no marco 3, que mexe no cálculo de horários.
- **Formas de pagamento** vão pra aba Comodidades ("Comodidades e pagamento"); **telefone da barbearia** vai pra Comunicação (junto de WhatsApp e Instagram).

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Marca de "já fez" | `apps/api/src/routers/onboarding.ts:73` | `updateMany` com guarda pra gravar só a primeira vez (`linkCompartilhadoEm`); trilha derivada no servidor |
| Rotas do dono | `apps/api/src/routers/onboarding.ts:44` | `onRequest: exigirPapel("dono")`, schema JSON com `additionalProperties: false` |
| Migration | `packages/database/prisma/migrations/20261005120000_lembrete_ativo` | migration SQL à mão com default e backfill no mesmo arquivo; `migrate deploy` nos dois bancos |
| api-client + dublê | `packages/api-client/src/barbeiro.ts:251`, `falso.ts:882` | todo campo novo da API entra no tipo (`packages/types`), no client e no dublê com a mesma regra |
| Tela do painel | `apps/web/src/telas/painel/ConfiguracoesDaBarbearia.tsx:51` | `useRequisicao` + `useApiDoPainel`, `Aviso` pra erro, `Botao carregando`, um salvar por bloco |
| Rotas Next | `apps/web/app/(painel)/painel/(guardado)/configuracoes/page.tsx` | `page.tsx` cliente fino que só monta a tela de `src/telas/painel` |
| Tests API | `apps/api/tests/routers/onboarding.test.ts`, `interruptor-do-lembrete.test.ts` | Fastify `inject` contra o banco `_test`, datas relativas (`tests/helpers/datas.ts`) |
| Tests web | `apps/web/tests/telas/painel/configuracoes.test.tsx` | tela com o dublê do api-client, consulta por papel |

## Files to Change
| File | Action | Why |
|---|---|---|
| `packages/database/prisma/schema.prisma` + migration `20261007120000_areas_decididas` | UPDATE/CREATE | `barbearia.areas_decididas TEXT[] DEFAULT '{}'`; backfill `horarios` pra quem já tem dia aberto |
| `apps/api/src/lib/areas.ts` | CREATE | lista `AREAS` e `areasTocadas(corpoDoPatch)` (campo → área); marcar decidida de forma idempotente |
| `apps/api/src/routers/barbearias.ts`, `horarios.ts`, `imagens.ts` | UPDATE | PATCH `/barbearias/me` marca as áreas dos campos enviados; PUT horários marca `horarios`; capa marca `dados_do_negocio`; GET devolve `areasDecididas` |
| `packages/types`, `packages/api-client/src/barbeiro.ts`, `falso.ts` | UPDATE | `BarbeariaDoPainel.areasDecididas`; dublê marca igual à API |
| `apps/web/src/telas/painel/configuracoes/*` | CREATE | `IndiceDeConfiguracoes`, `Horarios`, `DadosDoNegocio` (abas), `Comunicacao`, `Notificacoes`, `SeuPerfil`, `areas.ts` (resumo/consequência por área, ordem, "próxima faltando") |
| `apps/web/app/(painel)/painel/(guardado)/configuracoes/{horarios,dados-do-negocio,comunicacao,notificacoes,perfil}/page.tsx` | CREATE | uma rota por subtela |
| `apps/web/src/telas/painel/ConfiguracoesDaBarbearia.tsx` + `.module.css` | DELETE (no PR B) | conteúdo repartido nas subtelas |
| `apps/web/src/painel/icones.tsx` | UPDATE | ícones das comodidades que faltarem (PR D) |
| `apps/web/tests/telas/painel/configuracoes*.test.tsx` | CREATE/UPDATE | índice, cada subtela, "próxima área faltando" |

## Tasks

Quatro PRs, TDD (commit RED/GREEN), push + PR + merge com os testes verdes.

### PR A — API: áreas decididas
- **Action**: migration + backfill; `lib/areas.ts`; as três rotas marcam; GET `/barbearias/me` expõe `areasDecididas: string[]`; tipo + client + dublê.
- **Mirror**: `onboarding.ts` (marca que só cresce), `interruptor-do-lembrete.test.ts`.
- **Validate** (`tests/routers/areas-decididas.test.ts`): barbearia nova começa sem áreas; salvar horário igual ao padrão marca `horarios`; PATCH só com `whatsapp` marca `comunicacao` e nada mais; PATCH com `lembreteAtivo` marca `notificacoes`; repetir não duplica; capa marca `dados_do_negocio`; profissional continua 403 nas rotas do dono; o backfill marca `horarios` só pra quem tem dia aberto. Dublê: teste equivalente em `packages/api-client/tests`.

### PR B — Web: índice + subtelas com o conteúdo de hoje
- **Action**: `/painel/configuracoes` vira o índice (dono): cabeçalho com "X de 4 decididas" e barra; `SecaoNumerada` "Operação" (Horários) e "Canais com clientes" (Dados do negócio, Comunicação, Notificações); linha = nome · resumo de hoje **ou** consequência em âmbar + "Configurar →"; linha "Seu perfil" sem selo. Subtelas com `CabecalhoDaPagina voltar + selo` (Configurado/Faltando) e rodapé "Próxima área faltando →". Conteúdo dos formulários movido sem mudar comportamento (Identidade: nome, endereço, sobre, link/pedido de troca; Marca: capa; Comodidades: checkboxes + pagamento; Comunicação: telefone, WhatsApp, Instagram; Notificações: chave + antecedência; Perfil). Recepção/profissional: `/painel/configuracoes` mostra só o perfil, como hoje.
- **Mirror**: `ConfiguracoesDaBarbearia.tsx` (cada handler de salvar vai inteiro pra subtela dele).
- **Validate**: testes do índice (decidida mostra resumo, não decidida mostra consequência e link; contagem; ordem); de cada subtela (salvar chama o client certo e a área passa a decidida no dublê; voltar; próxima faltando aponta a primeira não decidida e some quando tudo está decidido); os casos de hoje do `configuracoes.test.tsx` migram pras subtelas sem perder nenhum.

### PR C — Web: Horários com rotina
- **Action**: "A rotina da semana": atalhos (Seg a sex 9–18 · Seg a sáb 9–19 · Todos os dias 9–18), dias que abre como checkboxes em pílula, abre/fecha, frase "Resultado: Seg – Sex, 09:00–18:00", "Aplicar aos N dias"; "A semana" lista os sete dias com o horário e editar por dia (dia diferente da rotina ganha chip "Diferente"); salvar = `salvarHorarios` de hoje.
- **Validate**: atalho preenche a rotina; aplicar copia pros dias marcados e não mexe nos outros; editar um dia isolado; dia fechado; validação abre < fecha; salvar envia a semana inteira.

### PR D — Web: Comodidades em grade e Notificações em pílulas
- **Action**: Comodidades viram grade de cartões com ícone (8 do `COMODIDADES` + 4 formas de pagamento), marcado = amarelo; Notificações: antecedência em `SeletorEmPilulas` (24 h / 12 h / 2 h) com efeito "O cliente recebe o lembrete 24 horas antes do horário", chave do lembrete.
- **Validate**: cartão é checkbox com nome (teclado e leitor de tela); salvar envia as listas; seletor troca a antecedência.

## Validation
```bash
cd barchop
pnpm --filter @barchop/database migrate:deploy            # dev; e o mesmo com o DATABASE_URL do apps/api/.env.test (tem BOM)
pnpm --filter @barchop/api test -- tests/routers/areas-decididas.test.ts   # + rotas tocadas
pnpm --filter @barchop/api-client test -- <arquivo do dublê>
pnpm --filter @barchop/web test -- tests/telas/painel/configuracoes
pnpm --filter @barchop/web type-check && pnpm --filter @barchop/api type-check
pnpm lint
```
Visual (PR B em diante): índice e subtelas no navegador via DevTools do ECC, 375px e 1440px, claro e escuro. Precisa de conta de teste local no painel (ver Risks).

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Quem já tem tudo configurado (GR Barber) aparecer com "1 de 4" | M | backfill de `horarios`; as outras áreas aparecem como Faltando até salvar — é o comportamento combinado ("salva uma vez") |
| PR B grande (repartir 723 linhas) | H | mover handlers sem reescrever; testes antigos migrados um a um antes de apagar o arquivo |
| `prisma generate` com EPERM (API de dev segura a DLL) | M | gerar com a API de dev desligada |
| Ver as telas no navegador sem conta no painel local | H | antes do PR B: criar barbearia de teste local (código lido do banco ou Resend desligado no `.env` de dev) — perguntar ao usuário |
| Memória baixa derrubando os servidores de dev | H | subir só o necessário pra conferir e derrubar depois |

## Acceptance
- [ ] PRs A–D mergeados
- [ ] `/painel/configuracoes` mostra "X de 4 decididas"; salvar uma área (mesmo sem mudar nada) faz ela contar
- [ ] Nada que se configura hoje deixou de ser configurável; recepção/profissional continuam vendo só o perfil
- [ ] Testes, tsc e lint limpos; telas conferidas no navegador
- [ ] Patterns mirrored, not reinvented
