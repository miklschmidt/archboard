import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mintId } from "@archboard/board/ids";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { readArchitectureModel } from "@archboard/board/store-read";
import type { SemanticNode } from "@archboard/board/content";
/**
 * Seed authored canonical inputs for tests of generic local workbench behavior.
 * @param vault The disposable test vault.
 * @param name The fixture model name.
 * @param modules The fixture responsibilities.
 * @returns The coherent canonical reading.
 */
function seedCanonicalFixture(
	vault: string,
	name = "scratch",
	modules: readonly (Pick<SemanticNode, "name" | "kind"> & Partial<SemanticNode>)[] = [
		{ name: "Gateway", kind: "service" },
	],
) {
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	writeFileSync(join(vault, ".archboard/config.yaml"), Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY));
	writeFileSync(
		join(vault, "model.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Fixture",
			name,
			current: { id: "Now", name: "Current" },
		}),
	);
	modules.forEach((module, index) => {
		const id = `Fixture#${mintId()}`;
		writeFileSync(
			join(vault, `${id.slice(8)}.module.json`),
			JSON.stringify({
				schemaVersion: 1,
				id,
				name: module.name,
				kind: module.kind,
				order: index,
				responsibility: module.responsibility,
				description: module.description,
				binding: module.binding,
				outgoing: [],
			}),
		);
	});
	const model = readArchitectureModel(vault);
	if (!model.success) throw new Error(JSON.stringify(model));
	return model;
}
export { seedCanonicalFixture };

/**
 * Capture the canonical reading that a disposable pane actually reports.
 * @param vault The addressed test vault.
 * @param model The coherent fixture reading.
 * @param subjects The selected stable identities.
 * @returns Exact architecture context for the existing pane report.
 */
function canonicalCapture(
	vault: string,
	model: ReturnType<typeof seedCanonicalFixture>,
	subjects: string[],
) {
	return {
		vault,
		model: model.manifest.id,
		expectedRevision: model.revision.digest,
		subjects,
		reading: {
			focus: subjects,
			relationshipKinds: Object.keys(model.policy.relationshipKinds),
			groups: true,
			grammar: "architecture" as const,
		},
		selection: { state: model.selectedState!.id },
	};
}
export { canonicalCapture };
