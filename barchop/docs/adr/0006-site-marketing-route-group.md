# ADR-0006: Site de marketing como route group no app Next

**Date**: 2026-10-02
**Status**: accepted
**Deciders**: Gustavo Falci (dono do produto), Claude

## Context

O SaaS precisa de um site que venda: landing, preços, plano grátis e,
depois, páginas de funcionalidade e blog para SEO. O `apps/web` já
separa painel e fluxo público por route groups (`(painel)`, `(publico)`),
e o host decide o que servir (ADR-0002).

## Decision

O site de marketing é o route group `(marketing)` do `apps/web`, com
geração estática, servido em `www.barchop.com.br`. Ele usa os mesmos
tokens de design e componentes do resto do app.

## Alternatives Considered

### Alternativa 1: App separado (`apps/site`)
- **Pros**: deploy e cache independentes; nada do painel no bundle do site.
- **Cons**: mais um app para manter; tokens e componentes duplicados ou extraídos para pacote.
- **Why not**: o site começa pequeno; separar pode ser feito depois sem reescrever páginas.

### Alternativa 2: Construtor externo (Framer, Webflow)
- **Pros**: iterar no visual sem código.
- **Cons**: outro lugar para manter marca e preços; os preços divergem do código.
- **Why not**: conflita com o ADR-0007 (planos num lugar só).

## Consequences

### Positive
- Preços e planos do site vêm do mesmo código que aplica os limites.
- Um deploy só.

### Negative
- O build do site e do app andam juntos.

### Risks
- O site pesar no app. Mitigação: as páginas são estáticas e não importam código do painel.
