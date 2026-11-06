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
# A drawing leaves out its render recipe: the recipe names the disposable copy, which no
# `archboard check embeds` can resolve later. Draw them again after a renderer change instead.
render() {
	local name=$1
	shift
	"$cli" -C "$holder" model render "$@" --theme dark --out "$out/$name.svg" >/dev/null
	bun -e 'const f = Bun.argv[1]; const svg = await Bun.file(f).text(); await Bun.write(f, svg.replace(/<metadata><archboard:render-recipe[\s\S]*?<\/metadata>/, ""));' "$out/$name.svg"
	echo "wrote src/diagrams/$name.svg"
}

render queued-fulfilment --state wyzlP1Nf
render nightly-batch --state "Nightly batch"
render live-events --state "Live events"
render inventory-service --scope "Shop/MKhTEYqf#HYDbL5fE"
render checkout-api --scope "Shop/MKhTEYqf#lwmpnaVU"

# The example still writes the branches and the retry of "Place an order" as notes. The site draws
# that exchange with its decisions and its loop: once the drawings above have read the example as
# it is, the copy's flow is rewritten through the CLI from scripts/place-order-logic.changes.json.
CLI="$cli" HOLDER="$holder" WORK="$work" CHANGES="$site/scripts/place-order-logic.changes.json" bun -e '
	const { CLI, HOLDER, WORK, CHANGES } = process.env;
	const archboard = (...args) => {
		const run = Bun.spawnSync([CLI, "-C", HOLDER, "model", ...args], { stderr: "inherit" });
		if (run.exitCode !== 0) process.exit(run.exitCode);
		return JSON.parse(run.stdout.toString());
	};
	const reading = archboard("read");
	const changes = await Bun.file(CHANGES).json();
	const collection = await Bun.file(`${HOLDER}/.archboard/vault/flows/MKhTEYqf.flows.json`).json();
	const old = collection.flows.find((flow) => flow.name === "Place an order");
	const ids = (steps) => steps.flatMap((step) => [step.id, ...ids(step.steps ?? []), ...(step.alternatives ?? []).flatMap((one) => ids(one.steps))]);
	const target = { model: reading.manifest.id, state: reading.manifest.current.id };
	// The Queued fulfilment proposal changes this flow, so the rewrite touches it too.
	const subjects = [reading.manifest.id, `${reading.manifest.id}#${collection.id}`, "wyzlP1Nf", old.id, ...old.participants, ...ids(old.steps)];
	const doing = "drawing Place an order with its logic";
	await Bun.write(`${WORK}/claim.json`, JSON.stringify({ target, writer: "site", reason: doing, subjects }));
	const { claim } = archboard("claim", "--input", `${WORK}/claim.json`);
	await Bun.write(`${WORK}/edit.json`, JSON.stringify({ target, expectedRevision: reading.revision, operationId: "site-place-order-logic", writer: "site", claim: claim.id, changes }));
	archboard("edit", "--input", `${WORK}/edit.json`, "--doing", doing);
'
render place-order-sequence --flow "Place an order" --grammar sequence
render place-order-flowchart --flow "Place an order" --grammar flowchart
