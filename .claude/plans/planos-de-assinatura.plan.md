# Plan: Planos de assinatura para o cliente

**Source PRD**: `.claude/prds/onda-2-dinheiro.prd.md`
**Selected Milestone**: 3 — Planos de assinatura para o cliente
**Complexity**: Large (12 PRs, 1 migração no PR 2)
**Status**: aguardando a aprovação do dono (plano escrito em 2026-10-24)

## Summary
A barbearia e cada barbeiro liberado pelo dono criam planos de assinatura: ciclo, preço, dias de teste e serviços incluídos com limite de usos por ciclo. A página pública mostra esses planos numa vitrine. O cliente assina e paga online pelo Asaas, com o dinheiro na conta de quem vende, ou combina o pagamento no balcão.

Quando o assinante é atendido, o painel registra o atendimento "pelo plano" no caixa. Assim:
- o uso é contado;
- no plano da casa, quem atendeu ganha o valor fixo;
- a mensalidade recebida entra no acerto do dia com a parte da casa.

O caminho sem provedor (planos, vitrine, assinante "no balcão", "pelo plano" no caixa) sai primeiro. O Asaas entra por cima, num conector que depois recebe o Mercado Pago e a Stripe.

## Decisões do dono (24/10, antes do plano; gravadas no PRD)
- **Dois tipos de plano.** Há planos **da casa** e planos **de barbeiro**. O dinheiro cai na conta de quem vende.
- **Plano de barbeiro:**
  - vale só com aquele barbeiro;
  - com outro barbeiro, o atendimento é avulso e entra no caixa como hoje;
  - a casa fica com o mesmo % da "parte da casa" do barbeiro sobre a mensalidade recebida, cobrado no acerto.
- **Plano da casa:**
  - vale com qualquer profissional;
  - quem atende ganha um **valor fixo por atendimento**, definido no plano;
  - no acerto, a casa deve esse valor a quem atendeu.
- **Quem vende.** O dono sempre vende. Cada profissional só vende se o dono ligar "pode vender planos" para ele. Quem vende conecta a própria conta no provedor.
- **Provedores.** Cada provedor tem um conector. O primeiro é o **Asaas**: o vendedor cola a chave de API, e o BarChop cria o webhook pela API com um `authToken` próprio. O Pix Automático fica como extra.
- **O BarChop não cobra taxa** sobre essas vendas (PRD).

## Decisões propostas (confirmar ao aprovar o plano)
1. **Em qual plano do BarChop.** Os dois tipos ficam no recurso `planosDaBarbearia`, que hoje só existe no Completo (`planos.ts:68`). Nenhuma mudança de preço.
2. **Onde o uso é contado: no caixa, não no agendamento.**
   - A página pública agenda sem login (nome e telefone), então não prova quem está agendando.
   - O uso conta quando o painel registra o pagamento com a forma **"Pelo plano"** (PR 6). Ali a API confere:
     - assinatura `ativa`;
     - serviço incluído e com uso sobrando no ciclo;
     - no plano de barbeiro, que quem atendeu é o vendedor.
   - **Diferença da prévia que o dono viu:** a mensagem "Seu plano vale só com Gustavo" não aparece ao agendar. Ela aparece no painel, na hora de registrar. Mostrar a mensagem ao agendar, para o cliente logado, fica para depois.
3. **Atendimento pelo plano, no caixa:**
   - registra `forma = "plano"`, com o valor dos serviços cobertos zerado;
   - serviço fora do plano, ou uso que passou do limite, é cobrado à parte no mesmo pagamento: ele ganha um campo de **valor avulso**, que é dividido pelas regras de hoje;
   - **no plano de barbeiro**, a parte "pelo plano" não gera nada: o barbeiro já recebeu a mensalidade;
   - **no plano da casa**, gera a parte `plano` para quem atendeu, no valor fixo. O `recebidoPor` é o membro que conectou a conta da casa, porque é ele quem está com o dinheiro. Assim o `acertoDoDia` mostra "Gustavo repassa R$ 25 para o Parceiro" sem mudar a conta dele;
   - gorjeta segue a regra de hoje: 100% para quem atendeu, sobre a forma do pagamento avulso. Atendimento só pelo plano não aceita gorjeta no MVP.
