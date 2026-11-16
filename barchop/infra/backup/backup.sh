#!/bin/sh
# Backup diário do banco (serviço `backup` do compose.yaml): um
# pg_dump no formato custom ao subir e depois a cada 24 h, apagando os
# mais velhos que BACKUP_DIAS. A conexão vem das variáveis PG* do
# serviço.
#
# Duas cópias (auditoria de segurança de 15/11, SEC-006):
#
# 1. No volume `backups`, no mesmo disco da VM, em claro. Protege de erro
#    humano e de migração ruim, e restaura na hora (infra/README.md). Em
#    claro porque mora ao lado do próprio banco: quem lê um lê o outro.
#
# 2. Fora da VM, CIFRADA, num bucket privado — a que salva quando o disco
#    ou a VM se perdem. Só acontece com BACKUP_S3_BUCKET preenchido.
#    Cifrada com a chave PÚBLICA do `age` (BACKUP_CHAVE_PUBLICA): a VM só
#    sabe cifrar. A chave privada, que abre os arquivos, fica com o dono,
#    fora daqui. Nada sai da VM sem cifra: com o bucket configurado e sem
#    a chave, a cópia é recusada.
#
# A credencial do bucket só precisa escrever: quem apaga os antigos é a
# regra de ciclo de vida do próprio bucket. Assim, quem tomar a VM não
# consegue apagar os backups de fora.
#
# Uma falha na cópia de fora não mexe no backup local, que já está
# gravado quando ela começa.
set -eu

PASTA="${BACKUP_PASTA:-/backups}"
DIAS="${BACKUP_DIAS:-14}"

# Manda um arquivo local, cifrado, pro bucket. Devolve 0 se mandou ou se
# a cópia de fora está desligada; 1 se devia ter mandado e não mandou.
enviar_pra_fora() {
  local_="$1"

  if [ -z "${BACKUP_S3_BUCKET:-}" ]; then
    echo "AVISO: cópia fora da VM desligada (BACKUP_S3_BUCKET vazio): este backup só existe neste disco"
    return 0
  fi
  if [ -z "${BACKUP_CHAVE_PUBLICA:-}" ]; then
    echo "cópia fora da VM FALHOU: BACKUP_CHAVE_PUBLICA vazia, e backup nenhum sai daqui sem cifra" >&2
    return 1
  fi
  if [ -z "${BACKUP_S3_ENDPOINT:-}" ] || [ -z "${BACKUP_S3_CHAVE_DE_ACESSO:-}" ] || [ -z "${BACKUP_S3_SEGREDO:-}" ]; then
    echo "cópia fora da VM FALHOU: faltam BACKUP_S3_ENDPOINT, BACKUP_S3_CHAVE_DE_ACESSO ou BACKUP_S3_SEGREDO" >&2
    return 1
  fi

  cifrado="$local_.age"
  if ! age --recipient "$BACKUP_CHAVE_PUBLICA" --output "$cifrado" "$local_"; then
    rm -f "$cifrado"
    echo "cópia fora da VM FALHOU: não deu pra cifrar" >&2
    return 1
  fi

  # O rclone lê a configuração do ambiente: nada de arquivo com segredo.
  # `FORA` é o nome do destino; `Other` é o S3 de quem não é a AWS (o da
  # OCI pede o endereço no estilo de caminho).
  if RCLONE_CONFIG_FORA_TYPE=s3 \
    RCLONE_CONFIG_FORA_PROVIDER=Other \
    RCLONE_CONFIG_FORA_ENDPOINT="$BACKUP_S3_ENDPOINT" \
    RCLONE_CONFIG_FORA_REGION="${BACKUP_S3_REGIAO:-}" \
    RCLONE_CONFIG_FORA_ACCESS_KEY_ID="$BACKUP_S3_CHAVE_DE_ACESSO" \
    RCLONE_CONFIG_FORA_SECRET_ACCESS_KEY="$BACKUP_S3_SEGREDO" \
    RCLONE_CONFIG_FORA_FORCE_PATH_STYLE=true \
    RCLONE_CONFIG_FORA_NO_CHECK_BUCKET=true \
    rclone copyto "$cifrado" "FORA:$BACKUP_S3_BUCKET/$(basename "$cifrado")"; then
    rm -f "$cifrado"
    echo "cópia fora da VM ok: $(basename "$cifrado") em $BACKUP_S3_BUCKET"
    return 0
  fi
  rm -f "$cifrado"
  echo "cópia fora da VM FALHOU: o envio pro bucket não passou" >&2
  return 1
}

while true; do
  arquivo="$PASTA/barchop-$(date -u +%Y%m%dT%H%M%SZ).dump"
  # Grava num nome provisório: um dump que falha no meio não pode
  # parecer um backup bom.
  if pg_dump --format=custom --file="$arquivo.parcial"; then
    mv "$arquivo.parcial" "$arquivo"
    echo "backup ok: $arquivo"
    # `|| true`: o `set -e` não pode derrubar o laço por causa da cópia
    # de fora — amanhã tem outro backup pra fazer.
    enviar_pra_fora "$arquivo" || true
  else
    rm -f "$arquivo.parcial"
    echo "backup FALHOU" >&2
  fi
  find "$PASTA" -name 'barchop-*.dump' -mtime +"$DIAS" -delete
  # Sobra de uma cópia interrompida no meio (contêiner reiniciado).
  find "$PASTA" -name 'barchop-*.dump.age' -mtime +1 -delete

  # Uma rodada só, pra um backup na hora ou pra testar a cópia de fora:
  # docker compose run --rm -e BACKUP_UMA_VEZ=1 backup
  if [ -n "${BACKUP_UMA_VEZ:-}" ]; then break; fi
  sleep 86400
done
