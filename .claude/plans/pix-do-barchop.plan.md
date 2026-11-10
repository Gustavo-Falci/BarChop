# Plan: Pagar o BarChop por Pix, conferido pelo Suporte (passo 5, 08/11)

**Origem**: ordem combinada com o dono em 08/11/2026, passo 5 ("Pix manual no Suporte"). A Stripe da conta tem Pix, mas não recorrente; o cartão segue como está.
**Canvas**: página "Pix do BarChop" (Pix-Pagar, Pix-Aguardando + Recusado/Confirmado, Pix-Renovar + Vencido, Pix-Suporte; escuro e claro). **Aprovado pelo dono em 08/11.**
**Complexity**: Large, 5 PRs (banco/API → web Faturas → web Suporte → avisos e vencimento → diferença de profissional).

## Summary

Hoje Faturas só assina por cartão (Checkout da Stripe); Pix e boleto aparecem "Em breve". O dono quer receber por Pix na chave do BarChop, sem integração: o painel gera o QR e o copia e cola com o valor exato, o barbeiro paga no banco e toca **Já paguei**; o plano vale na hora, marcado "Aguardando conferência", e o Suporte confere no extrato e confirma ou recusa. Pix não renova sozinho: cada período é um Pix novo, com aviso 5 dias antes.

## Decisões

**(dono, 08/11)** nas perguntas antes do canvas:
- QR + copia e cola gerados pelo BarChop (BR Code estático com valor), na chave do BarChop. Nada de só mostrar a chave.
- "Já paguei" vira pedido na fila do Suporte, sem comprovante.
- O plano vale **na hora** do "Já paguei"; recusa volta ao que era antes (teste ou Grátis), com a resposta do Suporte em Faturas e no sino.
- Renovação: aviso no sino e por e-mail 5 dias antes; Faturas mostra "Pagar o próximo mês"; sem pagar até o fim do período, cai no Grátis sem apagar nada.

**(dono, 08/11: "Aprovado" no canvas, com as propostas da nota laranja)**:
1. Pix pago no teste: o período pago começa no fim do teste (`testeTerminaEm`), sem perder dias. Como no cartão, a barbearia passa a `ativa` no plano escolhido na hora.
2. Mais profissionais que os pagos no meio do período: Pix da diferença, proporcional aos dias que faltam (PR 5).
3. Um Pix em conferência por vez (índice parcial no banco); **Ainda não paguei** desfaz o pedido e volta ao que era antes.
4. **Em aberto**: o que o extrato do banco do dono mostra num Pix recebido. O cartão do Suporte mostra valor, hora do "Já paguei" e identificador; ajustar o destaque quando o dono responder. **09/11**: o dono mandou o comprovante de um Pix *enviado* (mostra nome, valor, data e hora, banco de destino e o ID da transação E2E), que não responde o lado de quem recebe. O manual do Bacen (item 2.6.2) diz que o banco de quem paga repassa o txid (62/05) intacto ao recebedor, pra conciliação. Fechar no Pix de R$ 1,00 de teste, olhando o extrato de quem recebe. O identificador segue visível no cartão do Suporte; o destaque se decide no PR 3.

**(dono, 09/11: "OK para as 4")** as técnicas abaixo ficam valendo: 409 cartão×Pix nos dois sentidos; variáveis `PIX_*` vazias até os PRs 2–4 no ar, depois Pix de R$ 1,00; PR 5 com a diferença **proporcional** (a resposta veio a uma pergunta "proporcional ou só na renovação": confirmar ao começar o PR 5).
5. Pagou depois de vencer: o período conta do dia do pagamento.
6. Anual por Pix: mesma tela, preço anual de `precoDoPlano`, vale 12 meses.