4. **Mensalidade no caixa:**
   - cada mensalidade recebida (webhook do Asaas, ou "recebi no balcão" marcado no painel) vira uma linha de `recebimento_do_plano`;
   - a parte da casa é **congelada na hora**, como as partes do caixa:
     - no plano de barbeiro: preço × `parteDaCasa` do vendedor, arredondado para baixo;
     - no plano da casa: 100% casa;
   - a conta é sobre o **preço do plano (bruto)**, não sobre o líquido da taxa do Asaas: a taxa é custo de quem vende;
   - o dia do caixa é o dia em que o pagamento foi confirmado. Se esse dia já estiver fechado, o recebimento entra no **próximo dia aberto** e o Caixa mostra "recebido em DD/MM";
   - o `GET` do caixa soma os recebimentos ao acerto (`acertoDoDia` já só pede `recebidoPor` e partes).
5. **Situações da assinatura do cliente:** `pendente` (esperando o 1º pagamento), `teste`, `ativa`, `em_atraso`, `cancelada`.
   - Só `ativa` e `teste` usam o plano.
   - Assinante `em_atraso` é atendido como avulso, até o pagamento entrar.
6. **Dinheiro que segue andando no provedor.** Para cada caso, o que o BarChop faz:
   - **A barbearia cai no Grátis (teste vencido ou assinatura do BarChop cancelada):** as assinaturas que existem continuam valendo (são do cliente com quem vende) e o caixa segue contando. Novas vendas e vitrine ficam desligadas. A tela de Planos mostra o convite para o Completo.
   - **Desativar um membro** com assinantes ativos no plano dele: a tela pergunta e **cancela as assinaturas no provedor no mesmo passo**. Sem resposta, não desativa.
   - **Tirar o "pode vender planos"** de quem tem assinantes: os planos dele saem da vitrine e param de aceitar assinante novo. As assinaturas que existem continuam até o fim.
   - **Desconectar a chave do Asaas** com assinaturas vivas: **recusado** (422 `assinaturas_ativas`), com a lista de quem cancelar antes. Sem isso o webhook deixaria de chegar e a cobrança continuaria.
7. **Ciclos do MVP:** mensal, trimestral e anual. Os dias de teste empurram a primeira cobrança.
8. **Checkout do Asaas pela fatura dele (`invoiceUrl`).** O BarChop nunca vê dado de cartão.
   - Assinar exige o cliente **logado** na página pública, porque o login já existe: código + senha, em `auth-cliente.ts`.
   - Se o Asaas exigir CPF para cobrar (conferir no PR 8), o CPF é pedido no checkout e guardado no cadastro do cliente. Nesse caso, Privacidade e Termos ganham o trecho.
9. **"No balcão":**
   - o plano pode aceitar online, no balcão ou os dois;
   - assinante no balcão é cadastrado pelo painel, no detalhe do cliente;
   - cada ciclo é marcado "recebi" à mão, com a forma, e vira um recebimento do item 4;
   - ciclo sem "recebi" deixa a assinatura em `em_atraso` no dia seguinte ao vencimento.
10. **Chave do Asaas:**
    - cifrada no banco com AES-256-GCM, com a chave `CHAVE_DE_CIFRA` do ambiente. A API não sobe em produção sem ela, como com o `JWT_SECRET`;
    - nunca volta para a tela: a tela só mostra os 4 últimos caracteres;
    - o `authToken` do webhook é gerado pelo BarChop, guardado só como hash e conferido com `timingSafeEqual`;
    - chave de sandbox é recusada em produção e vice-versa, como o `modoDaChave` da Stripe.

