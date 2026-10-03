#!/bin/bash
# Entry point for the Linux package. Node opens --inspect and V8 applies
# --js-flags before app code runs, so those switches have to be dropped here.
# Keep Playwright's --inspect=0 and --remote-debugging-port=0. Drop every other
# value so a later attacker port does not win. Never append those switches.
set -euo pipefail

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
bin="${here}/$(basename -- "$0").bin"

if [[ ! -e "$bin" ]]; then
  echo "agenteque: missing runtime ${bin}" >&2
  exit 127
fi

kept=()
args=("$@")
i=0
while ((i < ${#args[@]})); do
  arg="${args[$i]}"
  case "$arg" in
    --)
      kept+=("$arg")
      while ((i + 1 < ${#args[@]})); do
        i=$((i + 1))
        kept+=("${args[$i]}")
      done
      ;;
    --disable-web-security | --disable-web-security=*) ;;
    --js-flags)
      # The next argv is the value, including one that starts with "--".
      if ((i + 1 < ${#args[@]})); then
        i=$((i + 1))
      fi
      ;;
    --js-flags=*) ;;
    --inspect=0 | --remote-debugging-port=0)
      kept+=("$arg")
      ;;
    --inspect | --remote-debugging-port)
      if ((i + 1 < ${#args[@]})); then
        next="${args[$((i + 1))]}"
        if [[ "$next" =~ ^[0-9]+$ ]]; then
          i=$((i + 1))
        fi
      fi
      ;;
    --inspect=* | --remote-debugging-port=*) ;;
    *)
      kept+=("$arg")
      ;;
  esac
  i=$((i + 1))
done

if ((${#kept[@]} > 0)); then
  exec "$bin" "${kept[@]}"
fi
exec "$bin"