**Técnicas** (minhas, a confirmar na revisão do plano):
- **Chave, nome e cidade do recebedor por variável de ambiente** (`PIX_CHAVE`, `PIX_NOME_DO_RECEBEDOR`, `PIX_CIDADE_DO_RECEBEDOR`). Sem elas, a API responde que o Pix não está ligado e a web mantém "Pix · Em breve". Nada disso vai pra repositório, fixture ou canvas.
- **BR Code** (EMV-QRCPS-MPM do Bacen: campos 00, 26 com GUI `br.gov.bcb.pix` e chave, 52 `0000`, 53 `986`, 54 valor, 58 `BR`, 59 nome, 60 cidade, 62/05 txid, 63 CRC16-CCITT) em `@barchop/formato`, função pura com teste contra exemplo conhecido do manual. Nome e cidade sem acento e cortados nos limites (25 e 15).
- **Identificador** (txid) de 6 caracteres `[A-Z2-9]` sem 0/O/1/I, **estável**: derivado pela API (HMAC com segredo do servidor) de barbearia + `periodoComecaEm` + plano + ciclo + profissionais. Recarregar a tela mostra o mesmo QR que o barbeiro pagou; o "Já paguei" não manda o identificador, a API recalcula. Único no banco (colisão → 409, raríssima). Vai no campo 62/05: alguns bancos mostram no extrato.
- **Cartão vivo bloqueia Pix e Pix vigente bloqueia cartão**: cotação e "Já paguei" dão 409 `assinatura_no_cartao` com `stripeSubscriptionId` e situação `ativa`/`em_atraso` (inclusive com `cancelaEm` no futuro); o checkout dá 409 `pix_vigente` com `forma = 'pix'` e período por vencer.
- **Escritores da `assinatura` com Pix** (auditados em 08/11):
  - "Já paguei" zera `stripeSubscriptionId` (mantém `stripeCustomerId`): a assinatura do cartão, se havia, já morreu (o 409 acima garante).
  - `webhook-stripe.ts › aplicar`: com `forma = 'pix'`, um evento da Stripe só vale se chegar `ativa` (cartão novo depois do Pix vencido) e aí grava `forma = 'cartao'`; evento atrasado de assinatura velha não derruba o Pix. Hoje a guarda (`stripeSubscriptionId !== assinatura.id && situacao !== "ativa"`) deixaria passar com o id zerado.
  - `sincronizarQuantidade`: já sai sem `stripeSubscriptionId`; com o id zerado o Pix não chama a Stripe. Teste explícito.
  - A guarda do checkout (`stripeSubscriptionId && ativa`) deixa de pegar Pix por engano, porque o id fica nulo.
  - Pix nunca mexe em `testeTerminaEm`.
