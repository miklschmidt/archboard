import type { ArchitectureModel, ArchitectureCheckpointRequest } from "#shared/schemas/model.ts";
import { resolve } from "node:path";
import {
	readCheckpointModel,
	listArchitectureCheckpoints,
} from "#runtime/operations/history/read.ts";
import {
	resolveModelReferences,
	readReferenceState,
	referenceState,
	matchesReference,
} from "#runtime/operations/read/model-references.ts";
import { ArchiveError, archiveContext } from "#runtime/store/model-archive.ts";
import { selectReferenceSubject } from "#runtime/operations/read/reference-subject.ts";

type Address = NonNullable<ArchitectureModel["location"]>;
type Resolution = NonNullable<ArchitectureModel["resolvedReferences"]>[number];
type Intent = Pick<ArchitectureCheckpointRequest, "operationId" | "writer" | "doing">;

/**
 * Prepare a missing local current snapshot without updating archive refs or live files.
 * @param vault The operation vault.
 * @param address The resolved target.
 * @param current The coherent selected target.
 * @param intent The enclosing writer intent.
 * @returns Its signed snapshot, or absence for targets that require prior retention.
 */
async function localCurrentCheckpoint(
	vault: string,
	address: Address,
	current: ArchitectureModel,
	intent: Intent,
) {
	if (resolve(vault) !== resolve(address.vault) || current.selectedState?.lifecycle !== "current")
		return undefined;
	const { prepareCheckpoint } = await import("#runtime/operations/history/retain.ts");
	return prepareCheckpoint(await archiveContext(vault), vault, current, {
		writer: intent.writer,
		doing: intent.doing,
		operationId: `${intent.operationId}:reference:${address.state}`,
		target: "current",
		expectedRevision: current.revision.digest,
		dependencies: [],
	});
}

/**
 * Find an exact retained target before preparing a missing local current snapshot.
 * @param vault The operation vault.
 * @param address The resolved target state.
 * @param intent The enclosing writer intent.
 * @returns A deterministic exact checkpoint, when available.
 */
async function retainedReference(vault: string, address: Address, intent: Intent) {
	const current = await readReferenceState(vault, address.vault, address.state);
	if (!current.success) return undefined;
	if (referenceState(current) !== address.state) return undefined;
	const retained = await listArchitectureCheckpoints(address.vault);
	if (!retained.success) return undefined;
	const checkpoint = retained.checkpoints
		.filter(
			(candidate) =>
				candidate.model === address.model &&
				candidate.state?.id === address.state &&
				candidate.revision.digest === current.revision.digest,
		)
		.map((candidate) => candidate.id)
		.toSorted()[0];
	return checkpoint ?? localCurrentCheckpoint(vault, address, current, intent);
}

/**
 * Prove an exact target before preparing the enclosing local installation.
 * @param entry The resolved authored reference.
 * @param retained The operation-local snapshot lookup.
 * @returns The exact target pin.
 */
async function captureReferencePin(
	entry: Resolution,
	retained: (address: Address) => Promise<string | undefined>,
) {
	const { address } = entry;
	if (address === undefined)
		throw new ArchiveError(
			"REFERENCE_UNAVAILABLE",
			entry.diagnostics.map((diagnostic) => diagnostic.message).join(" "),
			"model.json",
			[entry.module, entry.reference.subject],
		);
	const checkpoint = address.checkpoint ?? (await retained(address));
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
 * Capture exact targets while the writer owns local installation.
 * @param vault The source vault.
 * @param model The complete candidate that the local checkpoint will retain.
 * @param intent The enclosing writer identity.
 * @returns Exact pins and local dependencies, or a preparation refusal.
 */
async function captureReferencePins(vault: string, model: ArchitectureModel, intent: Intent) {
	const resolved = await resolveModelReferences(vault, model);
	const retained = new Map<string, Promise<string | undefined>>();
	/**
	 * Share one exact snapshot across references to the same observed state.
	 * @param address The resolved target.
	 * @returns The existing or prepared exact checkpoint.
	 */
	const retain = (address: Address) => {
		const key = JSON.stringify([address.vault, address.model, address.state]);
		if (!retained.has(key)) retained.set(key, retainedReference(vault, address, intent));
		return retained.get(key)!;
	};
	const captures = await Promise.all(
		(resolved.resolvedReferences ?? [])
			.filter((entry) => !containedReference(vault, model, entry))
			.map(async (entry) => ({
				pin: await captureReferencePin(entry, retain),
				vault: entry.address?.vault,
			})),
	);
	const pins = captures.map((capture) => capture.pin);
	const dependencies = captures.flatMap((capture) =>
		capture.vault !== undefined && resolve(capture.vault) === resolve(vault)
			? [capture.pin.checkpoint]
			: [],
	);
	return {
		...(pins.length === 0 ? {} : { references: pins }),
		referenceDependencies: [...new Set(dependencies)],
	};
}

/**
 * Keep local same-state references in their containing snapshot without circular Git pins.
 * @param vault The source vault.
 * @param model The complete candidate snapshot.
 * @param entry The resolved reference, including subject and ownership evidence.
 * @returns Whether the containing checkpoint retains the complete target.
 */
function containedReference(vault: string, model: ArchitectureModel, entry: Resolution) {
	const { address } = entry;
	if (address === undefined) return false;
	return (
		resolve(address.vault) === resolve(vault) &&
		address.checkpoint === undefined &&
		address.state === referenceState(model)
	);
}

export { captureReferencePins };
