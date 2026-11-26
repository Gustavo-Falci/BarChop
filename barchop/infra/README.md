# Produção na VM da OCI

Tudo roda num `docker compose` na VM (Ubuntu ARM): Postgres, migração,
API (com o worker da fila), web, Caddy e backup. As imagens são
montadas na própria VM. Só o Caddy abre porta (80 e 443).

| Serviço | O que é |
|---|---|
| `postgres` | Postgres 19, volume `banco-19` |
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

**Se o `git pull` trouxer outra versão maior do Postgres** (a imagem
`postgres:<n>` do `compose.yaml`), não dar o `up`: ir pra "Trocar a
versão maior do Postgres". O `up` sobe o banco novo vazio, e a migração
cria as tabelas sem dado nenhum.

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

## Trocar a versão maior do Postgres

Cada versão maior tem o seu volume (`banco-19`, depois `banco-20`...),
e os dados passam por dump e restauração. A imagem nova não abre os
dados da velha: com eles no volume, ela se recusa a subir; num volume
novo, sobe vazia. O volume velho fica guardado e é a volta atrás.

Ensaiado de 18 pra 19 em 26/11 com o `compose.yaml` de verdade, numa
cópia com barbearia, agendamentos, `pgboss` e o papel `barchop_app`:
contagem igual, `migrar` sem pendência, backup, volta pro 18 e ida de
novo sem perder linha.

O site fica fora do passo 2 ao 7, uns 20 minutos. Fazer em horário
vazio, **logo depois do merge** do PR que troca a versão: até a troca,
o "Atualizar" de sempre sobe o banco novo vazio.

```bash
cd ~/BarChop/barchop/infra

# 0. Espaço: o volume novo ocupa o mesmo que o velho, mais o dump.
df -h /
docker compose exec postgres sh -c 'psql -X -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select pg_size_pretty(pg_database_size(current_database()))"'

# 1. Um backup do jeito de sempre, ainda na versão velha (e a cópia de
#    fora, se configurada).
docker compose run --rm -e BACKUP_UMA_VEZ=1 backup

# 2. Ninguém mais escreve no banco.
docker compose stop api web backup

# 3. Onde o repo estava, a contagem e o dump final, fora do volume. O
#    umask deixa os arquivos só seus: o dump é o banco em claro.
git -C ~/BarChop rev-parse HEAD > ~/antes-da-troca.txt
umask 077
docker compose exec -T postgres sh -c 'psql -X -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f -' \
  < banco/contar-linhas.sql > ~/contagem-antes.txt
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > ~/barchop-antes-da-troca.dump
ls -lh ~/barchop-antes-da-troca.dump   # não pode ter 0 bytes

# 4. Para o banco velho, traz a versão nova e sobe SÓ o banco, no volume
#    novo, vazio.
docker compose stop postgres
cd ~/BarChop && git pull && cd barchop/infra
docker compose up -d --wait postgres
docker compose exec postgres postgres --version
```

