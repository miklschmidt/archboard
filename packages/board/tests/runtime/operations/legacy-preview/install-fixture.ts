import { rmSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import { narrativeFixture } from "#tests/runtime/operations/legacy-preview/readings-fixture.ts";
import { savePreviewPlan } from "#tests/runtime/operations/legacy-preview/fixture.ts";
async function installationFixture(fixture = narrativeFixture()) {
	rmSync(join(fixture.vault, "Future.semantic.json"));
	await savePreviewPlan(fixture.vault);
	const preview = await readArchitectureModel(fixture.vault, undefined, undefined, {
		preview: "Shop",
	});
	if (!preview.success) throw new Error(JSON.stringify(preview));
	const request = {
		origin: "Shop",
		expectedSource: preview.migrationPreview!.source,
		expectedPlan: preview.migrationPreview!.planRevision!,
		previewRevision: preview.revision,
		...preview.migrationPreview!.installation!,
		authorization: "owner" as const,
		operationId: "migration-install",
		writer: "owner",
		doing: "Install the approved preview",
	};
	return { ...fixture, preview, request };
}
export { installationFixture };
