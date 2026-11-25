import { afterEach, expect, test } from "bun:test";
import { architectureModuleEditSchema } from "@archboard/model/contract";
import { RecordedModuleEditSchema } from "#shared/canonical-contracts/schemas/model-operations.ts";
import {
	disposeFixtures,
	fixture,
	structureIntent,
} from "#tests/runtime/canonical/edit/operations/fixture.ts";

afterEach(disposeFixtures);

test("history keeps reading an edit that wrote the retired kind call, and a new edit is refused", async () => {
	const { vault } = fixture();
	const input = await structureIntent(vault, ["Shop", "Shop#Gateway"]);
	const edit = (kind: string) => ({
		...input,
		changes: [
			{
				type: "add-relationship",
				source: "Shop#Gateway",
				relationship: { to: "Shop#Gateway", kind, effect: "mutation", order: 1 },
			},
		],
	});
	expect(RecordedModuleEditSchema.safeParse(edit("call")).success).toBe(true);
	const refused = architectureModuleEditSchema().safeParse(edit("call"));
	expect(refused.success).toBe(false);
	expect(JSON.stringify(refused.error?.issues)).toContain("sync");
	expect(architectureModuleEditSchema().safeParse(edit("sync")).success).toBe(true);
});
