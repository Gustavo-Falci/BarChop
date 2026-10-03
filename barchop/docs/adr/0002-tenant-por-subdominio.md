# ADR-0002: Tenant resolvido pelo subdomínio

**Date**: 2026-10-02
**Status**: accepted
**Deciders**: Gustavo Falci (dono do produto), Claude

## Context

Hoje a página pública da barbearia vive em `/[slug]`, no mesmo host do
painel. Isso já custou uma dívida: um slug igual a uma rota estática
(`painel`) fica inalcançável. O link vai pelo WhatsApp e pelo Instagram,
então o endereço que ele mostra faz parte do produto. A referência usa
`<slug>.barbeiro.app`.

## Decision

Cada barbearia é servida em `<slug>.barchop.com.br`, resolvida por um
middleware do Next.js a partir do host, com DNS e certificado coringa.
`www` serve o site de marketing; o painel ganha subdomínio próprio. A
rota `/[slug]` continua viva como fallback e para desenvolvimento local.
Os slugs que colidem com subdomínios do sistema ficam numa lista de
reservados, num lugar só (`packages/formato`).

## Alternatives Considered

### Alternativa 1: Manter só o caminho `/[slug]`
- **Pros**: zero infra nova.
- **Cons**: link mais longo e menos "da barbearia"; slugs disputam espaço com as rotas do sistema.
- **Why not**: o endereço é parte do valor percebido pelo dono.

### Alternativa 2: Domínio próprio por barbearia desde já
- **Pros**: máximo de marca para o dono.
- **Cons**: emissão de certificado por domínio, suporte de DNS para cada cliente.
- **Why not**: é diferencial da Onda 5, não núcleo.

## Consequences

### Positive
- Elimina a classe de bug do slug sombreado por rota.
- Abre caminho para o domínio próprio depois, pelo mesmo middleware.

### Negative
- Certificado coringa exige desafio DNS-01 no deploy.
- Cookies e sessão precisam ser pensados entre subdomínios.

### Risks
- Trocar o slug quebra links já enviados. Mitigação: redirect do slug antigo junto do middleware (Onda 1).
