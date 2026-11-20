# Caddy com o módulo de DNS da Cloudflare: o certificado coringa
# (*.barchop.com.br) só sai pelo desafio DNS-01, e a imagem oficial não
# traz provedor de DNS nenhum (ADR-0002).
#
# Tudo preso (auditoria de 15/11, SEC-016): as imagens por digest e o
# módulo por versão. Sem isso cada build pegava o que houvesse de mais
# novo na hora, e um módulo trocado na origem entrava no binário que
# segura o certificado de todo mundo. Quem propõe digest novo é o
# Dependabot (.github/dependabot.yml); a versão do módulo sobe à mão.
FROM caddy:2-builder@sha256:aef223d1f943bc12a29a9e0a0a73983aa19a36672daede7507da4201a6b1016a AS build
RUN xcaddy build --with github.com/caddy-dns/cloudflare@v0.2.4

FROM caddy:2@sha256:4851e54a46b206517c574821bb5cc67f170d2156041e9fbc4c9193b45e84a75b
COPY --from=build /usr/bin/caddy /usr/bin/caddy
