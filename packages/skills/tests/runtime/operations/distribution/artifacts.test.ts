import { Ajv2020 } from "ajv/dist/2020.js";
import { SOURCE_CHECKOUT } from "@archboard/workspace/source-checkout";
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ArchitectureInitializationRequestSchema,
	ArchitectureModuleEditSchema,
} from "@archboard/board/model";
import { prepareSkillArtifacts } from "#runtime/operations/distribution/prepare.ts";

test("installed canonical input schemas accept and refuse the same expressible input as the runtime", () => {
	const skill = mkdtempSync(join(tmpdir(), "archboard-schemas-"));
	try {
		const prepared = prepareSkillArtifacts(skill, { root: SOURCE_CHECKOUT, revision: "test" });
		const ajv = new Ajv2020({ strict: false, validateFormats: false });
		const cases = [
			{
				file: "model-initialize.schema.json",
				schema: ArchitectureInitializationRequestSchema,
				input: { name: "Shop", operationId: "init", writer: "agent", doing: "Initialize model" },
			},
			{
				file: "model-edit.schema.json",
				schema: ArchitectureModuleEditSchema,
				input: {
					target: { model: "Shop", state: null },
					expectedRevision: { digest: "abc", files: [] },
					operationId: "edit",
					writer: "agent",
					doing: "Add initial state",
					claim: "claim",
					proposal: { type: "create", name: "Initial" },
					changes: [],
				},
			},
		];
		for (const item of cases) {
			const file = prepared.files.find((candidate) => candidate.endsWith(item.file));
			if (file === undefined) throw new Error(item.file);
			const validate = ajv.compile(JSON.parse(readFileSync(join(skill, file), "utf8")));
			expect(item.schema.safeParse(item.input).success).toBe(true);
			expect(validate(item.input)).toBe(true);
			const invalid = { ...item.input, operationId: 42 };
			expect(item.schema.safeParse(invalid).success).toBe(false);
			expect(validate(invalid)).toBe(false);
		}
	} finally {
		rmSync(skill, { recursive: true, force: true });
	}
});