## Modelo (PR 2, migração `20261026120000_planos_de_assinatura`)
- `barbeiro.pode_vender_planos`: `BOOLEAN`, padrão `false`. O dono vende sem precisar dela.
- `barbearia.vitrine_de_planos`: `BOOLEAN`, padrão `false`.
- `conexao_de_pagamento`: a conta de um vendedor num provedor.
  - `id`, `barbearia_id`, `barbeiro_id` (quem conectou) e `da_casa` (`BOOLEAN`: a conta que recebe os planos da casa; UNIQUE parcial com uma por barbearia);
  - `provedor` (CHECK `asaas`) e `modo` (`teste` | `real`);
  - `chave_cifrada` (`BYTEA`), `chave_final` (4 caracteres) e `webhook_token_hash`;
  - `id_externo_webhook`, `criado_em`;
  - UNIQUE `(barbeiro_id, provedor)` para as contas de barbeiro.
- `plano_de_assinatura`:
  - `id`, `barbearia_id` e `vendedor_id` (anulável: nulo = da casa; `ON DELETE RESTRICT`);
  - `nome`, `descricao`, `ciclo` (CHECK), `preco_centavos`, `dias_de_teste` (0 a 30);
  - `fixo_por_atendimento_centavos` (só no da casa; CHECK nulo quando é de barbeiro);
  - `aceita_online`, `aceita_no_balcao`, `ativo`, `ordem`, `criado_em`.
- `plano_servico`: `plano_id`, `servico_id` e `usos_por_ciclo` (nulo = ilimitado). Chave primária no par.
- `assinatura_do_cliente`:
  - `id`, `barbearia_id`, `plano_id` e `cliente_id`;
  - `situacao` (CHECK) e `forma` (`online` | `no_balcao`);
  - `conexao_id` e `id_externo` (anuláveis no balcão; UNIQUE `(conexao_id, id_externo)`);
  - `ciclo_comeca_em` e `ciclo_termina_em` (`DATE`), `cancelada_em`, `criado_em`;
  - preço e ciclo **congelados** (`preco_centavos`, `ciclo`): mudar o plano vale para assinatura nova.
- `recebimento_do_plano`:
  - `id`, `barbearia_id`, `assinatura_id`, `data` (dia do caixa; índice `(barbearia_id, data)`);
  - `recebido_por_id` (o membro dono da conta, ou quem marcou "recebi");
  - `valor_centavos`, `casa_centavos` (congelado; CHECK ≤ valor) e `forma`;
  - `id_externo` (UNIQUE, anulável: a cobrança no provedor) e `registrado_em`.
- `evento_do_provedor`: `(provedor, id)` como chave primária e `recebido_em`. É a mesma deduplicação do `evento_stripe`.
- `pagamento`:
  - CHECK de `forma` passa a usar a lista nova `FORMAS_DO_CAIXA` = `FORMAS_DE_PAGAMENTO` + `plano`. O `barbearia.formas_pagamento` da página pública **não muda**;
  - ganha `assinatura_id` (anulável) e `avulso_centavos` (o que foi cobrado à parte num atendimento pelo plano, padrão 0).
