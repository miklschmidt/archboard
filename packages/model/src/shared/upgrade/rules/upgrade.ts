import { createHash } from "node:crypto";
import type { z } from "zod";
import {
	EFFECTLESS_KIND,
	type EvidenceKindSchema,
	type SemanticPolicy,
} from "#shared/schemas/semantic-policy.ts";
import { sameSemanticValue } from "#shared/rules/semantic-value.ts";
import type { ModelDiagnostic } from "#shared/canonical-contracts/schemas/model.ts";
import type { InventoryRelationship, UpgradeInventory } from "#shared/upgrade/schemas/upgrade.ts";

/** The kind the current format retired: a storage access is now `storage`, and data that passes is no kind. */
const RETIRED_KIND = "data";
/**
 * The relationship kinds an old vault was written with, as `model init` wrote
 * them before kinds were layered. An entry that only restates one of these is
 * the old default, not the vault's choice, so the upgrade drops it and the
 * built-in of the current format applies, its color and evidence included.
 */
const NETWORK: z.infer<typeof EvidenceKindSchema>[] = ["call", "configured-path"];
const OLD_BUILT_IN_KINDS: Record<string, SemanticPolicy["relationshipKinds"][string]> = {
	call: { name: "Call", arrowhead: "filled", evidence: ["call"] },
	http: { name: "HTTP", color: "sky", arrowhead: "filled", evidence: NETWORK },
	rpc: { name: "RPC", color: "blue", arrowhead: "filled", evidence: NETWORK },
	event: { name: "Event", color: "amber", arrowhead: "open", evidence: NETWORK },
	queue: { name: "Queue", color: "orange", arrowhead: "open", evidence: NETWORK },
	dependency: {
		name: "Dependency",
		arrowhead: "open",
		evidence: ["call", "configured-path", "import", "build-dependency"],
	},
	render: { name: "Render", color: "pink", arrowhead: "filled", evidence: ["call"] },
	other: { name: "Other", arrowhead: "filled" },
};

/**
 * The configuration of an old vault in the current format: no kind has a
 * dash, the retired `data` kind goes, and so does each entry that restates an
 * old default, its dash aside. What the vault chose itself stays.
 * @param policy The policy of the old configuration.
 * @returns The configuration to validate and write.
 */
function upgradedConfiguration(policy: SemanticPolicy): Record<string, unknown> {
	const { lenses: _lenses, defaultLens: _defaultLens, relationshipKinds, ...vocabulary } = policy;
	const kinds = Object.entries(relationshipKinds).flatMap(([id, { dash: _dash, ...kind }]) => {
		const old = OLD_BUILT_IN_KINDS[id];
		const restated =
			old !== undefined &&
			sameSemanticValue({ ...kind, evidence: kind.evidence ?? old.evidence }, old);
		return id === RETIRED_KIND || restated ? [] : [[id, kind] as const];
	});
	return { ...vocabulary, relationshipKinds: Object.fromEntries(kinds) };
}

/** A relationship the inventory names, by its key: its id, and its draft when it has one. */
type Listed = Pick<InventoryRelationship, "id" | "proposal">;
/** A relationship the vault holds, with the vault file it is written in. */
type Held = Listed & { readonly file: string };
/** A relationship the inventory leaves unclassified, and what to repair. */
type Refusal = readonly [Listed, string];

/**
 * What a filled kind lacks.
 * @param kind The filled kind.
 * @param kinds The relationship kinds of the upgraded vault.
 * @returns What to repair, or nothing.
 */
function kindProblem(kind: string | null, kinds: ReadonlySet<string>): string | undefined {
	if (kind === null) return "states no kind";
	if (kinds.has(kind)) return undefined;
	return kind === RETIRED_KIND
		? "keeps the retired kind data: use storage for a store the source reads or writes directly, or the kind that carries the data"
		: `names the unknown kind ${kind}: use one of ${[...kinds].join(", ")}`;
}

/**
 * What a filled effect lacks: only a dependency may state none, and a recorded
 * gap means a side effect was not ruled out, which makes it a mutation.
 * @param entry The filled relationship.
 * @returns What to repair, or nothing.
 */
function effectProblem(entry: InventoryRelationship): string | undefined {
	if (entry.effect === null)
		return entry.kind === EFFECTLESS_KIND
			? undefined
			: "states no effect: mutation, query or compute";
	return entry.gap !== null && entry.effect !== "mutation"
		? "records a gap, so a side effect was not ruled out: its effect is mutation"
		: undefined;
}

