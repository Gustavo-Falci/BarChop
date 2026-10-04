# Plan: Onda 1 — Agenda que funciona (MVP + piloto)

**Source PRD**: `.claude/prds/barchop-saas.prd.md`
**Selected Milestone**: 1 — Onda 1 — Agenda que funciona (MVP + piloto)
**Complexity**: Large

## Onde paramos (2026-10-04)
**Bloco A mergeado** na main (PR #14, `8ca5697`). **Bloco B completo** na branch `onda-1-bloco-b` (saída da main), cada tarefa com commit RED e GREEN — falta push e PR:

| Tarefa | Estado | O que ficou |
|---|---|---|
| B1 schema | feito | migrations `20261004120000_jornada_servicos_bloqueio` (tabelas, CHECKs, **triggers**) e `20261004120100_equipe_nasce_inteira` (backfill); jornada = 7 linhas por membro, modo `barbearia`/`proprio`/`folga` (decisão 4 revista, abaixo); trigger no insert do membro dá a semana e todos os serviços; trigger no insert do serviço o dá à equipe inteira |
| B2 rotas | feito | `GET/PUT /equipe/:id/jornada` e `/equipe/:id/servicos` (PUT só dono, na matriz); `routers/bloqueios.ts`: `GET/POST/DELETE /bloqueios`, dono e recepção de qualquer um, profissional só os dele (403 criar no colega, 404 apagar) |
| B3 disponibilidade | feito | `janelaEfetiva` (pura) = jornada ∩ funcionamento; `aplicarBloqueios`, `caiEmBloqueio`, `contextoDoDia` em `lib/disponibilidade.ts`; 422 `horario_bloqueado`, `servico_fora_do_profissional`, `profissional_nao_atende`; o mês faz uma consulta por tabela |
| B4 telas | feito | `JornadaDoMembro` e `ServicosDoMembro` na edição do membro; `FolgasEBloqueios` em `/painel/bloqueios` (link "Folgas" pra todos); api-client + dublê com as mesmas recusas |

Suítes no fim do B: API 482, web 492, api-client 75, formato 19; lint, type-check e `next build` verdes. Próximo: push e PR do Bloco B, depois o **Bloco C** (agenda da equipe: "qualquer um", passo de escolher profissional, agenda em colunas).

Dívidas novas do B (em `docs/roadmap.md`): o fluxo público ainda agenda com `barbeiros[0]` e mostra o catálogo inteiro — serviço que esse profissional não faz dá "Não foi possível carregar a agenda" (fecha no C2); a agenda do painel ainda não desenha os bloqueios (C3).

### Bloco C — em andamento (branch `onda-1-bloco-c`, saída da `onda-1-bloco-b`; PR empilhado sobre o #15 enquanto ele não for mergeado — perguntar antes de mergear o #15)
Decisões tomadas antes do RED (2026-10-04):
- **Candidato** ("qualquer um" e passo do profissional): ativo, atende, `senha_hash` não nulo e faz todos os serviços pedidos — uma constante/consulta só, a mesma do perfil público.
- **Uma função por profissional e dia** (janela efetiva, bloqueios, ocupados, `descartarPassados`) usada pela união do "qualquer um" e pela escolha no POST: todo horário oferecido tem que ser marcável. O mês recebe uma lista de `barbeiroId` e consulta cada tabela uma vez (`in`).
- **POST público sem `barbeiroId`**: `pg_advisory_xact_lock` por barbearia+data **só nesse caminho**, antes de ler candidatos; escolhe o livre com menos agendamentos no dia (empate: ordem de entrada). Com `barbeiroId` nada muda (409 `horario_ocupado` da EXCLUDE continua). Teste segura a trava de verdade; função da chave exportada.
- **Agendamento serializado ganha `barbeiro: {id, nome}`** (INCLUDE_AGENDAMENTO e o include próprio do histórico em `clientes.ts`); no dublê o campo é opcional na semente, padrão `bb1`.
- **C2**: perfil público com `servicoIds` por barbeiro; passo `/agendar/profissional` entre serviços e data, `?profissional=<id>` (ausente = qualquer um), **por último** no `montarQuery`; revalidado no passo de data (fora da lista ou não faz o serviço → `replace` pro passo do profissional); pulado quando só um candidato; mensagem quando ninguém faz a combinação; remarcar leva `profissional=<barbeiro.id do agendamento>`.
- **C3**: seletor de profissional no Novo agendamento e colunas por profissional na Agenda (com bloqueios), em pares RED/GREEN separados.

Progresso: **C1 feito** (`bb61d2e`): `candidatosDoQualquerUm`, `horariosDoProfissionalNoDia`, `diasComVaga`, `travarQualquerUm`/`chaveDoQualquerUm` e `PODE_ATENDER` em `lib/disponibilidade.ts`; `escolherProfissional` em `lib/agendamento.ts`; teste de concorrência prova a trava (sem ela, 409). Dublê aceita agendamento semeado sem `barbeiro` (`SementeFalsa`), completa com `bb1`, e o conflito passou a ser por profissional. Suítes: API 491, web 492, api-client 75. **C2 feito** (`4424241`): `EscolhaDoProfissional` em `/agendar/profissional`, `profissionaisQueFazem` em `src/fluxo/profissionais.ts`, `?profissional=` revalidado na `EscolhaDaData`, confirmação com "Com X"/"Com quem estiver livre" e o nome de quem ficou no sucesso, remarcar com o profissional original. Suítes: API 492, web 506 (uma falha intermitente vista uma vez em "bloqueia o almoço da Ana", não reproduziu em 5 execuções). **Próximo: C3** (painel).

### Bloco A (histórico)
Cada tarefa com commit RED e GREEN:

| Tarefa | Estado | O que ficou |
|---|---|---|
| A0 lint | feito | `pnpm lint` roda o ESLint da raiz; config em `barchop/packages/config/eslint.mjs` |
| A1 e-mail | feito | `apps/api/src/lib/canal-email.ts` (Resend); `CanalDeMensagem.destinos`; `CANAL_DE_MENSAGEM=email` exige `RESEND_API_KEY` e `EMAIL_REMETENTE` |
| A1b cliente por e-mail | feito | código, senha e login do cliente aceitam telefone ou e-mail; tela `/[slug]/entrar` por e-mail; 422 `destino_indisponivel` e `telefone_ja_cadastrado` |
| A2 papel | feito | migrations `20261003120000_papel_do_membro` e `20261003120100_dono_da_barbearia`; signup cria o dono; login recusa conta sem senha |
| A3 guardas | feito | `plugins/auth.ts`: `request.membro`, `exigirPapel` no `onRequest`, `agendaVisivel`; matriz em `apps/api/tests/routers/auth-papeis.test.ts` |
| A4 equipe e convite | feito | `routers/equipe.ts`; `POST /equipe` já manda o convite (409 `email_em_uso`, 422 `destino_indisponivel`); reenvio 422 `convite_desnecessario` pra quem tem senha; `POST /auth/convite/aceitar` só pra quem não tem senha; 422 `ultimo_dono` conta só donos ativos **com senha**, trava `FOR NO KEY UPDATE` na linha da barbearia; lista pública de barbeiros = ativo + atende + com senha, por `criadoEm` |
| A5 telas | feito | `ListaDaEquipe`, `CadastroDeMembro` (convidar e editar), `AceitarConvite` em `/painel/convite` (fora da guarda, `?email=` do link); `SoDoDono` nas páginas de Equipe e do cadastro de serviço; barra esconde Equipe de quem não é dono; Serviços só leitura e Configurações só "Seu perfil" pra quem não é dono; `recarregarPerfil` no `SessaoDoPainel`; dublê com `papel` semeável e as regras da API; `URL_DO_PAINEL` põe o link no e-mail do convite |

**Bloco A completo** e mergeado (PR #14), com teste de fumaça contra a API real. Suítes no fim do A5: API 438, web 482, api-client 68, formato 19.

Dívidas abertas no Bloco A (registradas em `docs/roadmap.md`): o Novo agendamento marca em quem está logado (a recepção marcaria em si mesma) até o C3; `POST /auth/senha` não devolve `papel`; convite e reenvio sem limite de envio; e-mail único na plataforma impede um profissional em duas barbearias.

Pra continuar em outra máquina: `git checkout onda-1-bloco-b` (ou a main, depois do merge do B), `pnpm install`, criar `apps/api/.env`, `apps/api/.env.test` e `packages/database/.env` a partir dos `.example`, e rodar `pnpm --filter @barchop/database migrate:deploy` nos bancos de dev e de teste (nunca `migrate dev`).

Pendências do dono antes do Bloco G: conta no Resend com o domínio `barchop.com.br` verificado; DNS do domínio na Cloudflare (certificado coringa por DNS-01).

## Summary
Transformar a barbearia de "um barbeiro só" em equipe: profissionais com papel (dono, profissional, recepção), jornada e folgas próprias, serviços que cada um faz; o cliente escolhe o profissional (ou "qualquer um") na página da barbearia, servida em `<slug>.barchop.com.br`; um lembrete por e-mail chega antes do horário e o cliente confirma ou cancela com um toque; o dono se cadastra e configura sozinho com uma trilha de onboarding; tudo rodando na OCI com a GR Barber.

A onda é grande demais para um PR só. Ela é executada em **7 blocos (A–G)**, cada um entregável sozinho, com `ecc:tdd-workflow` (commit RED, depois GREEN) e **um PR por bloco**. A ordem respeita dependências: equipe antes de jornada, jornada antes do fluxo público, e-mail antes de convite e lembrete.

**Verificação da Meta em standby (decisão do dono, 2026-10-03).** Nada da Onda 1 depende do WhatsApp oficial: o lembrete automático sai por e-mail; o painel ganha "lembrar pelo WhatsApp" que abre o `wa.me` com o texto pronto (envio manual, zero aprovação); o canal WhatsApp Cloud API fica só como interface, ligado por flag quando a Meta aprovar.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Naming | `barchop/apps/api/src/lib/padroes.ts:9` | Constantes `PADRAO_*`/`SCHEMA_*` compartilhadas, comentário com o porquê |
| Schema de rota | `barchop/apps/api/src/routers/horarios.ts:16` | JSON Schema `as const` no topo, `additionalProperties: false`, estado sem ambiguidade (7 dias sempre gravados) |
| Errors | `barchop/apps/api/src/lib/erro-negocio.ts:7` | `ErroDeNegocio(mensagem, codigo)` → 422 com código snake_case estável |
| Auth / escopo | `barchop/apps/api/src/plugins/auth.ts:79` e `app.ts:110` | Hook `onRequest` lê o banco a cada requisição; escopo por `app.register`, nunca hook rota a rota |
| Canal de mensagem | `barchop/apps/api/src/lib/canal.ts:12` | Interface `CanalDeMensagem` + `canalDoAmbiente` que recusa subir sem provedor real em produção |
| Disponibilidade | `barchop/apps/api/src/lib/disponibilidade.ts:33` | Funções puras (`horariosLivres`, `descartarPassados`) com "agora" injetado, comparação por string |
| Códigos | `barchop/apps/api/src/lib/codigos.ts:10` | `emitirCodigo`/`consumirCodigo` por `Finalidade`, hash, uso único |
| Limites | `barchop/apps/api/src/lib/limites.ts` | Contador nomeado por rota, montado no escopo `comLimite` |
| Migrations | `barchop/packages/database/prisma/migrations/20261002120000_senha_alterada_em` | SQL à mão, `migrate deploy` (nunca `migrate dev`), aditivo + backfill |
| Next 16 | `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` | O antigo `middleware.ts` agora é `proxy.ts` — ler o guia antes de escrever |
| Rotas web | `barchop/apps/web/app/(publico)/[slug]/…`, `app/(painel)/painel/(guardado)/…` | Route groups; telas em `src/telas`, CSS modules ao lado |
| Tests (API) | `barchop/apps/api/tests/routers/auth-barbeiro-senha.test.ts` | Vitest + `buildApp({ canal })` + `app.inject`, helpers em `tests/helpers/`, datas de `helpers/datas.ts` |
| Tests (web) | `barchop/apps/web/tests/telas/painel/entrar-no-painel.test.tsx` | Vitest + Testing Library contra o dublê do `api-client` |

## Decisões de desenho (propostas — confirmar no aceite)
1. **"Profissional" é o `barbeiro` de hoje.** Tabela e rotas mantêm o nome (sem rename gigante); entra `papel` (`dono | profissional | recepcao`) e `atende` (aparece na agenda e no fluxo público). Recepção nasce com `atende = false`. O primeiro barbeiro de cada barbearia vira `dono` no backfill.
2. **Papel lido no hook, não no token.** O `autenticar` já consulta o banco; passa a decorar `request.membro = { id, barbeariaId, papel }`. Guardas `exigirPapel("dono")` por escopo. Trocar o papel vale na próxima requisição.
3. **Convite = código de verificação.** Dono cria o profissional com e-mail e `senha_hash` nulo; o convite reaproveita `emitirCodigo` (finalidade `convite_profissional`, validade 7 dias) e o aceite reaproveita o caminho do `POST /auth/senha`. Login recusa conta sem senha.
4. **Jornada explícita, sem fallback silencioso** (revista no B1, 2026-10-04). `jornada_profissional` grava os 7 dias, cada um num modo explícito: `barbearia` (acompanha o funcionamento), `proprio` (horas do membro) ou `folga`; tudo nasce `barbearia`. Não é cópia do horário da barbearia, como dizia a versão anterior: o signup cria a barbearia sem horário (a cópia daria ao dono uma semana de folga) e a cópia congelaria a jornada quando o dono mudasse o horário. "Acompanha" é estado gravado e visível, não linha ausente. A janela efetiva é a interseção jornada ∩ funcionamento.
5. **Folga, almoço e bloqueio = uma tabela.** `bloqueio (barbeiro_id, data_inicio, data_fim, hora_inicio?, hora_fim?, motivo)`; hora nula = dia inteiro. Entra como "ocupado" no `horariosLivres` e é checado no criar/remarcar.
6. **Serviços por profissional explícitos.** `profissional_servico`; backfill: todo profissional faz todo serviço ativo; serviço novo entra para todos que `atende`.
7. **"Qualquer um"** = disponibilidade sem `barbeiroId` devolve a união; no criar, o servidor escolhe dentro da transação o profissional livre com menos agendamentos no dia (a `EXCLUDE` gist continua sendo a trava final).
8. **Lembrete por job, verificado na hora de rodar.** pg-boss atrás de `lib/fila.ts`; criar/remarcar agenda o job com `startAfter`; o job relê o agendamento e só envia se status e horário ainda batem (sem depender de cancelar job). Antecedência configurável por barbearia (padrão 24 h; opções 2/12/24 h).
9. **Confirmar/cancelar sem login.** Link assinado (JWT `tipo: "lembrete"`, `agendamentoId`, expira no horário) → `/[slug]/lembrete/[token]`. Nova coluna `presenca_confirmada_em`; cancelar passa por `garantirAlteravel`.
10. **Tenant pelo host no `proxy.ts`.** `<slug>.barchop.com.br/*` reescreve para `/[slug]/*`; `painel.` serve o painel; `www`/raiz ficam para o site (1s). Slug trocado grava em `slug_antigo` e responde 308 para o novo. A chave da sessão do cliente passa a ser o id da barbearia (fecha a dívida da revisão da Onda 0).
11. **Código do cliente por e-mail no piloto (decidido 2026-10-03).** Primeiro acesso e recuperação de senha do cliente saem por e-mail (Resend, Bloco A); cliente só com telefone agenda sem conta. SMS/WhatsApp ficam para quando a Meta sair do standby.

## Files to Change
| File | Action | Why |
|---|---|---|
| `barchop/packages/database/prisma/schema.prisma` + migrations `2026100x…` | UPDATE/CREATE | `papel`, `atende`, `foto_url`, `senha_hash` nulo; `jornada_profissional`; `bloqueio`; `profissional_servico`; `presenca_confirmada_em`; config de lembrete; campos da página rica; `slug_antigo`; categoria de serviço |
| `barchop/apps/api/src/plugins/auth.ts` | UPDATE | Decorar `request.membro` com papel; `exigirPapel`; login recusa senha nula |
| `barchop/apps/api/src/routers/equipe.ts` | CREATE | CRUD de profissionais, papel, serviços, convite/reenviar |
| `barchop/apps/api/src/routers/jornada.ts`, `bloqueios.ts` | CREATE | Jornada da semana e bloqueios por profissional |
| `barchop/apps/api/src/lib/disponibilidade.ts`, `routers/disponibilidade.ts` | UPDATE | Janela = jornada ∩ funcionamento; bloqueios como ocupados; união para "qualquer um" |
| `barchop/apps/api/src/lib/agendamento.ts`, `routers/agendamentos.ts`, `clientes-me.ts` | UPDATE | Validar serviço do profissional e bloqueio; escolher profissional em "qualquer um"; agendar lembrete |
| `barchop/apps/api/src/routers/barbearias.ts` | UPDATE | Página rica no público; `slug_antigo` no `PATCH /me/slug`; onboarding em `GET /barbearias/me/onboarding` |
| `barchop/apps/api/src/lib/canal.ts` + `lib/canal-email.ts` | UPDATE/CREATE | Mensagem com `assunto` opcional; canal Resend; canal WhatsApp só como interface atrás de `WHATSAPP_ATIVO` |
| `barchop/apps/api/src/lib/fila.ts`, `lib/lembrete.ts`, `src/worker.ts` | CREATE | pg-boss, job de lembrete, worker no mesmo processo da API |
| `barchop/apps/api/src/routers/lembrete.ts` | CREATE | `GET/POST /lembretes/:token` confirmar e cancelar |
| `barchop/apps/api/src/app.ts`, `server.ts` | UPDATE | Escopos novos; `trustProxy` e CORS por lista só com o proxy da OCI (bloco G) |
| `barchop/packages/api-client/src/*` + dublê | UPDATE | Métodos de equipe, jornada, bloqueios, lembrete, onboarding, página rica |
| `barchop/apps/web/proxy.ts` | CREATE | Tenant por host, `painel.`, redirect de slug antigo |
| `barchop/apps/web/src/sessao/armazenamento.ts` | UPDATE | Chave da sessão do cliente pelo id da barbearia |
| `barchop/apps/web/src/telas/painel/{Equipe,Profissional,FolgasEBloqueios,AceitarConvite,CadastroDoDono,Onboarding}.tsx` | CREATE | Telas novas do painel (screens.md, Onda 1) |
| `barchop/apps/web/src/telas/painel/{Agenda,DashboardDoDia,NovoAgendamento,ConfiguracoesDaBarbearia}.tsx` | UPDATE | Colunas por profissional, bloqueios visíveis, profissional vê só a própria, escolher profissional, config de lembrete e página rica |
| `barchop/apps/web/src/telas/{EscolhaDoProfissional,ConfirmarOuCancelar}.tsx` | CREATE | Passo do profissional; destino do link do lembrete |
| `barchop/apps/web/src/telas/{PerfilDaBarbearia,EscolhaDaData}.tsx` | UPDATE | Página rica; data por profissional (sai o `barbeiros[0]`) |
| `barchop/packages/config` + `package.json` de cada pacote | UPDATE | ESLint compartilhado (dívida "monorepo sem lint") |
| `barchop/infra/` (compose, Caddyfile, scripts) | CREATE | Deploy na VM da OCI |
| `barchop/docs/roadmap.md`, `screens.md`, `docs/adr/0009…` | UPDATE/CREATE | Estado por bloco; ADR do papel no hook e do lembrete por e-mail primeiro |
| testes em `apps/api/tests/**`, `apps/web/tests/**` | CREATE/UPDATE | RED antes de cada GREEN |

## Tasks

### Bloco A — Equipe e papéis (+ e-mail de verdade)
#### Task A0: Lint no monorepo
- **Action**: ESLint flat config em `packages/config`, script `lint` em cada pacote, `pnpm lint` verde (só regras que não reescrevem o código existente).
- **Validate**: `pnpm lint`.
#### Task A1: Canal de e-mail (Resend)
- **Action**: `Mensagem` ganha `assunto?`; `canalDeEmail` via Resend (`RESEND_API_KEY`, `EMAIL_REMETENTE`); `canalDoAmbiente` aceita `email`; códigos do barbeiro passam a sair por e-mail. Fecha metade da dívida "códigos só pelo log".
- **Mirror**: `lib/canal.ts` (recusa subir em produção sem provedor).
- **Validate**: `tests/lib/canal.test.ts` (escolha por ambiente; fetch mockado no Resend).
#### Task A1b: Código do cliente por e-mail
- **Action**: `POST /barbearias/:slug/auth/codigo` aceita e-mail como destino (além do telefone) e envia pelo canal de e-mail; tela `/[slug]/entrar` oferece entrar por e-mail.
- **Validate**: `auth-cliente-senha.test.ts` com destino e-mail; teste da tela.
#### Task A2: Schema de papel
- **Action**: migration aditiva: `papel` enum, `atende boolean`, `foto_url`, `senha_hash` nulo; backfill: mais antigo de cada barbearia = `dono`.
- **Validate**: `tests/banco.test.ts`; `migrate deploy` em dev e test.
#### Task A3: Papel no hook + guardas
- **Action**: `request.membro`; `exigirPapel(...)`; matriz: dono tudo; recepção agenda/clientes de todos, sem config/equipe/serviços; profissional só a própria agenda (outro = 404, marcar pra outro = 403) e vê/cadastra clientes da barbearia — restringir aos clientes atendidos ficou fora do piloto (o walk-in chega pra qualquer profissional). Guarda no `onRequest` da rota, antes da validação.
- **Validate**: `auth-papeis.test.ts` (matriz rota × papel, 403 `sem_permissao`).
#### Task A4: Rotas de equipe e convite
- **Action**: `GET/POST/PATCH /equipe`, `POST /equipe/:id/convite`, `POST /auth/convite/aceitar` (código + senha → sessão). Desativar não apaga histórico; não se pode desativar/rebaixar o último dono.
- **Validate**: `equipe.test.ts`, `auth-convite.test.ts`.
#### Task A5: Telas Equipe, Profissional, Aceitar convite
- **Validate**: testes de tela; navegação do painel esconde o que o papel não pode.

### Bloco B — Jornada, serviços por profissional, folgas e bloqueios
#### Task B1: Schema `jornada_profissional`, `bloqueio`, `profissional_servico` + backfill
#### Task B2: Rotas `PUT/GET /equipe/:id/jornada`, `/equipe/:id/servicos`, CRUD `/bloqueios`
- **Mirror**: `routers/horarios.ts` (7 dias sempre gravados).
#### Task B3: Disponibilidade por profissional
- **Action**: janela = jornada ∩ funcionamento; bloqueios entram como ocupados; profissional que não faz o serviço → 422 `servico_fora_do_profissional`; criar/remarcar recusam horário em bloqueio (`horario_bloqueado`).
- **Validate**: `tests/lib/disponibilidade.test.ts` (puro), `disponibilidade-*.test.ts`, `agendamentos-*.test.ts`.
#### Task B4: Telas Profissional (jornada + serviços) e Folgas e bloqueios

### Bloco C — Agenda da equipe (cliente e painel)
#### Task C1: "Qualquer um"
- **Action**: disponibilidade dia/mês sem `barbeiroId` = união dos que fazem todos os serviços; `POST` público sem `barbeiroId` escolhe na transação o livre com menos agendamentos no dia.
- **Validate**: testes de rota com 2 profissionais e conflito simultâneo.
#### Task C2: Passo "Escolher profissional" no fluxo público
- **Action**: tela entre serviços e data, com fotos e "qualquer um"; `EscolhaDaData` deixa o `barbeiros[0]`; público só lista `atende = true`.
#### Task C3: Painel — novo agendamento escolhe profissional; agenda em colunas por profissional com bloqueios; painel do dia por profissional; profissional vê só a própria
- **Validate**: testes das telas e das rotas com papel `profissional`.

### Bloco D — Lembrete com confirmar/cancelar
#### Task D1: Fila pg-boss atrás de `lib/fila.ts`
- **Action**: `agendar(nome, dados, { startAfter, singletonKey })`; worker sobe com a API (`server.ts`), não no `buildApp` dos testes; implementação de memória para teste.
- **Validate**: `tests/lib/fila.test.ts`.
#### Task D2: Job de lembrete
- **Action**: criar/remarcar agenda o job (chave = agendamento + horário); job relê e só envia se status ∈ {confirmado, pendente} e o horário bate; cliente sem e-mail → nada (registrado). Config `lembrete_antecedencia_horas` na barbearia.
- **Validate**: `tests/lib/lembrete.test.ts` com relógio controlado.
#### Task D3: Link assinado + rotas `GET/POST /lembretes/:token/{confirmar,cancelar}`
- **Action**: `presenca_confirmada_em`; cancelar respeita `garantirAlteravel`; token expira no horário.
- **Validate**: `lembrete.test.ts` (token de outro tipo → 401, expirado → 410, dupla confirmação idempotente).
#### Task D4: Tela "Confirmar ou cancelar" + selo "confirmou presença" na agenda + botão "lembrar pelo WhatsApp" (`wa.me` com texto e link) + e-mail incentivado no passo de dados
#### Task D5: Canal WhatsApp Cloud API só como interface + flag `WHATSAPP_ATIVO` (desligada); ADR-0009 registra "e-mail primeiro, Meta em standby"

### Bloco E — Página da barbearia no endereço próprio
#### Task E1: Página rica
- **Action**: campos: capa, comodidades, WhatsApp, Instagram, mapa (link pelo endereço), formas de pagamento, categoria de serviço; público devolve equipe com foto e os 3 próximos horários livres por serviço.
#### Task E2: Imagens
- **Action**: upload direto ao bucket (OCI Object Storage, API S3) por URL pré-assinada; API só valida tipo/tamanho e grava a URL.
#### Task E3: `proxy.ts` de tenant
- **Action**: host → reescrita para `/[slug]`; `painel.` → painel; `slug_antigo` → 308; `/[slug]` segue como fallback local; chave da sessão do cliente pelo id.
- **Validate**: testes unitários da função de resolução de host (pura) + teste de rota do 308.

### Bloco F — Cadastro self-service e onboarding
#### Task F1: Tela "Cadastro do dono" (sai do primeiro acesso do `/painel/entrar`), prévia do link, slug validado com `slugValido()`
#### Task F2: `GET /barbearias/me/onboarding` (estado derivado: horários, serviços, equipe, link copiado, primeira reserva) + tela de trilha no painel
#### Task F3: Verificação de e-mail do dono no cadastro (fecha a dívida do `409` que revela e-mail)

### Bloco G — Produção na OCI e piloto
#### Task G1: `infra/`: docker compose (api+worker, web, postgres com backup diário), Caddy com certificado coringa por DNS-01
#### Task G2: `trustProxy` atrás do Caddy, CORS por lista, `CANAL_DE_MENSAGEM=email`, segredos fora do repo
#### Task G3: GR Barber migrada: dados atuais, equipe real, jornada; medir linha de base de faltas (open question do PRD) antes de ligar o lembrete
#### Task G4: Roteiro/screens.md/PRD atualizados; linha 1 do PRD → `complete` só com o piloto rodando

## Validation
```bash
cd barchop
pnpm lint
pnpm type-check
pnpm --filter @barchop/api test
pnpm --filter @barchop/web test
pnpm --filter @barchop/api-client test
pnpm --filter @barchop/formato test
pnpm --filter @barchop/database exec prisma migrate deploy   # dev e test, nunca migrate dev
pnpm --filter @barchop/web build                             # pega erro de proxy.ts/rotas do Next 16
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Cliente só com telefone não recebe lembrete por e-mail → métrica de faltas não se mexe | High | Pedir e-mail no passo de dados (opcional, com o porquê); botão `wa.me` no painel para os sem e-mail; WhatsApp automático quando a Meta sair do standby |
| Código de primeiro acesso do cliente não tem canal em produção (telefone sem WhatsApp/SMS) | High | Decidido: código por e-mail no piloto (decisão 11); agendar continua sem conta |
| Papel espalhado em ~10 routers abre brecha (profissional vê agenda alheia) | Medium | Matriz rota × papel num teste só (A3), escopos por `register` |
| "Qualquer um" sob concorrência | Medium | Escolha dentro da transação; `EXCLUDE` gist como trava final; teste com requisições simultâneas |
| Certificado coringa exige DNS com API (o Registro.br não tem) | Medium | Apontar o DNS do `barchop.com.br` para a Cloudflare antes do bloco G |
| Next 16 mudou convenções (`proxy.ts`) | Medium | Ler `node_modules/next/dist/docs` antes do E3; `next build` na validação |
| Worker pg-boss no mesmo processo derruba a API se travar | Low | Concorrência baixa, timeout no job, processo separado é só trocar o entrypoint |
| Onda cresce além do piloto | High | Um PR por bloco; nada fora desta lista sem passar pelo PRD |

## Acceptance
- [ ] Blocos A–G completos, cada um com PR
- [ ] Validação passa em todos os pacotes
- [ ] Patterns mirrored, not reinvented
- [ ] GR Barber em produção no subdomínio dela, com equipe, jornada e lembrete por e-mail ligado
- [ ] Roteiro e screens.md refletem o que entrou; dívidas fechadas saem da lista
