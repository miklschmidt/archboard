import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { ArchitectureModel } from "#shared/canonical-contracts/schemas/model.ts";
import { MODULE_FORMAT, StateMetadataSchema } from "#shared/schemas/model-definitions.ts";
import { ProposalSchema } from "#shared/schemas/model-proposals.ts";
import {
	ArchitectureUpgradeRequestSchema,
	type ArchitectureUpgradeRequest,
	type ArchitectureUpgradeResult,
	type InventoryRelationship,
	type UpgradeInstallationSchema,
} from "#shared/upgrade/schemas/upgrade.ts";
import {
	inventoryDiagnostics,
	inventoryDigest,
	inventoryKey,
	upgradedConfiguration,
	upgradedRelationship,
	classification,
} from "#shared/upgrade/rules/upgrade.ts";
import { configurationFile, parseVaultPolicy } from "#runtime/store/configuration.ts";
import { readModelFiles, modelRevision } from "#runtime/store/model-files.ts";
import { decodeModel, failure } from "#runtime/canonical/read/operations/model-read.ts";
import {
	materializedInputs,
	proposalBaseline,
	requireModel,
} from "#runtime/canonical/proposals/operations/read.ts";
import {
	retainBaseline,
	updateChanges,
} from "#runtime/canonical/proposals/operations/candidate.ts";
import { predecessorRevision } from "#runtime/canonical/proposals/operations/predecessor-revision.ts";
import { changedFiles } from "#runtime/canonical/edit/operations/candidate.ts";
import { resumeEdit } from "#runtime/canonical/edit/operations/edit.ts";
import { walkthroughDependencies } from "#runtime/canonical/history/retained-reading/operations/walkthrough-targets.ts";
import {
	editResult,
	historyResult,
} from "#runtime/canonical/history/retained-reading/operations/result.ts";
import {
	ArchiveError,
	CheckpointRecordSchema,
	archiveCommit,
	archiveContext,
	archiveTip,
	assertArchiveWritable,
	captureSource,
	readRecord,
	tree,
	type ArchiveContext,
} from "#runtime/canonical/archive/store/model-archive.ts";
import {
	checkoutContext,
	modelWriteFailure,
	operationRef,
	withModelLock,
	writeState,
	type ModelJournal,
} from "#runtime/canonical/installation/store/model-state.ts";
import { activeJournal } from "#runtime/canonical/installation/store/model-install.ts";
import { notifyArchitecture } from "#runtime/canonical/installation/news/store/model-news.ts";
import {
	heldRelationships,
	predecessorOf,
	readUpgradeStates,
	type UpgradeStates,
} from "#runtime/upgrade/operations/inventory.ts";

type Installation = z.infer<typeof UpgradeInstallationSchema>;
/** An upgrade request with its operation identity, which its inventories' digest names. */
type UpgradeIntent = ArchitectureUpgradeRequest & { readonly operationId: string };
type Failure = Extract<ArchitectureUpgradeResult, { success: false }>;
type Draft = ArchitectureModel["proposals"][number];
/** How a relationship of one state is classified: its filled entry, found by id. */
type Classify = (id: string) => Pick<InventoryRelationship, "kind" | "effect">;

/**
 * Refuse another intent under the operation identity of these inventories.
 * @param recorded The installation the journal or checkpoint holds.
 * @param digest The digest of the inventories.
 */
function requireSameUpgrade(recorded: ModelJournal["request"] | undefined, digest: string): void {
	if (
		recorded === undefined ||
		!("type" in recorded) ||
		recorded.type !== "upgrade" ||
		recorded.inventoryDigest !== digest
	)
		throw new ArchiveError(
			"OPERATION_REUSED",
			"This operation identity names another intent. Retry its original request or use a new identity.",
		);
}

/**
 * The policy of the upgraded vault, or the refusal of its configuration.
 * @param current The old vault's reading.
 * @returns The policy in effect after the upgrade, or why there is none.
 */
