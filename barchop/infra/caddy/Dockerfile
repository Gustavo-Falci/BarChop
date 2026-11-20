# Caddy com o módulo de DNS da Cloudflare: o certificado coringa
# (*.barchop.com.br) só sai pelo desafio DNS-01, e a imagem oficial não
# traz provedor de DNS nenhum (ADR-0002).
#
# Tudo preso (auditoria de 15/11, SEC-016): as imagens por digest e o
# módulo por versão. Sem isso cada build pegava o que houvesse de mais
# novo na hora, e um módulo trocado na origem entrava no binário que
# segura o certificado de todo mundo. Quem propõe digest novo é o
# Dependabot (.github/dependabot.yml); a versão do módulo sobe à mão.
FROM caddy:2-builder@sha256:6350162b3889ca32600b3c699c61572fa0eb3ad6b2a51874f19b158a7df77511 AS build
RUN xcaddy build --with github.com/caddy-dns/cloudflare@v0.2.4

FROM caddy:2@sha256:4e2425f6009577e7c651010f16679c28f7d12df3e7b1914f941a7a3370746b3c
COPY --from=build /usr/bin/caddy /usr/bin/caddy
