import { readArchitectureModel } from "@archboard/board/store-read";
import { migrateArchitectureModel } from "@archboard/board/store-write";
import { legacyNavigation } from "./legacy-navigation.ts";

/** Prepare exact owner-authorized installation intent through the public reader. */
async function migrationNavigation(root: string) {
	const fixture = await legacyNavigation(root);
	const preview = await readArchitectureModel(fixture.vault, undefined, undefined, {
		preview: "Shop",
	});
	if (!preview.success) throw new Error(JSON.stringify(preview));
	const migration = preview.migrationPreview;
	if (migration?.installation === undefined || migration.planRevision === null)
		throw new Error("The fixture has no complete installation preview.");
	const request = {
		origin: migration.origin,
		expectedSource: migration.source,
		expectedPlan: migration.planRevision,
		previewRevision: preview.revision,
		...migration.installation,
		authorization: "owner" as const,
		operationId: "install-browser-navigation",
		writer: "fixture",
		doing: "Install the approved browser fixture",
	};
	return { ...fixture, request };
}

/** Install the real legacy fixture without changing its source Git index or HEAD. */
async function installedNavigation(root: string) {
	const fixture = await migrationNavigation(root);
	const installed = await migrateArchitectureModel(fixture.vault, fixture.request);
	if (!installed.success) throw new Error(JSON.stringify(installed));
	const model = await readArchitectureModel(fixture.vault);
	if (!model.success || model.migration === undefined) throw new Error(JSON.stringify(model));
	return { ...fixture, model, migration: model.migration };
}

export { migrationNavigation, installedNavigation };