- `pagamento_parte.motivo` ganha `plano` (o fixo do plano da casa).

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Lista fechada + conta pura | `barchop/packages/formato/src/caixa.ts:17`, `planos.ts:11` | constantes `as const` que viram CHECK, funções puras testadas em `packages/formato/tests/`; API e web leem do mesmo lugar (ADR-0007) |
| Conector com dublê | `barchop/apps/api/src/lib/cobranca.ts:156` (`Cobranca`), `:244` (`cobrancaDeMemoria`), `:586` (`cobrancaDoAmbiente`) | interface + implementação de memória + a real; aqui uma **fábrica** na instância (`app.provedores(conexão)`), porque cada vendedor tem a própria chave |
| Webhook | `barchop/apps/api/src/routers/webhook-stripe.ts:15` | o estado é relido no provedor; o evento é gravado na mesma transação da mudança; dado estranho → log + 200; releitura fora da transação, falhou → 500 sem gravar |
| Recurso do plano | `barchop/apps/api/src/lib/assinatura.ts:96` (`garantirRecurso`) | 403 `recurso_do_plano` |
| Erro de negócio | `barchop/apps/api/src/lib/erro-negocio.ts` | `ErroDeNegocio(mensagem, codigo)` → 422; 409 `dia_fechado` |
| Papel | `barchop/apps/api/src/plugins/auth.ts:218` (`exigirPapel`), `:228` (`agendaVisivel`) | planos da casa e "pode vender" = dono; plano próprio = quem tem `pode_vender_planos`; matriz em `tests/routers/auth-papeis.test.ts` |
| Rota protegida da barbearia | `barchop/apps/api/src/routers/caixa.ts:98` | `GET/PUT /barbearias/me/...` |
| Login do cliente | `barchop/apps/api/src/routers/clientes-me.ts:83`, `plugins/auth.ts` (`autenticarCliente`) | rotas `/clientes/me/...` |
| Migração à mão | `migrations/20261017120000_caixa` | SQL com CHECK das listas; `migrate deploy`, nunca `migrate dev` |
| Segredo obrigatório no ambiente | `JWT_SECRET` em `apps/api/.env.example`, `cobrancaDoAmbiente` | sem a variável em produção, a API não sobe |
| Testes de API | `barchop/apps/api/tests/routers/caixa.test.ts`, `pagamento.test.ts` | `buildApp` + `app.inject`, banco de teste, fixtures em `tests/helpers` |
| Testes de tela | `barchop/apps/web/tests/painel/sino-de-notificacoes.test.tsx` | Testing Library + `fetch` falso |
| Telas | memória "telas sem blocos" e "telas horizontais"; `CaixaDoDia.tsx`, `DivisaoDoDinheiro.tsx` | ação principal em destaque, pílulas, Salvar/Descartar só quando muda |

## Files to Change
| File | Action | Why |
|---|---|---|
| `barchop/packages/formato/src/planos-do-cliente.ts` (+ teste, `index.ts`) | CREATE | listas (ciclos, situações, formas), `FORMAS_DO_CAIXA`, `parteDaCasaNaMensalidade()`, `usosNoCiclo()`, `fimDoCiclo()`, validação do plano |
| `barchop/packages/formato/src/caixa.ts` | UPDATE | motivo `plano`; `dividirPagamento` com a parte pelo plano + avulso |
| `barchop/packages/database/prisma/schema.prisma` + migração | UPDATE / CREATE | modelo acima |
| `barchop/apps/api/src/lib/cifra.ts` (+ `.env.example`) | CREATE | AES-256-GCM com `CHAVE_DE_CIFRA` |
| `barchop/apps/api/src/lib/planos-do-cliente.ts` | CREATE | ler plano e assinatura, conferir uso, gravar recebimento (dia aberto) |
| `barchop/apps/api/src/routers/planos.ts` | CREATE | CRUD de planos, vitrine, assinantes, "recebi no balcão" |
| `barchop/apps/api/src/routers/equipe.ts` | UPDATE | `podeVenderPlanos` no PATCH (dono); desativar com assinantes |
| `barchop/apps/api/src/routers/caixa.ts`, `lib/caixa.ts` | UPDATE | forma `plano`, recebimentos no caixa do dia |
| `barchop/apps/api/src/lib/provedores/{index,memoria,asaas}.ts` | CREATE | o conector |
| `barchop/apps/api/src/routers/pagamentos-online.ts` | CREATE | conectar/desconectar a conta |
| `barchop/apps/api/src/routers/webhook-asaas.ts` | CREATE | `POST /webhooks/asaas/:conexaoId` |
| `barchop/apps/api/src/routers/barbearias.ts`, `clientes-me.ts` | UPDATE | vitrine pública; assinar, minhas assinaturas, cancelar |
| `barchop/apps/api/src/app.ts` | UPDATE | rotas e a fábrica de provedores |
| `barchop/packages/api-client` (+ dublê) | UPDATE | métodos novos |
| `barchop/apps/web/src/telas/painel/Planos*.tsx` + rotas `planos/`, `planos/[id]`, `planos/novo` | CREATE | planos e assinantes |
| `barchop/apps/web/src/telas/painel/configuracoes/PagamentosOnline.tsx` + rota | CREATE | conectar o Asaas |
| `barchop/apps/web/src/telas/painel/DetalheDoAgendamento.tsx`, `CaixaDoDia.tsx`, `DetalheDoCliente.tsx`, `DetalheDoMembro` | UPDATE | "Pelo plano", recebimentos, assinar no balcão, "pode vender planos" |
| `barchop/apps/web/src/telas/PerfilDaBarbearia.tsx`, `MinhaConta.tsx` + rota `[slug]/planos` | UPDATE / CREATE | vitrine, assinar, minhas assinaturas |
| `barchop/apps/web/src/painel/NavegacaoDoPainel.tsx`, `novidades.ts`, Central de ajuda | UPDATE | menu "Planos", novidade, perguntas |
| `barchop/apps/web/app/(marketing)/privacidade`, `termos` | UPDATE | chave do vendedor guardada; CPF, se o Asaas pedir |
| `barchop/docs/screens.md`, `docs/roadmap.md`, PRD | UPDATE | telas novas; marco 3 |

