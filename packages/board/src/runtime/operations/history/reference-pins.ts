import type { ArchitectureModel } from "#shared/schemas/model.ts";
import { readArchitectureModel } from "#runtime/operations/read/model-read.ts";
import {
	readCheckpointModel,
	listArchitectureCheckpoints,
} from "#runtime/operations/history/read.ts";
import {
	resolveModelReferences,
	referenceState,
	matchesReference,
} from "#runtime/operations/read/model-references.ts";
import { ArchiveError } from "#runtime/store/model-archive.ts";
import { selectReferenceSubject } from "#runtime/operations/read/reference-subject.ts";

type Address = NonNullable<ArchitectureModel["location"]>;
type Resolution = NonNullable<ArchitectureModel["resolvedReferences"]>[number];

/**
 * Find an existing exact checkpoint for the observed foreign state.
 * @param address The explicit foreign model, subject and state.
 * @returns A deterministic retained identity, when exact content exists.
 */
async function retainedReference(address: Address) {
	const current = await readArchitectureModel(address.vault, undefined, undefined, {
		state: address.state,
		compare: false,
	});
	if (!current.success) return undefined;
	if (referenceState(current) !== address.state) return undefined;
	const retained = await listArchitectureCheckpoints(address.vault);
	if (!retained.success) return undefined;
	return retained.checkpoints
		.filter(
			(candidate) =>
				candidate.model === address.model &&
				candidate.state?.id === address.state &&
				candidate.revision.digest === current.revision.digest,
		)
		.map((candidate) => candidate.id)
		.toSorted()[0];
}

/**
 * Prove one foreign revision before preparing any local installation.
 * @param entry The resolved authored reference.
 * @returns A portable pin to existing foreign architecture.
 */
async function captureReferencePin(entry: Resolution) {
	const { address } = entry;
	if (address === undefined)
		throw new ArchiveError(
			"REFERENCE_UNAVAILABLE",
			entry.diagnostics.map((diagnostic) => diagnostic.message).join(" "),
			"model.json",
			[entry.module, entry.reference.subject],
		);
	const checkpoint = address.checkpoint ?? (await retainedReference(address));
	if (checkpoint === undefined)
		throw new ArchiveError(
			"REFERENCE_UNAVAILABLE",
			"The referenced foreign reading has no retained exact checkpoint. Retain that model first, then retry this local operation.",
			"model.json",
			[entry.module, entry.reference.subject],
		);
	const exact = selectReferenceSubject(
		await readCheckpointModel(address.vault, checkpoint),
		address.subject,
	);
	if (!exact.success)
		throw new ArchiveError("REFERENCE_UNAVAILABLE", exact.error, checkpoint, [
			entry.reference.subject,
		]);
	if (!matchesReference(entry.reference, exact))
		throw new ArchiveError(
			"REFERENCE_UNAVAILABLE",
			"The exact foreign checkpoint names another model or state.",
			checkpoint,
			[entry.reference.subject],
		);
	return { module: entry.module, index: entry.index, reference: entry.reference, checkpoint };
}

/**
 * Pin existing foreign checkpoints without writing their vaults or archives.
 * @param vault The source vault.
 * @param model The complete candidate that the local checkpoint will retain.
 * @returns The exact foreign revision pins, or a preparation refusal.
 */
async function captureReferencePins(vault: string, model: ArchitectureModel) {
	const resolved = await resolveModelReferences(vault, model);
	const pins = await Promise.all((resolved.resolvedReferences ?? []).map(captureReferencePin));
	return pins.length === 0 ? {} : { references: pins };
}

export { captureReferencePins };