function upgradedPolicy(current: ArchitectureModel): ArchitectureModel["policy"] | Failure {
	const parsed = parseVaultPolicy(upgradedConfiguration(current.policy));
	if (parsed.success && parsed.format === "current") return parsed.policy;
	return failure(
		"MODEL_INVALID",
		(parsed.success ? [] : parsed.error.issues).map((issue) => ({
			code: "INVALID_POLICY",
			file: ".archboard/config.yaml",
			path: issue.path.map(String).join("."),
			message: issue.message,
			recovery:
				"Repair the configuration of the old vault so that it reads in the current format, then install the inventory again.",
		})),
	);
}

/**
 * A reading in the current format: its policy, and each relationship classified.
 * @param reading The reading in the old format.
 * @param policy The upgraded policy.
 * @param classify How each of its relationships is classified.
 * @returns The coherent upgraded reading.
 */
function upgradedReading(
	reading: ArchitectureModel,
	policy: ArchitectureModel["policy"],
	classify: Classify,
): ArchitectureModel {
	const modules = reading.modules.map((module) => ({
		...module,
		schemaVersion: MODULE_FORMAT,
		outgoing: module.outgoing.map((relationship) => ({
			...relationship,
			...classification(classify(relationship.id)),
		})),
	}));
	const inputs = materializedInputs({ ...reading, modules }, configurationFile(policy));
	return requireModel(
		decodeModel(
			{ inputs, revision: modelRevision(inputs), diagnostics: [] },
			reading.selectedState,
		),
	);
}

/** A module file as written, read only as far as the upgrade changes it. */
const RawModuleSchema = z.looseObject({ outgoing: z.array(z.looseObject({ id: z.string() })) });

/**
 * The module files of the vault in the current format. Each file keeps its
 * fields and their order; only the format, the kinds and the effects change.
 * @param inputs The vault's files, changed in place.
 * @param current The old vault's reading.
 * @param classify How each current relationship is classified.
 */
function upgradeModuleFiles(
	inputs: Map<string, Buffer>,
	current: ArchitectureModel,
	classify: Classify,
): void {
	for (const { file } of current.modules) {
		const module = RawModuleSchema.parse(JSON.parse(inputs.get(file)!.toString("utf8")));
		const upgraded = {
			...module,
			schemaVersion: MODULE_FORMAT,
			outgoing: module.outgoing.map((relationship) =>
				upgradedRelationship(relationship, classify(relationship.id)),
			),
		};
		inputs.set(file, Buffer.from(`${JSON.stringify(upgraded, null, 2)}\n`));
	}
}

/**
 * The drafts in an order where each comes after its predecessor.
 * @param states Every state of the vault.
 * @returns The drafts, predecessors first.
 */
function draftsInOrder(states: UpgradeStates): Draft[] {
	const ordered: Draft[] = [];
	const placed = new Set<string | null>([null, states.current.manifest.current?.id ?? null]);
	let pending = states.current.proposals;
	while (pending.length > 0) {
		const ready = pending.filter((draft) => placed.has(draft.predecessor));
		if (ready.length === 0)
			throw new ArchiveError("MODEL_INVALID", "Proposal ancestry names a missing predecessor.");
		for (const draft of ready) placed.add(draft.id);
		ordered.push(...ready);
		pending = pending.filter((draft) => !placed.has(draft.id));
	}
	return ordered;
}

/**
 * How a draft's relationships are classified: its own entries first, then
 * those of the state it starts from.
 * @param classified Every filled entry, by inventory key.
 * @param draft The draft.
 * @param inherited How the state it starts from is classified.
 * @returns The draft's classifier.
 */
function draftClassifier(
	classified: ReadonlyMap<string, InventoryRelationship>,
	draft: Draft,
	inherited: Classify,
): Classify {
	return (id) => classified.get(inventoryKey({ id, proposal: draft.id })) ?? inherited(id);
}

