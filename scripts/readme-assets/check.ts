// `bun run readme:check`: list the README assets that no longer show what the checkout holds.
//
// Exits 1 when any asset is stale or the manifest names something that does not exist, and 0
// when every asset is current. It is not part of `bun run check`: a stale README is listed, it
// does not fail the gate (TASK-396). docs/agents/readme-assets.md says when to refresh.

import { resolve } from "node:path";

// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { MANIFEST_PATH, assess, checkoutFacts, readManifest, type StaleAsset } from "./manifest.ts";

const root = resolve(import.meta.dir, "../..");
const manifest = readManifest(root);
const assessment = assess(manifest, checkoutFacts(root));

/**
 * The lines that say why one asset is stale and how to make it again.
 * @param stale The asset and its reasons.
 * @returns The lines.
 */
function staleLines(stale: StaleAsset): readonly string[] {
	const { asset, reasons } = stale;
	const codex = asset.codex ? ", needs a Codex sign-in" : "";
	return [
		`stale  ${asset.name} (${asset.kind}${codex}): ${reasons.join("; ")}.`,
		`       ${asset.command}`,
	];
}

const total = manifest.assets.length;
console.log(
	`README assets: ${assessment.current.length} of ${total} current, ${assessment.stale.length} stale.`,
);
for (const stale of assessment.stale) console.log(staleLines(stale).join("\n"));
for (const problem of assessment.problems) console.log(`fix ${MANIFEST_PATH}: ${problem}`);
process.exitCode = assessment.stale.length > 0 || assessment.problems.length > 0 ? 1 : 0;
