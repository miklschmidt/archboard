import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
	resolveRegisteredCheckout,
	snapshotCheckoutAccess,
} from "@archboard/code-binding/resolution";
import type { ArchitectureModel, ArchitectureModelRead } from "#shared/schemas/model.ts";
import { readArchitectureModel } from "#runtime/operations/read/model-read.ts";
import { readCheckpointModel } from "#runtime/operations/history/read.ts";

type Resolution = NonNullable<ArchitectureModel["resolvedReferences"]>[number];
type ReferenceEntry = Pick<Resolution, "module" | "index" | "reference">;

/**
 * Read the logical state of this exact architecture.
 * @param model The coherent current or retained model.
 * @returns Its selected state identity, when one exists.
 */
function referenceState(model: ArchitectureModel) {
	return model.checkpoint?.state.id ?? model.manifest.current?.id;
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
 * @param vault The source vault, whose own checkout takes precedence.
 * @param reference The explicit target identity and state.
 * @param checkpoint The optional exact retained revision.
 * @returns The chosen target vault and its reading, or checkout diagnostics.
 */
async function foreignReading(
	vault: string,
	reference: ReferenceEntry["reference"],
	checkpoint: string | undefined,
) {
	const snapshot = await snapshotCheckoutAccess({
		vault,
		bindings: [{ repo: reference.repo, path: "" }],
	});
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
			? readArchitectureModel(targetVault, reference.subject)
			: await readCheckpointModel(targetVault, checkpoint, reference.subject);
	return { vault: targetVault, reading };
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
		diagnostics: [],
		address: {
			vault,
			model: entry.reference.model,
			subject: entry.reference.subject,
			state: referenceState(reading)!,
			...(checkpoint === undefined ? {} : { checkpoint }),
		},
	};
}

/**
 * Require retained pins rather than selecting foreign current architecture for history.
 * @param model The source reading.
 * @param entry The authored source reference.
 * @returns An exact revision, a current selector, or explicit unavailable history.
 */
function referencePin(model: ArchitectureModel, entry: ReferenceEntry): string | null | undefined {
	if (model.checkpoint === undefined) return entry.reference.checkpoint;
	const pin = model.checkpoint.references?.find(
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
 * @param vault The source vault.
 * @param model The coherent current or retained source.
 * @param entry The authored reference and its owner.
 * @returns The replaceable navigation entry.
 */
async function resolveReference(
	vault: string,
	model: ArchitectureModel,
	entry: ReferenceEntry,
): Promise<Resolution> {
	const checkpoint = referencePin(model, entry);
	if (checkpoint === null)
		return unavailableReference(
			entry,
			"This retained reading has no exact foreign revision pin.",
			"Restore the original retained pin. Historical navigation never substitutes current architecture.",
		);
	const target = await foreignReading(vault, entry.reference, checkpoint);
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
	const resolvedReferences = await Promise.all(
		modelReferences(model).map((entry) => resolveReference(vault, model, entry)),
	);
	return resolvedReferences.length === 0 ? model : { ...model, resolvedReferences };
}

export { resolveModelReferences, referenceState, matchesReference };