Passo 5. **Com `APP_DB_USER` preenchido no `.env`** (ver "Papel do
banco"), o papel nasce antes e de novo depois da restauração: ele não
vai no dump, e o `--no-owner` faz tudo nascer do superusuário. A
segunda rodada passa tudo pra ele e tem que terminar em "(0 rows)".
Com `APP_DB_USER` vazio, só a restauração e o `ANALYZE`.

```bash
SENHA_DO_APP="$(grep '^APP_DB_PASSWORD=' .env | cut -d= -f2-)"
papel() {
  docker compose exec -T postgres sh -c \
    'psql -X -v ON_ERROR_STOP=1 -v senha="$1" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f -' \
    sh "$SENHA_DO_APP" < banco/papel-da-aplicacao.sql
}

papel
docker compose exec -T postgres sh -c 'pg_restore --no-owner --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < ~/barchop-antes-da-troca.dump && echo RESTAURADO
papel                                  # "(0 rows)"
unset SENHA_DO_APP

# A restauração não traz as estatísticas do planejador.
docker compose exec postgres sh -c 'psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c ANALYZE'
```

```bash
# 6. Tem que dar IGUAL.
docker compose exec -T postgres sh -c 'psql -X -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f -' \
  < banco/contar-linhas.sql > ~/contagem-depois.txt
diff ~/contagem-antes.txt ~/contagem-depois.txt && echo IGUAL

# 7. O resto. O backup monta a imagem nova (o pg_dump da versão nova).
docker compose build backup
docker compose up -d
docker compose logs migrar    # "No pending migrations to apply."
curl -I https://api.barchop.com.br/health
```

Depois, entrar no painel e abrir a página pública: agenda de hoje,
clientes e serviços têm que estar lá.

**Se o passo 5 ou o 6 falhar**, o banco novo ficou pela metade. Jogar
fora só ele e refazer do `up -d --wait postgres` do passo 4:

```bash
docker compose stop postgres && docker compose rm -f postgres
docker volume rm barchop_banco-19
```

**Voltar pra versão velha**, enquanto o volume velho existir. Perde o
que entrou no banco novo depois do passo 7:

```bash
docker compose stop api web backup postgres
git -C ~/BarChop checkout "$(cat ~/antes-da-troca.txt)" -- barchop/infra/compose.yaml
docker compose up -d
```

O `compose.yaml` da VM fica diferente da main até a troca ser refeita
(`git -C ~/BarChop checkout HEAD -- barchop/infra/compose.yaml` e o
roteiro de novo). O backup pode ficar na imagem nova: o `pg_dump` lê
versões mais velhas.

**Limpeza**, uns dias depois, com tudo certo:

```bash
docker volume rm barchop_banco
rm ~/barchop-antes-da-troca.dump ~/contagem-antes.txt ~/contagem-depois.txt ~/antes-da-troca.txt
```

**A próxima troca** (19 → 20) é o mesmo roteiro. O PR muda a imagem e o
volume no `compose.yaml` (`postgres:20`, `banco-20` no serviço e na
lista de volumes), o `FROM` do `backup/Dockerfile`, o serviço do
`.github/workflows/ci.yml` e este README (tabela do topo, nomes dos
volumes acima).

## DNS: quem pode emitir certificado e quem pode mandar e-mail

Dois registros na zona `barchop.com.br` da Cloudflare (auditoria de
segurança de 15/11, SEC-019). Não dependem de deploy.

**CAA** — diz quais autoridades podem emitir certificado pro domínio.
Sem ele, qualquer uma pode. O Caddy emite pela Let's Encrypt e, se ela
falhar, tenta a ZeroSSL (que emite como Sectigo): entram as duas, pra
não perder a reserva. Na raiz (`@`), tipo CAA:

| Flags | Tag | Valor |
|---|---|---|
| 0 | `issue` | `letsencrypt.org` |
| 0 | `issuewild` | `letsencrypt.org` |
| 0 | `issue` | `sectigo.com` |
| 0 | `issuewild` | `sectigo.com` |
| 0 | `iodef` | `mailto:<e-mail que você lê>` |

Conferir depois: `dig +short CAA barchop.com.br`, e na próxima
renovação `docker compose logs caddy | grep -i "certificate obtained"`.
Se um dia trocar de autoridade ou de provedor de DNS, o CAA muda junto
— senão a renovação falha.

**DMARC** — hoje é `v=DMARC1; p=none;`: quem recebe um e-mail falso em
nome do BarChop entrega do mesmo jeito, e ninguém fica sabendo. Subir
em dois passos, no TXT `_dmarc`:

1. Ligar os relatórios (Cloudflare → Email → DMARC Management, que
   acrescenta o `rua=` sozinho) e conferir num e-mail de verdade
   mandado pelo sistema — o código de verificação serve — que o
   cabeçalho `Authentication-Results` traz `dmarc=pass`. Então:
   `v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:<o da Cloudflare>`
2. Depois de umas três semanas de relatório sem envio legítimo
   reprovado, trocar `p=quarantine` por `p=reject`.

A raiz já tem `v=spf1 -all` (ninguém manda e-mail como
`@barchop.com.br` fora do serviço de envio, que usa o subdomínio
`send.`): não mexer.

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
