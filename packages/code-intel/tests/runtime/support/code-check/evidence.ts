import type { CodeCheckSkip } from "#shared/protocol/code-check.ts";
// Existing language and infrastructure cases supply static semantic evidence.
// Live model discovery belongs to the public canonical runtime owner.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { LegacyBoardSchema, type LegacyBoard } from "@archboard/model/legacy-board";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/model/policy";
import { readVaultConfiguration } from "@archboard/model/vault-policy";
import type { StateToCheck } from "#runtime/operations/code-check/states.ts";
/**
 * Load static evidence fixtures for the language engine.
 * @param vault The fixture directory.
 * @param variant The requested draft name.
 * @param every Whether every draft participates.
 * @returns Selected fixture evidence.
 */
function evidence(vault: string, variant?: string, every = false) {
	const states: Array<Omit<StateToCheck, "document"> & { document: LegacyBoard }> = [];
	const skipped: CodeCheckSkip[] = [];
	const drafts = new Set<string>();
	const relationshipKinds =
		readVaultConfiguration(vault).configuration.relationshipKinds ??
		DEFAULT_SEMANTIC_POLICY.relationshipKinds;
	for (const file of readdirSync(vault).filter((name) => name.endsWith(".semantic.json"))) {
		const parsed = LegacyBoardSchema.safeParse(JSON.parse(readFileSync(join(vault, file), "utf8")));
		if (!parsed.success) {
			skipped.push({ reason: "model-unreadable", model: file });
			continue;
		}
		const document = parsed.data;
		document.variants
			.filter((state) => state.lifecycle === "draft")
			.forEach((state) => drafts.add(state.name));
		const draft = document.variants.find(
			(state) => state.name === variant && state.lifecycle === "draft",
		);
		const chosen = every
			? document.variants.filter((state) => state.lifecycle === "draft")
			: [draft ?? document.variants.find((state) => state.id === document.current)].filter(
					(state) => state !== undefined,
				);
		if (chosen.length === 0) skipped.push({ reason: "no-current-variant", model: document.name });
		for (const state of chosen)
			states.push({
				document,
				variant: state,
				file: join(vault, file),
				named: every || state === draft,
				relationshipKinds,
			});
	}
	return variant !== undefined && !states.some((document) => document.named)
		? { ok: false as const, variant, drafts: [...drafts] }
		: { ok: true as const, states, skipped };
}
function readStatesToCheck(vault: string, variant?: string) {
	return evidence(vault, variant);
}
function readEveryDraftToCheck(vault: string) {
	const read = evidence(vault, undefined, true);
	if (!read.ok) throw new Error("Fixture draft selection failed.");
	return read;
}
export { readStatesToCheck, readEveryDraftToCheck };
