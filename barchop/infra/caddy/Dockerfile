# Caddy com o módulo de DNS da Cloudflare: o certificado coringa
# (*.barchop.com.br) só sai pelo desafio DNS-01, e a imagem oficial não
# traz provedor de DNS nenhum (ADR-0002).
FROM caddy:2-builder AS build
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2
COPY --from=build /usr/bin/caddy /usr/bin/caddy
