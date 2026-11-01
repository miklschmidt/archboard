import { git } from "@archboard/process/git";
import {
	resolveRegisteredCheckout,
	snapshotCheckoutAccess,
} from "@archboard/code-binding/resolution";
import type { ArchitectureCheckpoint, ArchitectureModel } from "#shared/schemas/model.ts";

/**
 * Capture bound repository associations through the same checkout snapshot as code opening.
 * @param vault The explicitly addressed source vault.
 * @param model The complete architecture candidate.
 * @param known The source vault's existing association.
 * @returns Source associations without retaining code or changing any repository.
 */
async function captureBoundSources(
	vault: string,
	model: ArchitectureModel,
	known: ArchitectureCheckpoint["sources"],
) {
	const bindings = model.modules.flatMap((module) =>
		module.binding === undefined ? [] : [module.binding],
	);
	const repositories = [...new Set(bindings.map((binding) => binding.repo))]
		.filter((repo) => !known.some((source) => source.repo === repo))
		.toSorted();
	if (repositories.length === 0) return known;
	const snapshot = await snapshotCheckoutAccess({ vault, bindings });
	const sources = await Promise.all(
		repositories.map(async (repo) => {
			const checkout = resolveRegisteredCheckout(repo, snapshot);
			if (!checkout.ok) return [];
			const commit = snapshot.inspection(repo)?.head?.commit ?? null;
			const dirty = await git(checkout.root, [
				"status",
				"--porcelain",
				"--untracked-files=all",
				"--",
				".",
				":(exclude).archboard/vault",
			]);
			return [{ repo, commit, uncommitted: dirty !== undefined }];
		}),
	);
	return [...known, ...sources.flat()];
}

export { captureBoundSources };
