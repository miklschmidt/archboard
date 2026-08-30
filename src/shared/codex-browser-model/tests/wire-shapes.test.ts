import { expect, test } from "bun:test";

import { createFixtureIds } from "./support.js";

test("round-trips unrestricted generated file-change text", () => {
	const ids = createFixtureIds();
	const request = ids.serverRequests.find((candidate) => candidate.method === "applyPatchApproval");
	if (request?.method !== "applyPatchApproval")
		throw new Error("fixture is missing patch approval request");
	const largeText = "x".repeat(16_385);
	const fileChanges = {
		add: { type: "add", content: largeText },
		delete: { type: "delete", content: largeText },
		update: { type: "update", unified_diff: largeText, move_path: largeText },
	} as const;
	const value = { ...request, params: { ...request.params, fileChanges } };
	const parsed = ids.model.ServerRequestSchema.safeParse(value as unknown);
	expect(parsed.success).toBeTrue();
	if (parsed.success) expect(parsed.data).toEqual(value);
	const nulText = `patch${String.fromCodePoint(0)}content`;
	const nulValue = {
		...request,
		params: {
			...request.params,
			reason: nulText,
			fileChanges: { added: { type: "add", content: nulText } } as const,
		},
	};
	const reparsed = ids.model.ServerRequestSchema.safeParse(
		JSON.parse(JSON.stringify(nulValue)) as unknown,
	);
	expect(reparsed.success).toBeTrue();
	if (reparsed.success) expect(reparsed.data).toEqual(nulValue);
});
