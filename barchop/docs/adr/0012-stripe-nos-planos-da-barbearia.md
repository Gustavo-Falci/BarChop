# ADR-0012: Stripe nos planos que a barbearia vende

**Date**: 2026-10-31
**Status**: accepted
**Deciders**: Gustavo Falci (dono do produto), Claude

## Context

No marco 3 da Onda 2, quem vende plano de assinatura (a casa ou o
profissional liberado) recebe online conectando a própria conta do
Asaas: o dinheiro cai direto nela, e o BarChop não cobra taxa nem guarda
esse dinheiro. Quem já recebe pela Stripe teria de abrir conta no Asaas
(com aprovação por documentos) só para vender pelo BarChop. O dono
decidiu (30/10/2026) ter a Stripe pronta para quando um vendedor
precisar, só nos planos de assinatura, com uma plataforma por vendedor
(PRD `pagamentos-online-stripe-infinitepay`, marco 1).

A ADR-0010 é outra coisa: a Stripe da conta do BarChop, que cobra a
assinatura das barbearias. Aqui a conta é de quem vende.

## Decision

A Stripe entra como segundo provedor dos pagamentos online, atrás da
mesma interface do Asaas (`apps/api/src/lib/provedores`):

- quem vende **cola uma chave restrita** da própria conta, como a chave
  do Asaas, e o BarChop cria o webhook dela pela API. Sem Stripe Connect;
- a chave e o segredo do webhook ficam cifrados na conexão; cada evento
  é conferido com o segredo daquele webhook
  (`/webhooks/stripe/<conexão>`), e o estado é sempre relido na Stripe;
- **uma conta ligada por vendedor**, de qualquer provedor: para trocar,
  cancela as assinaturas, desconecta e conecta a outra;
- o cliente paga no **cartão**, na página da fatura da Stripe, com
  renovação automática. A Stripe não pede o CPF, e o BarChop não manda
  nem guarda (`PEDE_CPF`);
- o resto do sistema (vitrine, Minha conta, assinantes, Caixa, acerto,
  sino) não sabe qual é o provedor.

## Alternatives Considered

### Alternativa 1: Stripe Connect
- **Pros**: o vendedor autoriza por OAuth, sem copiar chave; a Stripe
  cuida da conta conectada.
- **Cons**: o BarChop vira plataforma na Stripe (cadastro, revisão,
  responsabilidade pelas contas conectadas) e precisa de CNPJ e de uma
  conta de plataforma.
- **Why not**: o mesmo fluxo do Asaas (colar a chave) já existe e não
  depende de nada do BarChop na Stripe.

### Alternativa 2: só o Asaas
- **Pros**: nada a fazer.
- **Cons**: quem já recebe pela Stripe precisa abrir outra conta.
- **Why not**: a decisão de produto é não forçar a troca de plataforma.

## Consequences

### Positive
- Quem já usa a Stripe vende planos sem abrir conta nova.
- O conector novo não mexeu no Caixa, no acerto nem nas telas do cliente
  além dos textos.
- Na Stripe, o cliente não dá o CPF.

### Negative
- **Só cartão.** O Pix em conta brasileira da Stripe é por convite, e o
  recorrente não foi confirmado (o conector fixa
  `payment_method_types: ["card"]`).
- A chave restrita precisa das permissões certas, e quem vende monta na
  mão (o guia lista). Sem uma de leitura, o conectar recusa; sem uma de
  escrita, a chave conecta e o assinar falha.

### Risks
- **Chave revogada depois de conectar:** o webhook responde 500 e a
  Stripe tenta de novo até desligar o endpoint. Mitigação: trocar a
  chave da mesma conta mantém o webhook; reconectar recria.
- **A Stripe muda a API.** Mitigação: versão fixa da biblioteca
  (`API_VERSION`, também no webhook criado) e respostas gravadas da
  conta de teste nos testes do conector.
- **Chave vazada.** Mitigação: a mesma da chave do Asaas (cifrada, nunca
  volta para a tela, apagada ao desconectar).
