import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import type { Fixture } from "#runtime/schemas/fixture.ts";
import {
	writeVaultConfiguration,
	writeFixtureInputs,
	assertCanonicalFixture,
} from "#runtime/operations/runs/vault.ts";
/**
 * Make sure that each authored evaluation fixture forms a coherent canonical model.
 * @param fixtures The scenario inputs.
 * @returns Concrete public-runtime refusals, if any.
 */
function layingProblems(fixtures: ReadonlyMap<string, Fixture>): string[] {
	return [...fixtures].flatMap(([id, fixture]) => {
		const root = mkdtempSync(join(tmpdir(), "archboard-skill-fixture-"));
		try {
			assertCanonicalFixture(fixture);
			writeVaultConfiguration(root, fixture.policy);
			writeFixtureInputs(root, fixture.inputs, null);
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