- **Precedente do teste conferido**: `situacaoDaStripe` mapeia `trialing` → `ativa`, então o cartão no teste já troca o Completo pelo plano escolhido na hora. O Pix faz igual (avisar o dono: pagar o Essencial no meio do teste tira os extras do Completo na hora).
- **Variáveis no deploy**: a API lê `infra/api.env` (`env_file` no `compose.yaml`). PR 1 acrescenta `PIX_CHAVE`, `PIX_NOME_DO_RECEBEDOR`, `PIX_CIDADE_DO_RECEBEDOR` e `PIX_SEGREDO_DO_IDENTIFICADOR` vazias em `api.env.example`. **Ficam vazias em produção até os PRs 2, 3 e 4 estarem no ar**; aí o dono preenche e faz um Pix de R$ 1,00 de teste.
- **O valor é sempre calculado pela API** (`precoDoPlano`), nunca vem do corpo. O "Já paguei" confere de novo plano, ciclo, profissionais (≥ equipe, ≤ limite do plano), como o checkout.
- **Tabela nova `pagamento_pix`**: `id`, `barbearia_id`, `identificador` (UNIQUE), `plano`, `ciclo`, `profissionais`, `valor_centavos`, `periodo_comeca_em`, `periodo_termina_em`, `situacao` (`aguardando` | `confirmado` | `recusado` | `desfeito`, CHECK), `resposta`, `criado_em`, `decidido_em`, `decidido_por` (→ `operador_suporte`, SET NULL), e **o retrato do antes** (`antes_situacao`, `antes_plano`, `antes_ciclo`, `antes_forma`, `antes_periodo_termina_em`, `antes_profissionais`) pra recusa e desfazer voltarem exatamente ao que era. Índice parcial UNIQUE (`barbearia_id`) WHERE `situacao = 'aguardando'`.
- **`assinatura.forma`** (`cartao` | `pix`, default `cartao`, CHECK). O Pix grava `situacao = 'ativa'`, `plano`, `ciclo`, `profissionais_contratados`, `periodo_termina_em`, `forma = 'pix'`, sem ids da Stripe.
- **O fim do período vale na hora, sem depender do cron**: `planoEfetivo` ganha `forma` e `periodoTerminaEm`; Pix com período vencido cai no Grátis. O cron (PR 4) só arruma a linha (`situacao = 'gratis'`) e avisa.
- **Recusa e desfazer** só restauram o retrato se o pedido for o último da barbearia (o índice parcial já impede outro aguardando; um confirmado depois não existe, porque o próximo Pix só nasce sem aguardando).
- **Cartão com Pix vigente**: o checkout recusa com 409 ("o Pix vale até DD/MM: troque pro cartão depois") nesta leva. Trocar de forma no meio do período fica pra depois, se aparecer pedido.
- Notificação ao dono: `tipo = plataforma`, por `notificarDonos`. E-mail pelo canal de e-mail que já existe.

## Contrato

- `GET /barbearias/me/assinatura/pix?plano&ciclo&profissionais` (dono): `{ valorCentavos, periodoComecaEm, periodoTerminaEm, identificador, copiaECola, recebedor: { nome, chaveMascarada } }`. 409 `pix_desligado` sem as variáveis; 422 nas regras do checkout.
- `POST /barbearias/me/assinatura/pix` (dono) `{ plano, ciclo, profissionais }` → 201 com o pagamento (identificador recalculado pela API); 409 `pix_em_conferencia` se já há um aguardando; 409 `assinatura_no_cartao`.
- `POST /barbearias/me/assinatura/pix/:id/desfazer` (dono): só o aguardando.
- `ResumoDaAssinatura` ganha `forma` e `pix: { aguardando: PagamentoPix | null, ultimaRecusa: { resposta, decididoEm } | null }`. `GET …/faturas` com forma Pix lista os pagamentos Pix.
- Suporte: `GET /suporte/pix` (aguardando, do mais velho pro mais novo, com barbearia e dono), `POST /suporte/pix/:id/confirmar`, `POST /suporte/pix/:id/recusar { resposta }`.
- api-client e dublê (`falso.ts`) com tudo isso.

## PRs (um por vez, cada um depois do anterior mergeado e no ar)

