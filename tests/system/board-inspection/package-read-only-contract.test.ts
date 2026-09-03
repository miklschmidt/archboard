import { expect, test } from "bun:test";

import { CheckResultSchema } from "../../../src/runtime/board-inspection/index.js";
import { cleanScene } from "./fixtures/package-cases.js";
import { createPackageInspectionOwner } from "./support/package-inspection.js";

test("package inspection is read-only and makes zero HTTP contacts", async () => {
	const owner = createPackageInspectionOwner();
	try {
		owner.startVault();
		const sentinel = await owner.startHttpSentinel();
		owner.writeBoard("clean", cleanScene());
		const before = owner.snapshot();
		const result = await owner.runInspection("clean", ["--strict"], {
			EXPRESS_SERVER_URL: sentinel.url,
		});
		const after = owner.snapshot();
		expect(result).toMatchObject({ status: 0, stderr: "" });
		expect(CheckResultSchema.parse(JSON.parse(result.stdout)).clean).toBe(true);
		expect(after).toEqual(before);
		expect(sentinel.contacts()).toBe("");
	} finally {
		await owner.dispose();
	}
});
