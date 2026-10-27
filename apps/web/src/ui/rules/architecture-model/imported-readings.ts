import type { Model } from "@archboard/board/content";
import type { ModelAddress } from "#ui/rules/board-routing/address.ts";

/**
 * Read imported navigation without confusing installed and original authority.
 * @param model The coherent model, when available.
 * @returns Content-free reading metadata from its existing owner.
 */
function importedReadings(model: Model | undefined) {
	return model?.migrationPreview ?? model?.migration;
}

/**
 * Preserve the exact original destination returned by an installed alias.
 * @param model The successful original read.
 * @returns Its complete router intent, or absence of an exact destination.
 */
function originalReadingAddress(model: Model): ModelAddress | null {
	const preview = model.migrationPreview;
	if (preview === undefined) return null;
	const state = preview.selected?.legacy;
	const checkpoint = model.checkpoint?.id;
	if (state === undefined || checkpoint === undefined) return null;
	return {
		id: model.manifest.id,
		preview: preview.origin,
		state,
		checkpoint,
		scope: null,
		subject: undefined,
		focus: undefined,
		grammar: undefined,
		flow: undefined,
		bookmark: undefined,
		legacyAddress: undefined,
		against: undefined,
		hideKinds: undefined,
		hideGroups: undefined,
	};
}

export { importedReadings, originalReadingAddress };
