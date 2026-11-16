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
| `backup` | `pg_dump` diário no volume `backups`, guarda `BACKUP_DIAS`; cópia cifrada pra fora da VM, se configurada |

## Antes da primeira subida

Uma vez só, na VM e nas contas:

1. **Docker** do repositório oficial, usuário no grupo `docker`.
2. **Firewall do Ubuntu**: a imagem da OCI recusa tudo menos o 22, mesmo
   com a security list aberta. Liberar 80/tcp, 443/tcp e 443/udp antes
   do `REJECT` do `INPUT` e salvar com `sudo netfilter-persistent save`
   — **antes** de instalar o Docker, senão as regras dele vão junto.
3. **Security list** da subnet: entrada 80/tcp, 443/tcp e 443/udp.
4. **DNS** na Cloudflare: `A @` e `A *` pro IP da VM, em "DNS only".
   Token de API com **Zone → Zone → Read** e **Zone → DNS → Edit** na
   zona `barchop.com.br` (o módulo do Caddy pede os dois).
5. **Bucket** no Object Storage (`barchop-imagens`): leitura pública
   dos objetos, **sem** listagem; uma Customer Secret Key pra API. Sem
   ele a API não sobe em produção.
6. **Resend** com o domínio verificado e uma chave de API.

## Primeira subida

```bash
git clone https://github.com/Gustavo-Falci/BarChop.git ~/BarChop
cd ~/BarChop/barchop/infra

cp .env.example .env
cp api.env.example api.env
chmod 600 .env api.env
nano .env       # banco, Cloudflare, e-mail do ACME, quem vende (termos)
nano api.env    # JWT, Resend, S3

# Um de cada vez: em paralelo, o build do Next e o da API disputam
# 1 OCPU e a memória, e podem matar um ao outro.
docker compose build migrar api
docker compose build web
docker compose build caddy
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

## Pedidos de titulares e encerramento (LGPD)

Não há tela nem rota pra isto: quem atende é o responsável pela
plataforma, depois de conferir a identidade de quem pede. Cada comando
deixa uma linha na tabela `auditoria`.

```bash
# Cópia dos dados de um cliente de uma barbearia (JSON). O arquivo tem
# dado pessoal: entregue por canal seguro e apague depois.
docker compose exec -T api node dist/titular.js exportar <link> <telefone-ou-e-mail> > dados.json

# Exclusão a pedido: esvazia o cadastro (nome, telefone, e-mail, CPF,
# senha). Os horários e pagamentos ficam, de ninguém. Não tem volta.
docker compose exec api node dist/titular.js apagar <link> <telefone-ou-e-mail> --confirmar

# Encerrar uma barbearia: apaga tudo dela, do banco e das imagens. Não
# tem volta. Recusa se houver cobrança viva na Stripe ou no Asaas —
# cancele lá antes.
docker compose exec api node dist/titular.js encerrar-barbearia <link> --confirmar <link>
```

O que foi apagado continua nos backups até eles vencerem: `BACKUP_DIAS`
no disco da VM (14) e o prazo da regra de ciclo de vida no bucket de
fora (ver Backup).

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

O backup do volume fica no mesmo disco da VM: protege de erro e de
migração ruim, não da perda do disco. Pra isso existe a cópia de fora.

### Cópia fora da VM, cifrada

Desligada até as variáveis `BACKUP_*` do `.env` serem preenchidas. Com
elas, cada backup diário é cifrado com o `age` e mandado pra um bucket.
Uma vez só:

1. **Par de chaves do `age`**, gerado FORA da VM (no seu computador):
   `age-keygen -o barchop-backup.key`. O arquivo é a chave privada, a
   única coisa que abre os backups: guardar no gerenciador de senhas e
   em mais um lugar. A linha `# public key: age1...` é a que vai no
   `.env` da VM, em `BACKUP_CHAVE_PUBLICA`. A VM só sabe cifrar.