### PR 1 — Banco, formato, API, tipos, api-client e dublê (sem mudança visível)
- Migration à mão (o `migrate dev` propõe derrubar `agendamento.periodo`), com bloco "Desfazer".
- `brCodeDoPix` e `identificadorDoPix` em `@barchop/formato`; `planoEfetivo` com o vencimento do Pix (todos os chamadores passam a mandar `forma` e `periodoTerminaEm`: o tsc acha).
- Rotas do dono e do Suporte; o checkout do cartão com o 409 do Pix vigente.
- Testes: BR Code (CRC-16/CCITT-FALSE de "123456789" = 0x29B1, e o payload completo do exemplo do manual do Bacen, buscado na fonte, não de cabeça), webhook da Stripe atrasado não derruba o Pix, cartão novo depois do Pix grava `forma = cartao`, 409 nos dois sentidos, identificador igual em duas cotações seguidas, cotação (teste → começa no fim do teste; vigente → começa no fim do período; vencido/Grátis → hoje; anual), "Já paguei" (vale na hora; dois seguidos → 409; valor nunca do corpo; equipe maior → 422), desfazer, confirmar, recusar (volta ao retrato: teste com o mesmo `testeTerminaEm`, Grátis), vencimento no `planoEfetivo` e no limite do link, Suporte sem token → 401.
- **Deploy**: migration + API, com as variáveis `PIX_*` vazias. A web antiga não chama nada novo.
- **Base**: só depois do #323 (contrair pausas) mergeado: os dois mexem no `schema.prisma`.
- **Feito 09/11: #325, mergeado e no ar (produção `caf74c6`, deploy conferido por curl).** Desvios do que está acima, conferidos na revisão:
  - O identificador (HMAC) mora na API (`lib/pix.ts`), não no `@barchop/formato`: precisa do segredo do servidor. O formato tem o BR Code, a máscara da chave e o período (`fimDoPeriodoDoPix`: 31/01 → último dia de fevereiro).
  - O identificador é único **só entre os aguardando** (índice parcial): é derivado do pedido, então incluir os confirmados recusaria pra sempre um pedido que batesse com um antigo; recusado ou desfeito, pagar de novo dá o mesmo identificador.
  - Início "hoje" = meia-noite de São Paulo, pro QR não mudar a cada recarga.
  - Recusa e desfazer só voltam ao retrato se a assinatura ainda é este Pix (`forma = 'pix'` e o mesmo fim de período); se um cartão assumiu (Checkout aberto antes do Pix e concluído depois), só o pagamento muda.
  - `GET …/faturas` com os pagamentos Pix fica pro PR 2 (quem usa é a tela). Os avisos de confirmação e recusa ficam no PR 4, como planejado.
  - O dublê liga o Pix pela semente (`pixLigado: true`); sem ela, 409 `pix_desligado`.

### PR 2 — Web: Faturas com Pix (canvas Pix-Pagar, Pix-Aguardando, Pix-Renovar)
- Pix habilitado quando a cotação responde; QR pelo `CodigoQr` que já existe; "Copiar código"; "Já paguei"; "Aguardando conferência" com "Ver o QR de novo" e "Ainda não paguei"; recusado com a resposta; "Pagar o próximo mês" nos 5 dias antes e depois de vencer.
- TDD com o dublê; conferência no navegador a 360/390, claro e escuro.

### PR 3 — Web: Suporte confere o Pix (canvas Pix-Suporte)
- Pedidos mistura Pix e troca de link (Pix primeiro); contador na aba; "Achei o Pix" / "Não achei" com resposta.

### PR 4 — Avisos e vencimento (cron diário)
- Trabalho na fila (como `ciclos-por-link`): 5 dias antes do fim de um período Pix sem próximo pago → notificação + e-mail (uma vez: coluna `avisado_em` no pagamento); vencido → `situacao = 'gratis'` + notificação + e-mail. Recusa e confirmação também avisam o dono (notificação; e-mail na recusa).

### PR 5 — Diferença de profissional no meio do período
- Equipe passa dos `profissionais_contratados` num período Pix: Faturas mostra "Pix da diferença" (extra × dias que faltam ÷ dias do período, arredondado pra cima no centavo), mesmo fluxo de "Já paguei". Enquanto não paga, o limite do link segue o contratado (como `foraDoLink`). Canvas antes.

## Riscos

- **"Vale na hora" é confiança**: quem toca "Já paguei" sem pagar ganha dias até o Suporte recusar. Mitigação: um aguardando por vez, e a fila do Suporte em ordem de chegada. Medir depois do primeiro mês.
- **Chave errada na variável** = dinheiro na conta errada. O recebedor (nome e chave mascarada) aparece na tela pra o barbeiro conferir; conferir em produção com um Pix de R$ 1,00 antes de anunciar (o dono).
- BR Code inválido em algum banco: testar o QR em 2–3 apps de banco na conferência do PR 2.