## Tasks (um PR por task; TDD com commit RED e depois GREEN)

**Parte A — sem provedor (o marco entrega mesmo se o Asaas surpreender)**

### PR 1: A conta dos planos em `@barchop/formato`
- **Action**:
  - `planos-do-cliente.ts`: listas, `FORMAS_DO_CAIXA`, `parteDaCasaNaMensalidade(preco, parteDaCasa, daCasa)`, `usosNoCiclo(...)` e `fimDoCiclo(inicio, ciclo)`;
  - em `caixa.ts`: motivo `plano`, e `dividirPagamento` com `peloPlano?: { daCasa, fixoCentavos, recebidoPorDaCasa }` e `avulsoCentavos`.
- **Mirror**: `caixa.ts` e o teste dele.
- **Validate**: `pnpm --filter @barchop/formato test`. Casos:
  - plano de barbeiro com 20% de parte da casa;
  - plano da casa com fixo;
  - avulso junto com o plano;
  - arredondamento;
  - ciclos com fim de mês (31/01 + 1 mês);
  - usos ilimitados e esgotados.

### PR 2: Planos no banco (MIGRAÇÃO)
- **Action**: schema e migração do modelo acima.
- **Mirror**: `20261017120000_caixa`.
- **Validate**: `tests/banco.test.ts` (CHECKs, UNIQUE parcial da conta da casa, `RESTRICT` do vendedor, CHECK da `forma` nova) + `migrate deploy` no dev e no teste.
- **Deploy**: precisa do `migrar`.

### PR 3: Planos e "pode vender" (API)
- **Action**:
  - `GET/POST/PATCH /barbearias/me/planos`: casa = dono; o próprio = quem pode vender; o profissional vê os dele;
  - `PATCH /equipe/:id` aceita `podeVenderPlanos` (só o dono);
  - `PUT /barbearias/me/vitrine-de-planos`;
  - 403 `recurso_do_plano` fora do Completo;
  - desativar membro com assinantes → 422 `assinaturas_ativas`, salvo com `cancelarAssinaturas: true`.
- **Validate**: `tests/routers/planos.test.ts` + matriz de papéis.

### PR 4: Vitrine pública (API)
- **Action**:
  - `GET /barbearias/:slug/planos`: planos ativos com vitrine ligada, recurso no plano e vendedor ativo que pode vender;
  - serviços incluídos com usos; o vendedor, com nome e foto.
- **Validate**: `tests/routers/planos-publicos.test.ts` (vitrine desligada = lista vazia, Grátis = vazia, vendedor sem permissão some).

