#!/bin/sh
# @oktis-works - Single entrypoint of the okcms/app image
#
# Compose picks the role with `command: api|web|admin|worker`. Any other
# value is passed through literally (`docker run okcms/app sh`), which keeps
# the container inspectable without rewriting the image.
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
