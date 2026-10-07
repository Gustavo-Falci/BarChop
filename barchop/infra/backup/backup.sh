#!/bin/sh
# Backup diário do banco (serviço `backup` do compose.yaml): um
# pg_dump no formato custom ao subir e depois a cada 24 h, apagando os
# mais velhos que BACKUP_DIAS. A conexão vem das variáveis PG* do
# serviço.
#
# Os arquivos ficam num volume do mesmo disco da VM: protegem de erro
# humano e de migração ruim, não da perda do disco. A cópia pro bucket
# da OCI fica pra quando o bucket existir.
set -eu

DIAS="${BACKUP_DIAS:-14}"

while true; do
  arquivo="/backups/barchop-$(date -u +%Y%m%dT%H%M%SZ).dump"
  # Grava num nome provisório: um dump que falha no meio não pode
  # parecer um backup bom.
  if pg_dump --format=custom --file="$arquivo.parcial"; then
    mv "$arquivo.parcial" "$arquivo"
    echo "backup ok: $arquivo"
  else
    rm -f "$arquivo.parcial"
    echo "backup FALHOU" >&2
  fi
  find /backups -name 'barchop-*.dump' -mtime +"$DIAS" -delete
  sleep 86400
done
