import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
	resolveRegisteredCheckout,
	snapshotCheckoutAccess,
	type CheckoutSnapshot,
} from "@archboard/code-binding/resolution";
import type { ArchitectureModel, ArchitectureModelRead } from "#shared/schemas/model.ts";
import { readArchitectureModel } from "#runtime/operations/read/model-read.ts";
import { readCheckpointModel } from "#runtime/operations/history/read.ts";
import {
	selectReferenceSubject,
	referenceSubjectName,
} from "#runtime/operations/read/reference-subject.ts";

type Resolution = NonNullable<ArchitectureModel["resolvedReferences"]>[number];
type ReferenceEntry = Pick<Resolution, "module" | "index" | "reference">;

/**
 * Read the logical state of this exact architecture.
 * @param model The coherent current or retained model.
 * @returns Its selected state identity, when one exists.
 */
function referenceState(model: ArchitectureModel) {
	return model.migrationPreview === undefined
		? model.selectedState?.id
		: (model.migrationPreview.selected?.legacy ?? "current");
}

/**
 * Preserve the explicit model and state contract.
 * @param reference The authored reference.
 * @param model The coherent addressed architecture.
 * @returns Whether its model and state match.
 */
function matchesReference(reference: ReferenceEntry["reference"], model: ArchitectureModel) {
	if (reference.model !== model.manifest.id) return false;
	const state = referenceState(model);
	if (state === undefined) return false;
	return reference.state === "current" || reference.state === state;
}

/**
 * Report one unavailable target without losing its authored reference.
 * @param entry The source module and reference.
 * @param message The observed failure.
 * @param recovery The explicit recovery action.
 * @returns The unavailable navigation entry.
 */
function unavailableReference(
	entry: ReferenceEntry,
	message: string,
	recovery: string,
): Resolution {
	return {
		...entry,
		status: "unavailable",
		diagnostics: [
			{
				code: "REFERENCE_UNAVAILABLE",
				file: "model.json",
				subjects: [entry.module, entry.reference.subject],
				message,
				recovery,
			},
		],
	};
}

/**
 * Read a foreign target through existing checkout and architecture authorities.
 * @param snapshot The source vault's existing checkout snapshot.
 * @param reference The explicit target identity and state.
 * @param checkpoint The optional exact retained revision.
 * @returns The chosen target vault and its reading, or checkout diagnostics.
 */
async function foreignReading(
	snapshot: CheckoutSnapshot,
	reference: ReferenceEntry["reference"],
	checkpoint: string | undefined,
) {
	const checkout = resolveRegisteredCheckout(reference.repo, snapshot);
	if (!checkout.ok)
		return {
			diagnostics: [
				{
					code: checkout.code,
					file: "model.json",
					message: checkout.error,
					recovery:
						"Restore or choose the referenced repository checkout with archboard repo use <directory>.",
				},
			],
		};
	const targetVault = join(checkout.root, ".archboard/vault");
	const reading =
		checkpoint === undefined
			? await readArchitectureModel(targetVault, undefined, undefined, {
					state: reference.state,
					compare: false,
				})
			: await readCheckpointModel(targetVault, checkpoint, undefined, undefined, {
					compare: false,
				});
	return { vault: targetVault, reading: selectReferenceSubject(reading, reference.subject) };
}

/**
 * Build an available reference only for the requested model and state.
 * @param entry The authored reference and its owner.
 * @param vault The resolved foreign vault.
 * @param reading The complete foreign reading.
 * @param checkpoint The optional exact checkpoint.
 * @returns An available address or actionable diagnostics.
 */
function resolvedReference(
	entry: ReferenceEntry,
	vault: string,
	reading: ArchitectureModelRead,
	checkpoint: string | undefined,
): Resolution {
	if (!reading.success)
		return { ...entry, status: "unavailable", diagnostics: reading.diagnostics };
	if (!matchesReference(entry.reference, reading))
		return unavailableReference(
			entry,
			"The referenced model or state does not match the addressed architecture.",
			"Restore the explicit model and state or author an exact checkpoint reference. No current substitute is used.",
		);
	return {
		...entry,
		status: "available",
		name: referenceSubjectName(reading, entry.reference.subject),
		modelName: reading.manifest.name,
		stateName: reading.selectedState?.name,
		lifecycle: reading.selectedState?.lifecycle,
		diagnostics: [],
		address: referenceAddress(entry, vault, reading, checkpoint),
	};
}

