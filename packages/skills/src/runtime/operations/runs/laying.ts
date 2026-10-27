import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, isAbsolute } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import type { Fixture } from "#runtime/schemas/fixture.ts";
import { writeVaultConfiguration } from "#runtime/operations/runs/vault.ts";
/**
 * Make sure that each authored evaluation fixture forms a coherent canonical model.
 * @param fixtures The scenario inputs.
 * @returns Concrete public-runtime refusals, if any.
 */
function layingProblems(fixtures: ReadonlyMap<string, Fixture>): string[] {
	return [...fixtures].flatMap(([id, fixture]) => {
		const root = mkdtempSync(join(tmpdir(), "archboard-skill-fixture-"));
		try {
			if (fixture.steps.length !== 0 || fixture.talk !== undefined)
				return [`${id}: legacy fixture authoring is retired`];
			writeVaultConfiguration(root, fixture.policy);
			for (const [file, text] of Object.entries(fixture.inputs)) {
				if (isAbsolute(file) || file.split(/[\\/]/u).includes(".."))
					return [`${id}: input leaves its vault`];
				const target = join(root, file);
				mkdirSync(dirname(target), { recursive: true });
				writeFileSync(target, text.replaceAll("$FLASK", "github.com/pallets/flask"));
			}
			const model = readArchitectureModel(root);
			return model.success
				? []
				: model.diagnostics.map((entry) => `${id}: ${entry.code}: ${entry.message}`);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
}
export { layingProblems };
