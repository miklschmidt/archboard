import type {
	ArchitectureModel,
	ModuleNavigationRead,
	ReadingIdentity,
} from "#shared/schemas/model.ts";
import { readArchitectureModel } from "#runtime/operations/read/model-read.ts";
import type { NavigationOptions } from "#runtime/operations/read/model-navigation.ts";

/**
 * Name the exact reading that a separately read detail belongs to.
 * @param model One coherent reading.
 * @returns Its model, state, checkpoint, preview and input revision.
 */
function readingIdentity(model: ArchitectureModel): ReadingIdentity {
	return {
		model: model.manifest.id,
		state: model.selectedState?.id,
		checkpoint: model.checkpoint?.id,
		preview: model.migrationPreview?.origin,
		previewState: model.migrationPreview?.selected?.legacy,
		digest: model.revision.digest,
	};
}

/**
 * Answer what a selected module needs: its source target and its own references.
 * @param vault The explicitly addressed vault.
 * @param module The selected module.
 * @param options The reading the module was selected in.
 * @returns The details and the reading they belong to, or the refusal of that reading.
 */
async function readModuleNavigation(
	vault: string,
	module: string,
	options: Pick<NavigationOptions, "state" | "checkpoint" | "preview" | "code">,
): Promise<ModuleNavigationRead> {
	const reading = await readArchitectureModel(vault, module, undefined, {
		...options,
		references: true,
		compare: false,
	});
	if (!reading.success) return reading;
	return {
		success: true,
		reading: readingIdentity(reading),
		module: reading.selectedModule!,
		resolvedReferences: reading.resolvedReferences ?? [],
		codeTarget: reading.codeTarget,
	};
}

export { readModuleNavigation };