/** What carrying the drafts across needs, besides the vault. */
interface Carry {
	readonly context: ArchiveContext;
	readonly states: UpgradeStates;
	readonly upgraded: ArchitectureModel;
	readonly classified: ReadonlyMap<string, InventoryRelationship>;
	readonly intent: Parameters<typeof retainBaseline>[1];
}

/**
 * The upgraded state a draft starts from: the upgraded current state, an
 * upgraded draft before it, or its own baseline upgraded for a planning draft.
 * @param carry The upgrade so far.
 * @param settled The drafts already upgraded.
 * @param draft The draft.
 * @param classify How the draft is classified.
 * @returns The upgraded predecessor.
 */
async function upgradedPredecessor(
	carry: Carry,
	settled: ReadonlyMap<string, ArchitectureModel>,
	draft: Draft,
	classify: Classify,
): Promise<ArchitectureModel> {
	const old = predecessorOf(carry.states, draft);
	if (old === carry.states.current) return carry.upgraded;
	if (old !== undefined) return settled.get(draft.predecessor!)!;
	const baseline = requireModel(await proposalBaseline(carry.context, carry.states.current, draft));
	return upgradedReading(baseline, carry.upgraded.policy, classify);
}

/**
 * Carry each draft across: retain its upgraded predecessor as its new
 * baseline, and state its changes against it, so it reads in the current
 * format and is not behind its predecessor.
 * @param vault The addressed vault.
 * @param carry The upgrade so far.
 * @returns The files of the re-based drafts, and their new baselines.
 */
async function rebaseDrafts(vault: string, carry: Carry) {
	const { states, classified } = carry;
	const settled = new Map<string, ArchitectureModel>();
	const classifiers = new Map<string | null, Classify>([
		[states.current.manifest.current?.id ?? null, (id) => classified.get(id)!],
	]);
	const files = new Map<string, Buffer>();
	const baselines: string[] = [];
	for (const draft of draftsInOrder(states)) {
		const inherited = classifiers.get(draft.predecessor) ?? classifiers.get(null)!;
		const classify = draftClassifier(classified, draft, inherited);
		classifiers.set(draft.id, classify);
		// oxlint-disable-next-line no-await-in-loop -- each draft starts from the one upgraded before it
		const predecessor = await upgradedPredecessor(carry, settled, draft, classify);
		const reading = upgradedReading(states.drafts.get(draft.id)!, carry.upgraded.policy, classify);
		const { file, ...proposal } = draft;
		// oxlint-disable-next-line no-await-in-loop -- each baseline is retained before its successors
		proposal.baseline = await retainBaseline(vault, carry.intent, predecessor, proposal);
		proposal.predecessorRevision = predecessorRevision(predecessor);
		updateChanges(proposal, predecessor, reading);
		settled.set(draft.id, reading);
		baselines.push(proposal.baseline);
		files.set(file, Buffer.from(`${JSON.stringify(ProposalSchema.parse(proposal), null, 2)}\n`));
	}
	return { files, baselines };
}

/**
 * The policy and the classification of every relationship, from inventories
 * that cover the vault completely, or why they cannot be installed.
 * @param states Every state of the vault.
 * @param request The filled inventories.
 * @returns The upgraded policy and every entry by inventory key, or the refusal.
 */
function classifiedInventory(states: UpgradeStates, request: UpgradeIntent) {
	const { current } = states;
	const stale = request.inventories.find(({ revision }) => revision !== current.revision.digest);
	if (stale !== undefined)
		throw new ArchiveError(
			"STALE_REVISION",
			`The inventory of ${stale.root.name} was read from another revision of the vault. Write the inventory again and carry its classifications over.`,
		);
	const policy = upgradedPolicy(current);
	if ("success" in policy) return policy;
	const entries = request.inventories.flatMap((inventory) => inventory.relationships);
	const diagnostics = inventoryDiagnostics(
		entries,
		heldRelationships(states),
		new Set(Object.keys(policy.relationshipKinds)),
	);
	if (diagnostics.length > 0)
		return {
			...failure("INVENTORY_INCOMPLETE", diagnostics),
			error: `The inventory leaves ${diagnostics.length} relationships unclassified. Nothing changed.`,
		};
	return { policy, classified: new Map(entries.map((entry) => [inventoryKey(entry), entry])) };
}

