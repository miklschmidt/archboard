import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import type { Model } from "@archboard/model/content";
import {
	architectureModuleQuery,
	readModel,
} from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";

/** The fields that make a reading one exact reading. */
const READING_FIELDS = [
	"model",
	"state",
	"checkpoint",
	"ref",
	"preview",
	"previewState",
	"digest",
] as const;
type ReadingIdentity = Partial<Record<(typeof READING_FIELDS)[number], string | undefined>>;

/**
 * Navigation details belong to the exact state whose module the inspector shows.
 * @param vault The addressed vault.
 * @param model The inspector's coherent reading.
 * @param module The selected authored module.
 * @returns The ordinary query and a matching source target, when available.
 */
function useModelNavigation(vault: string, model: Model, module: Model["modules"][number]) {
	const subject = module.id;
	const target = navigationTarget(model, subject);
	const { checkpoint, ref, state, preview } = target;
	// The opener opens the files on disk, which a branch reading does not describe.
	const code = module.binding !== undefined && ref === undefined;
	const query = useQuery(
		architectureModuleQuery(
			vault,
			{ module: subject, state, checkpoint, ref, preview, code },
			model.revision.digest,
		),
	);
	const data = query.isError ? undefined : coherentDetails(query.data, model);
	const follow = useCallback(
		(index: number, signal: AbortSignal) =>
			readModel(vault, checkpoint ?? null, signal, {
				ref,
				state,
				preview,
				module: subject,
				reference: index,
				compare: false,
			}),
		[vault, checkpoint, ref, state, preview, subject],
	);
	return {
		query,
		coherent: data !== undefined,
		code: data?.codeTarget,
		references: data?.resolvedReferences ?? [],
		follow,
		target,
	};
}

/**
 * A later or different reading never supplies actions for an older inspector.
 * @param details The separately read navigation details.
 * @param shown The exact state that the person sees.
 * @returns The details when both responses identify one coherent reading.
 */
function coherentDetails<T extends { reading: ReadingIdentity }>(
	details: T | undefined,
	shown: Model,
): T | undefined {
	if (details === undefined) return undefined;
	const identity = readingIdentity(shown);
	const same = READING_FIELDS.every((field) => details.reading[field] === identity[field]);
	return same ? details : undefined;
}

/**
 * Preview navigation preserves the original state beside its retained checkpoint.
 * @param model The coherent inspected model.
 * @param subject The inspected module.
 * @returns The existing opener destination fields.
 */
function navigationTarget(model: Model, subject: string) {
	const checkpoint = model.checkpoint?.id;
	const ref = model.sourceRef?.ref;
	const preview = model.migrationPreview?.origin;
	const state = navigationState(model);
	return { model: model.manifest.id, subject, state, checkpoint, ref, preview };
}

/**
 * Original coverage remains independent of the checkpoint that retains its inputs.
 * @param model The exact source architecture.
 * @returns Its original state or ordinary canonical selector.
 */
function navigationState(model: Model): string | undefined {
	if (model.migrationPreview !== undefined) return model.migrationPreview.selected?.legacy;
	return model.checkpoint === undefined ? model.selectedState?.id : undefined;
}

/**
 * State, checkpoint, and input revision all contribute to reading identity.
 * @param model One complete query response.
 * @returns Its identity, as the server names it on a separately read detail.
 */
function readingIdentity(model: Model): ReadingIdentity {
	return {
		model: model.manifest.id,
		state: model.selectedState?.id,
		checkpoint: model.checkpoint?.id,
		ref: model.sourceRef?.ref,
		...previewIdentity(model),
		digest: model.revision.digest,
	};
}

/**
 * The part of a reading's identity that a migration preview adds.
 * @param model One complete query response.
 * @returns The preview's origin and its chosen legacy state, each absent outside a preview.
 */
function previewIdentity(model: Model): Pick<ReadingIdentity, "preview" | "previewState"> {
	const preview = model.migrationPreview;
	return { preview: preview?.origin, previewState: preview?.selected?.legacy };
}

export { useModelNavigation };
