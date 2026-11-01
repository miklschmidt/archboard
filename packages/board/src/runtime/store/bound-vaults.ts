// Known canonical models whose current or proposed modules bind a repository.
// Discovery returns an explicit -C hint and never reads live legacy boards or rewrites inputs.

import fs from "node:fs";
import path from "node:path";
import { chosenCheckouts, listRegistry } from "@archboard/workspace/checkouts";
import { VAULT_DIRECTORY, isVaultLayout, type BoundVault } from "@archboard/workspace/vault";
import { readArchitectureModel } from "#runtime/operations/read/model-read.ts";

/**
 * The vault a known directory holds, as its real path, when the server would serve it.
 * @param holder A chosen checkout or the directory of an untracked vault.
 * @returns The vault, or undefined when it holds none.
 */
function servedVaultOf(holder: string): string | undefined {
	try {
		const vault = fs.realpathSync.native(path.join(holder, VAULT_DIRECTORY));
		return isVaultLayout(vault) && fs.statSync(vault).isDirectory() ? vault : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Read the canonical model and its independent proposals for bindings to a repository.
 * @param vault The explicit known vault.
 * @param repo The repository identity.
 * @returns The model name when current or proposed meaning binds that source.
 */
async function modelBinding(vault: string, repo: string): Promise<string | undefined> {
	const model = readArchitectureModel(vault);
	if (!model.success) return undefined;
	const proposals = await Promise.all(
		model.proposals.map((proposal) =>
			readArchitectureModel(vault, undefined, undefined, { state: proposal.id }),
		),
	);
	const readings = [model, ...proposals].filter((reading) => reading.success);
	return readings.some((reading) => reading.modules.some((module) => module.binding?.repo === repo))
		? model.manifest.name
		: undefined;
}
/**
 * The known canonical models that bind a repository's code.
 * @param repo The repository identity, as a binding names it.
 * @returns Each matching model and its vault holder, in path order.
 */
async function vaultsBoundTo(repo: string): Promise<BoundVault[]> {
	const holders = [
		...chosenCheckouts().filter((each) => each.exists),
		...listRegistry().vaults.filter((each) => each.exists),
	].map((each) => each.root);
	const matches = await Promise.all(
		[...new Set(holders)].toSorted().map(async (holder) => {
			const vault = servedVaultOf(holder);
			if (vault === undefined) return [];
			const name = await modelBinding(vault, repo);
			return name === undefined ? [] : [{ holder, models: [name] }];
		}),
	);
	return matches.flat();
}

export { vaultsBoundTo };
