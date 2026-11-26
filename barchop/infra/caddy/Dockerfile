# Caddy com o módulo de DNS da Cloudflare: o certificado coringa
# (*.barchop.com.br) só sai pelo desafio DNS-01, e a imagem oficial não
# traz provedor de DNS nenhum (ADR-0002).
#
# Tudo preso (auditoria de 15/11, SEC-016): as imagens por digest e o
# módulo por versão. Sem isso cada build pegava o que houvesse de mais
# novo na hora, e um módulo trocado na origem entrava no binário que
# segura o certificado de todo mundo. Quem propõe digest novo é o
# Dependabot (.github/dependabot.yml); a versão do módulo sobe à mão.
FROM caddy:2-builder@sha256:cda07fe9d82728c7ac44d844306d435e98131423dc7b114f05a8a8ecfff94707 AS build
RUN xcaddy build --with github.com/caddy-dns/cloudflare@v0.2.4

FROM caddy:2@sha256:4851e54a46b206517c574821bb5cc67f170d2156041e9fbc4c9193b45e84a75b
COPY --from=build /usr/bin/caddy /usr/bin/caddy
