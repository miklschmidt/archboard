import type { ArchitectureModel } from "#shared/canonical-contracts/schemas/model.ts";
import { failure, readCurrentModel } from "#runtime/canonical/read/operations/model-read.ts";
import { materializeProposal } from "#runtime/canonical/proposals/operations/read.ts";
import {
	ArchiveError,
	archiveContext,
	type ArchiveContext,
} from "#runtime/canonical/archive/store/model-archive.ts";
import { modelBoundaryFailure } from "#runtime/canonical/installation/store/model-state.ts";
import { RETIRED_KIND, inventoryKey, type Held } from "#shared/upgrade/rules/upgrade.ts";
import type {
	InventoryRelationship,
	UpgradeInventory,
	UpgradeInventoryRead,
} from "#shared/upgrade/schemas/upgrade.ts";

type Draft = ArchitectureModel["proposals"][number];
/** The states an upgrade carries: the current one, and each draft as it reads today. */
interface UpgradeStates {
	readonly current: ArchitectureModel;
	readonly drafts: ReadonlyMap<string, ArchitectureModel>;
}

/**
 * Why a draft cannot be carried across: it does not read, most often because
 * it is behind its predecessor, and only an upgraded vault can reconcile it.
 * @param draft The draft.
 * @param message What its reading said.
 * @returns The refusal.
 */
function uncarriedDraft(draft: Draft, message: string) {
	return failure("PROPOSAL_BLOCKED", [
		{
			code: "PROPOSAL_BLOCKED",
			file: draft.file,
			subjects: [draft.id],
			message: `The draft ${draft.name} does not read, so the upgrade cannot carry it: ${message}`,
			recovery:
				"Shelve or reconcile the draft with the Archboard release that wrote this vault, or remove its proposal file, and upgrade again.",
		},
	]);
}

/** Why a vault in the current format has nothing to upgrade. */
const UPGRADE_NOT_NEEDED = failure("UPGRADE_NOT_NEEDED", [
	{
		code: "UPGRADE_NOT_NEEDED",
		file: ".",
		message: "This vault is in the current format: its relationships state their effect.",
		recovery: "Read and edit the model as it is.",
	},
]);

/**
 * Read one draft as it reads today, or say why the upgrade cannot carry it.
 * @param context The archive.
 * @param current The current state.
 * @param draft The draft.
 * @returns Its reading, or the refusal.
 */
async function readDraft(context: ArchiveContext, current: ArchitectureModel, draft: Draft) {
	try {
		const reading = await materializeProposal(context, current, draft, new Set());
		return reading.success ? reading : uncarriedDraft(draft, reading.diagnostics[0]!.message);
	} catch (error) {
		if (error instanceof ArchiveError) return uncarriedDraft(draft, error.message);
		throw error;
	}
}

/**
 * Read the current state and every draft of an old vault, which the upgrade
 * carries across together. It takes no lease: the upgrade reads under its own.
 * @param vault The addressed vault.
 * @returns Every state, or why the vault cannot be upgraded.
 */
async function readUpgradeStates(
	vault: string,
): Promise<UpgradeStates | Extract<UpgradeInventoryRead, { success: false }>> {
	const current = readCurrentModel(vault);
	if (!current.success) return current;
	if (current.readOnly === undefined) return UPGRADE_NOT_NEEDED;
	const drafts = new Map<string, ArchitectureModel>();
	const context = current.proposals.length === 0 ? undefined : await archiveContext(vault);
	for (const draft of current.proposals) {
		// oxlint-disable-next-line no-await-in-loop -- each draft reads its own retained baseline
		const reading = await readDraft(context!, current, draft);
		if (!reading.success) return reading;
		drafts.set(draft.id, reading);
	}
	return { current, drafts };
}

/**
 * The reading a draft starts from: its predecessor's, or none for a planning draft.
 * @param states Every state of the vault.
 * @param draft The draft.
 * @returns The predecessor's reading, or undefined.
 */
function predecessorOf(states: UpgradeStates, draft: Draft): ArchitectureModel | undefined {
	if (draft.predecessor === null) return undefined;
	return draft.predecessor === states.current.manifest.current?.id
		? states.current
		: states.drafts.get(draft.predecessor);
}

/**
 * The relationships of a state that the inventory lists under it: all of the
 * current state's, and those a draft adds or gives another kind.
 * @param reading The state's reading.
 * @param predecessor The reading it starts from, if any.
 * @returns Its own relationships.
 */
