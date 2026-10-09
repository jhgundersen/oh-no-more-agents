#!/bin/sh
# CRAP report (https://github.com/unclebob/crapper): cyclomatic complexity
# against test coverage, per function, worst first. Crapper is a Python tool and
# not on npm, so it is fetched into .crapper/ on first use rather than added to
# the game's dependencies. Coverage comes from `npm run coverage`, which crapper
# runs itself.
#
#   npm run crap                       every function in the game and tools
#   npm run crap -- --changed          only what git says has changed
#   npm run crap -- --threshold 30     exit 2 if the worst score is over 30
set -e
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DIR="$ROOT/.crapper"
if [ ! -x "$DIR/crapper" ]; then
  git clone -q --depth 1 https://github.com/unclebob/crapper "$DIR"
fi
cd "$ROOT"
if [ $# -eq 0 ] || [ "${1#-}" != "$1" ]; then set -- "$@" public/agents src tools; fi
exec "$DIR/crapper" "$@"
