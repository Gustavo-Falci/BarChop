# Plan: Onda 1 — Agenda que funciona (MVP + piloto)

**Source PRD**: `.claude/prds/barchop-saas.prd.md`
**Selected Milestone**: 1 — Onda 1 — Agenda que funciona (MVP + piloto)
**Complexity**: Large

## RETOMAR AQUI (noite de 2026-10-24 — Onda 2, marco 3: modelo decidido) — vale mais que as seções abaixo

**Estado:**
- **`main` = este RETOMAR AQUI** (o código segue o `cec7e32`, #200; produção igual à seção abaixo). Nenhum PR de código aberto.
- **Conferido pelo dono em 24/10:** a agenda no celular (#189 a #196) e tudo de 21/10 (arrastar na agenda, "Mudar horário" e o e-mail, "Mudar ordem" na página pública, passos até o ✓, seções ao rolar, janelas saindo animadas). Os "Ao retomar" das duas seções abaixo estão feitos.
- **Onda 2, marco 3 — decisões do dono** (gravadas em `.claude/prds/onda-2-dinheiro.prd.md`): planos **da casa** e **de barbeiro**; o dinheiro cai na conta de quem vende; plano de barbeiro vale só com ele e a casa fica com o % da "parte da casa" dele sobre a mensalidade; plano da casa vale com qualquer um e paga valor fixo por atendimento; o dono libera "pode vender planos" por membro; vários provedores por conector, começando pelo **Asaas** (chave de API do vendedor, webhook criado pela API com `authToken`).

**Ao retomar:**
1. `/plan` do marco 3 a partir do PRD. Em aberto para o plano: se planos de barbeiro ficam no recurso `planosDaBarbearia` (só Completo); a chave do Asaas cifrada no banco e nunca devolvida à tela; `forma`/`motivo` novos no caixa para atendimento pelo plano e para a parte da casa sobre a mensalidade.
2. O resto da lista de 21/10: testar o caixa em produção; marco 4; G3; decidir a `barbearia-teste`; pendentes do redesenho.

## RETOMAR AQUI (tarde de 2026-10-24 — preços novos no ar: #199 e #200) — histórico

**Estado:**
- **`main` = este RETOMAR AQUI** (o código é o `cec7e32`, #200). **Produção:** API com o #200 (o `criar-precos` da VM já rodou o código novo); web com pelo menos o #199 (`/precos` no ar com os valores novos), então a agenda no celular (#189 a #196) também foi pro ar.
- **#199, preços dos planos pagos** (decisão do dono em 24/10: +R$ 10 na base, +R$ 5 no extra), só em `packages/formato/src/planos.ts`:

  | Plano | Base mensal | Extra por profissional | Anual (1 profissional) |
  |---|---|---|---|
  | Essencial | R$ 34,90 → **R$ 44,90** | R$ 10 → **R$ 15** | R$ 349 → **R$ 449** |
  | Completo | R$ 44,90 → **R$ 54,90** | R$ 15 → **R$ 20** | R$ 449 → **R$ 549** |

- **#200, `criar-precos` e o Portal:** o Portal guarda **ids** de preço, não a `lookup_key`. Ao trocar preço, o script arquivava os antigos e a cópia "sem descida" quebrava com `Only active, per unit licensed prices are supported`. Agora o script troca, na configuração padrão do Portal, cada preço arquivado pelo novo do mesmo produto e ciclo, e só depois copia a "sem descida".
- **Stripe, nos dois modos** (sandbox do PC e real da VM): 4 preços novos com a `lookup_key` de sempre, os antigos arquivados, Portal padrão e "sem descida" apontando para os novos. No real: padrão `bpc_1UQwUL2Lldv3THCmQPCBAkfG`, "sem descida" `bpc_1URCCv2Lldv3THCmy92C3kbo`; preços novos `price_1UU7cU…` (essencial_mensal), `price_1UU7cV…` (essencial_anual), `price_1UU7cW…` (completo_mensal) e `price_1UU7cX…` (completo_anual).
- Branches `precos-mais-10` e `portal-com-precos-novos` apagados pelo dono. Nenhum PR aberto.

**Para lembrar:**
- **Assinaturas que já existiam continuam no preço antigo**: a Stripe não muda preço de assinatura sozinha. Os Termos prometem aviso no painel com 30 dias de antecedência e valor novo só a partir da renovação seguinte. Se um dia for migrar alguém, avisar antes.
- Próxima mudança de preço: mudar `planos.ts`, fazer o deploy de web e API e rodar o `criar-precos` nos dois modos. O Portal acompanha sozinho.

**Ao retomar:**
1. O dono olhar a agenda no celular de verdade (lista da seção abaixo, "Ao retomar" item 2).
2. O resto: a mesma lista da seção de 21/10.

## RETOMAR AQUI (2026-10-24 — agenda no celular mesclada na `main`: #189 a #196) — histórico

**Estado:**
- **`main` = `0e2193c`** (#197, este RETOMAR AQUI; o código é o #196); **produção = `c6a3b33`** (#187). A agenda no celular está na `main` e **ainda não foi pro ar**.
- Mesclados em 24/10, com o "pode mergear" do dono, na ordem:
  1. **#189**: o plano `.claude/plans/agenda-no-celular.plan.md` (canvas aprovado: https://claude.ai/artifact/Vus5qcnD2mRpy5orskvtGy).
  2. **#190**: status no bloco (pendente tracejado, atendido e faltou apagados, anel no "em atendimento").
  3. **#191**: vistas Lista e 3 dias; o celular abre na Lista; última vista lembrada no aparelho.
  4. **#192**: filtro de vários profissionais (`?profissionais=a,b`, o `?profissional=` antigo ainda vale).
  5. **#193**: barra do celular (☰ · título ▾ · ‹ › · Hoje · Bloquear), menu lateral, calendário numa folha.
  6. **#194**: a Lista no desenho aprovado ("Mais cedo", régua do agora, bloqueios, "Mostrar mais 14 dias").
  7. **#195**: semana e 3 dias cabendo na tela do celular (container query por coluna; dia de 4+ profissionais rola com o eixo preso).
  8. **#196**: mês com 3 nomes no tom de cada um e "+N", mais dois commits de ajuste: o da revisão e o do que se viu no navegador a 390px (etiqueta com o primeiro nome, ✓ logo depois do nome, caixinhas do menu na cor de cada um, eixo "09" por `::before`, "Fechado" só pro leitor na semana, pílula do mês com o primeiro nome).
- Conferido no navegador (DevTools, 390px, conta layout-dev): Lista, menu, calendário, 3 dias, semana, dia com 2 profissionais, mês. Suíte do web 1443/1443, `tsc` e lint limpos.
- Branches da pilha (`plano-agenda-celular`, `agenda-celular-*`, `docs-retomar-24-10`) apagados pelo dono, no GitHub e no clone local. Nenhum PR aberto.
- No banco **dev** `gr_barber` há dados de teste na barbearia layout-dev: 10 clientes, 14 agendamentos com a observação "teste-agenda-celular" e um bloqueio "Almoço" da Ana em 24/10. Senha da conta layout-dev@exemplo.com no dev: `layoutdev123`.

**Ao retomar:**
1. Deploy só do `web` (sem migração, sem mudança na API), quando o dono quiser.
2. Depois do deploy, o dono olhar no celular de verdade: barra presa ao rolar, semana com 7 colunas sem rolar de lado, ☰ entrando pela esquerda, "Mais cedo" e régua na Lista, mês com 3 nomes e "+N".

**Para lembrar:** depois de "Mostrar mais", os 14 dias novos dizem "Nenhum horário. Toque para marcar." por um instante, até a busca voltar. Tocar num dia da semana guarda "dia" como a vista lembrada.

**O que falta além disso:** a mesma lista da seção de 21/10 abaixo.

## RETOMAR AQUI (noite de 2026-10-21 — motion e arrastar completos e no ar: #175 a #187) — histórico

**Estado:**
- **`main` = produção = `c6a3b33`** (#187). Deploy feito pelo dono em 21/10 (API + web + `migrate deploy` da ordem). Conferido por fora: `POST /agendamentos/:id/remarcar` responde 401 sem token, a página pública tem `ordemCategorias`, o CSS novo está no ar.
- Nenhum branch pela metade, nenhum PR aberto (só este de docs).

**O que entrou (os dois planos de 19/10, aprovados em 21/10, completos):**
- **`motion-sutil.plan.md`** — 6 PRs (#175, #180–#184): lib `motion` 13.5.1 com `LazyMotion` (raiz `domAnimation`; painel `domMax` à parte, +19KB gz assíncrono, por causa do `layoutId`). Troca de tela com fade; janelas, menus e barra de mudanças com saída (`depoisDaSaida` segura o `onClose` das `<dialog>`); indicador deslizante nos seletores; listas escalonadas e números do Hoje; passos do agendamento com direção e ✓ desenhado na confirmação; seções do site com `Revelar` (HTML do servidor visível).
- **`arrastar-e-reordenar.plan.md`** — 7 PRs (#176–#179, #185–#187): `ordem` em serviço/profissional e `ordem_categorias` (migração); API de ordem; `ListaReordenavel` (dnd-kit); "Mudar ordem" em Serviços e Equipe; **remarcar pelo painel** (`POST /agendamentos/:id/remarcar`, e-mail "Seu horário mudou" ao cliente — decisão do dono: sim); "Mudar horário" no detalhe; **arrastar na agenda** com fantasma encaixado de 15 em 15 e confirmação antes de mudar.
- Cada plano tem as seções "Feito (21/10), desvios" por PR. Os que pesam: sem notificação no sino ao remarcar pelo painel (o sino é só do que o cliente faz); "Mudar horário" não oferece horários que sobrepõem o próprio agendamento (mover 15 min é pelo arrasto).

**Ao retomar:**
1. Perguntar ao dono o que ele viu no navegador (nada disso foi conferido no navegador nesta rodada): arrastar na agenda com mouse e no celular (segurar 250ms); "Mudar horário" e o e-mail chegando; "Mudar ordem" refletindo na página pública; passos do agendamento até o ✓; seções do site entrando ao rolar; janelas e menus saindo animados.
2. Consertar o que ele apontar antes de abrir frente nova.

**O que falta além disso:** testar o caixa em produção; Onda 2 marco 3 (decidir assinante do parceiro + provedor) e marco 4; G3; decidir a `barbearia-teste`; pendentes do redesenho.

**Lição de processo (21/10):** em PR empilhado, trocar a base do filho pra `main` **antes** de apagar o branch de base — apagar com `--delete-branch` fecha o PR filho em vez de redirecionar (aconteceu com o #186; recriei o branch, reabri, troquei a base e mesclei).

## RETOMAR AQUI (tarde de 2026-10-19 — próximo: motion e arrastar) — histórico

**Estado:**
- **`main` = `7996cae`** (#173, só docs). Depois disso, só este PR de docs, que traz os dois planos novos.
- **Produção:** ainda com o redesenho de 17/10 (`cd57bdb`); o deploy do `web` com o #172 (temas paginados) segue pendente com o dono.
- Nenhum branch pela metade, nenhum código novo.

**Próximo trabalho (decidido pelo dono em 19/10):** dois planos, escritos e ainda **sem aprovação formal**:
- **`.claude/plans/motion-sutil.plan.md`**: animações com a lib `motion` (versão fixa `13.5.1`; a 14 é nova demais), carregada com `LazyMotion`. Vale pro painel, pro agendamento público e pro site, no modo sutil e rápido (até 280ms, nada trava clique, "reduzir movimento" respeitado). 6 PRs: base e troca de tela; janelas e menus com saída; micro-interações (indicador deslizante); listas; passos do agendamento; site.
- **`.claude/plans/arrastar-e-reordenar.plan.md`**: dnd-kit (`core 6.3.1`, `sortable 10.0.0`, `utilities 3.2.2`, `modifiers 9.0.0`). 7 PRs:
  - migração com `ordem` em serviço e profissional e `ordem_categorias` na barbearia;
  - API de ordem;
  - lista reordenável (mouse, toque e teclado);
  - aplicar em Serviços, Categorias e Equipe;
  - remarcar pelo painel (API nova);
  - "Mudar horário" no detalhe;
  - arrastar na agenda, sempre com confirmação.
  O limite do Grátis e o "qualquer um" continuam pela ordem de entrada na equipe (`criadoEm`).
- Ordem sugerida: motion PR 1 → arrastar PR 1–4 → motion PR 2–6 → arrastar PR 5–7. O ADR 0011 cobre as duas libs.

**Ao retomar:**
1. Confirmar com o dono a aprovação dos dois planos.
2. Antes do arrastar PR 5: decidir se o cliente recebe aviso por e-mail quando o painel remarca. A recomendação é sim (e-mail "seu horário mudou", lembrete reagendado e notificação interna "remarcado").

**O que falta além disso:** a mesma lista da seção de 19/10 abaixo (deploy do #172, caixa em produção, marcos 3 e 4, G3, `barbearia-teste`).

## RETOMAR AQUI (2026-10-19 — temas da Aparência paginados e descrição no hover: #172) — histórico

**Estado:**
- **`main` = `32303ea`** (merge do #172). Depois disso, só este PR de docs.
- **Produção:** ainda com o redesenho de 17/10 (`cd57bdb`). O #172 pede deploy só do `web` (sem migração, sem mudança na API) — o dono faz.
- **O que entrou no #172** (Aparência › Tema):
  - os 17 temas em páginas de seis; "Mostrar mais temas (N)" traz os próximos seis e diz quantos faltam; "Mostrar menos temas" aparece depois de abrir mais e volta pros seis primeiros. Botões de texto discretos, sem moldura, embaixo da grade;
  - o tema escolhido aparece no fim da grade mesmo fora da página aberta; trocar o filtro (Todos/Claros/Escuros) volta pra primeira página;
  - a descrição do tema sai da carta: com mouse, cobre o pé da amostra no hover ou no foco do teclado, sem mudar a altura da grade; no celular, só a do escolhido. O leitor de tela a recebe como descrição do botão (`aria-describedby`).
- **Testado:** 28/28 na tela da Aparência, `tsc` e lint limpos. Não conferido no navegador (a extensão do Chrome não abriu o localhost); a rota responde 200 no dev.

**Para lembrar:**
- Pendentes do redesenho: o resumo fixo no rodapé do fluxo público desde o passo 3; o app mobile não foi aberto num emulador. (A descrição do tema no hover saiu no #172.)
- Rota do painel presa em "Rendering"/"Compiling …" no dev, com as outras abrindo: é o cache do Turbopack. Parar o `next dev` (e o node que sobrar na porta 3000), apagar `apps/web/.next/dev` e subir de novo. Aconteceu com a Aparência em 19/10; não era o código.
- Os demais lembretes de 17/10 (abaixo) seguem valendo.

**O que falta (o dono escolhe):**
1. Deploy do `web` com o #172 e conferir a Aparência no ar.
2. Testar o caixa por dentro em produção (registrar um pagamento, fechar e reabrir o dia).
3. Onda 2, marco 3 — planos da barbearia para o cliente (antes do `/plan`, a pergunta aberta do PRD: de quem é a mensalidade no acerto, e o provedor pra barbearia receber).
4. Onda 2, marco 4 — relatórios.
5. Onda 1, G3 — o piloto da GR Barber.
6. `barbearia-teste` em produção: apagar ou manter.

## RETOMAR AQUI (noite de 2026-10-17 — redesenho "menos amarelo, menos moldura" no ar: #162 a #169) — histórico

**Estado:**
- **Código do redesenho = `cd57bdb`** (merge do #162; os 8 PRs foram mesclados de cima pra baixo e a `main` ficou idêntica ao topo da pilha). Depois disso, só PRs de docs (#170 e este).
- **Produção:** o dono fez o deploy do `web` em 17/10 (sem migração, sem mudança na API).
- **Conferido no ar:** Home com o ouro novo (`#F0C93A` no HTML, nada do `#FFD900` antigo); página pública da `barbearia-teste` no celular, com "Agendar agora" preso no pé; fluxo público com "Passo 1 de 4" e a barra de passos, sem erro no console; a novidade "Visual novo" nos chunks do painel. A conferência do painel logado foi dispensada pelo dono.
- **A série:** a análise de UI/UX do dono no claude.ai/design (17/10) virou o plano `.claude/plans/menos-amarelo-menos-moldura.plan.md`, em 8 PRs:
  - #162: paleta (escuro neutro quente, ouro #E8C547 / #F0C93A), fio de 1px e sombra difusa, segmentado, ícone do app com o "B" sobre o ouro;
  - #163: barra lateral com monograma, barra inferior no celular (Hoje, Agenda, + Novo, Caixa, Mais), Hoje mais enxuto, faixa da assinatura que fecha por 24h, esqueleto no carregando;
  - #164: Agenda (hora livre só no hover, decisão do dono que substitui a de 11/10; tom por profissional), Novo agendamento com profissional em chips, detalhe com a ação presa no pé do celular;
  - #165: BarraDeMudancas (um Salvar só por tela, diz o que mudou), Regras, índice, Comodidades, papel em segmentado;
  - #166: Aparência e Membro da equipe em abas (jornada em segmentado por dia);
  - #167: listas viram cartão no celular, Dados do negócio com a barra, ajudas em 14px;
  - #168: Caixa (número por pessoa, fechar numa janela), Folgas abrem na lista, Faturas lado a lado, cliente em leitura com Editar;
  - #169: indicador de passo no fluxo público, horários em 4 colunas, a novidade "Visual novo".
- **Decisões do dono (17/10):** a bolinha "Amarelo BarChop" foi pro ouro novo; a descrição do tema BarChop fica; textos novos aprovados ("Ainda não decidido: salve pra manter assim.", "Segunda: horário ou pausa", "Editar as nove cores"); a loja da Aparência numa linha.

**Para lembrar:**
- Pendentes do redesenho (no plano): o resumo fixo no rodapé do fluxo público desde o passo 3; a descrição de cada tema no hover da Aparência; o app mobile não foi aberto num emulador (só as imagens do ícone).
- No banco dev desta máquina, as Regras da Barbearia do Gu ficaram "Configurado" (salvas pra testar a barra).
- O `apps/api/.env` desta máquina tem o `STRIPE_WEBHOOK_SECRET` do `stripe listen` (fora do git): no local, o webhook só chega com o `stripe listen --events ... --forward-to localhost:3333/stripe/webhook` rodando.

**O que falta (o dono escolhe):**
1. Testar o caixa por dentro em produção (registrar um pagamento, fechar e reabrir o dia).
2. Onda 2, marco 3 — planos da barbearia para o cliente (antes do `/plan`, a pergunta aberta do PRD: de quem é a mensalidade no acerto, e o provedor pra barbearia receber).
3. Onda 2, marco 4 — relatórios.
4. Onda 1, G3 — o piloto da GR Barber.
5. `barbearia-teste` em produção: apagar ou manter.

## RETOMAR AQUI (noite de 2026-10-16 — caixa do dia no ar: Onda 2, marco 2 completo, #153 a #160) — histórico

**Estado:**
- **Produção = `main` = `4c6e6ab`** (#160). O dono fez o deploy: `migrar` (migração `20261017120000_caixa`), depois `api` e `web`.
- **Conferido no ar com curl:** as rotas do caixa na API respondem 401 sem login (existem) e uma rota inexistente, 404; nos chunks do painel estão o Caixa ("Fechar o dia", "Entrou no dia"), a Divisão do dinheiro, "Concluir e registrar pagamento", "Salvar troca" (Cliente de X) e a novidade "Caixa do dia".
- **Ainda não testado por dentro em produção:** entrar numa barbearia do Essencial ou do Completo, registrar um pagamento e fechar o dia. No dev local foi testado no navegador, em 1440 e 375.

**O que entrou no marco 2** (plano `.claude/plans/caixa-do-dia.plan.md`, marcado FEITO; PRD da Onda 2 com o marco 2 `complete`):
- #153: a conta em `@barchop/formato` (`caixa.ts`: `dividirPagamento` e `acertoDoDia`).
- #154: a migração (`pagamento`, `pagamento_parte`, `regra_de_divisao`, `fechamento_do_dia`, `cliente.profissional_id` preenchido com quem atendeu o 1º concluído, `barbeiro.parte_da_casa`).
- #155: API do pagamento (`PUT`/`DELETE`/`GET /agendamentos/:id/pagamento`; o PATCH de status solta o pagamento ao sair do concluído; 409 `dia_fechado`; 403 `recurso_do_plano` no Grátis).
- #156: API do caixa do dia (`GET /barbearias/me/caixa?data=`; fechar e reabrir só o dono, com a foto do acerto).
- #157: API da divisão (`GET`/`PUT /barbearias/me/divisao`) e o profissional do cliente (`profissionalId` no `PATCH /clientes/:id`, só o dono).
- #158: o pagamento no detalhe do agendamento ("Concluir e registrar pagamento", resumo com a frase da divisão, editar, remover, dia fechado só leitura).
- #159: a tela Caixa (`/painel/caixa`) e o item no menu, entre Agenda e Folgas.
- #160: a Divisão do dinheiro (`/painel/configuracoes/divisao`), "Cliente de X" no detalhe do cliente, o tema Caixa na Central de ajuda, a novidade e as docs (`screens.md` com 34 rotas).

**Para lembrar:**
- Os clientes antigos ficaram com quem atendeu o 1º agendamento concluído de cada um; se algum estiver errado, o dono troca no detalhe do cliente.
- A novidade "Caixa do dia" está com a data 2026-10-16.
- Barbearia com agendamento não pode ser apagada (RESTRICT da init em `agendamento`; ver "Dívidas conhecidas" no roadmap). Pesa em apagar a `barbearia-teste`.
- Ainda não visto no ar (da cobrança): o Portal "sem descida" com uma barbearia real de mais de 3 profissionais no Completo.

**O que falta (o dono escolhe):**
1. Testar o caixa por dentro em produção (registrar um pagamento, fechar e reabrir o dia).
2. Onda 2, marco 3 — planos da barbearia para o cliente. Antes do `/plan`, decidir a pergunta aberta do PRD: o plano de um cliente que é do parceiro, de quem é a mensalidade no acerto? E o provedor para a barbearia receber dos clientes.
3. Onda 2, marco 4 — relatórios (o que entrou por período, profissional e forma; histórico dos fechamentos).
4. Onda 1, G3 — o piloto da GR Barber (adiado pelo dono para depois da Onda 2).
5. Mais telas de UI/UX: o dono manda print por print.
6. `barbearia-teste` em produção: apagar ou manter.

## RETOMAR AQUI (2026-10-16 — cobrança encerrada: testada de verdade, #147 a #150 no ar, sandbox limpo) — histórico

**Estado:**
- **Produção = `main` = `2880d59`** (#148 `bb74899`, #149 `abeb799`, #150 `2880d59`, mesclados com "pode mergear"; #147 só docs). Sem migração nova.
- **Conferido no ar com curl:** API 200; `POST /stripe/webhook` sem assinatura responde 400; nos chunks do painel, a novidade "Faturas e assinatura" com data 2026-10-15 e o rótulo "Reembolsada em parte".
- **O que entrou:**
  - #148: data da novidade; o `criar-precos` reconhece `rk_live_` como modo real.
  - #149: Portal "sem descida". Com mais de 3 profissionais (dono e profissionais ativos; recepção não conta), a sessão do Portal usa uma configuração que só oferece os 2 preços do Completo. É uma cópia da padrão, achada pelo metadata `barchop=sem_descida` e criada ou atualizada pelo `criar-precos`. Sem a configuração, abre a padrão e avisa no log.
  - #150: Faturas mostram "Reembolsada" ou "Reembolsada em parte" (a Stripe deixa a fatura `paid`). Lido na hora: `expand: data.payments` + `charges.list` do cliente.
- **Stripe real:** links de Termos e Privacidade no Portal. O dono rodou `criar-precos` no real (a `rk_live_` teve permissão): configuração `bpc_1URCCv2Lldv3THCmy92C3kbo` "BarChop — sem descida (mais de 3 profissionais)", conferida no painel com só os 2 preços do Completo.
- **Teste de verdade feito em 16/10, ciclo completo:** `barbearia-teste` assinou o Completo mensal com o cartão do dono; teste encerrado → cobrança real de R$ 44,90; reembolso; cancelamento no fim do período; cancelamento imediato → voltou ao Grátis ("Nada foi apagado"). 8 webhooks, todos 200.
- **Sandbox de teste limpo:** quantidade desligada nos 2 produtos do Portal padrão (`bpc_1UQSPVRszmqdCj2a5Iu7wDXF`); produto "myproduct" arquivado. A configuração "sem descida" do sandbox é `bpc_1URBRrRszmqdCj2awKDHjfty`.

**Para lembrar:**
- **Mudou o Portal padrão no painel da Stripe? Rodar `criar-precos` de novo**, porque a "sem descida" é uma cópia. Na VM, em `~/BarChop/barchop/infra`: `docker compose exec api node dist/criar-precos-no-stripe.js`. No PC (sandbox): `pnpm --filter @barchop/api criar-precos`.
- A `sk_test_` do `apps/api/.env` é de um **Sandbox** da Stripe (outra conta), não do modo de teste da conta real, que fica vazio. No painel, entrar pela lista de Sandboxes.
- A quantidade por produto do Portal não aparece no painel; só muda pela API ou pelo Workbench → Shell (`stripe billing_portal configurations update <id> -d ...`, listando todos os preços; `stripe post` não roda lá).
- Ainda não visto no ar: o Portal "sem descida" com uma barbearia real de mais de 3 profissionais no Completo (no sandbox funcionou).

**Próximo passo (o dono escolhe):**
1. Mais telas de UI/UX: o dono manda print por print.
2. `barbearia-teste` em produção: apagar ou manter (ela também recebe os avisos da plataforma).

**G4 feito em 16/10** (este PR, só docs): `docs/roadmap.md` (o que está no ar da Onda 1 e da Onda 2, dívidas fechadas), `docs/screens.md` (foto de hoje: 32 rotas do painel, 8 telas públicas, 5 do site) e os PRDs (Onda 2 marco 1 `complete`; a linha da Onda 1 segue `in-progress` até o G3). Da Onda 1 só falta o G3.

## RETOMAR AQUI (noite de 2026-10-15 — cobrança no ar: #144, #145 e #146 em produção, Stripe real configurada) — histórico

> Os passos 1 a 5 abaixo foram todos feitos em 16/10 (seção acima).

**Estado:**
- **Produção = `main` = `774581c`** (#144 `070be6c`, #145 `e0b0689`, #146 `774581c`, mesclados em ordem com "pode mergear"). Deploy do dono com o `migrar` (última migração `20261015120000_assinatura_cancela_em`).
- **Conferido no ar com curl:** `/`, `/precos`, `/gratis`, `/termos` e `/privacidade` respondem 200; `/precos` com Essencial R$ 34,90/R$ 349,00 e Completo R$ 44,90/R$ 449,00; termos com nome, CPF e e-mail de quem vende e vigência 15/10, sem "a preencher"; `POST /stripe/webhook` sem assinatura responde 400 `assinatura_invalida` (a API subiu com as chaves).
- **Stripe real** (a conta, não o sandbox de teste — são contas com ids diferentes), conferida no painel:
  - conta ativa (pagamentos e repasses); nome público BarChop; descrição na fatura `BARCHOP.COM.BR`;
  - produtos `barchop_essencial` e `barchop_completo` com os 4 preços (o `criar-precos` rodou do PC do dono com a chave real);
  - Portal do cliente: troca de plano com os 4 preços, **quantidade desligada** (a quantidade é o número de profissionais, o app cuida), troca **não** encerra o teste, rateio cobrado na hora, plano mais barato e anual → mensal no fim do período, cancelar no fim do período com motivo;
  - Pix e Boleto desligados (as Faturas dizem "Em breve");
  - webhook `https://api.barchop.com.br/stripe/webhook`, versão `2026-09-30.endive`, os 6 eventos;
  - a chave da API é **restrita** ("acesso total, exceto operações sensíveis", `rk_live_…`), no `infra/api.env` com o `whsec_…`.
- **Ambiente local:** `apps/api/.env` sempre com `sk_test_` (a chave real só na VM).

**Próximo passo (nesta ordem):**
1. **Dono, na Stripe real:** Dados públicos → links de Termos (`https://barchop.com.br/termos`) e Privacidade (`/privacidade`); hoje o rodapé do Portal mostra "Nenhum link".
2. **Teste de verdade:** o dono assina um plano com cartão próprio; conferir plano ativo no painel, a fatura em `/painel/faturas` e as entregas do webhook na Stripe; depois cancelar ou reembolsar.
3. **PR pequeno:** data da novidade "Faturas e assinatura" (`novidades.ts`); o `criar-precos` escreve "modo: teste" para chave `rk_live_` (só reconhece `sk_live_`) — corrigir.
4. **Depois:** o Portal só troca o preço; quem desce do Completo para o Essencial com mais de 3 profissionais não é barrado lá — segurar no app.
5. Opcional, no sandbox: desligar a quantidade no Portal (lá ficou ligada) e arquivar o produto "myproduct".

## RETOMAR AQUI (2026-10-15 — PRs 4, 5 e 6 da cobrança abertos e empilhados: #144 → #145 → #146) — histórico

> Na época, este RETOMAR AQUI vivia no branch `site-e-termos` (#146); os três foram mesclados e estão em produção (seção acima).

**Estado:**
- **Produção:** igual à seção de 14/10 abaixo (`main` = `10ff35c`; última migração em produção `20261014120000_assinatura`).
- **#145 virou "Faturas"** no modelo do `Telas_Assinatura_BarbeiroApp.docx` do dono (plano em `.claude/plans/faturas-no-modelo-do-barbeiro-app.plan.md`):
  - `/painel/faturas`, só do dono: sem plano pago, Plano → Pagamento (Cartão; Pix e Boleto "Em breve") → Acesso liberado, com o Seu pedido ao lado; com plano pago, a lista de faturas da Stripe e o Seu plano com **Gerenciar assinatura** (o Portal);
  - `/painel/faturas/cancelado` na volta do Checkout desistido;
  - API: `GET /barbearias/me/assinatura/faturas` e `usoNoTeste` no resumo; o webhook cancela e reembolsa a 2ª assinatura viva da mesma barbearia (dois Checkouts antes do webhook).
- **Portal da Stripe (modo de teste), conferido em 15/10:**
  - troca de plano ligada, com Essencial e Completo, mensal e anual;
  - subir de plano: **cobra na hora só a diferença proporcional** (`always_invoice`, pedido do dono);
  - descer de plano ou anual → mensal: no fim do período;
  - trocar durante o teste mantém o teste (`continue_trial`);
  - cancelar: no fim do período, sem reembolso parcial;
  - nome público e descrição na fatura do cartão: **BarChop / BARCHOP**.
  - A pergunta "Mudei de plano no meio do mês, quanto pago?" está nas Faturas.
- **#146 (PR 6):** Home sem o "lançamento" e com a tabela dos planos; `/precos`; `/gratis`; termos com a seção da cobrança; privacidade com a Stripe; Preços no cabeçalho (no celular estreito, só no rodapé); site sem rolar pro lado em 375px.
  - **Quem vende** (pessoa física: nome, CPF e e-mail; sem cidade) vem de `NEXT_PUBLIC_VENDEDOR_NOME`, `_CPF` e `_EMAIL`, porque o repositório é **público**. Nesta máquina estão no `apps/web/.env.local` (fora do git). O `compose.yaml` exige as três no `infra/.env`.
  - Os termos prometem aviso de 30 dias antes de mudar preço e o arrependimento de 7 dias (CDC art. 49, devolução pedida por e-mail, feita à mão na Stripe). Conferir com o dono/revisão jurídica.

**Próximo passo (nesta ordem):**
1. O dono confere `/painel/faturas`, `/`, `/precos`, `/gratis` e `/termos` no navegador.
2. **Entrada no ar dos PRs 4, 5 e 6 juntos** (merge só com "pode mergear"; mesclar #144, depois #145, depois #146). Antes:
   - o dono ativa a conta PF no modo real;
   - no modo real, repetir o Portal do cliente como no teste (troca de plano com os 4 preços, `always_invoice`, descida no fim do período, `continue_trial`) e conferir nome público e descrição na fatura;
   - criar o webhook real `https://api.barchop.com.br/stripe/webhook` com os eventos `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid` e `invoice.payment_failed`;
   - `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` no `infra/api.env` da VM;
   - `NEXT_PUBLIC_VENDEDOR_NOME`, `_CPF` e `_EMAIL` no `infra/.env` da VM (rebuild do web);
   - o deploy roda **as duas migrações** (`migrar`);
   - depois, `docker compose exec api node dist/criar-precos-no-stripe.js`;
   - a data da novidade "Faturas e assinatura" (`novidades.ts`) e a vigência dos termos (`controlador.ts`, hoje 15/10) mudam para o dia da entrada no ar.
3. Depois: o Portal só troca o preço, não a quantidade. Quem desce do Completo para o Essencial com mais de 3 profissionais não é barrado lá; segurar no app.

**Ambiente local:** como na seção de 14/10 abaixo. A API dev roda com `STRIPE_WEBHOOK_SECRET` do `stripe listen` e `CANAL_DE_MENSAGEM=log` (o Resend falha no dev).

## RETOMAR AQUI (noite de 2026-10-14 — #143 no ar, PR 4 testado na Stripe, PR 5 aberto como #145) — histórico

> **Este RETOMAR AQUI vive no branch `tela-do-plano` (#145), empilhado sobre o `stripe-na-cobranca` (#144).** Nenhum dos dois foi mesclado. Na outra máquina: `git fetch` e `git checkout tela-do-plano`. A `main` ainda mostra o RETOMAR AQUI de 13/10.

**Estado:**
- **Produção:**
  - **#143 no ar**, conferido em 14/10 à noite:
    - a disponibilidade aceita `?remarcar=` (a versão antiga dava 400);
    - o JS publicado tem "Com o mesmo profissional".
  - A `main` = `10ff35c`, toda em produção.
- **Última migração:** `20261015120000_assinatura_cancela_em` (PR 5).
  - Está aplicada só no dev e no test **desta** máquina.
  - Em produção, a última continua sendo `20261014120000_assinatura`.
- **Branches abertos (não mesclar ainda):**
  - `stripe-na-cobranca`: **#144**, o PR 4;
  - `tela-do-plano`: o PR 5, **#145**, aberto com base `stripe-na-cobranca`. Na abertura, as suítes estavam verdes: API 960, web 1141, formato 175.

**Feito em 14/10 à noite:**
- **Teste de fumaça do #144 na Stripe de teste: passou.** Os detalhes estão no plano `cobranca-do-barchop.plan.md`, na seção "Teste de fumaça do PR 4".
  - O `criar-precos` rodou no modo de teste com o OK do dono. A 2ª rodada deu "já está certo" nos 4 preços.
  - A `layout-dev` (banco dev) assinou o Essencial mensal com 2 profissionais e pagou com o cartão 4242. A assinatura está `trialing` na Stripe e `ativa` no banco.
  - O webhook respondeu 200. O evento repetido não foi aplicado duas vezes. O aviso "Assinatura ativa" chegou ao dono. O Portal abre.
- **Stripe CLI 1.53.1** instalado em `~/bin` (`stripe.exe`), sem `stripe login`.
  - Os comandos usam `--api-key` com a `sk_test_` do `apps/api/.env`.
  - `stripe listen --print-secret --api-key …` dá o `whsec_`. Passar esse valor no ambiente ao subir a API (`STRIPE_WEBHOOK_SECRET=… npx tsx --env-file=.env src/server.ts`), sem gravar no `.env`.
  - Cuidado: o `--print-secret` sai com uma linha em branco antes do segredo.
- **PR 5 (tela do plano), feito no branch `tela-do-plano`:**
  - **API:**
    - migração `cancela_em`: o webhook grava o `cancel_at` da Stripe e o apaga quando a assinatura chega `cancelada`. Testado na Stripe de verdade: cancelar e desfazer;
    - o `GET /barbearias/me/assinatura` ganhou `primeiraCobrancaPendente`, `cancelaEm`, `foraDoLink` (nomes, sem convite pendente nem quem não atende) e `temPortal`;
    - o `ResumoDaAssinatura` mora em `@barchop/types`.
  - **Web:**
    - `/painel/assinatura`, só do dono, no modelo do `Planos_BarbeiroApp.docx` do dono: configurador, cartão do plano, plano atual com Gerenciar pagamento e faturas, e perguntas frequentes;
    - faixa no topo, só do dono;
    - menu da conta com Plano, e Faturas abrindo o Portal;
    - `formatarReais` em `@barchop/formato`;
    - novidade "Plano da barbearia".
  - Conferido no navegador em 1440 e 375, sem nada vazando para os lados.

**Decisões do dono em 14/10 à noite:**
- **(b) Assinou durante o teste, vale o plano assinado na hora.** A tela diz "1ª cobrança em X".
- **Cancelar no Portal ganha migração própria** (`cancela_em`). As opções descartadas foram texto neutro e ler da Stripe na hora.
- A referência visual da tela do plano é o `Planos_BarbeiroApp.docx` do dono.

**Próximo passo (nesta ordem):**
1. **Ajustes miúdos do #145, se o dono quiser:**
   - a página do plano fica alinhada à esquerda em telas largas (até 880px);
   - o tema claro não foi conferido;
   - a data da novidade (14/10) muda para o dia da entrada no ar.
2. **PR 6:** site (`/precos`, `/gratis`, Home) e termos.
   - Branch empilhado no `tela-do-plano`; o PR vai com base `tela-do-plano`.
   - A tabela vem de `planos.ts` e o preço sai de `formatarReais`.
   - Os termos falam da cobrança recorrente, do cancelamento, do fim do teste e do atraso, e da Stripe como processadora. A política de privacidade cita a Stripe como operadora.
   - O dono decide quais dados pessoais aparecem nos termos, porque o vendedor é pessoa física.
3. **Entrada no ar dos PRs 4, 5 e 6 juntos** (#144, #145 e o PR 6; o merge só com "pode mergear" do dono). Antes:
   - **o dono ativa a conta PF no modo real** (hoje `charges_enabled: false`);
   - criar o webhook real `https://api.barchop.com.br/stripe/webhook`;
   - preencher `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` no `~/BarChop/barchop/infra/api.env` da VM;
   - o deploy roda **as duas migrações** (`migrar`);
   - depois, `docker compose exec api node dist/criar-precos-no-stripe.js`.

**Na outra máquina, antes de rodar qualquer coisa:**
- `pnpm install`. O `node-linker=hoisted` põe o `stripe` em `barchop/node_modules`, e não em `apps/api/node_modules`.
- `pnpm exec prisma generate` em `packages/database`. Pare a API de desenvolvimento antes, senão dá EPERM na DLL do Prisma.
- `prisma migrate deploy` nos bancos dev e test, até `20261015120000_assinatura_cancela_em`.
- Copiar a `STRIPE_SECRET_KEY=sk_test_...` para o `apps/api/.env`. Para o webhook local, instalar o Stripe CLI como acima.

**O que mais falta:** igual à seção de 13/10 abaixo.

**Ambiente local e Combinados:** iguais aos da seção de 11/10 abaixo.

## RETOMAR AQUI (2026-10-14 — cobrança: PRs 1 a 3 mesclados, PR 4 aberto) — histórico

> **Este RETOMAR AQUI vive no branch `stripe-na-cobranca` (PR #144), que ainda não foi mesclado.** Na outra máquina: `git fetch` e `git checkout stripe-na-cobranca`. A `main` ainda mostra o RETOMAR AQUI de 13/10.

**Estado:**
- **Produção:**
  - a API está com o **#142** (assinatura no banco). O deploy foi conferido em 14/10:
    - `GET /barbearias/me/assinatura` sem token dá 401;
    - pelo console do painel, deu `situacao: "teste"` com 14 dias.
  - O **#143** está mesclado (`main` = `10ff35c`) e **ainda não foi para produção**. Ele mexe na API e na web.
- **Última migração:** `20261014120000_assinatura`. Foi aplicada em produção e no dev e no test desta máquina.
- **Teste das barbearias que já existiam:** acaba em **28/10/2026 às 11h43**. Em produção só existem a teste1 e a barbearia-teste. **A GR Barber ainda não existe em produção**: vai se cadastrar e ganhar os 14 dias dela.
- **Branch aberto:** `stripe-na-cobranca`, o **PR #144** (PR 4 de 6), com todos os testes verdes. **Não mesclar ainda** (ver "Próximo passo").

**Feito em 14/10 (plano `.claude/plans/cobranca-do-barchop.plan.md`):**
- **#141 (PR 1):**
  - `@barchop/formato/src/planos.ts`: preços em centavos, limite, recursos, `precoDoPlano`, `precosDoCiclo` e `planoEfetivo`;
  - ADR-0010 (Stripe na cobrança, conta PF). A ADR-0005 passou a parcialmente substituída;
  - PRD da Onda 2 atualizado.
- **#142 (PR 2, MIGRAÇÃO):**
  - tabelas `assinatura` (1:1 com a barbearia, CHECK das listas) e `evento_stripe`;
  - o signup cria a assinatura em teste;
  - `GET /barbearias/me/assinatura`, só do dono. As rotas ficam sob `/barbearias/me`, e não `/me`.
- **#143 (PR 3):**
  - **Na equipe:** acima do limite do plano que vale agora, dá 422 `limite_do_plano`, com o convite de cada plano.
  - **No Grátis acima do limite**, o link público esconde quem ficou de fora. Isso vale para a página, a disponibilidade, os próximos horários, o "qualquer um" e o agendamento novo. O painel segue vendo todos.
- **#144 (PR 4, aberto):** lib `cobranca` (memória/Stripe/desligada), Checkout, Portal, webhook `POST /stripe/webhook`, quantidade na Stripe acompanhando a equipe e script `criar-precos`. Dependência `stripe` ^23. **Em produção, a API não sobe sem `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`.**

**Decisões do dono em 14/10:**
- **Pix:** está habilitado na conta, mas "Pagamentos recorrentes: Não". A assinatura fica **só no cartão**.
- **Portal do cliente:** configurado. A chave `sk_test_` está no `apps/api/.env` **desta** máquina.
- **Quem fica no link (Grátis acima do limite):** quem atende, com o dono à frente. Se o dono não atende, fica o profissional mais antigo que atende.
- **Remarcar:** o cliente **remarca** pela conta com o mesmo profissional, mesmo que ele tenha saído do link, desde que dentro do prazo de remarcar da barbearia.
- **Primeira cobrança:** assinar durante o teste só cobra **no fim do teste** (`trial_end`). Se faltarem menos de 48h, cobra na hora.

**Próximo passo (nesta ordem):**
1. **O dono faz o deploy do #143** (API + web, sem migração). Eu confiro no ar com curl.
2. **O dono responde duas perguntas:**
   - **(a)** posso rodar o `pnpm --filter @barchop/api criar-precos` no **modo de teste**? Rodar duas vezes: na 2ª, todos os preços têm que dizer "já está certo";
   - **(b)** a conta PF está **ativada no modo real**? Sem isso não existe `sk_live_`.
3. **Teste de fumaça do #144 na Stripe de teste, antes de pedir o merge:**
   - subir a API dev com a `sk_test_`;
   - gerar o JWT de dono (o truque da seção de 11/10);
   - `POST /barbearias/me/assinatura/checkout` tem que devolver uma URL real da Stripe;
   - opcional: pagar com o cartão 4242 4242 4242 4242 e conferir a assinatura (`trialing`, `lookup_key`, metadata `barbeariaId`, `current_period_end`);
   - o webhook local precisa do Stripe CLI (`stripe listen --forward-to localhost:3333/stripe/webhook`), que dá o `STRIPE_WEBHOOK_SECRET`.
4. **PR 5 (tela do plano):** empilhado sobre o #144, a partir do branch `stripe-na-cobranca`.
   - `/painel/assinatura` com plano em pílulas, profissionais −/+, Mensal/Anual, preço por `precoDoPlano`, Assinar e Gerenciar;
   - a faixa no topo;
   - Faturas e Plano no menu da conta;
   - Novidades.
   - **Pendências para o PR 5:**
     - `trialing` vira `ativa`, então quem assina o Essencial no dia 2 cai do Completo para o Essencial na hora. Combinar com o dono. Correção barata: expor "em teste na Stripe" e `periodoTerminaEm` ("1ª cobrança em X").
     - A faixa "X fora do link" precisa dos nomes do `foraDoLink`. Deixar de fora o convite pendente e o dono que não atende.
5. **PR 6:** site (`/precos`, `/gratis`, Home) e termos (cobrança recorrente, cancelamento, Stripe).
6. **Entrada no ar:** os PRs 4, 5 e 6 entram juntos, porque depois do merge do #144 a `main` só sobe em produção com as chaves reais. Antes:
   - criar o webhook real `https://api.barchop.com.br/stripe/webhook` com os eventos listados no PR #144;
   - preencher `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` no `infra/api.env` da VM;
   - depois de subir, rodar `docker compose exec api node dist/criar-precos-no-stripe.js`.

**Na outra máquina, antes de rodar qualquer coisa:**
- `pnpm install` (por causa da dependência `stripe` nova);
- `pnpm exec prisma generate` em `packages/database`;
- `prisma migrate deploy` nos bancos dev e test, até `20261014120000_assinatura`;
- copiar a `STRIPE_SECRET_KEY=sk_test_...` para o `apps/api/.env` de lá. O `.env` não viaja; o dono pega a chave no painel da Stripe.

**O que mais falta:** igual à seção de 13/10 abaixo.

**Ambiente local e Combinados:** iguais aos da seção de 11/10 abaixo.

## RETOMAR AQUI (noite de 2026-10-13 — Onda 2 começou: marco 1, cobrança pela Stripe) — histórico

**Estado:** produção = `baf335c` (#139). A `main` ganhou depois disso só docs (este PR). Nada pela metade em branch nenhuma. Última migração: `20261013120000_notificacoes`.

**Feito em 13/10 (#132–#139, tudo em produção):**
- Prévia da Aparência numa moldura só: Celular/Computador e Modo escuro.
- Medidas recomendadas: logo 512×512 e capa 1600×400.
- Logo com botão, como a capa, e com o título "Logo".
- Barra de topo do painel:
  - menu "…": Novidades, Central de ajuda, Aparência Claro/Escuro/Sistema;
  - menu da conta, com Faturas e Indique como "Em breve".
- Notificações e avisos (MIGRAÇÃO), sino com abas, e a tela de avisos do suporte.

**Onda 2 — o dono escolheu começar pelo marco 1 (BarChop cobra a assinatura):**
- Provedor: **Stripe**, conta de pessoa física (CPF), sem CNPJ.
- Plano aprovado: `.claude/plans/cobranca-do-barchop.plan.md`, em 6 PRs:
  1. `planos.ts` em `@barchop/formato` e ADR-0010;
  2. assinatura no banco (MIGRAÇÃO);
  3. limite de profissionais;
  4. Stripe: Checkout, Portal, webhook e o script dos preços;
  5. tela do plano no painel;
  6. site (`/precos`, `/gratis`) e termos.
- Decisões do dono:
  - GR Barber **paga**, sem cortesia;
  - `/precos` mostra a tabela, `/gratis` leva ao cadastro com o Grátis em destaque;
  - as decisões propostas no plano foram aceitas: recepção não conta, existentes ganham 14 dias a partir do deploy, sem pagar cai no Grátis sem apagar nada, só cartão até o Pix se confirmar;
  - marco 2: a gorjeta vai 100% para quem atendeu, e o desconto reduz o valor que é dividido.
- PRD: marco 1 `in-progress`.
- **Conta na Stripe criada pelo dono em 13/10:**
  - categoria Software (SaaS);
  - descrição no extrato `BARCHOP.COM.BR`, descrição curta `BARCHOP`.

**Próximo passo (nesta ordem):**
1. O dono põe a chave de teste no `barchop/apps/api/.env` como `STRIPE_SECRET_KEY=sk_test_...`. Nunca colar a chave no chat; conferir só o prefixo.
2. O dono vê se o Pix aparece em Formas de pagamento, e se é recorrente.
3. O dono configura o Portal do cliente nos dois modos: trocar cartão, faturas e cancelar no fim do período ligados; trocar plano e quantidade desligados.
4. Começar o PR 1 com `ecc:tdd-workflow`. Os PRs 1 a 3 não precisam da Stripe; a partir do PR 4, a chave é necessária.

**O que mais falta (depois da Onda 2 ou quando o dono pedir):**
- telas de UI/UX por print;
- `barbearia-teste` em produção (o aviso de teste de 13/10 só sai pelo banco);
- G4 (docs da onda 1);
- conferir no navegador a foto do membro e o serviço novo;
- razão social/CNPJ/DPO "a preencher" no site;
- G3 (GR Barber) só quando o dono pedir.

**Ambiente local e Combinados:** iguais aos da seção de 11/10 abaixo.

## RETOMAR AQUI (2026-10-12 — PRD da Onda 2 na main, Onda 2 adiada) — histórico

**Estado:** produção segue em `336717d` (#128); a `main` só ganhou docs depois disso (#129, #130 e este PR). Nada pela metade em branch nenhuma. Sem migração nova (última: `20261012120000_aparencia`).

**Onda 2 (dinheiro) — PRD pronto, mas o dono decidiu NÃO começar agora** (não propor `/plan` dela sem ele pedir):
- PRD: `.claude/prds/onda-2-dinheiro.prd.md` (#130). Quatro marcos, nessa ordem:
  1. BarChop cobra a assinatura.
  2. Caixa do dia e comissões: acerto por profissional, regra "de quem é o cliente × quem atendeu"; o cliente é de quem o atendeu primeiro e o dono troca à mão.
  3. Planos da barbearia para o cliente, com pagamento online e o dinheiro na conta da própria barbearia; o BarChop não cobra taxa sobre essas vendas.
  4. Relatórios.
- O que o PRD mestre (`barchop-saas.prd.md`) passou a registrar:
  - o piloto da GR Barber só começa com o sistema pronto, Onda 2 incluída;
  - sem entrevistas com outras barbearias;
  - o clube de assinatura subiu da Onda 3 para a 2.
- Preços decididos: Grátis (1 profissional, agendamentos sem limite), Essencial R$ 34,90 + R$ 10 por extra (até 3), Completo R$ 44,90 + R$ 15 por extra. Anual com 2 meses grátis. Teste de 14 dias com tudo liberado, sem cartão.
- Referências em `.claude/prds/referencias/`: as duas análises do Barbeiro.app e a pesquisa de preços dos concorrentes.
- Trava o `/plan` do marco 1:
  - CNPJ ou razão social (nenhum provedor abre conta sem);
  - escolha do provedor de pagamento;
  - custos da mensagem de WhatsApp na Meta, da taxa do provedor e da VM.
- O marco 2 não depende de gateway nem de CNPJ.

**O que falta (perguntar ao dono a ordem):** os itens 1 a 5 e 7 da lista da seção abaixo seguem valendo. O item 6 (Onda 2) virou o bloco acima e está adiado.

**Ambiente local e Combinados:** iguais aos da seção abaixo.

## RETOMAR AQUI (noite de 2026-10-11 — a tela Aparência inteira, marcos A a H, tudo em produção) — histórico

**Estado:** `main` = **produção** = `336717d` (até o #128; cada deploy conferido no ar com curl e grep nos chunks — por último: `PUT /barbearias/me/aparencia/layout-dos-servicos` dá 401 sem token (rota que não existe dá 404), "Categorias de serviço" no chunk da página pública e "Layout dos serviços" no de `/painel/configuracoes/aparencia`). Nada pela metade em branch nenhuma. **Migração nova:** `20261012120000_aparencia` (aplicada em produção pelo dono, e no dev e no test).

**A Aparência** (pedido do dono com o guia e as prints do Barbeiro.app; plano em `.claude/plans/aparencia.plan.md`, que tem as decisões e as armadilhas): `/painel/configuracoes/aparencia`, só o dono, área nova `aparencia` no índice (agora **6** áreas). Barbearia que nunca publicou fica exatamente como antes (tema BarChop = os tokens).
- #121 (A) `@barchop/formato/aparencia`: 17 temas (BarChop + os 16 da referência, descrições nossas), paleta pura com contraste WCAG garantido em teste, `normalizarAparencia`. Token novo `onAccent` (texto sobre a marca).
- #122 (B, **migração**) colunas `aparencia` (no ar) e `aparencia_rascunho` (**decisão do dono: rascunho guardado no servidor** até publicar/descartar); rotas PUT rascunho, POST publicar (409 sem rascunho), DELETE rascunho; hex estrito no schema.
- #123 (C) a página pública aplica a aparência publicada: `<style>` nos três blocos do tokens-css (só hex) + `<script>` do modo padrão; botão lua/sol quando o dono deixa (escolha em `pagina.<slug>.modo`, nunca `painel.tema`); texto sobre a marca vira `--cor-on-accent` em todos os componentes; `--cor-accent-on-dark` nas iniciais da fachada.
- #124 (D) a tela: blocos 1 (logo/capa → atalho pra Marca), 2 (temas com filtro, "personalizado · Voltar ao original", modo padrão, Sim/Não do botão do cliente) e 3 (16 cores, outra cor em hex, fundo por modo); rascunho gravado a cada mudança, uma gravação por vez; barra Publicar/Descartar presa ao pé; "Não guardado · Tentar de novo" quando falha. Publicar decide a área.
- #125 (G) ajuste fino: cantos, botão (sólido/contorno/gradiente), cards (plano/elevado/borda) e as nove cores por modo — variáveis com o valor de hoje como reserva (`var(--raio-botao, var(--raio-md))`), então o painel não muda. Marca herdada no escuro clareia até 3:1 (o Carvão sumia). **Corrigiu bug que estava no ar desde o #123:** o filtro de hex só aceitava maiúsculas e o BarChop personalizado no escuro vazava o claro.
- #126 (E) prévia ao vivo: iframe da página de verdade numa coluna presa à direita (celular/computador, Início/Agendar, claro/escuro, Atualizar, Ampliar num `<dialog>`, Abrir a página); rascunho por `postMessage` com origem conferida dos dois lados (cross-origin em produção: `painel.` → `<slug>.`), nunca pela URL.
- #127 (F) a letra: Roboto, Poppins, Montserrat, Open Sans e Lato em `barchop/font/` (recorte latino + licença, como a Inter), **sem pré-carga** (o painel segue só com Clash e Inter); a Inter virou `--fonte-inter` com `--fonte-corpo: var(--fonte-inter)` no `:root`; títulos em outra fonte e tamanho do texto (régua `--texto-*` a 0,9/1,1).
- #128 (H) layout dos serviços (lista agrupada × abas de categoria), **salva na hora** e leva junto o rascunho pendente; abas são um `tablist` acessível na página inicial. O passo Agendar segue em lista.

**Ambiente local:** `migrate deploy` nos bancos dev e test ao trocar de máquina (última migração: `20261012120000_aparencia`). O banco dev da `layout-dev` ficou com uma aparência que o dono testou (publicado Clássico + Poppins + Espaçoso; rascunho Oceano + Pílula + Open Sans) — não apagar sem perguntar. Pra ver o painel dev sem senha: gerar um JWT com o `JWT_SECRET` do `apps/api/.env` (payload `{tipo:"barbeiro", barbeiroId, barbeariaId, iat}`) e gravar em `localStorage["sessao.barbeiro"]` + `["sessao.barbearia"]`; um 401 (ex.: a API dev reiniciando com o `tsx watch`) derruba a sessão por regra. O servidor web dev travado ("Next stale", erro de worker) se resolve matando o PID da porta 3000 e subindo de novo.

**O que falta (perguntar ao dono a ordem):**
1. Aparência, depois: Histórico de alterações (adiado pelo dono; seria pras Configurações todas); abas também no passo Agendar (decidido que não, por ora); barra do proprietário dentro da prévia (a referência tem; aqui não).
2. Mais telas de UI/UX — o dono manda print por print ("não divida em quadrados").
3. Conferir no navegador o que só os testes cobriram: capa (Configurações) e foto do membro com o `CampoDeImagem` novo, a logo no painel (aba Marca), a tela de serviço novo e o editar membro do #110 em produção.
4. G4 — docs da onda 1.
5. `barbearia-teste` em produção: apagar ou manter.
6. Onda 2 (dinheiro): caixa, cobrança, planos — começar pelo PRD (`ecc:plan-prd`); preços/plano grátis do site entram aqui.
7. Solta: razão social/CNPJ/DPO "a preencher" (`apps/web/src/site/controlador.ts`).

**Combinados:** um PR por item, TDD RED → GREEN, português; push, PR e merge por mim só com "pode mergear" do dono no turno ("aprovado" é aprovação visual); `gh pr merge` passa no modo automático. **PR empilhado:** depois de mesclar a base, `gh pr edit <n> --base main` e conferir antes de mesclar o de cima (o GitHub não troca sozinho sem apagar o branch). Telas sem caixas: colunas sem moldura com título pequeno, linhas finas, pílulas no lugar de select/checkbox de poucas opções, Salvar/Descartar só quando muda (por grupo), frase do efeito antes da ação; conferir no navegador em 375 e 1440. Prettier não é do projeto — não rodar (reformata o arquivo inteiro). Deploy: o dono roda na VM sozinho e já sabe os comandos (não passar), rebuildando o `migrar` quando houver migração; eu confiro com curl e grep nos chunks.

## RETOMAR AQUI (fim de 2026-10-11 — Open Graph, semana sombreada, por profissional, no celular e horas nos livres, tudo em produção) — histórico

**Estado:** `main` = **produção** = `41465d5` (até o #119; #114 a #117 e #119 só web, sem migração, conferidos no ar em 2026-10-11 com `/health`, curl e grep: `og:image` de `https://www.barchop.com.br/` → 200 `image/png` no `www` e na raiz, sem 308; no chunk de `/painel/agenda`, `profissionais=` (#115) e `Filtrar por profissional` (#116); no CSS da agenda, `minmax(120px, 1fr)` (#117) e o `.livre` com `color:var(--cor-muted)` (#119)). Nada pela metade em branch nenhuma. Nenhuma migração nova desde `20261011120000_categoria_fechada`.

**Também de 2026-10-11 (#116–#120):**
- #119 **horários livres com a hora escrita** (pedido do dono; `b8f0b27` RED → `975954b` GREEN): cada faixa livre mostra a hora (09:00, 09:15, 09:30…) o tempo todo, no canto de cima, miúda e no cinza do eixo (`--cor-muted`); ao passar o mouse acende como antes. Pausa, fechado, ocupado e horário passado seguem sem hora. Contraste: no claro, em texto pequeno, fica abaixo de 4,5:1 — trocar o tom se o dono achar difícil de ler.
- #120 docs: este RETOMAR AQUI.
- #116 **semana por profissional** (`b36967d` RED → `213963d` GREEN): pílulas "Todos · Rafael · Ana" na semana, pra dono e recepção (não no dia, que já tem uma coluna por pessoa; não pro profissional). Escolhida uma pessoa (`?profissional=` na URL, mantido ao andar e ao trocar de vista), a semana mostra só os agendamentos e o expediente dela — pausa, folgas e o horário livre, que já leva ela pro Novo agendamento. Conferido em 1440.
- #117 **semana no celular** (`c46e866` RED → `8e2cf6c` GREEN → `169a1b0` teste sem CRLF): em 375 as sete colunas se sobrepunham (o `min-width: 120px` ia nos itens, com trilhas `minmax(0, 1fr)`). Os 120px vão nas trilhas, e cabeçalho e corpo têm a mesma largura mínima pra rolarem juntos dentro do quadro. Conferido em 375: colunas de 120px, página sem rolagem horizontal, cabeçalho alinhado depois de rolar. O eixo das horas rola junto (não fica fixo).

**Feito em 2026-10-11 (#113–#118):**
- #113 e #118 docs.
- **#89 decidido:** a grade da agenda continua clicável de 15 em 15 (sem código).
- #114 **imagem de Open Graph da home**: `app/(marketing)/opengraph-image.tsx`, 1200×630 gerado no build com a Clash Grotesk do repositório (TTF estáticos; o gerador não lê woff2). O Next serve em `/opengraph-image-<hash>`, que no host do site passava no formato de slug e ia pro subdomínio de uma barbearia: o `matcher` do `proxy.ts` deixa esse caminho de fora. Termos e Privacidade herdam a imagem.
- #115 **semana da agenda sombreada**: 7 consultas da rota do dia (`ocupacaoDoDia`, sem rota de período), presas ao domingo; a semana também busca as folgas. `expediente` da grade virou registro por data. **Regras do dono:** na coluna que junta a equipe só fica sombreado onde ninguém atende ("Pausa" quando todos no turno param; "Fechado" fora de todos os turnos, inclusive o vão entre turnos); um horário fica livre se alguém pode atender (no turno, fora da pausa, sem folga e sem agendamento dele) e leva essa lista pro Novo agendamento (`?profissionais=`), que oferece só essas pessoas — sendo uma, já escolhida; trocar dia ou hora tira a restrição. Todos em pausa = sem horário. Limite não visto: um agendamento que cubra a largura da coluna da semana pode esconder o horário livre de outro embaixo (vista de Dia ou o filtro por profissional resolvem).
- Convite pendente não entra na agenda nem na ocupação (`PODE_ATENDER` = ativo, atende e com senha) — foi o que confundiu o teste do dono com a Ana.

**G3 adiado:** o dono decidiu (2026-10-08) que a GR Barber ainda não entra em produção. Não propor até ele pedir.

**Ambiente local:** ao trocar de máquina, `migrate deploy` nos bancos dev e test (última migração: `20261011120000_categoria_fechada`). Banco dev da `layout-dev`: casa de segunda a sábado, 9–19; Rafael Dono com pausa 12–13 e folga na quarta; **Ana Souza ativada só no dev** (senha `ana-dev-123`, sem aceitar convite) com segunda 10–18 e pausa 12–13. Sem clientes. O `TaskStop` não derruba os filhos do `pnpm dev`: encerrar pelos PIDs das portas 3000 e 3333.

**O que falta (perguntar ao dono a ordem):**
1. Mais telas de UI/UX — o dono manda print por print ("não divida em quadrados").
2. Conferir no navegador o que só os testes cobriram: capa (Configurações) e foto do membro com o `CampoDeImagem` novo, a logo no painel (aba Marca), a tela de serviço novo e o editar membro do #110 em produção.
3. G4 — docs da onda 1.
4. `barbearia-teste` em produção: apagar ou manter.
5. Onda 2 (dinheiro): caixa, cobrança, planos — começar pelo PRD (`ecc:plan-prd`); preços/plano grátis do site entram aqui.
6. Solta: razão social/CNPJ/DPO "a preencher" (`apps/web/src/site/controlador.ts`).

**Combinados:** um PR por item, TDD RED → GREEN, português; push, PR e merge por mim só com "pode mergear" do dono no turno ("aprovado" é aprovação visual); `gh pr merge` passa no modo automático. Telas sem caixas: colunas sem moldura com título pequeno, linhas finas, pílulas no lugar de select/checkbox de poucas opções, Salvar/Descartar só quando muda (por grupo), frase do efeito antes da ação; conferir no navegador em 375 e 1440. Deploy: o dono roda na VM sozinho e já sabe os comandos (não passar), rebuildando o `migrar` quando houver migração; eu confiro com curl e grep nos chunks.

## RETOMAR AQUI (2026-10-11 — editar membro sem caixas e Cancelar no novo agendamento, tudo em produção) — histórico

**Estado:** `main` = **produção** = `305e764` (até o #112; #110 e #112 só web, sem migração, os dois conferidos no ar em 2026-10-11 com `/health` e grep nos chunks — #110: "perde o acesso ao painel" e "Reativar devolve os dois" em `/painel/equipe/[id]`; #112: "Cancelar" e `.replace(` no chunk de `/painel/agendamentos/novo`). Nada pela metade em branch nenhuma. Nenhuma migração nova desde `20261011120000_categoria_fechada`.

**Feito em 2026-10-10 (#110):**
- **Editar membro sem caixas** (pedido do dono): topo no desenho do detalhe do cliente ("← Equipe", nome, selo da situação, resumo do papel); duas colunas sem caixas — dados e jornada à esquerda, foto, serviços e situação à direita (uma coluna no celular). **Cada grupo salva sozinho** (dados, jornada, serviços), com Salvar/Descartar só quando aquele grupo mudou. Situação com a frase do efeito antes de Reenviar/Desativar. Convidar membro numa coluna só. Peça nova `componentes/Grupo` (a `Secao` sem moldura; as Configurações seguem com a `Secao`).
- **Bug corrigido (estava em produção):** depois de "Salvar jornada"/"Salvar serviços" a tela voltava pro valor antigo (a API gravava certo): o GET antigo sobrescrevia a resposta do salvar. Agora a última resposta do GET e a base gravada ficam separadas.

**Feito em 2026-10-11 (#111–#112):**
- #111 docs: este RETOMAR AQUI.
- #112 **Cancelar no novo agendamento** (pedido do dono): botão abaixo do Agendar, no fecho, que volta pra tela anterior (`router.back()` — a tela abre do Hoje, da Agenda, da lista e do detalhe do cliente). Dia e hora agora trocam a URL com `router.replace` (com `push` o voltar caía na mesma tela). Limite: aberto direto numa aba nova, sem histórico, o Cancelar não faz nada. No teste, `navegacaoFalsa.back`.
- `gh pr merge` voltou a passar no modo automático (com o "pode mergear" do dono).

**G3 adiado:** o dono decidiu (2026-10-08) que a GR Barber ainda não entra em produção. Não propor até ele pedir.

**Ambiente local:** ao trocar de máquina, `migrate deploy` nos bancos dev e test (última migração: `20261011120000_categoria_fechada`). O banco dev da barbearia `layout-dev` está sem horário de funcionamento e sem clientes: nenhum dia com vaga no novo agendamento.

**O que falta (perguntar ao dono a ordem):**
1. Mais telas de UI/UX — o dono manda print por print ("não divida em quadrados").
2. Conferir no navegador o que só os testes cobriram: capa (Configurações) e foto do membro com o `CampoDeImagem` novo, a logo no painel (aba Marca), a tela de serviço novo e o editar membro do #110 em produção.
3. G4 — docs da onda 1.
4. Sombrear também a vista de semana da agenda (hoje só o dia; precisa de 7 consultas ou rota de período).
5. `barbearia-teste` em produção: apagar ou manter.
6. Onda 2 (dinheiro): caixa, cobrança, planos — começar pelo PRD (`ecc:plan-prd`); preços/plano grátis do site entram aqui.
7. Soltas: razão social/CNPJ/DPO "a preencher" (`apps/web/src/site/controlador.ts`); imagem de Open Graph da home; pergunta do #89 (só hora cheia clicável na grade?).

**Combinados:** um PR por item, TDD RED → GREEN, português; push, PR e merge por mim só com "pode mergear" do dono no turno ("aprovado" é aprovação visual). Telas sem caixas: colunas sem moldura com título pequeno, linhas finas, pílulas no lugar de select/checkbox de poucas opções, Salvar/Descartar só quando muda (por grupo), frase do efeito antes da ação; conferir no navegador em 375 e 1440. Deploy: o dono roda na VM sozinho e já sabe os comandos (não passar), rebuildando o `migrar` quando houver migração; eu confiro com curl e grep nos chunks.

## RETOMAR AQUI (fim de 2026-10-09 — categoria fechada, Inter local e telas sem caixas, tudo em produção) — histórico

**Estado:** `main` = **produção** = `4874b7c` (até o #108; cada deploy conferido no ar com curl e grep nos chunks). Nada pela metade em branch nenhuma. A migração `20261011120000_categoria_fechada` está aplicada em produção e no banco local de desenvolvimento.

**Feito em 2026-10-09 (#101–#108):**
- **Categoria do serviço em lista fechada** (plano `.claude/plans/categoria-fechada.plan.md`). #101 (API, **migração**): `CATEGORIAS_DE_SERVICO` em `@barchop/formato` — cabelo, barba, combo, sobrancelha, quimica ("Química e tratamentos"), infantil; a migração converteu o texto livre por palavra-chave (sem acento e sem caixa; não casou = sem categoria, caso do "CEBELO") e pôs o CHECK; a API valida com `enum`. #102 (telas): pílulas no cadastro, seções da página pública e da lista do painel na ordem da lista com `ROTULO_DA_CATEGORIA`, ícone por valor. #104: `categoriaConhecida()` — valor fora da lista vira "sem categoria" em vez de sumir (no primeiro deploy o web novo subiu antes do `migrar` e o serviço sumiu da página).
- #103 **Inter self-hosted** em `barchop/font/Inter/` (Inter 4.1, recorte latino, licença OFL) por `next/font/local`, com `tests/app/fontes.test.ts`: o build do web tinha quebrado na VM ao baixar a fonte do `fonts.gstatic.com`. O build não depende mais de internet pras fontes.
- #105 **cadastro de serviço**: prévia "Como o cliente vê" (o `CartaoDeServico`, `inert`) na coluna da direita com a foto embaixo; `CampoDeImagem` sem o input cru do navegador (botão "Escolher/Trocar foto", lugar "Sem foto" tracejado, Remover discreto) — vale também pra capa e foto do membro; rodapé Salvar/Cancelar | Desativar com a frase do efeito; preço abre com vírgula.
- #106 **detalhe do cliente sem caixas**: topo com "← Clientes", resumo ("N agendamentos · próximo em … · último em …") e as ações WhatsApp e Agendar (`BotaoLink`; `linkDoZap` em `painel/whatsapp.ts`); histórico em Próximos/Anteriores com cada linha levando ao agendamento; dados com Salvar/Descartar só quando algo mudou.
- #107 **folgas sem caixas**; o `FormularioDeBloqueio` (também da janela "Bloquear horário" da agenda) ganhou membro e "Dia inteiro / Só algumas horas" em pílulas, o Até acompanhando o De, atalhos de motivo (Folga, Férias, Almoço, Médico) e a frase "X fica fora da agenda …"; a lista mostra o período por extenso (`formatarPeriodo`).
- #108 **página pública**: a Equipe foi pra lateral, logo abaixo do Horário de funcionamento.
- **Lição do deploy (de novo):** com migração, o `migrar` precisa ser rebuildado e subido — ficou pra trás no #97 e no #101.

**G3 adiado:** o dono decidiu (2026-10-08) que a GR Barber ainda não entra em produção. Não propor até ele pedir.

**Ambiente local:** ao trocar de máquina, `migrate deploy` nos bancos dev e test (migração nova: `20261011120000_categoria_fechada`). Sem login, o dev deu 404 em `/painel/servicos/novo` e `/painel/clientes/novo`; logado, abriu normal.

**O que falta (perguntar ao dono a ordem):**
1. Mais telas de UI/UX — o dono manda print por print ("não divida em quadrados").
2. Conferir no navegador o que só os testes cobriram: capa (Configurações) e foto do membro com o `CampoDeImagem` novo, a logo no painel (aba Marca) e a tela de serviço novo.
3. G4 — docs da onda 1.
4. Sombrear também a vista de semana da agenda (hoje só o dia; precisa de 7 consultas ou rota de período).
5. `barbearia-teste` em produção: apagar ou manter.
6. Onda 2 (dinheiro): caixa, cobrança, planos — começar pelo PRD (`ecc:plan-prd`); preços/plano grátis do site entram aqui.
7. Soltas: razão social/CNPJ/DPO "a preencher" (`apps/web/src/site/controlador.ts`); imagem de Open Graph da home; pergunta do #89 (só hora cheia clicável na grade?).

**Combinados:** um PR por item, TDD RED → GREEN, português; push, PR e merge por mim só com "pode mergear" do dono no turno ("aprovado" é aprovação visual). Telas sem caixas: colunas sem moldura com título pequeno, linhas finas, pílulas no lugar de select/checkbox de poucas opções, Salvar/Descartar só quando muda, frase do efeito antes da ação; conferir no navegador em 375 e 1440. Deploy: o dono roda na VM sozinho e já sabe os comandos (não passar), rebuildando o `migrar` quando houver migração; eu confiro com curl e grep nos chunks.

## RETOMAR AQUI (fim de 2026-10-08, noite — polimento de UI/UX e logo, tudo em produção) — histórico

**Estado:** `main` = **produção** = `4cc2296` (até o #99, conferido no ar com curl e grep no bundle e no CSS). Nada pela metade em branch nenhuma. A migração `20261010120000_logo_da_barbearia` está aplicada em produção e no banco local de desenvolvimento.

**Feito em 2026-10-08 à tarde (#92–#99, UI/UX pedido pelo dono, print por print):**
- #92 trilha "Primeiros passos": barra de progresso, próximo passo destacado (único botão amarelo), número no círculo, feitos viram selo, Recolher/Mostrar (`localStorage` `painel.trilha`), "Esperando o primeiro cliente". #93 as ações viram rodapé do cartão (`IconeSeta` novo).
- #94 detalhe do agendamento **sem blocos**: faixa do próximo passo (caminho Pendente → Confirmado → Concluído; só as ações do estado, com verbo; Cancelar com confirmação inline; Reabrir/Reativar/Desfazer falta), corpo em duas colunas sem caixas, observações com Salvar/Descartar só quando mudam.
- #95 página pública: capa 4:1 no desktop, atalhos Mapa/WhatsApp/Instagram no topo, lateral sem moldura com "Agendar agora" no topo (no celular segue grudado no rodapé), serviços em lista única, equipe sem cartões. #99 selo de aberto + endereço numa linha; no desktop os atalhos à direita.
- #96 página pública e fluxo do cliente seguem o tema do sistema; o site de marketing segue claro pelo host (`scriptDeTema(hostDoSite(NEXT_PUBLIC_URL_DO_SITE))` em `src/painel/tema.ts`).
- #97 (API, **migração**) logo: `logo_chave` + `logo_formato` (redonda/quadrada/livre), `logo_url` apagada; `POST /barbearias/me/logo?formato=` e `DELETE`; PATCH só `logoFormato`. #98 (telas) `painel/logo.ts` (sugere a moldura pelos pixels; 512px WebP com alfa — a capa segue em JPEG), `LogoDaBarbearia`, `CampoDaLogo` na aba Marca, logo na fachada (metade sobre a capa), no topo do fluxo e na marca do painel.
- **Lição do deploy do #97:** o `migrar` tem imagem própria (target `migrar` do `api.Dockerfile`). Buildar só a `api` deixou o `migrar` velho ("No pending migrations") e a API nova deu 500 (`column barbearia.logo_chave does not exist`). Com migração: `docker compose build migrar` + `docker compose up migrar`.

**G3 adiado:** o dono decidiu (2026-10-08) que a GR Barber ainda não entra em produção. Não propor até ele pedir (`/barbearias/gr-barber` dá 404 em produção — esperado).

**Ambiente local:** a API de dev ficou fora do ar depois do `prisma generate` do #97 (o `tsx watch` vivo, sem servidor) — reiniciar `pnpm dev` em `apps/api`. Ao trocar de máquina, rodar `migrate deploy` nos bancos dev e test (migração nova: `20261010120000_logo_da_barbearia`).

**O que falta (perguntar ao dono a ordem):**
1. Conferir a logo no painel em produção (aba Marca e barra lateral): só os testes cobriram; a sessão local do painel tinha caído.
2. Mais telas de UI/UX — o dono vinha mandando print por print.
3. G4 — docs da onda 1.
4. Sombrear também a vista de semana (hoje só o dia; precisa de 7 consultas ou rota de período).
5. `barbearia-teste` em produção: apagar ou manter.
6. Onda 2 (dinheiro): caixa, cobrança, planos — começar pelo PRD (`ecc:plan-prd`); preços/plano grátis do site entram aqui.
7. Soltas: categoria "CEBELO" nos dados do dono (aparece na página pública); razão social/CNPJ/DPO "a preencher" (`apps/web/src/site/controlador.ts`); imagem de Open Graph da home; pergunta do #89 (só hora cheia clicável na grade?).

**Combinados:** um PR por item, TDD RED → GREEN, português; push, PR e merge por mim com "pode mergear" do dono no turno. Telas sem pilha de caixas com título: ação principal em destaque, resto sem moldura. Deploy: o dono roda na VM sozinho e já sabe os comandos (não passar), rebuildando o `migrar` quando houver migração; eu confiro com curl e grep no bundle.

## RETOMAR AQUI (fim de 2026-10-08 — painel v2 completo e em produção) — histórico

**Estado:** `main` = **produção** (até o #90, conferido no ar com curl e grep no bundle do painel). Nada pela metade em branch nenhuma. **Painel v2 completo** (os 6 marcos do PRD `painel-v2.prd.md`).

**Feito em 2026-10-08 (#79–#90):**
- Marco 5 — Listas (`painel-v2-listas.plan.md`): #79 serviços por categoria + pílulas + busca; #80 `GET /clientes?faixa=recentes|sumidos` + `contagens`; #81 clientes com pílulas contadas no servidor (faixa na URL); #82 equipe com pílulas e Situação; #83 docs.
- Marco 6 — Agenda (`painel-v2-agenda.plan.md`): #84 a ocupação devolve `janela`/`pausa` de cada profissional; #85 vista de dia sombreia fora do expediente e a pausa, sem horário livre ali; #86 faixa de resumo + "Agora"; #87 "Bloquear" na agenda (formulário extraído de Folgas; coluna única desenha bloqueios); #88 docs.
- #89 grade da agenda dividida por hora (pedido do dono): uma linha por hora cheia, eixo de hora em hora; o clique continua de 15 em 15.
- #90 tipo do `packages/formato/tests/regras.test.ts` corrigido: `pnpm -r --no-bail type-check` limpo nos 6 pacotes.

**G3 adiado:** o dono decidiu (2026-10-08) que a GR Barber ainda não entra em produção. Não propor até ele pedir.

**O que falta (perguntar ao dono a ordem):**
1. G4 — docs da onda 1.
2. Sombrear também a vista de semana (hoje só o dia; precisa de 7 consultas ou rota de período).
3. `barbearia-teste` em produção: apagar ou manter.
4. Onda 2 (dinheiro): caixa, cobrança, planos — começar pelo PRD (`ecc:plan-prd`); preços/plano grátis do site entram aqui.
5. Soltas: razão social/CNPJ/DPO "a preencher" (`apps/web/src/site/controlador.ts`); imagem de Open Graph da home; telas do 3g e várias horizontais não vistas no navegador; cartaz/janela não vistos no tema claro e cartaz no celular.
6. Pergunta em aberto (#89): na grade, só hora cheia clicável?

**Combinados:** um PR por item, TDD RED → GREEN, português; push, PR e merge por mim com "pode mergear" do dono no turno; telas novas com aprovação visual (375 e 1440). Deploy: o dono roda na VM, **um comando por vez** (`git pull` → `docker compose build api` (+ `migrar`) → `build web` → `up -d`); eu confiro com curl e grep no bundle.

## RETOMAR AQUI (2026-10-08, tarde — painel v2 completo na main) — histórico

**Estado:** **painel v2 completo** (os 6 marcos do PRD `painel-v2.prd.md`). Hoje entraram o marco 5 (Listas, #79–#83) e o marco 6 (Agenda, plano `painel-v2-agenda.plan.md`): #84 a ocupação devolve `janela`/`pausa` de cada profissional; #85 a vista de dia sombreia fora do expediente e a pausa e não oferece horário livre ali; #86 faixa de resumo + "Agora"; #87 "Bloquear" na agenda (janela com o formulário extraído de Folgas; coluna única passa a desenhar bloqueios). **Produção = marco 4** (`8fff69d`, último conferido). **Primeiro:** deploy dos marcos 5 e 6 juntos — API e web, sem migration: `git pull` → `docker compose build api` → `docker compose build web` → `docker compose up -d`; conferir `/health`, `GET /clientes?faixa=sumidos` e `GET /barbearias/me/ocupacao?data=` sem login = 401, `/painel/agenda`. Nada pela metade em branch nenhuma.

**Depois (perguntar ao dono a ordem):** G3 (GR Barber em produção com `lembrete_ativo = false`), G4 (docs da onda 1), soltas: dados legais (razão social/CNPJ/DPO); `barbearia-teste` em produção; `packages/formato` com erro de tipo em `tests/regras.test.ts` (já na `main` antes do marco 5); sombrear a semana também (marco 6 deixou só no dia).

## RETOMAR AQUI (2026-10-08 — marco 5 completo na main) — histórico

**Estado:** marco 5 do painel v2 (Listas) **completo** na `main` (plano `painel-v2-listas.plan.md`): #79 serviços por categoria + pílulas + busca; #80 `GET /clientes?faixa=recentes|sumidos` + `contagens` (API, types, api-client e dublê com `hoje` na semente); #81 clientes com pílulas contadas no servidor; #82 equipe com pílulas e Situação. **Produção = marco 4** (`8fff69d`). **Primeiro:** deploy do marco 5 — API e web, sem migration: `git pull` → `docker compose build api` → `docker compose build web` → `docker compose up -d`; conferir `/health`, `GET /clientes?faixa=sumidos` sem login = 401, `/painel/clientes`. Nada pela metade em branch nenhuma.

**Depois (perguntar ao dono a ordem):** marco 6 do painel v2 (Agenda: resumo do dia, "Agora", "Bloquear" na agenda, almoço sombreado — plano a criar com `ecc:plan`), G3 (GR Barber com `lembrete_ativo = false`), G4 (docs), soltas (dados legais; `barbearia-teste` em produção; `packages/formato` com erro de tipo em `tests/regras.test.ts`, já na `main` antes do marco 5).

## RETOMAR AQUI (2026-10-07, fim da noite — marco 4 completo na main) — histórico

**Estado:** `main` = `8fff69d` (marco 4 do painel v2, Hoje, completo: #75 ocupação na API, #76 link/QR/cartaz, #77 próximos + ocupação + layout). **Produção = `3e3f80d`** (1s-c no ar, conferido com curl). **Primeiro:** deploy do marco 4 — API e web, sem migration: `git pull` → `docker compose build api` → `docker compose build web` → `docker compose up -d`, e conferir (`/health`; `GET /barbearias/me/ocupacao` sem login = 401; `/painel`). Nada pela metade em branch nenhuma.

**Depois (perguntar ao dono a ordem):** marco 5 do painel v2 (Listas: serviços por categoria, clientes e equipe com pílulas e tabela nova — plano a criar com `ecc:plan` do PRD `painel-v2.prd.md`), marco 6 (Agenda), G3 (GR Barber com `lembrete_ativo = false`), G4 (docs) e as soltas do item 4 abaixo.

### Bloco anterior (marco 3 completo)

**Feito depois do bloco abaixo (PRs #65–#72):**
- Marco 3 do painel v2 **completo**: 3e #65 regras na API (migration `20261009120000_regras_de_agendamento`), 3f #66 tela Regras + 5ª área + Novo agendamento com token, 3g #67 cliente obedece os prazos (botões somem + WhatsApp/telefone da casa).
- Página pública sem a fita listrada, com ou sem capa (#68, #69).
- **Todas as telas horizontais no desktop** (pedido do dono): Configurações (#66), painel (#71), fluxo do cliente (#72), termos/privacidade (#70). Peças `apps/web/src/componentes/Colunas` (`LadoALado`, `CamposLadoALado`). Tela nova já nasce assim.
- **Onda 1s-b** (#70): `/termos`, `/privacidade`, links no rodapé, aceite no cadastro. Razão social, CNPJ e e-mail do DPO "a preencher" em `apps/web/src/site/controlador.ts` (o dono ainda não tem).

**O que falta (perguntar ao dono a ordem):**
1. ~~`onda-1s-c`~~ — **feito em 2026-10-07** (PR `onda-1s-c`): robots, sitemap, description/Open Graph, docs. **Onda 1s completa** no mínimo; precisa de deploy do web (sem migration).
2. ~~Marco 4 do painel v2 — Hoje~~ — **feito em 2026-10-07** (plano `painel-v2-hoje.plan.md`; PRs #75 ocupação na API, #76 link/QR/cartaz, `painel-v2-hoje-dia` próximos + ocupação + layout). Deploy: API e web, sem migration. Próximos: marcos 5 (Listas) e 6 (Agenda).
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
#### Task G4: Roteiro/screens.md/PRD atualizados; linha 1 do PRD → `complete` só com o piloto rodando — FEITO em 2026-10-16 (a linha 1 espera o G3)

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