/**
 * Keep exact preview coverage in a resolved reference address.
 * @param entry The authored target reference.
 * @param vault Its resolved vault.
 * @param reading The addressed coherent model.
 * @param checkpoint Its exact retained checkpoint, when selected.
 * @returns The complete navigation address.
 */
function referenceAddress(
	entry: ReferenceEntry,
	vault: string,
	reading: ArchitectureModel,
	checkpoint?: string,
): NonNullable<Resolution["address"]> {
	return {
		vault,
		preview: reading.migrationPreview?.origin,
		model: entry.reference.model,
		subject: entry.reference.subject,
		state: referenceState(reading)!,
		...(checkpoint === undefined ? {} : { checkpoint }),
	};
}
/**
 * Require retained pins rather than selecting foreign current architecture for history.
 * @param model The source reading.
 * @param entry The authored source reference.
 * @returns An exact revision, a current selector, or explicit unavailable history.
 */
function referencePin(model: ArchitectureModel, entry: ReferenceEntry): string | null | undefined {
	if (model.migrationPreview?.selected !== undefined) return entry.reference.checkpoint ?? null;
	if (model.checkpoint === undefined) return entry.reference.checkpoint;
	return checkpointReferencePin(model.checkpoint, entry);
}

/**
 * Resolve one retained foreign pin without falling back to current architecture.
 * @param checkpoint The exact source checkpoint.
 * @param entry The original authored reference.
 * @returns An exact target checkpoint or explicit unavailable history.
 */
function checkpointReferencePin(
	checkpoint: NonNullable<ArchitectureModel["checkpoint"]>,
	entry: ReferenceEntry,
) {
	const pin = checkpoint.references?.find(
		(candidate) =>
			candidate.module === entry.module &&
			candidate.index === entry.index &&
			isDeepStrictEqual(candidate.reference, entry.reference),
	);
	if (pin !== undefined) return pin.checkpoint;
	return entry.reference.checkpoint ?? null;
}
/**
 * Resolve one direct reference without recursively expanding foreign ownership.
 * @param vault The explicitly addressed source vault.
 * @param snapshot The source vault's existing checkout snapshot.
 * @param model The coherent current or retained source.
 * @param entry The authored reference and its owner.
 * @returns The replaceable navigation entry.
 */
async function resolveReference(
	vault: string,
	snapshot: CheckoutSnapshot,
	model: ArchitectureModel,
	entry: ReferenceEntry,
): Promise<Resolution> {
	const local = await localPreviewReference(vault, snapshot, model, entry);
	if (local !== undefined) return local;
	const checkpoint = referencePin(model, entry);
	if (checkpoint === null)
		return unavailableReference(
			entry,
			"This retained reading has no exact foreign revision pin.",
			"Restore the original retained pin. Historical navigation never substitutes current architecture.",
		);
	const target = await foreignReading(snapshot, entry.reference, checkpoint);
	if (target.reading === undefined)
		return { ...entry, status: "unavailable", diagnostics: target.diagnostics };
	return resolvedReference(entry, target.vault, target.reading, checkpoint);
}

/**
 * Gather authored references without adding another identity or index authority.
 * @param model The complete source reading.
 * @returns Direct authored references in module and authored array order.
 */
function modelReferences(model: ArchitectureModel): ReferenceEntry[] {
	return model.modules.flatMap((module) =>
		(module.references ?? []).map((reference, index) => ({ module: module.id, index, reference })),
	);
}

/**
 * Report direct references without changing either model.
 * @param vault The source vault.
 * @param model The complete source reading.
 * @returns The authored model with replaceable navigation details.
 */
async function resolveModelReferences(
	vault: string,
	model: ArchitectureModel,
): Promise<ArchitectureModel> {
	const entries = modelReferences(model);
	if (entries.length === 0) return model;
	const snapshot = await snapshotCheckoutAccess({
		vault,
		bindings: entries.map((entry) => ({ repo: entry.reference.repo, path: "" })),
	});
	const resolvedReferences = await Promise.all(
		entries.map((entry) => resolveReference(vault, snapshot, model, entry)),
	);
	return { ...model, resolvedReferences };
}

