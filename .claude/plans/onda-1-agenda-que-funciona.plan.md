# Plan: Onda 1 — Agenda que funciona (MVP + piloto)

**Source PRD**: `.claude/prds/barchop-saas.prd.md`
**Selected Milestone**: 1 — Onda 1 — Agenda que funciona (MVP + piloto)
**Complexity**: Large

## RETOMAR AQUI (2026-10-07, noite — marco 3 completo, tudo em produção) — vale mais que as seções abaixo

**Estado:** `main` = produção = `e9f68f0` (VM atualizada e conferida). Nada pela metade em branch nenhuma.

**Feito depois do bloco abaixo (PRs #65–#72):**
- Marco 3 do painel v2 **completo**: 3e #65 regras na API (migration `20261009120000_regras_de_agendamento`), 3f #66 tela Regras + 5ª área + Novo agendamento com token, 3g #67 cliente obedece os prazos (botões somem + WhatsApp/telefone da casa).
- Página pública sem a fita listrada, com ou sem capa (#68, #69).
- **Todas as telas horizontais no desktop** (pedido do dono): Configurações (#66), painel (#71), fluxo do cliente (#72), termos/privacidade (#70). Peças `apps/web/src/componentes/Colunas` (`LadoALado`, `CamposLadoALado`). Tela nova já nasce assim.
- **Onda 1s-b** (#70): `/termos`, `/privacidade`, links no rodapé, aceite no cadastro. Razão social, CNPJ e e-mail do DPO "a preencher" em `apps/web/src/site/controlador.ts` (o dono ainda não tem).

**O que falta (perguntar ao dono a ordem):**
1. `onda-1s-c` — robots, sitemap, description/Open Graph, docs (Task 3 do plano `onda-1s-site-de-marketing.plan.md`). Era o próximo.
2. Marco 4 do painel v2 — Hoje (plano a criar com `ecc:plan` do PRD `painel-v2.prd.md`); depois marcos 5 e 6.
3. G3 (GR Barber com `lembrete_ativo = false`) e G4 (docs).
4. Soltas: dados legais a preencher; telas do 3g e várias horizontais não vistas no navegador; `barbearia-teste` em produção.

**Combinados (atualizados):** um PR por item, TDD RED → GREEN, português; **push, PR e merge por mim** com testes verdes (o dono reafirmou em 2026-10-07); telas novas com aprovação visual antes do merge. Deploy: o dono roda na VM (PC de casa ou notebook, MobaXterm), **um comando por vez**: `git pull` → `docker compose build api` (+ `migrar` se tiver migration) → `build web` → `up -d`; eu confiro produção com curl.

## RETOMAR AQUI (2026-10-07, fim do dia — marco 3 do painel v2 pela metade) — histórico

**Estado:** `main` em #63, nada pela metade em branch nenhuma. Produção no ar (G1); na VM roda a `main` até o #61.

**Feito hoje:** G1 (#56, #57, conferido de ponta a ponta, ver a seção abaixo); dívida dos ícones (#59: o que não pode ser link de barbearia não consulta a API); marco 3 do painel v2 (plano `painel-v2-regras-de-agendamento.plan.md`, decisões do dono lá dentro):
- **3a** #60 — pausa do almoço na jornada de cada profissional (API; migration `20261008120000_jornada_pausa`; `horario_na_pausa`). **Em produção.**
- **3b** #61 — pausa nas telas (jornada do membro + "Pausas da equipe" em Horários). **Em produção.**
- **3c** #62 — exceções por data da barbearia (API; migration `20261008130000_excecao_horario`; `GET/PUT/DELETE /barbearias/me/horarios/excecoes[/:data]`, `foraDoHorario`). **Não está na VM.**
- **3d** #63 — "Datas especiais" em Horários; `Aviso` ganhou o tom `atencao`. **Não está na VM** e o dono ainda não viu no navegador.

**Primeiro amanhã:** levar 3c+3d pra VM, um build por vez (1 OCPU; o `--build` de tudo junto levou 413 s e arrisca memória):
`cd ~/BarChop && git pull && cd barchop/infra && docker compose build migrar api && docker compose build web && docker compose up -d`; conferir `docker compose logs migrar | grep excecao_horario` e `curl -sI https://api.barchop.com.br/health`. Depois o dono olha Horários (pausas + datas especiais) em 375px e 1440px.

**3e feito** (regras de agendamento na API; diferenças do previsto no plano do marco 3). **Próximo no código:** **3f**. Histórico do 3e: Regras de agendamento na API, o maior PR do marco (7 colunas em `barbearia`, padrões = comportamento de hoje, só pra `origem = cliente`; token de membro desliga as regras na disponibilidade; prazos de remarcar/cancelar no `garantirAlteravel` dos caminhos do cliente). Depois **3f** (tela Regras, 5ª área, "X de 5") e **3g** (cliente obedece os prazos: botões somem + WhatsApp da casa). Fora do marco 3: G3 (GR Barber), `onda-1s-b`/`onda-1s-c`, dívidas do roadmap.

**Ao trocar de máquina:** em `barchop/`: `git checkout main && git pull`; `pnpm install` (se pedir pra recriar o `node_modules`: `pnpm install --config.confirmModulesPurge=false`); `migrate deploy` nos bancos dev **e** test (`pnpm --filter @barchop/database migrate:deploy`, e o mesmo com o `DATABASE_URL` do `apps/api/.env.test`, que tem BOM) — migrations novas desde 06/10: `20261008120000_jornada_pausa`, `20261008130000_excecao_horario`; `pnpm --filter @barchop/database generate` com a API de dev **parada** (EPERM na DLL do Prisma — pedir ao dono pra parar). Subir: `pnpm dev` em `apps/api` (3333) e `apps/web` (3000).

**Combinados (atualizados 2026-10-07):** um PR por item, TDD com commit RED e depois GREEN, português; push, PR **e merge** sem perguntar quando os testes passam (o dono reafirmou: "quero que vc de merge as PRs"). Telas novas: aprovação visual do dono antes do merge. Rodar os testes afetados + tsc + lint, e a suíte inteira quando mexer em `lib/disponibilidade.ts` ou `lib/agendamento.ts`. Skills só do ECC.

## RETOMAR AQUI (2026-10-07, G1 no ar) — histórico

**Produção no ar** (G1, plano `onda-1-g1-infra.plan.md`): PRs #56 (G1a: web standalone, `criar-suporte` no bundle) e #57 (G1b: `barchop/infra/`) mergeados pelo dono (o modo automático bloqueia `gh pr merge`: pedir o merge ao dono). Na VM (`~/BarChop`, na `main`; atualizar = `git pull` + `docker compose up -d --build` em `barchop/infra`): compose com postgres 18, migrar, api, web, caddy e backup; certificados da raiz e do coringa emitidos; `api.`, raiz e `painel.` respondendo 200; log do Caddy com `/lembretes/***`. VM: Ubuntu 26.04 ARM, 1 OCPU, 5,8 GB + swap 4 GB; iptables com 80/443/443udp salvos; Docker 29.8. Bucket `barchop-imagens` (namespace `grljjvpwv9ed`, `sa-saopaulo-1`), Customer Secret Key e chave do Resend nos `infra/.env` e `infra/api.env` da VM (só lá). Token da Cloudflare com Zone:Read + DNS:Edit. Acesso à VM pelo MobaXterm do PC de casa; repo público, clone por HTTPS.

**G1 conferido de ponta a ponta (2026-10-07):** conta de suporte de produção criada (e-mail do dono), fila do suporte abre vazia, cadastro de barbearia com o código chegando pelo Resend, capa subindo pro bucket e aparecendo em `<slug>.barchop.com.br`. A API vê o IP real do cliente (trustProxy ok). Ficou em produção a barbearia de teste `barbearia-teste` — apagar ou manter até o G3.

- **Onda 1:** blocos A–F, F4, G1 e G2 completos. Faltam **G3** (GR Barber entra com `lembrete_ativo = false`) e **G4** (docs).
- **Onda 1s (site):** #40 (home em `/`) feito; faltam `onda-1s-b` (termos + aceite no cadastro) e `onda-1s-c` (robots/sitemap/docs). Plano `onda-1s-site-de-marketing.plan.md`.
- **Serviços com foto e descrição:** #42–#44 feitos (plano `servicos-com-foto-e-descricao.plan.md`). Candidato: foto + descrição também na PerfilDaBarbearia.
- **Painel v2** (PRD `.claude/prds/painel-v2.prd.md`, 6 marcos): **marco 1** peças comuns completo (#45–#47, plano `painel-v2-pecas-comuns.plan.md`); **marco 2** Configurações em decisões completo (#48–#51, plano `painel-v2-configuracoes.plan.md`) + ajustes visuais pedidos pelo dono (#52 cartão em pé, #53 Identidade com os 2 quadros lado a lado, #54 "Próxima área faltando" no canto inferior direito).

**Próximo — perguntar ao dono qual:** marco 3 do painel v2 (**Regras de agendamento**, inclui pausa do almoço e exceções por dia; criar plano com `ecc:plan` a partir do PRD do painel v2) **ou** G3 (GR Barber).

**Ao trocar de máquina:** `git checkout main && git pull`, `pnpm install`, `migrate deploy` nos bancos dev **e** test (em `packages/database`; `.env.test` tem BOM; migrations novas desde 05/10: `lembrete_ativo`, `servico_descricao_foto`, `areas_decididas`, `areas_decididas_horarios`), `prisma generate` com a API de dev desligada (EPERM na DLL). Subir: `pnpm dev` em `apps/api` (3333) e `apps/web` (3000).

**Combinados de trabalho:** um PR por item, TDD com commit RED e depois GREEN, mensagens/PRs em português; push, PR e merge sem perguntar quando os testes passam. Rodar só os testes afetados + tsc + lint. Skills só do ECC (`ecc:*`), nunca superpowers.

## RETOMAR AQUI (2026-10-05, fim do dia)

**Estado:** `main` em PR #35. Onda 1: blocos A–F e **F4 completos**. Nada pela metade em branch nenhuma. Falta só o **G** (produção na OCI e piloto).

**O G começa pelo DNS, feito pelo dono nas contas (eu oriento):**
1. Cloudflare (Free): "Add a site" `barchop.com.br`, anotar os 2 nameservers.
2. Registro.br: desligar o DNSSEC se estiver ligado; trocar os servidores DNS pelos da Cloudflare; esperar a zona ficar "Active" (horas, até 48 h).
3. Com o IP público da VM da OCI: `A @` e `A *` (coringa) → IP, em "DNS only" — o TLS é do Caddy.
4. Token de API da Cloudflare só com `Zone → DNS → Edit` na zona, pro Caddy emitir o coringa por DNS-01. Segredo da VM: nunca no repo nem no chat.
5. Resend: adicionar o domínio, criar na Cloudflare os TXT/MX que ele pedir, esperar "Verified".

**G2 em três PRs (começado 2026-10-05, enquanto o DNS propaga):** **G2a feito** (branch `onda-1-bloco-g2a`): `lib/borda.ts` — `PROXIES_CONFIAVEIS` (saltos de proxy, vira `trustProxy` em forma de função porque os tipos do Fastify não aceitam número) e `ORIGENS_PERMITIDAS` (lista com coringa de um nível, `https://*.barchop.com.br`); em produção a API não sobe sem as duas; `buildApp({ ambiente })` pros testes. **G2b feito** (branch `onda-1-bloco-g2b`): limites no `POST` público de agendar (5/h por e-mail do lembrete, só quando há e-mail; 20/h por IP), nos próximos horários (60/min por IP) e no convite+reenvio da equipe (20/dia por barbearia, no escopo protegido). **Bug achado e corrigido:** o handler do `rateLimit()` do plugin marca a requisição na primeira passagem e pula os outros contadores da mesma rota — os limites por IP de auth (o 2º de cada lista) nunca rodavam; `contador` agora usa `createRateLimit` e lança o 429 com `Retry-After`. Intermitente visto: `tests/lib/fila.test.ts` (pg-boss real) às vezes não entrega o trabalho a tempo nesta máquina. **G2c feito** (branch `onda-1-bloco-g2c`): migration `20261005120000_lembrete_ativo` (`barbearia.lembrete_ativo`, ligado por padrão — decisão do dono 2026-10-05); desligado, `agendarLembrete` não enfileira e `enviarLembrete` descarta o que já estava na fila (sem marcar); `PATCH /barbearias/me` com `lembreteAtivo`, e só a virada desligado→ligado chama `enfileirarLembretesFuturos` (ativos, não lembrados; piso de 1 h como sempre); chave "Enviar lembrete por e-mail" na seção Lembrete de Configurações. **No G3:** a GR Barber migrada entra com `lembrete_ativo = false`. **G2 completo.** Ao trocar de máquina: `migrate deploy` nos dois bancos (migration nova).

**Depois, código (um PR por item, TDD, push+PR+merge sem perguntar):** G1 `infra/` (compose api+worker, web, postgres com backup, Caddy coringa) → G2 `trustProxy`, CORS por lista, limites nas rotas públicas, interruptor do lembrete, `CANAL_DE_MENSAGEM=email` → G3 GR Barber (medir faltas antes de ligar o lembrete) → G4 docs. Conferir no navegador as telas do F4c/F4d (não vistas: a extensão do Chrome não conectou).

## Histórico do F4 (2026-10-05)

**Estado:** Onda 1: blocos **A–F completos** (PRs #14–#30), **F4 completo**: F4a (PR #31), F4b (PR #33), F4c (PR #34) e F4d (branch `onda-1-bloco-f4d`). Próximo: **G**.

**Ao chegar no outro computador:** `git fetch && git checkout main && git pull`; `pnpm install`; aplicar as migrations novas nos DOIS bancos — `pnpm --filter @barchop/database migrate:deploy` (dev) e o mesmo com `DATABASE_URL` do `apps/api/.env.test` (atenção: esse arquivo tem BOM; `sed '1s/^\xEF\xBB\xBF//'` antes do grep); `pnpm --filter @barchop/database generate` com a API de dev DESLIGADA (ela trava a DLL do Prisma → EPERM). Migrations desta leva: `20261004180000_slug_antigo`, `20261004190000_onboarding`, `20261004200000_suporte`. Conferir: API 681, web 624, api-client 131, formato 24.

**O que falta, em ordem (um PR por item, TDD com commit RED e GREEN, push+PR+merge sem perguntar):**

1. ~~F4b~~ **feito** (branch `onda-1-bloco-f4b`): `packages/api-client/src/suporte.ts` (`criarApiSuporte`, em `criarApiClient().suporte`), os três métodos do pedido em `barbeiro.ts`, tipos em `packages/types`; dublê com `solicitacoesDeLink` e `slugsEmUso` na semente, a fila mostra a barbearia do dublê com o nome e o link de agora, aprovar com o link em `slugsEmUso` é 409 e deixa pendente (como a API). Testes em `packages/api-client/tests/solicitacao-de-link.test.ts` (23). O que era a especificação: Tipos em `packages/types`: `SolicitacaoDeLink { id, slugPedido, motivo, status: "pendente"|"aprovada"|"recusada"|"cancelada", resposta, criadoEm, decididoEm }`, `SolicitacaoNaFila = SolicitacaoDeLink & { barbearia: { id, nome, slug } }`, `SessaoSuporte { token, operador: { id, nome, email } }`. Em `barbeiro.ts`: `solicitacaoDeLink()` (GET `/barbearias/me/solicitacao-de-link` → `.solicitacao`, pode ser null), `pedirTrocaDeLink(slug, motivo?)` (POST), `cancelarPedidoDeLink()` (POST `/cancelar`). Novo `suporte.ts` registrado em `criarApiClient` (`index.ts`): `login(email, senha)` sem token (POST `/suporte/login`), `solicitacoes()` (GET `/suporte/solicitacoes` → `.solicitacoes`), `aprovar(id)`, `recusar(id, resposta)`. O painel do suporte monta um client próprio com `obterToken` da sessão do suporte. Dublê (`falso.ts`): semente `solicitacoesDeLink?: SolicitacaoNaFila[]` e `slugsEmUso?: string[]`; mesmas recusas da API — 403 `sem_permissao` pra quem não é dono, 422 `slug_reservado` (usar `slugReservado` do `@barchop/formato`) e `slug_igual_ao_atual` (`estado.perfil.slug`), 409 `conflito` (slug em `slugsEmUso`) e 409 `solicitacao_pendente`; cancelar sem pendente → 404; suporte: credenciais falsas exportadas (`EMAIL_DO_SUPORTE_FALSO`/`SENHA_DO_SUPORTE_FALSA`), senão 401 `credenciais_invalidas`; aprovar/recusar inexistente → 404, já decidido → 422 `solicitacao_decidida`; aprovar da própria barbearia troca `estado.perfil.slug`. Testes no padrão de `packages/api-client/tests/onboarding.test.ts`.
2. ~~F4c~~ **feito** (branch `onda-1-bloco-f4c`): seção própria "Link da barbearia" em Configurações (campo só leitura com o endereço pelo host; sem pedido ou com o último cancelado/aprovado, formulário "Novo link" + "Motivo (opcional)" + "Pedir troca", validação de formato, reservado e igual ao atual na tela, 409 `conflito` no campo, `solicitacao_pendente` relê; pendente mostra o link pedido, o motivo e "Cancelar pedido"; recusado mostra a resposta do suporte e o formulário). A resposta do pedir/cancelar entra por cima da leitura, sem reler. `SessaoDoPainel` relê `GET /barbearias/me` ao abrir e regrava o slug (falha não fecha o painel). Cadastro avisa que o link só muda pelo suporte. `PATCH /barbearias/me/slug` saiu da API (404), e o `trocarSlug` do api-client e do dublê; `slug-antigo.test.ts` troca pela lib numa transação; a matriz de papéis ganhou as três rotas do pedido. O que era a especificação: Configurações: o campo "Link da barbearia" vira **só leitura** (mostra `enderecoDaBarbearia`), com formulário "Pedir troca do link" (novo link + motivo, validação espelhada: formato/reservado/igual ao atual), o status do pedido pendente com botão Cancelar, e a última decisão (recusada mostra a resposta do suporte). `SessaoDoPainel`: ao abrir, reler o slug em `GET /barbearias/me` e gravar em `sessaoDaBarbearia` (senão, depois de uma aprovação, o Novo agendamento chama a disponibilidade pública com o slug velho e quebra — desde o E3a as outras rotas públicas só aceitam o slug atual — e a trilha copiaria o link velho). Cadastro do dono (`CadastroDoDono`): avisar no apoio do link que depois ele só muda pelo suporte. **Só neste PR** sai o `PATCH /barbearias/me/slug` da API (`routers/barbearias.ts`) e os testes dele (`barbearias-me.test.ts` e `slug-antigo.test.ts` usam o PATCH pra preparar slug antigo — trocar por `trocarSlug` de `lib/slug.ts` numa `prisma.$transaction`), e o `trocarSlug` do api-client e do dublê.
3. ~~F4d~~ **feito** (branch `onda-1-bloco-f4d`): `sessaoDoSuporte` (chave `sessao.suporte`), `apiDoSuporte` em `cliente-da-api.ts`, `src/suporte/ProvedorDoSuporte.tsx`; telas `src/telas/suporte/EntrarNoSuporte.tsx` (`/painel/suporte/entrar`, sem esqueci-a-senha nem cadastro) e `FilaDoSuporte.tsx` (`/painel/suporte`, guarda no efeito como o `SessaoDoPainel`; cada pedido é um `<article>` com barbearia, link atual → pedido, motivo e data no fuso de São Paulo; Aprovar; Recusar abre a resposta obrigatória; 409 avisa "link tomado" e abre a recusa; 404/`solicitacao_decidida` tira da fila; 401 limpa só a sessão do suporte). Rodado contra a API real com curl (a extensão do Chrome não conectou nesta máquina): PATCH antigo 404, pedido do dono, token de barbeiro 401 no suporte, fila, aprovação, `GET /barbearias/me` e o link antigo devolvendo o novo, dono lendo `aprovada`; as três páginas respondem 200 no `next dev`. **As telas não foram vistas no navegador** — ver no G. O que era a especificação: Em `/painel/suporte/...` FORA do `(guardado)` (como `/painel/entrar`), sessão própria (`sessaoDoSuporte` em `src/sessao/armazenamento.ts`, chave `sessao.suporte`): `/painel/suporte/entrar` (login) e `/painel/suporte` (fila de pendentes: barbearia, link atual → pedido, motivo, data; Aprovar; Recusar com resposta obrigatória; 409 na aprovação = "link tomado no meio, recuse com uma resposta"). O host `painel.` já serve `/painel/*` sem mexer no proxy. Rodar de verdade: criar conta de dev com `SENHA_DO_SUPORTE='...' pnpm --filter @barchop/api criar-suporte "Suporte" suporte@barchop.com.br`.
4. Depois do F4: **G** (produção na OCI e piloto) — a lista do que falta está no fim de `barchop/docs/roadmap.md` (limites nas rotas públicas, `trustProxy`, CORS por lista, interruptor do lembrete, bucket S3, Resend com domínio, `NEXT_PUBLIC_URL_DO_SITE`/`URL_DAS_BARBEARIAS`/DNS coringa/Caddy com Host, conta de suporte de produção).

**Testes intermitentes vistos em 2026-10-05 (máquina mais lenta):** API `auth-limites.test.ts` "recusa a tentativa seguinte ao limite" (falhou 1× na suíte inteira, passa isolado) e web `cadastro-do-dono.test.tsx` "manda o código pro e-mail…" (~2,7 s normal, às vezes passa dos 5 s do Vitest). Não tocados; se voltarem, dar folga de tempo ou encurtar a digitação.

**Decisões do dono que valem daqui pra frente:** link (slug) único PRA SEMPRE e trocado só pelo suporte numa tela de suporte; nome exibido o dono edita livre; e-mail do dono verificado antes de criar a conta; "Trabalho sozinho" fecha o passo da equipe na trilha; push+PR+merge sem perguntar ao fim de cada tarefa.

## Onde paramos (2026-10-04)
**Blocos A, B e C mergeados** na main (PRs #14, #15, #16). **Bloco D completo**: D1 a D5 mergeados na main, um PR por tarefa (PRs #17 a #21). **Bloco E em andamento.** E1 (página rica) na branch `onda-1-bloco-e`: migration `20261004160000_pagina_da_barbearia` (whatsapp, instagram, comodidades e formas de pagamento com CHECK da lista de `@barchop/formato/pagina.ts`; categoria no serviço); `GET /barbearias/:slug/proximos-horarios` (3 por serviço em 14 dias, união do "qualquer um", `agendaDoPeriodo` com uma consulta por tabela, também usado pelo `diasComVaga`); página pública com categorias, próximos horários levando à confirmação, Contato/Comodidades/Pagamento; Configurações "Página da barbearia"; categoria no cadastro de serviço. Capa e fotos ficaram inteiras pro E2 (upload + URL só do bucket). Rodado de verdade no Chrome (desktop e celular). Suítes: API 592, web 557, api-client 94, formato 19. Escolhas de produto a confirmar com o dono: comodidades = wifi, ar-condicionado, estacionamento, acessibilidade, café, bebidas, TV, espaço kids; pagamento = pix, dinheiro, débito, crédito. E1 mergeado (PR #22). **E2 (imagens) feito** na branch `onda-1-bloco-e2`: o upload passa **pela API** — a OCI aceita POST pré-assinado com `content-length-range`, mas o CORS do Object Storage atual não ficou confirmado, e pela API o tipo é conferido pelos bytes em produção também. `lib/armazenamento.ts` (local em dev/testes, S3 da OCI path-style pronto; produção recusa o local); migration `20261004170000_imagens_por_chave` (guarda a chave, a URL sai da config; `foto_url`, nunca usada, virou `foto_chave`); `POST/DELETE /barbearias/me/capa` e `/equipe/:id/foto` (só dono, multipart num escopo filho, png/jpeg/webp pelos bytes, 4 MB/2 MB); `GET /arquivos/*` só no local. Web: `CampoDeImagem`, redimensionamento no navegador (1600 px, JPEG — tira o EXIF/GPS), capa em Configurações, foto na edição do membro, capa e Equipe na página pública. Rodado de verdade: PNG 2400×1350 virou JPEG 1600×900 de 23 KB. Suítes: API 618, web 565, api-client 99. Sem bucket na OCI ainda (decisão do dono): o S3 liga no G. E2 mergeado (PR #23). **E3 em três PRs.** **E3a (API) feito** na branch `onda-1-bloco-e3a`: migration `20261004180000_slug_antigo` — **tabela** (`slug` PK → `barbearia_id`), não coluna: a coluna guardaria só a última troca. O atual de qualquer barbearia ganha do antigo (signup e `PATCH /me/slug` apagam a linha na mesma transação; voltar ao nome anterior também). `GET /barbearias/:slug` acha pelo antigo e devolve o `slug` atual — as outras rotas públicas só aceitam o atual. `lib/endereco.ts`: `URL_DAS_BARBEARIAS` (molde com `{slug}`, sem ele a API não sobe) põe o link do lembrete (e-mail e wa.me) em `<slug>.barchop.com.br/lembrete/<token>`; sem ela, `URL_DO_PAINEL/<slug>`. Suíte API 632. E3a mergeado (PR #24). **E3b feito** (branch `onda-1-bloco-e3b`): `apps/web/proxy.ts` + `src/tenant/rota.ts` (`decidirRota`), ligado por `NEXT_PUBLIC_URL_DO_SITE` (ausente = nada muda); `allowedDevOrigins: ["*.localhost"]`; matcher só tira `_next/`, `__next` e favicon/robots/sitemap — **não** "todo caminho com ponto" como na doc, porque o token JWT do lembrete tem pontos; o utilitário de teste se chama `unstable_doesMiddlewareMatch` (a doc diz `doesProxyMatch`, não existe no 16.3.3). Rodado de verdade (API + web, Chrome em `barbearia-do-gu.localhost:3000`): reescrita, 308s e navegação cliente funcionam, sem aviso de hidratação; **`usePathname()` devolve o caminho do navegador (`/`)**, então a `BarraDaBarbearia` aparece na home duplicando o h1 — conserto no E3c. Com a API de dev rodando, o `pnpm type-check` cai no `prisma generate` (EPERM na DLL); rodar `tsc --noEmit` por pacote. Suítes: web 591, formato 20. E3b mergeado (PR #25). **E3c feito** (branch `onda-1-bloco-e3c`): `useNoHost()` (`src/tenant/ProvedorDoHost.tsx`) embrulha todo link e `router.push` do fluxo — as funções puras (`caminhoDoPasso`, `caminhoDoLogin`) continuam devolvendo `/<slug>/…` e os testes antigos não mudaram; o layout de `/[slug]` virou async, lê `x-barchop-barbearia` e `x-barchop-caminho` do proxy, provê o host e redireciona slug antigo com 307 (`destinoDoSlugAntigo`, caminho e query inteiros); barra some na home pelo host; Configurações e o cadastro mostram o link pelo host (`enderecoDaBarbearia`). Rodado de verdade: slug trocado, `antigo.localhost:3000/lembrete/<token real>` → 307 → página do lembrete no host novo → "Confirmar presença" ok; fluxo navega com URLs limpas. Suíte web 607. Dívidas no roadmap: sessão do cliente por origem (chave por id não resolve), nome largado tomado por outra barbearia, configuração do tenant no G. **Bloco E completo** (PR #26). **Bloco F em andamento.** Decisões do dono (2026-10-04): e-mail verificado **antes** de criar a conta (fecha o 409 que revela e-mail; o cadastro passa a depender do Resend em produção); a trilha tem "Trabalho sozinho" que marca a equipe como feita (gravado no servidor). Ordem: F1 tela → F3 código no cadastro (API, api-client, dublê e tela num PR só, senão a main fica quebrada) → F2a rota do onboarding → F2b trilha. **F1 feito** (branch `onda-1-bloco-f1`): `/painel/cadastro` (`CadastroDoDono`), promessa + mini-painel à esquerda (mini-painel some abaixo de 880px), `sugerirSlug` no `@barchop/formato` (acompanha o nome até o dono editar o link; apagar o campo devolve a sugestão); `/painel/entrar` só com login e link "Criar barbearia". Rodado de verdade: cadastro real pelo celular emulado entrou no painel. Suítes: web 612, formato 24. Pro F3: `criarBarbeariaComToken` (quase toda a suíte da API) chama o signup — decidir antes como o helper consegue o código; consumir o código dentro da `$transaction` da criação, senão um 409 de slug queima o código. F1 mergeado (PR #27). **F3 feito** (branch `onda-1-bloco-f3`): `POST /auth/cadastro/codigo` (202 sempre; livre recebe código `cadastro_dono`, tomado ou convite recebe aviso sem código; limite por e-mail e por IP em chaves próprias); signup exige `codigo` e o consome dentro da transação via `consumirCodigo(..., tx)` — código errado devolve `null` da transação (a tentativa gasta fica gravada) e o 422 sai depois; 409 do link desfaz tudo e o código volta a valer. Helper de teste `comCodigo` emite pela lib. Tela: passo do código na mesma rota (`Fragment` com `key` por passo — sem ela o React reaproveitava o input do link e o foco caía no `<body>`, achado no Chrome), reenviar, trocar e-mail, 409 volta pros dados sem pedir outro código. Rodado de verdade com o código lido do log da API. Suítes: API 644, web 617, api-client 101. F3 mergeado (PR #28). **F2a feito** (branch `onda-1-bloco-f2a`): migration `20261004190000_onboarding` (`link_compartilhado_em`, `trabalha_sozinho`; backfill do link pra quem já tem agendamento `origem = cliente`); `routers/onboarding.ts`: `GET /barbearias/me/onboarding` (só dono; passos horarios → servicos → equipe → link → primeira_reserva, `completo`), `PATCH` com `{ trabalhoSozinho }` (marca e desmarca, devolve o estado), `POST /barbearias/me/link-copiado` (qualquer membro, guarda a primeira vez, 204). Equipe = segundo membro ativo OU trabalho sozinho; primeira reserva = agendamento `origem = cliente`. api-client (`onboarding`, `marcarTrabalhoSozinho`, `marcarLinkCopiado`) e dublê (semente `onboarding`, 403 pra quem não é dono). Suítes: API 655, api-client 108. Próximo: F2b (a trilha no painel e o botão de copiar o link). F2a mergeado (PR #29). **F2b feito** (branch `onda-1-bloco-f2b`): `TrilhaDoOnboarding` no topo do `DashboardDoDia`, só pro dono (o profissional nem pergunta à API); some com a trilha completa ou se não carregar; ações por passo (Definir horário → Configurações, Cadastrar serviço, Convidar + "Trabalho sozinho", "Copiar link" com `navigator.clipboard` e o endereço pelo host — sem permissão mostra o link e não marca —, primeira reserva sem ação). Rodado de verdade: conta nova, trabalho sozinho e copiar link marcaram e o estado voltou do servidor ao recarregar; desktop e celular. Suíte web 624. **Bloco F completo.** **F4 — link único e troca pelo suporte** (decisão do dono, 2026-10-04): o link (slug) é único **pra sempre** — o atual e os antigos de uma barbearia nunca vão pra outra (fecha a pendência da quarentena; o "atual ganha do antigo" do E3a se inverte); o nome exibido o dono continua editando; trocar o link é **solicitação** que o **suporte** avalia numa **tela de suporte** (conta própria, fora da equipe, JWT `tipo: "suporte"`, escopo irmão, conta criada só por comando no `apps/api`). PRs: F4a API (unicidade com `pg_advisory_xact_lock` nos dois caminhos, solicitação do dono com uma pendente por vez, autenticação e decisão do suporte, comando; o `PATCH /me/slug` fica até o F4c) → F4b api-client e dublê → F4c painel (Configurações só leitura + pedir/cancelar, `SessaoDoPainel` relê o slug do `GET /barbearias/me`, aviso no cadastro; sai o `PATCH /me/slug`) → F4d área do suporte em `/painel/suporte`. **F4a feito** (branch `onda-1-bloco-f4a`): migration `20261004200000_suporte` (`operador_suporte`; `solicitacao_troca_link` com CHECK do status e índice único parcial "uma pendente por barbearia"); `lib/slug.ts` (`travarSlugs` = `pg_advisory_xact_lock` de chave fixa, `slugDeOutra`, `garantirSlugLivre`, `trocarSlug(tx, …)`) usado no signup (lança dentro da transação: o rollback devolve o código), no `PATCH /me/slug` e na aprovação; teste de concorrência provado falhando sem a trava. `routers/solicitacao-de-link.ts` (dono: GET a mais recente, POST com 422 `slug_reservado`/`slug_igual_ao_atual`, 409 `conflito`/`solicitacao_pendente`, POST cancelar). `routers/suporte.ts`: `POST /suporte/login` (limite próprio, scrypt descartável), escopo irmão com `autenticarSuporte` (`tipo: "suporte"`, `ativo`, troca de senha), `GET /suporte/solicitacoes` (pendentes, mais antigos primeiro, com a barbearia), aprovar (pedido `FOR UPDATE` + `trocarSlug` + marca, 409 deixa pendente) e recusar (resposta obrigatória); 422 `solicitacao_decidida`. Matriz: token de suporte dá 401 no painel, barbeiro e lembrete dão 401 no suporte. Comando `pnpm --filter @barchop/api criar-suporte "Nome" email` com `SENHA_DO_SUPORTE` (mín. 12). Suíte API 681. Depois: G (produção na OCI e piloto) — as pendências estão no fim de `barchop/docs/roadmap.md`. Desenho que era do E3b: `proxy.ts` com a decisão numa função pura (host + caminho + config → rewrite/redirect/next), sem tocar link nenhum: no host do tenant, caminho sem prefixo reescreve pra `/<slug>/…` e caminho já com `/<slug>` passa; raiz/www `/<slug>/…` → 308 pro subdomínio; `painel.` só `/` → `/painel`; host desconhecido passa (fallback `/[slug]`). URLs de redirect montadas da config, nunca do `request.url` (atrás do Caddy vem o host interno). `agendar` e `lembrete` entram nos reservados. **E3c**: base dos links por contexto (header do proxy lido no layout `[slug]`), redirect do slug antigo no layout com o caminho inteiro (o token do lembrete sobrevive) e **307**, não 308 — 308 fica em cache e ida-e-volta de slug daria loop; link público em Configurações pelo host. A chave da sessão do cliente pelo id **não** fecha a dívida no modo tenant: `localStorage` é por origem, `novo.dom` nunca vê o de `antigo.dom` — trocar o slug desloga os clientes, aceitável por ser raro.

### Bloco D — completo (PRs #17 a #21)
| Tarefa | Estado | O que ficou |
|---|---|---|
| D1 fila | feito | `lib/fila.ts`: `Fila` (`agendar(trabalho, dados, { quando, chave })` → `false` se a chave já está na fila; `trabalhar`), `filaDeMemoria` (`pendentes`, `rodarVencidos(agora)`) e `filaDoPgBoss` (pg-boss 12, ESM, externo no bundle CJS — `require(esm)` do Node ≥22.12). Fila com política **`exclusive`**: na `standard` a `singletonKey` não deduplica nada; chave ausente vira UUID (a `exclusive` indexa `COALESCE(chave,'')`). `buildApp({ fila })`; sem fila só em `NODE_ENV=test` (`filaPadrao`). `server.ts` monta o pg-boss (`urlDoPg` tira o `?schema=`), ouve `error`, `start` antes do `listen`, `stop` no `onClose`. Contrato em `tests/lib/fila.test.ts` roda contra memória **e** pg-boss real no banco de teste. Retenção: o pg-boss conta `keep_until` a partir do `start_after`, então lembrete a 30+ dias não expira |
| D2 lembrete | feito | Branch `onda-1-bloco-d2`. Migration `20261004130000_lembrete`: `barbearia.lembrete_antecedencia_horas` (2/12/24, padrão 24, CHECK) e `agendamento.lembrete_enviado_em`. `lib/lembrete.ts`: `agendarLembrete` depois do commit em POST painel, POST público, remarcar e PATCH com `status` (chave `lembrete:<id>` — o horário de um agendamento não muda, remarcar cria outro); falha da fila só no log. `enviarLembrete` relê; some/cancelado/começou/sem e-mail → sai sem erro; reivindica a marca com status no WHERE, envia, devolve a marca se falhar. `instanteNaBarbearia` em `horas.ts`. Fila de memória entrega JSON; pg-boss repete 5× (1 min dobrando até 1 h). Worker registrado no `server.ts` depois do `start` — sem teste automatizado, só a fumaça (fila criada no dev com a config certa) |
| D3 link | feito | Branch `onda-1-bloco-d3`. Migration `20261004140000_presenca_confirmada`. Token `{ tipo: "lembrete", agendamentoId, exp: início }` (`assinarTokenDoLembrete`); hooks do painel e do cliente recusam pelo `tipo` (testado). `routers/lembretes.ts`: `GET /lembretes/:token` (só lê), `POST …/confirmar` (idempotente, cancelado → 422), `POST …/cancelar` (repetido → 200, concluído/falta → 422); vencido 410 `link_expirado`, resto 401 `link_invalido`. Link `URL_DO_PAINEL/<slug>/lembrete/<token>` no e-mail (`criarLinkDoLembrete`). Token oculto no log (`ocultarTokenDoLembrete` no serializer). `maxParamLength: 512`. `server.ts` chama `app.ready()` antes do worker. Fumaça no bundle: worker real assinou o link e o `GET` respondeu 200 |
| D4 telas | feito | Branch `onda-1-bloco-d4`. **D4a API**: migration `20261004150000_email_do_lembrete` — o e-mail digitado na página pública vai pro **agendamento** (`email_lembrete`), nunca pro cadastro (o cadastro é achado pelo telefone e o e-mail dele é o login: gravar ali deixaria tomar a conta de quem tem o telefone conhecido); tratador manda pro do agendamento antes do do cadastro; remarcar leva o do antigo. `GET/PATCH /barbearias/me` com `lembreteAntecedenciaHoras` (só painel). `presencaConfirmadaEm` no agendamento. `GET /agendamentos/:id/lembrete-whatsapp` (no-store, 422 se não ativo, `agendaVisivel`). **D4b**: api-client + dublê com as mesmas recusas. **D4c**: tela `/[slug]/lembrete/[token]` (só age no clique, cancelar com confirmação, metadata no-referrer/noindex), selo ✓ na agenda e no detalhe, link "Lembrar pelo WhatsApp" (buscado ao carregar, `<a>` real), seção Lembrete em Configurações, e-mail opcional na confirmação. Rodado de verdade (API + web + Chrome): link real → confirmar → selo e link no painel |
| D5 WhatsApp | feito | Branch `onda-1-bloco-d5`. `lib/canal-whatsapp.ts` (Cloud API; só envia `Mensagem.modelo`, porque a Meta descarta mensagem da empresa sem modelo aprovado); `canalComposto` (e-mail pro endereço, WhatsApp pro telefone); `WHATSAPP_ATIVO=true` junta o WhatsApp, ausente/`false` nada muda, valor torto ou credencial faltando a API não sobe. ADR-0009 lista o que falta antes de ligar (modelos aprovados, chamadores passando `modelo`). Dívidas do D no `docs/roadmap.md` |

**Piso de 1 h** (decisão do dono, 2026-10-04): faltando menos de 1 h pro horário ao marcar, o lembrete não entra na fila (walk-in com o cliente na cadeira); vale pra qualquer origem. Entre 1 h e a antecedência, sai na hora.

**Pro G (do D4):** o e-mail da página pública não é verificado — qualquer um faz o domínio mandar e-mail pra qualquer caixa; a rota pública de agendar não tem limite de taxa (só as de auth têm). Pôr limite antes de ligar o Resend em produção. Os logs de acesso do proxy da OCI também gravam o caminho `/…/lembrete/<token>` — ocultar ou não logar o caminho dessa rota.

**Pro D4 (da D3, aplicado):** a tela `/[slug]/lembrete/[token]` lê `GET /lembretes/:token` e só confirma/cancela no clique (POST) — nunca ao carregar, leitor de e-mail abre links; ela se monta do que o GET devolve (barbearia vem junto), não de um lookup pelo slug, que pode ter mudado depois do e-mail. 410 vira "o horário já começou", 401 "link inválido". api-client e dublê ganham os três métodos; o selo "confirmou presença" na agenda precisa de `presencaConfirmadaEm` no `serializarAgendamento` (e nos tipos). **No E3:** o link usa `URL_DO_PAINEL` porque site e painel ainda são o mesmo host — separar quando o tenant for por subdomínio.

**Pro D4:** a antecedência ainda não tem rota nem tela (só a coluna, padrão 24). Ela é lida ao agendar: mudar depois não move lembretes já na fila — a tela diz isso, ou a troca reagenda os futuros. O texto do e-mail ganha os links de confirmar/cancelar no D3. **Falta um interruptor:** o G3 pede medir a linha de base de faltas *antes* de ligar o lembrete, mas hoje ele liga no deploy e não desliga. Antes do G: chave por barbearia (migration nova) ou por ambiente, e ao ligar enfileirar os agendamentos futuros que já existem — inclusive os da GR Barber migrados no G3, que nunca passaram por `agendarLembrete`.

Decisões pro D2 (antes do RED, todas aplicadas): agendar o lembrete **depois** do `$transaction` commitar (pg-boss tem pool próprio: dentro da transação, o job sobreviveria ao rollback do 409, e o `comRetryDeDeadlock` roda o callback duas vezes); `quando` = instante absoluto de `data` + `horaInicio` em `FUSO_DA_BARBEARIA` menos a antecedência, função pura testada; quando o momento do lembrete já passou na hora de marcar (marcou às 15h pras 18h com antecedência de 24 h), **manda na hora** (decisão do dono, 2026-10-04) — o `quando` no passado faz o pg-boss rodar assim que houver worker; o job continua relendo o agendamento e não manda se o horário já passou. O `trabalhar` do lembrete é registrado no `server.ts` **depois** do `boss.start()` — no `buildApp` rodaria antes do start e quebraria na subida, e nenhum teste com a fila de memória mostraria. Idempotência: o pg-boss repete o trabalho que lança (`retryLimit` 2) e a fila de memória não — o tratador precisa de uma marca de "lembrete enviado" conferida antes de enviar, senão uma falha depois do envio manda o e-mail de novo.

Suítes no fim do D1: API 506. No fim do D2: API 529. No fim do D3: API 547. No fim do D4: API 566, web 544, api-client 88, formato 19. No fim do D5: API 577.

### Bloco B (histórico)
Cada tarefa com commit RED e GREEN:

| Tarefa | Estado | O que ficou |
|---|---|---|
| B1 schema | feito | migrations `20261004120000_jornada_servicos_bloqueio` (tabelas, CHECKs, **triggers**) e `20261004120100_equipe_nasce_inteira` (backfill); jornada = 7 linhas por membro, modo `barbearia`/`proprio`/`folga` (decisão 4 revista, abaixo); trigger no insert do membro dá a semana e todos os serviços; trigger no insert do serviço o dá à equipe inteira |
| B2 rotas | feito | `GET/PUT /equipe/:id/jornada` e `/equipe/:id/servicos` (PUT só dono, na matriz); `routers/bloqueios.ts`: `GET/POST/DELETE /bloqueios`, dono e recepção de qualquer um, profissional só os dele (403 criar no colega, 404 apagar) |
| B3 disponibilidade | feito | `janelaEfetiva` (pura) = jornada ∩ funcionamento; `aplicarBloqueios`, `caiEmBloqueio`, `contextoDoDia` em `lib/disponibilidade.ts`; 422 `horario_bloqueado`, `servico_fora_do_profissional`, `profissional_nao_atende`; o mês faz uma consulta por tabela |
| B4 telas | feito | `JornadaDoMembro` e `ServicosDoMembro` na edição do membro; `FolgasEBloqueios` em `/painel/bloqueios` (link "Folgas" pra todos); api-client + dublê com as mesmas recusas |

Suítes no fim do B: API 482, web 492, api-client 75, formato 19; lint, type-check e `next build` verdes. Mergeado no PR #15.

Dívidas novas do B (em `docs/roadmap.md`): o fluxo público ainda agenda com `barbeiros[0]` e mostra o catálogo inteiro — serviço que esse profissional não faz dá "Não foi possível carregar a agenda" (fecha no C2); a agenda do painel ainda não desenha os bloqueios (C3).

### Bloco C (histórico — mergeado no PR #16)
Decisões tomadas antes do RED (2026-10-04):
- **Candidato** ("qualquer um" e passo do profissional): ativo, atende, `senha_hash` não nulo e faz todos os serviços pedidos — uma constante/consulta só, a mesma do perfil público.
- **Uma função por profissional e dia** (janela efetiva, bloqueios, ocupados, `descartarPassados`) usada pela união do "qualquer um" e pela escolha no POST: todo horário oferecido tem que ser marcável. O mês recebe uma lista de `barbeiroId` e consulta cada tabela uma vez (`in`).
- **POST público sem `barbeiroId`**: `pg_advisory_xact_lock` por barbearia+data **só nesse caminho**, antes de ler candidatos; escolhe o livre com menos agendamentos no dia (empate: ordem de entrada). Com `barbeiroId` nada muda (409 `horario_ocupado` da EXCLUDE continua). Teste segura a trava de verdade; função da chave exportada.
- **Agendamento serializado ganha `barbeiro: {id, nome}`** (INCLUDE_AGENDAMENTO e o include próprio do histórico em `clientes.ts`); no dublê o campo é opcional na semente, padrão `bb1`.
- **C2**: perfil público com `servicoIds` por barbeiro; passo `/agendar/profissional` entre serviços e data, `?profissional=<id>` (ausente = qualquer um), **por último** no `montarQuery`; revalidado no passo de data (fora da lista ou não faz o serviço → `replace` pro passo do profissional); pulado quando só um candidato; mensagem quando ninguém faz a combinação; remarcar leva `profissional=<barbeiro.id do agendamento>`.
- **C3**: seletor de profissional no Novo agendamento e colunas por profissional na Agenda (com bloqueios), em pares RED/GREEN separados.

Progresso: **C1 feito** (`bb61d2e`): `candidatosDoQualquerUm`, `horariosDoProfissionalNoDia`, `diasComVaga`, `travarQualquerUm`/`chaveDoQualquerUm` e `PODE_ATENDER` em `lib/disponibilidade.ts`; `escolherProfissional` em `lib/agendamento.ts`; teste de concorrência prova a trava (sem ela, 409). Dublê aceita agendamento semeado sem `barbeiro` (`SementeFalsa`), completa com `bb1`, e o conflito passou a ser por profissional. Suítes: API 491, web 492, api-client 75. **C2 feito** (`4424241`): `EscolhaDoProfissional` em `/agendar/profissional`, `profissionaisQueFazem` em `src/fluxo/profissionais.ts`, `?profissional=` revalidado na `EscolhaDaData`, confirmação com "Com X"/"Com quem estiver livre" e o nome de quem ficou no sucesso, remarcar com o profissional original. Suítes: API 492, web 506 (uma falha intermitente vista uma vez em "bloqueia o almoço da Ana", não reproduziu em 5 execuções). **C3 feito**: `NovoAgendamento` com seletor de profissional (`?profissional=` da URL), agenda do dia em colunas por profissional com bloqueios listrados (`gradeDeTempo` com `profissionais`/`bloqueios`), painel do dia com "com X" quando há equipe. Corrida de teste do `<select>` encontrada e corrigida (memória `select-carregado-espere-a-opcao`).

**Bloco C completo.** Suítes: API 492, web 521, api-client 75, formato 19; lint, type-check e build verdes. Dívidas novas no roadmap: coluna da agenda sem a jornada, ocupação sem a equipe, semana mistura a equipe, remarcar com profissional que saiu. Próximo bloco: **D** (lembrete).

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
