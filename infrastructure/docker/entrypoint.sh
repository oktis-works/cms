#!/bin/sh
# @oktis-works - Entrada única da imagem okcms/app
#
# O compose escolhe o papel com `command: api|web|admin|worker`. Qualquer
# outro valor é repassado literalmente (`docker run okcms/app sh`), o que
# mantem o container inspecionável sem reescrever a imagem.
set -eu

api_entry="node_modules/@oktis-works/api/dist/index.js"
web_entry="node_modules/@oktis-works/web/dist/index.js"
admin_entry="node_modules/@oktis-works/admin/bin/admin.js"
worker_entry="node_modules/@oktis-works/worker/dist/index.js"

case "${1:-api}" in
  api)
    shift
    exec bun "$api_entry" "$@"
    ;;
  web)
    shift
    exec bun "$web_entry" "$@"
    ;;
  admin)
    shift
    exec bun "$admin_entry" "$@"
    ;;
  worker)
    shift
    exec bun "$worker_entry" "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