export { resolveModelReferences, referenceState, matchesReference };

/**
 * Read an explicit same-vault migration target without passing through live legacy authority.
 * @param vault The source vault.
 * @param snapshot The existing repository lookup evidence.
 * @param model The captured preview and original source fingerprint.
 * @param entry The explicit reference choice.
 * @returns Its exact preview target, or absence for ordinary foreign resolution.
 */
async function localPreviewReference(
	vault: string,
	snapshot: CheckoutSnapshot,
	model: ArchitectureModel,
	entry: ReferenceEntry,
): Promise<Resolution | undefined> {
	const preview = originalReferenceProvenance(model, entry);
	if (preview === undefined || !sameReferenceVault(vault, snapshot, entry)) return undefined;
	if (unresolvedOriginalCurrent(model, entry))
		return unavailableReference(
			entry,
			"This original historical reference does not identify an exact target state.",
			"Save an explicit qualified original state target. Historical navigation never follows current content.",
		);
	const checkpoint = localPreviewCheckpoint(model, entry);
	const reading = await readArchitectureModel(vault, undefined, undefined, {
		preview: preview.origin,
		state: originalReferenceState(entry),
		checkpoint,
	});
	if (changedPreviewSource(model, reading, entry))
		return unavailableReference(
			entry,
			"The original source or identity choices differ from the captured reference.",
			"Reopen the source reading and follow its reference again.",
		);
	return resolvedReference(
		entry,
		vault,
		selectReferenceSubject(reading, entry.reference.subject),
		checkpoint,
	);
}
/**
 * Compare resolved repository ownership rather than model names.
 * @param vault The explicitly addressed source vault.
 * @param snapshot The repository lookup evidence.
 * @param entry The authored reference.
 * @returns Whether the target is this exact vault.
 */
function sameReferenceVault(vault: string, snapshot: CheckoutSnapshot, entry: ReferenceEntry) {
	const checkout = resolveRegisteredCheckout(entry.reference.repo, snapshot);
	return checkout.ok && resolve(join(checkout.root, ".archboard/vault")) === resolve(vault);
}
/**
 * Use an explicit target checkpoint before the captured migration checkpoint.
 * @param model The captured source reading.
 * @param entry The authored target.
 * @returns Its exact retained pin, when present.
 */
function localPreviewCheckpoint(model: ArchitectureModel, entry: ReferenceEntry) {
	return (
		entry.reference.checkpoint ??
		(model.migrationPreview === undefined ? model.migration?.checkpoint : model.checkpoint?.id)
	);
}
/**
 * Translate only the explicit current designation into the composed preview selector.
 * @param entry The authored target.
 * @returns Its original state selector or composed current selection.
 */
function originalReferenceState(entry: ReferenceEntry) {
	return entry.reference.state === "current" ? undefined : entry.reference.state;
}
/**
 * Refuse navigation across different original source or choice fingerprints.
 * @param source The captured reference source.
 * @param target The separately resolved target.
 * @param entry The authored exact checkpoint or captured source selector.
 * @returns Whether a coherent target comes from different originals.
 */
function changedPreviewSource(
	source: ArchitectureModel,
	target: ArchitectureModelRead,
	entry: ReferenceEntry,
) {
	if (entry.reference.checkpoint !== undefined) return false;
	if (!target.success) return false;
	const provenance = source.migrationPreview ?? source.migration;
	return (
		target.migrationPreview?.source.digest !== provenance!.source.digest ||
		target.migrationPreview.planRevision !== provenance!.planRevision
	);
}

/**
 * Resolve installed original references without retargeting ordinary canonical references.
 * @param model The source reading.
 * @param entry The explicit authored target.
 * @returns Its original source provenance, when needed.
 */
function originalReferenceProvenance(model: ArchitectureModel, entry: ReferenceEntry) {
	if (model.migrationPreview !== undefined) return model.migrationPreview;
	return entry.reference.state.includes("#") ? model.migration : undefined;
}

/**
 * Keep historical reference intent separate from a moving current designation.
 * @param model The original reading.
 * @param entry Its explicit reference.
 * @returns Whether an exact original target is missing.
 */
function unresolvedOriginalCurrent(model: ArchitectureModel, entry: ReferenceEntry): boolean {
	return model.migrationPreview?.selected !== undefined && entry.reference.state === "current";
}
