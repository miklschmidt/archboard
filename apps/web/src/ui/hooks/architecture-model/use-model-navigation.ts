import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import type { Model } from "@archboard/board/content";
import type { ModuleNavigationRead } from "@archboard/board/model";
import { architectureModuleQuery, readModel } from "#ui/clients/architecture-model/queries.ts";

/** The fields that make a reading one exact reading. */
const READING_FIELDS = [
	"model",
	"state",
	"checkpoint",
	"preview",
	"previewState",
	"digest",
] as const;

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
	const { checkpoint, state, preview } = target;
	const query = useQuery(
		architectureModuleQuery(
			vault,
			{ module: subject, state, checkpoint, preview, code: module.binding !== undefined },
			model.revision.digest,
		),
	);
	const coherent = !query.isError && matchingNavigation(query.data, model);
	const data = coherent ? query.data : undefined;
	const follow = useCallback(
		(index: number, signal: AbortSignal) =>
			readModel(vault, checkpoint ?? null, signal, {
				state,
				preview,
				module: subject,
				reference: index,
				compare: false,
			}),
		[vault, checkpoint, state, preview, subject],
	);
	return {
		query,
		coherent,
		code: data?.codeTarget,
		references: data?.resolvedReferences ?? [],
		follow,
		target,
	};
}

/**
 * A later or different reading never supplies actions for an older inspector.
 * @param actual The separately read navigation details.
 * @param shown The exact state that the person sees.
 * @returns Whether both responses identify one coherent reading.
 */
function matchingNavigation(
	actual: Extract<ModuleNavigationRead, { success: true }> | undefined,
	shown: Model,
): boolean {
	if (actual === undefined) return false;
	const identity = readingIdentity(shown);
	return READING_FIELDS.every((field) => actual.reading[field] === identity[field]);
}

/**
 * Preview navigation preserves the original state beside its retained checkpoint.
 * @param model The coherent inspected model.
 * @param subject The inspected module.
 * @returns The existing opener destination fields.
 */
function navigationTarget(model: Model, subject: string) {
	const checkpoint = model.checkpoint?.id;
	const preview = model.migrationPreview?.origin;
	const state = navigationState(model);
	return { model: model.manifest.id, subject, state, checkpoint, preview };
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
function readingIdentity(model: Model) {
	return {
		model: model.manifest.id,
		state: model.selectedState?.id,
		checkpoint: model.checkpoint?.id,
		preview: model.migrationPreview?.origin,
		previewState: model.migrationPreview?.selected?.legacy,
		digest: model.revision.digest,
	};
}

export { useModelNavigation };
