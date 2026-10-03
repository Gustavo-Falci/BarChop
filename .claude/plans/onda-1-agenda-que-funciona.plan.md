# Plan: Onda 1 — Agenda que funciona (MVP + piloto)

**Source PRD**: `.claude/prds/barchop-saas.prd.md`
**Selected Milestone**: 1 — Onda 1 — Agenda que funciona (MVP + piloto)
**Complexity**: Large

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
4. **Jornada explícita, sem fallback silencioso.** `jornada_profissional` grava os 7 dias como o PUT de horários; ao criar o profissional ela nasce copiada do horário da barbearia. A janela efetiva é a interseção jornada ∩ funcionamento.
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
- **Action**: `request.membro`; `exigirPapel(...)`; matriz: dono tudo; recepção agenda/clientes de todos, sem config/equipe/serviços; profissional só a própria agenda (outro = 404, marcar pra outro = 403) e vê/cadastra clientes da barbearia — restringir aos clientes atendidos ficou fora do piloto (o walk-in chega pra qualquer profissional). Guarda no  da rota, antes da validação.
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