2. **Bucket novo e PRIVADO** no Object Storage (`barchop-backups`), sem
   leitura pública — nunca o `barchop-imagens`. Ligar o versionamento e
   uma regra de ciclo de vida que apague os objetos com mais de 30 dias:
   é o bucket que apaga os antigos, não a VM.
3. **Customer Secret Key** de um usuário que só escreve nesse bucket
   (política com `OBJECT_CREATE` e `OBJECT_INSPECT`, sem apagar). Quem
   tomar a VM não consegue apagar os backups de fora.
4. Preencher `BACKUP_*` no `.env` e subir: `docker compose up -d --build backup`.
5. Conferir na hora, sem esperar o dia seguinte:

```bash
docker compose run --rm -e BACKUP_UMA_VEZ=1 backup
# "backup ok: ..." e "cópia fora da VM ok: ... em barchop-backups"
```

Abrir um backup de fora (no seu computador, com a chave privada):

```bash
age --decrypt -i barchop-backup.key -o barchop.dump barchop-<data>.dump.age
pg_restore --list barchop.dump | head    # tem que listar as tabelas
```

**Ensaiar a restauração** num banco vazio depois de configurar, e de
tempos em tempos: backup que nunca foi restaurado não é backup.

Uma cópia que falha aparece no log, e só lá — olhar de vez em quando:
`docker compose logs backup | grep -i falhou`.

### O que o backup do banco não tem

As chaves de pagamento das barbearias e os CPFs estão no banco
**cifrados** com a `CHAVE_DE_CIFRA` do `api.env`. Sem ela o backup
restaura, mas esses campos não abrem nunca mais. Guardar fora da VM,
no gerenciador de senhas: a `CHAVE_DE_CIFRA`, o `JWT_SECRET` e o resto
do `api.env` e do `.env`.

## Papel do banco

A API e a migração devem conectar com um papel **sem superusuário**
(`barchop_app`). O `POSTGRES_USER` é o superusuário que a imagem cria,
e fica só pro backup e pra manutenção. Enquanto `APP_DB_USER` estiver
vazio no `.env`, a conexão continua pelo superusuário, como era.

Trocar, uma vez só, com um backup feito antes
(`docker compose run --rm -e BACKUP_UMA_VEZ=1 backup`):

```bash
cd ~/BarChop/barchop/infra
SENHA_DO_APP=$(openssl rand -hex 24)

docker compose stop api
# O roteiro cria o papel e passa pra ele tudo o que é da aplicação. Não
# mexe em dado nenhum; no fim lista o que sobrou com outro dono — tem
# que vir "(0 rows)".
docker compose exec -T postgres sh -c \
  'psql -X -v ON_ERROR_STOP=1 -v senha="$1" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f -' \
  sh "$SENHA_DO_APP" < banco/papel-da-aplicacao.sql

# No .env: APP_DB_USER=barchop_app e APP_DB_PASSWORD=<a senha gerada>.
nano .env
unset SENHA_DO_APP

docker compose up -d
docker compose logs migrar   # "No pending migrations to apply" ou as aplicadas
curl -I https://api.barchop.com.br/health
```

Voltar atrás é esvaziar `APP_DB_USER` e `APP_DB_PASSWORD` no `.env` e
dar `docker compose up -d`: o superusuário continua alcançando tudo.

Uma migration futura que precise de uma extensão nova do Postgres tem
que ser instalada antes pelo superusuário (`CREATE EXTENSION`): o papel
da aplicação só instala as extensões marcadas como confiáveis.

## Logs

```bash
docker compose logs -f api
docker compose logs -f web
```

O log de acesso do Caddy esconde o token do lembrete
(`/lembrete/<token>` e `/lembretes/<token>`) e descarta o `Referer`.
Conferir depois da primeira subida (e de mexer no Caddyfile) — o
`caddy validate` só olha a sintaxe:

```bash
curl -s -o /dev/null https://api.barchop.com.br/lembretes/teste123
docker compose logs caddy | tail -1   # tem que mostrar /lembretes/***, nunca teste123
```