/**
 * The relationships an inventory lists twice, lists without the vault
 * holding them, or leaves out.
 * @param entries Every filled relationship.
 * @param held The relationships the vault holds, by inventory key.
 * @returns A refusal for each.
 */
function coverageRefusals(
	entries: readonly InventoryRelationship[],
	held: ReadonlyMap<string, Held>,
): Refusal[] {
	const keys = entries.map(inventoryKey);
	const listed = new Set(keys);
	return [
		...entries
			.filter((_, index) => keys.indexOf(keys[index]!) !== index)
			.map((entry): Refusal => [entry, "is listed more than once"]),
		...entries
			.filter((entry) => !held.has(inventoryKey(entry)))
			.map((entry): Refusal => [entry, "is not a relationship this inventory covers"]),
		...[...held]
			.filter(([key]) => !listed.has(key))
			.map(([, relationship]): Refusal => [relationship, "is missing"]),
	];
}

/**
 * Where an inventory leaves the vault's relationships unclassified: one
 * diagnostic for each relationship that is missing, listed twice, unknown to
 * the vault, or without a kind or an effect it needs.
 * @param entries Every filled relationship.
 * @param held The relationships the vault holds, by inventory key.
 * @param kinds The relationship kinds of the upgraded vault.
 * @returns The diagnostics, empty when the inventory is complete.
 */
function inventoryDiagnostics(
	entries: readonly InventoryRelationship[],
	held: ReadonlyMap<string, Held>,
	kinds: ReadonlySet<string>,
): ModelDiagnostic[] {
	const refusals = [
		...coverageRefusals(entries, held),
		...entries.flatMap((entry) =>
			[kindProblem(entry.kind, kinds), effectProblem(entry)]
				.filter((problem) => problem !== undefined)
				.map((problem): Refusal => [entry, problem]),
		),
	];
	return refusals.map(([relationship, problem]) => ({
		code: "INVENTORY_INCOMPLETE",
		file: held.get(inventoryKey(relationship))?.file ?? ".",
		subjects: [relationship.id],
		message: `Relationship ${relationship.id}${relationship.proposal === undefined ? "" : ` (draft ${relationship.proposal})`} ${problem}.`,
		recovery:
			"Fill its kind and effect from the code, then install the inventory again. A side effect that cannot be ruled out is a mutation, with the gap recorded.",
	}));
}

/**
 * The key of a relationship in the inventory: its id, and the draft that adds or re-kinds it.
 * @param entry The relationship.
 * @returns Its key.
 */
function inventoryKey(entry: Listed): string {
	return entry.proposal === undefined ? entry.id : `${entry.id} ${entry.proposal}`;
}

/**
 * One digest for a set of inventories, whatever order their files were read in.
 * @param inventories The filled inventories.
 * @returns The digest a checkpoint records.
 */
function inventoryDigest(inventories: readonly UpgradeInventory[]): string {
	const ordered = inventories.toSorted((one, other) => one.root.id.localeCompare(other.root.id));
	return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}

/**
 * The kind and effect a filled entry gives its relationship; a dependency may have no effect.
 * @param entry The filled entry, which the inventory checks have passed.
 * @param entry.kind Its kind.
 * @param entry.effect Its effect.
 * @returns The fields to write.
 */
function classification({ kind, effect }: Pick<InventoryRelationship, "kind" | "effect">): {
	kind: string;
	effect?: NonNullable<InventoryRelationship["effect"]>;
} {
	return { kind: kind!, ...(effect === null ? {} : { effect }) };
}

/**
 * A relationship as the current format writes it: the classified kind, and the
 * effect right after it. Every other field keeps its place.
 * @param relationship The relationship as the old format wrote it.
 * @param entry Its filled inventory entry.
 * @returns The relationship in the current format.
 */
function upgradedRelationship(
	relationship: Record<string, unknown>,
	entry: Pick<InventoryRelationship, "kind" | "effect">,
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(relationship).flatMap(([key, value]) =>
			key === "kind" ? Object.entries(classification(entry)) : [[key, value]],
		),
	);
}

export {
	type Held,
	classification,
	RETIRED_KIND,
	upgradedConfiguration,
	inventoryDiagnostics,
	inventoryDigest,
	inventoryKey,
	upgradedRelationship,
};