function ownRelationships(reading: ArchitectureModel, predecessor: ArchitectureModel | undefined) {
	const inherited = new Map(
		(predecessor?.relationships ?? []).map((relationship) => [relationship.id, relationship.kind]),
	);
	return reading.relationships.filter(
		(relationship) => inherited.get(relationship.id) !== relationship.kind,
	);
}

/**
 * The root module a module sits under.
 * @param reading The reading that holds it.
 * @param id The module.
 * @returns The root module.
 */
function rootOf(reading: ArchitectureModel, id: string): ArchitectureModel["modules"][number] {
	const modules = new Map(reading.modules.map((module) => [module.id, module]));
	let module = modules.get(id)!;
	while (module.parent !== undefined) module = modules.get(module.parent)!;
	return module;
}

/**
 * One end of a relationship as the inventory shows it: the module and its binding.
 * @param reading The reading that holds the module.
 * @param id The module.
 * @returns The end.
 */
function endOf(reading: ArchitectureModel, id: string) {
	const { name, binding } = reading.modules.find((module) => module.id === id)!;
	return { id, name, ...(binding === undefined ? {} : { binding }) };
}

/**
 * One inventory entry, with nothing filled in but the old kind where it still exists.
 * @param reading The reading that holds the relationship.
 * @param relationship The relationship.
 * @param proposal The draft it belongs to, if any.
 * @returns The entry.
 */
function entryOf(
	reading: ArchitectureModel,
	relationship: ArchitectureModel["relationships"][number],
	proposal: string | undefined,
): InventoryRelationship {
	const { id, from, to, kind, label, description, anchor } = relationship;
	return {
		id,
		...(proposal === undefined ? {} : { proposal }),
		from: endOf(reading, from),
		to: endOf(reading, to),
		...(label === undefined ? {} : { label }),
		...(description === undefined ? {} : { description }),
		...(anchor === undefined ? {} : { anchor }),
		oldKind: kind,
		kind: kind === RETIRED_KIND ? null : kind,
		effect: null,
		gap: null,
	};
}

/**
 * Every relationship the upgrade classifies, keyed as the inventory lists it,
 * with the reading it is read from.
 * @param states Every state of the vault.
 * @returns The relationships, in reading order: the current state, then each draft.
 */
function upgradeRelationships(states: UpgradeStates) {
	const proposals = states.current.proposals;
	return [
		...states.current.relationships.map((relationship) => ({
			reading: states.current,
			relationship,
			proposal: undefined,
			file: states.current.modules.find((module) => module.id === relationship.from)!.file,
		})),
		...proposals.flatMap((draft) => {
			const reading = states.drafts.get(draft.id)!;
			return ownRelationships(reading, predecessorOf(states, draft)).map((relationship) => ({
				reading,
				relationship,
				proposal: draft.id,
				file: draft.file,
			}));
		}),
	];
}

/**
 * The inventory of an old vault: every relationship of the current state and
 * each one a draft adds or gives another kind, grouped by the root module of
 * its source, for agents to classify from the code. Nothing changes.
 * @param vault The addressed vault.
 * @returns One inventory for each root module, or why the vault has none.
 */
async function readUpgradeInventory(vault: string): Promise<UpgradeInventoryRead> {
	const blocked = modelBoundaryFailure(vault);
	if (blocked !== undefined) return blocked;
	const states = await readUpgradeStates(vault);
	if (!("current" in states)) return states;
	const inventories = new Map<string, UpgradeInventory>();
	for (const { reading, relationship, proposal } of upgradeRelationships(states)) {
		const root = rootOf(reading, relationship.from);
		const inventory = inventories.get(root.id) ?? {
			format: "archboard-upgrade-inventory" as const,
			schemaVersion: 1 as const,
			revision: states.current.revision.digest,
			root: { id: root.id, name: root.name },
			relationships: [],
		};
		inventory.relationships.push(entryOf(reading, relationship, proposal));
		inventories.set(root.id, inventory);
	}
	return { success: true, inventories: [...inventories.values()] };
}

/**
 * Every relationship the upgrade classifies, by inventory key, with the vault
 * file that holds it: its source module's, or its draft's.
 * @param states Every state of the vault.
 * @returns The relationships the vault holds.
 */
function heldRelationships(states: UpgradeStates): Map<string, Held> {
	return new Map(
		upgradeRelationships(states).map(({ relationship: { id }, proposal, file }) => {
			const listed = { id, ...(proposal === undefined ? {} : { proposal }) };
			return [inventoryKey(listed), { ...listed, file }];
		}),
	);
}

export {
	readUpgradeInventory,
	readUpgradeStates,
	predecessorOf,
	heldRelationships,
	type UpgradeStates,
};
