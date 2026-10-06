# Produção na VM da OCI

Tudo roda num `docker compose` na VM (Ubuntu ARM): Postgres, migração,
API (com o worker da fila), web, Caddy e backup. As imagens são
montadas na própria VM. Só o Caddy abre porta (80 e 443).

| Serviço | O que é |
|---|---|
| `postgres` | Postgres 18, volume `banco` |
| `migrar` | `prisma migrate deploy` a cada `up`; a API espera ele terminar bem |
| `api` | `api.barchop.com.br` |
| `web` | raiz, `www`, `painel.` e `<slug>.barchop.com.br` |
| `caddy` | TLS (raiz + coringa por DNS-01 na Cloudflare) e proxy |
| `backup` | `pg_dump` diário no volume `backups`, guarda `BACKUP_DIAS` |

## Antes da primeira subida

Uma vez só, na VM e nas contas:

1. **Docker** do repositório oficial, usuário no grupo `docker`.
2. **Firewall do Ubuntu**: a imagem da OCI recusa tudo menos o 22, mesmo
   com a security list aberta. Liberar 80/tcp, 443/tcp e 443/udp antes
   do `REJECT` do `INPUT` e salvar com `sudo netfilter-persistent save`
   — **antes** de instalar o Docker, senão as regras dele vão junto.
3. **Security list** da subnet: entrada 80/tcp, 443/tcp e 443/udp.
4. **DNS** na Cloudflare: `A @` e `A *` pro IP da VM, em "DNS only".
5. **Bucket** no Object Storage (`barchop-imagens`): leitura pública
   dos objetos, **sem** listagem; uma Customer Secret Key pra API. Sem
   ele a API não sobe em produção.
6. **Resend** com o domínio verificado e uma chave de API.

## Primeira subida

```bash
git clone <repo> ~/BarChop   # repo privado: deploy key só de leitura
cd ~/BarChop/barchop/infra

cp .env.example .env
cp api.env.example api.env
chmod 600 .env api.env
nano .env       # banco, Cloudflare, e-mail do ACME
nano api.env    # JWT, Resend, S3

docker compose build          # a primeira vez demora (1 OCPU)
docker compose up -d
docker compose ps
docker compose logs migrar    # "All migrations have been successfully applied"
docker compose logs -f caddy  # certificados emitidos
curl -I https://api.barchop.com.br/health
```

Os segredos vão direto nos arquivos da VM: nunca no repo nem em chat.

## Conta de suporte

A senha vem do ambiente, pra não ficar no histórico do shell:

```bash
read -rs SENHA_DO_SUPORTE && export SENHA_DO_SUPORTE
docker compose exec -e SENHA_DO_SUPORTE api node dist/criar-suporte.js "Nome" suporte@barchop.com.br
unset SENHA_DO_SUPORTE
```

## Atualizar

```bash
cd ~/BarChop && git pull
cd barchop/infra && docker compose up -d --build
```

A migração roda antes da API nova. Trocar `NEXT_PUBLIC_*` no `.env`
pede o `--build`: elas são embutidas no JavaScript do web.

## Backup

```bash
docker compose exec backup ls -lh /backups
docker compose cp backup:/backups/<arquivo>.dump .   # copiar pra fora
```

**Restaurar apaga o que está no banco** e põe o do arquivo no lugar.
Parar a API antes:

```bash
docker compose stop api
docker compose exec backup sh -c 'pg_restore --clean --if-exists -d "$PGDATABASE" /backups/<arquivo>.dump'
docker compose start api
```

O backup fica no mesmo disco da VM: protege de erro e de migração
ruim, não da perda do disco. Copiar pro bucket fica pra depois.

## Logs

```bash
docker compose logs -f api
docker compose logs -f web
```

O log de acesso do Caddy esconde o token do lembrete
(`/lembrete/<token>` e `/lembretes/<token>`) e descarta o `Referer`.
