import { createHash } from "node:crypto";
import type { z } from "zod";
import {
	configurationOf,
	type EvidenceKindSchema,
	type SemanticPolicy,
} from "#shared/schemas/semantic-policy.ts";
import {
	CALL_REPLACEMENT,
	EFFECTLESS_KIND,
	IN_PROCESS,
	RETIRED_CALL,
} from "#shared/schemas/built-in-vocabulary.ts";
import { sameSemanticValue } from "#shared/rules/semantic-value.ts";
import type { ModelDiagnostic } from "#shared/canonical-contracts/schemas/model.ts";
import type { InventoryRelationship, UpgradeInventory } from "#shared/upgrade/schemas/upgrade.ts";

/**
 * The kinds the current format retired, with what replaces each: an in-process call is now sync
 * or async, a storage access is now `storage` and data that passes is no kind, and a
 * relationship that fits no kind takes one the vault adds.
 */
const RETIRED_KINDS: Readonly<Record<string, string>> = {
	[RETIRED_CALL]: CALL_REPLACEMENT,
	data: "use storage for a store the source reads or writes directly, or the kind that carries the data",
	other:
		"use the kind that says how it travels, or add a kind of the vault's own under relationshipKinds in .archboard/config.yaml",
};

/**
 * Whether the current format retired a kind.
 * @param kind The kind.
 * @returns True for a retired kind.
 */
function isRetiredKind(kind: string): boolean {
	return Object.hasOwn(RETIRED_KINDS, kind);
}
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

type Lens = SemanticPolicy["lenses"][string];
type Selector = NonNullable<Lens["show"]>[number];

/**
 * A lens selector in the current vocabulary: one that names call names sync and async.
 * @param selector The selector as the old configuration wrote it.
 * @returns Its selectors now.
 */
function upgradedSelectors(selector: Selector): Selector[] {
	return selector.kind === RETIRED_CALL
		? IN_PROCESS.map((kind) => ({ ...selector, kind }))
		: [selector];
}

/**
 * A vault's own lens in the current vocabulary.
 * @param lens The lens as the old configuration wrote it.
 * @param lens.show What it shows, if it has that list.
 * @param lens.hide What it hides, if it has that list.
 * @returns The lens, its selectors upgraded.
 */
function upgradedLens({ show, hide, ...lens }: Lens): Lens {
	return {
		...lens,
		...(show === undefined ? {} : { show: show.flatMap(upgradedSelectors) }),
		...(hide === undefined ? {} : { hide: hide.flatMap(upgradedSelectors) }),
	};
}

/**
 * The configuration of an old vault in the current format: no kind has a
 * dash or an arrowhead, the retired kinds `call`, `data` and `other` go, and so does each entry
 * that restates an old default. An entry under call goes even when the vault renamed it, because
 * a name for one kind cannot name both sync and async, and keeping it would block the upgrade of
 * every old vault, whose configuration listed call whole. A vault's own lenses keep their place,
 * and a selector that names call names sync and async. What the vault chose itself stays.
 * @param policy The policy of the old configuration.
 * @returns The configuration to validate and write.
 */
function upgradedConfiguration(policy: SemanticPolicy): Record<string, unknown> {
	const { relationshipKinds, lenses, ...stated } = configurationOf(policy);
	const kinds = Object.entries(relationshipKinds).flatMap(
		([id, { dash: _dash, arrowhead, ...kind }]) => {
			const old = OLD_BUILT_IN_KINDS[id];
			const restated =
				old !== undefined &&
				sameSemanticValue({ ...kind, arrowhead, evidence: kind.evidence ?? old.evidence }, old);
			return isRetiredKind(id) || restated ? [] : [[id, kind] as const];
		},
	);
	return {
		...stated,
		relationshipKinds: Object.fromEntries(kinds),
		...(lenses === undefined
			? {}
			: {
					lenses: Object.fromEntries(
						Object.entries(lenses).map(([id, lens]) => [id, upgradedLens(lens)]),
					),
				}),
	};
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
	const replacement = RETIRED_KINDS[kind];
	return replacement === undefined
		? `names the unknown kind ${kind}: use one of ${[...kinds].join(", ")}`
		: `keeps the retired kind ${kind}: ${replacement}`;
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
		Object.entries(relationship).flatMap(([key, value]) => {
			if (key === "kind") return Object.entries(classification(entry));
			return key === "effect" ? [] : [[key, value]];
		}),
	);
}

/**
 * How the anchored call of a relationship runs, as the code facts read it: awaited, started and
 * left to run (a task, a goroutine, an async callee not awaited), a plain call of a sync
 * function, or unknown where the language or the code cannot tell.
 */
type CallTiming = "awaited" | "started" | "plain" | "unknown";

/**
 * The kind an inventory entry starts with: the old kind, none for a retired kind, and for a
 * call the kind its anchored call says, or none for the agent to fill.
 * @param oldKind The kind the relationship had.
 * @param timing How its anchored call runs, when the code facts read it.
 * @returns The seeded kind, or null.
 */
function seededKind(oldKind: string, timing: CallTiming | undefined): string | null {
	if (oldKind !== RETIRED_CALL) return isRetiredKind(oldKind) ? null : oldKind;
	if (timing === "awaited" || timing === "started") return "async";
	return timing === "plain" ? "sync" : null;
}

export {
	type CallTiming,
	type Held,
	seededKind,
	classification,
	isRetiredKind,
	upgradedConfiguration,
	inventoryDiagnostics,
	inventoryDigest,
	inventoryKey,
	upgradedRelationship,
};