/**
 * The vault's files in the current format: its configuration, its module
 * files and its drafts, carried across.
 * @param vault The addressed vault.
 * @param context Its archive.
 * @param states Every state of the vault.
 * @param inventory The upgraded policy and every classification.
 * @param intent The upgrade as its checkpoint records it.
 * @returns The files before and after, and the new baselines of the drafts.
 */
async function upgradedInputs(
	vault: string,
	context: ArchiveContext,
	states: UpgradeStates,
	inventory: Exclude<ReturnType<typeof classifiedInventory>, Failure>,
	intent: Installation,
) {
	const before = readModelFiles(vault);
	if (!isDeepStrictEqual(before.revision, states.current.revision))
		throw new ArchiveError("STALE_REVISION", "Inputs changed while the upgrade read them.");
	const inputs = new Map(before.inputs);
	inputs.set(".archboard/config.yaml", configurationFile(inventory.policy));
	upgradeModuleFiles(inputs, states.current, (id) => inventory.classified.get(id)!);
	const upgraded = requireModel(
		decodeModel({ inputs, revision: modelRevision(inputs), diagnostics: [] }),
	);
	const drafts = await rebaseDrafts(vault, { context, states, upgraded, intent, ...inventory });
	for (const [file, bytes] of drafts.files) inputs.set(file, bytes);
	return { before, inputs, baselines: drafts.baselines };
}

/**
 * Sign the upgraded files as one checkpoint, and the journal that installs it.
 * @param vault The addressed vault.
 * @param context Its archive.
 * @param intent The upgrade as its checkpoint records it.
 * @param files The files before and after, and the new baselines of the drafts.
 * @returns The journal ready to install.
 */
async function signUpgrade(
	vault: string,
	context: ArchiveContext,
	intent: Installation,
	files: Awaited<ReturnType<typeof upgradedInputs>>,
): Promise<ModelJournal> {
	const { before, inputs, baselines } = files;
	const revision = modelRevision(inputs);
	const model = requireModel(decodeModel({ inputs, revision, diagnostics: [] }));
	if (model.readOnly !== undefined)
		throw new ArchiveError("MODEL_INVALID", "The upgraded vault still reads in the old format.");
	const tip = await assertArchiveWritable(context);
	const dependencies = [
		...new Set([...(await walkthroughDependencies(context, model)), ...baselines]),
	];
	const record = CheckpointRecordSchema.parse({
		schemaVersion: 1,
		kind: "checkpoint",
		vault: context.vault,
		model: model.manifest.id,
		state: model.manifest.current && StateMetadataSchema.strip().parse(model.manifest.current),
		selection: model.selectedState,
		revision,
		createdAt: new Date().toISOString(),
		request: {
			target: "current",
			operationId: intent.operationId,
			writer: intent.writer,
			doing: intent.doing,
			expectedRevision: before.revision.digest,
			dependencies,
		},
		installation: intent,
		subjects: model.relationships.map((relationship) => relationship.id),
		sources: await captureSource(context, model, vault),
	});
	const retained = new Map([...inputs].map(([path, bytes]) => [`inputs/${path}`, bytes]));
	retained.set("record.json", Buffer.from(JSON.stringify(record)));
	const checkpoint = await archiveCommit(
		context,
		await tree(context, retained),
		[...new Set([...(tip === undefined ? [] : [tip]), ...dependencies])],
		"archboard: upgrade the vault to the current format",
	);
	if (!isDeepStrictEqual(readModelFiles(vault).revision, before.revision))
		throw new ArchiveError("STALE_REVISION", "Inputs changed during signed preparation.");
	return {
		schemaVersion: 1,
		context: await checkoutContext(context),
		request: intent,
		subjects: record.subjects,
		before: before.revision,
		after: revision,
		checkpoint,
		ref: operationRef(vault, intent.operationId, "transactions"),
		phase: "prepared",
		files: changedFiles(before.inputs, inputs),
	};
}

