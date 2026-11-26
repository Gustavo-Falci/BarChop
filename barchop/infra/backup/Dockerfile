# A imagem do backup: o Postgres (pelo pg_dump, na mesma versão maior do
# banco) mais o que a cópia de fora da VM pede — o `age`, que cifra, e o
# `rclone`, que manda pro bucket (auditoria de segurança de 15/11,
# SEC-006; ver backup.sh).
#
# O roteiro continua montado por volume (compose.yaml): mexer nele não
# pede montar a imagem de novo.
FROM postgres:19
RUN apt-get update \
  && apt-get install -y --no-install-recommends age rclone ca-certificates \
  && rm -rf /var/lib/apt/lists/*