### PR 5: Assinante no balcão (API)
- **Action**:
  - `POST /clientes/:id/assinaturas` (forma `no_balcao`, só planos que aceitam);
  - `GET /barbearias/me/assinantes?situacao=`;
  - `POST /assinaturas/:id/recebimentos` ("recebi", com a forma): grava o recebimento com a parte da casa congelada no próximo dia aberto e avança o ciclo;
  - `DELETE /assinaturas/:id` (cancelar);
  - tarefa diária na `fila` que passa para `em_atraso` o ciclo vencido sem "recebi".
- **Validate**: `tests/routers/assinantes.test.ts`.

### PR 6: "Pelo plano" e mensalidades no caixa (API)
- **Action**:
  - `PUT /agendamentos/:id/pagamento` aceita `forma: "plano"` + `assinaturaId` + `avulsoCentavos`, com as conferências da decisão 2. Erros: 422 `plano_de_outro_barbeiro`, `usos_esgotados`, `assinatura_inativa`;
  - `GET /barbearias/me/caixa` soma os recebimentos do dia ao acerto e à lista;
  - `GET /agendamentos/:id/pagamento` devolve as assinaturas usáveis do cliente.
- **Validate**: `tests/routers/pagamento.test.ts`, `caixa.test.ts` (os 3 cenários da GR com plano: barbeiro com 20%, plano da casa atendido pelo parceiro, assinante do Gustavo atendido pelo parceiro → avulso).

### PR 7: Telas do painel sem provedor (web)
- **Action**:
  - `/painel/planos`: lista com abas Planos e Assinantes; criar e editar plano; a vitrine liga e desliga ali;
  - "Pode vender planos" no detalhe do membro;
  - "Assinar plano" no detalhe do cliente, com "Recebi" por ciclo;
  - "Pelo plano" no registrar pagamento, com a frase do efeito;
  - recebimentos no Caixa;
  - item "Planos" no menu; convite fora do Completo.
- **Validate**: testes das telas + navegador em 375 e 1440.

**Parte B — online pelo Asaas**

### PR 8: Cifra e o conector do Asaas (API, sem rota)
- **Action**:
  - `lib/cifra.ts` e `CHAVE_DE_CIFRA` (`.env.example`; não sobe em produção sem ela);
  - `lib/provedores`: a interface `Provedor` (`conferirChave`, `registrarWebhook`, `criarCliente`, `criarAssinatura` → link da fatura, `lerAssinatura`, `lerCobranca`, `cancelarAssinatura`, `lerEvento`), mais a de memória e a do Asaas (`fetch`, base por modo);
  - `app.provedores(conexão)` na instância.