/**
 * Validate the filled inventories, write the vault in the current format and
 * prepare its signed installation.
 * @param vault The addressed vault.
 * @param context Its archive.
 * @param request The filled inventories.
 * @param digest Their digest.
 * @returns The journal ready to install, or why the inventory cannot be installed.
 */
async function prepareUpgrade(
	vault: string,
	context: ArchiveContext,
	request: UpgradeIntent,
	digest: string,
): Promise<ModelJournal | Failure> {
	const states = await readUpgradeStates(vault);
	if (!("current" in states)) return states;
	const inventory = classifiedInventory(states, request);
	if ("success" in inventory) return inventory;
	const { current } = states;
	const intent: Installation = {
		type: "upgrade",
		operationId: request.operationId,
		writer: request.writer,
		doing: request.doing,
		expectedRevision: current.revision,
		inventoryDigest: digest,
		target: { model: current.manifest.id, state: current.manifest.current?.id ?? null },
	};
	const files = await upgradedInputs(vault, context, states, inventory, intent);
	return signUpgrade(vault, context, intent, files);
}

/**
 * Install an upgrade, or finish or return the one this operation identity already started.
 * @param vault The addressed vault.
 * @param request The filled inventories.
 * @param digest Their digest.
 * @param guard The installation lease assertion.
 * @returns The receipt, or why the inventory cannot be installed.
 */
async function applyUpgrade(
	vault: string,
	request: UpgradeIntent,
	digest: string,
	guard: () => void,
) {
	const pending = activeJournal(vault);
	if (pending !== undefined) {
		if (pending.request.operationId !== request.operationId)
			throw new ArchiveError(
				"RECOVERY_REQUIRED",
				"Finish the pending operation before upgrading the vault.",
			);
		requireSameUpgrade(pending.request, digest);
		return resumeEdit(vault, pending, guard);
	}
	const context = await archiveContext(vault);
	const completed = await archiveTip(context, operationRef(vault, request.operationId));
	if (completed !== undefined) {
		const record = await readRecord(context, completed);
		if (record.kind !== "checkpoint")
			throw new ArchiveError("OPERATION_REUSED", "The operation identity names another record.");
		requireSameUpgrade(record.installation, digest);
		return editResult(completed, record);
	}
	const journal = await prepareUpgrade(vault, context, request, digest);
	if ("success" in journal) return journal;
	guard();
	writeState(vault, "transaction.json", journal);
	return resumeEdit(vault, journal, guard);
}

/**
 * Upgrade an old vault to the current format through its filled, reviewed
 * inventory: every relationship states its kind and effect, each id stays, and
 * each draft is carried across. An incomplete inventory is refused, naming
 * each relationship it leaves unclassified, and nothing changes.
 * @param vault The addressed vault.
 * @param input Every filled inventory.
 * @returns The receipt with the recorded gaps, or why the inventory cannot be installed.
 */
async function upgradeArchitectureModel(
	vault: string,
	input: z.input<typeof ArchitectureUpgradeRequestSchema>,
): Promise<ArchitectureUpgradeResult> {
	const parsed = ArchitectureUpgradeRequestSchema.parse(input);
	const digest = inventoryDigest(parsed.inventories);
	const request = { ...parsed, operationId: `upgrade-${digest.slice(0, 16)}` };
	const result = await historyResult("MODEL_WRITE_FAILED", () =>
		withModelLock(vault, (guard) => applyUpgrade(vault, request, digest, guard)),
	);
	if (!result.success) return modelWriteFailure(vault, result, request.operationId);
	notifyArchitecture(vault, result);
	const gaps = request.inventories.flatMap(({ relationships }) =>
		relationships.flatMap(({ id, gap }) => (gap === null ? [] : [{ id, gap }])),
	);
	return { ...result, gaps };
}

export { upgradeArchitectureModel };
