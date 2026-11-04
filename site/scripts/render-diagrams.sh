#!/usr/bin/env bash
# Render the drawings of the site that docs/readme does not keep.
#
# A private Archboard server reads a copy of examples/web-shop, like the README's quick start,
# and `archboard model render` draws each reading in the dark theme into site/src/diagrams.
# The server has its own port and registry. On Linux, it also has private runtime state.
# The run touches no registered repository.
# Run it from a built checkout, inside `nix develop`, after a renderer change. Commit the SVGs.
set -euo pipefail

site=$(cd "$(dirname "$0")/.." && pwd)
repo=$(cd "$site/.." && pwd)
out="$site/src/diagrams"
cli="$repo/bin/archboard"
work=$(mktemp -d)
holder="$work/shop"

port=$(bun -e 'const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } }); console.log(s.port); s.stop();')
export ARCHBOARD_URL="http://127.0.0.1:$port"
export ARCHBOARD_REPOS="$work/repos.json"
export ARCHBOARD_NO_AUTOSTART=1
export XDG_STATE_HOME="$work/state"

stop() {
	if ! "$cli" stop >/dev/null; then
		printf 'Could not stop the render server at %s. Kept its registry and state in %s.\n' "$ARCHBOARD_URL" "$work" >&2
		printf 'Retry: ARCHBOARD_URL=%q ARCHBOARD_REPOS=%q XDG_STATE_HOME=%q %q stop\n' "$ARCHBOARD_URL" "$ARCHBOARD_REPOS" "$XDG_STATE_HOME" "$cli" >&2
		exit 1
	fi
	rm -rf "$work"
}
trap stop EXIT

mkdir -p "$holder/.archboard" "$out"
cp -r "$repo/examples/web-shop" "$holder/.archboard/vault"
git -C "$holder" init -q
git -C "$holder" remote add origin https://example.invalid/web-shop.git
"$cli" repo add "$holder" >/dev/null
"$cli" start >/dev/null
"$cli" -C "$holder" model import --input "$holder/.archboard/vault/history.import.json" >/dev/null

# render <file> <reading options...>
render() {
	local name=$1
	shift
	"$cli" -C "$holder" model render "$@" --theme dark --out "$out/$name.svg" >/dev/null
	echo "wrote src/diagrams/$name.svg"
}

render queued-fulfilment --state wyzlP1Nf
render nightly-batch --state "Nightly batch"
render live-events --state "Live events"
render inventory-service --scope "Shop/MKhTEYqf#HYDbL5fE"
render checkout-api --scope "Shop/MKhTEYqf#lwmpnaVU"
render place-order-flowchart --flow "Place an order" --grammar flowchart