- **Conferir no sandbox do Asaas** (anotar no PR o que valeu):
  - (a) se o `cpfCnpj` é obrigatório para cobrar;
  - (b) se o cartão pago na fatura é cobrado sozinho nos ciclos seguintes;
  - (c) como a chave e a URL de sandbox e de produção se distinguem;
  - (d) os nomes exatos dos eventos (`PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `SUBSCRIPTION_DELETED`…) e o cabeçalho do token;
  - (e) como cancelar a assinatura.
- **Validate**: `tests/lib/cifra.test.ts` e `tests/lib/provedor-asaas.test.ts` com `fetch` falso, nas respostas gravadas do sandbox.

### PR 9: Conectar a conta (API)
- **Action**:
  - `GET/PUT/DELETE /barbearias/me/pagamentos-online` (a própria conta; `?daCasa=1` para o dono);
  - o PUT confere a chave e o modo, cifra, gera o `authToken` e registra o webhook;
  - o DELETE recusa com assinaturas vivas e apaga o webhook no Asaas.
- **Validate**: `tests/routers/pagamentos-online.test.ts` (a chave nunca volta na resposta, modo errado = 422, permissão).

### PR 10: Assinar online e o webhook (API)
- **Action**:
  - `POST /clientes/me/assinaturas`: logado; plano que aceita online e vendedor com conta conectada. Cria o cliente e a assinatura no Asaas e devolve o link da fatura; a assinatura nasce `pendente`;
  - `GET /clientes/me/assinaturas` e `DELETE /clientes/me/assinaturas/:id`;
  - `POST /webhooks/asaas/:conexaoId`: token conferido, estado relido no Asaas, evento deduplicado. O pagamento confirmado grava o recebimento e avança o ciclo;
  - notificação no sino de quem vende: "Nova assinatura", "Pagamento em atraso".
- **Validate**: `tests/routers/assinar-online.test.ts`, `webhook-asaas.test.ts` (evento repetido vale uma vez, token errado = 401, conexão de outra barbearia, cobrança desconhecida → 200 + log).

### PR 11: Online nas telas (web)
- **Action**:
  - Configurações › **Pagamentos online**: colar a chave, ver a final, desconectar;
  - vitrine na página pública e `/[slug]/planos`: "Assinar" → entrar (se preciso) → CPF (se o PR 8 confirmar) → fatura do Asaas → volta para a Minha conta;
  - Minha conta: as assinaturas, os usos que sobram e cancelar.
- **Validate**: testes das telas + navegador em 375 e 1440; uma assinatura de verdade no sandbox.

### PR 12: Fechamento
- **Action**: novidade e perguntas na Central de ajuda; Privacidade e Termos; `screens.md`, roadmap e PRD (marco 3 `complete`).
- **Validate**: `pnpm type-check && pnpm lint`; leitura das páginas.

## Validation
```bash
cd barchop
pnpm --filter @barchop/formato test
pnpm --filter @barchop/api test -- <arquivos tocados>   # suíte inteira nos PRs 2, 6 e 10
pnpm --filter @barchop/web test -- <arquivos tocados>
pnpm type-check && pnpm lint
pnpm --filter @barchop/database exec prisma migrate deploy   # dev e test
```
- O webhook do Asaas precisa de URL pública, então o PC não recebe. O teste ponta a ponta dos PRs 10 e 11 roda na VM, com uma conta **sandbox** do Asaas e a API de produção em modo teste por um dia (como foi com a Stripe em 16/10). Se o dono preferir, um túnel (`cloudflared`) no PC.
- **Deploy da Parte B:** o dono gera e põe `CHAVE_DE_CIFRA` no `.env` da VM **antes** do deploy do PR 9 (`openssl rand -base64 32`). Perder essa chave obriga todo vendedor a conectar de novo.

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| O Asaas não cobra o cartão sozinho nos ciclos seguintes pela fatura | Medium | Conferido no sandbox no PR 8, antes das rotas; a Parte A já entrega o marco "no balcão" |
| O Asaas exige CPF do cliente | High | Checkout pede o CPF e guarda no cadastro; Privacidade e Termos no PR 12 |
| Chave do vendedor vazada | Low | Cifrada com AES-GCM, nunca devolvida, `CHAVE_DE_CIFRA` só no ambiente; teste de que nenhuma resposta tem a chave |
| Webhook perdido (API fora do ar) deixa a assinatura desatualizada | Medium | O Asaas tenta de novo; o estado é relido a cada evento; "Atualizar" no detalhe do assinante relê no Asaas |
| Uso contado errado por registrar "pelo plano" no atendimento errado | Medium | Editar ou remover o pagamento com o dia aberto devolve o uso; a frase do efeito mostra "usa 1 de 4" antes de salvar |
| O acerto da GR com planos diverge da conta à mão | Medium | Os 3 cenários da GR como teste no PR 6 |
| Barbearia no Grátis com assinantes confunde o dono | Low | Decisão 6: as assinaturas seguem, a tela explica e convida ao Completo |
| O marco ficou grande (12 PRs) | High | A Parte A vai ao ar sozinha; a Parte B pode esperar sem quebrar nada |

## Acceptance
- [ ] A GR cria um plano da casa e um plano do Gustavo, um cliente assina cada um (um no balcão, um online no sandbox), e o acerto do dia bate com a conta à mão
- [ ] Os 12 PRs no ar, cada um em produção antes do próximo
- [ ] Nenhuma resposta da API contém a chave do vendedor
- [ ] Validação passa
- [ ] Padrões espelhados, não reinventados
