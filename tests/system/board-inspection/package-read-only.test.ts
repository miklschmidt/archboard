import { expect, test } from "bun:test";
import { CheckResultSchema } from "../../../src/runtime/board-inspection/index.js";
import { ingestScene } from "../../../src/runtime/engine/board-io.js";
import { cleanScene } from "./fixtures/package-cases.js";
import { createPackageInspectionOwner } from "./support/package-inspection.js";

test("package inspection is read-only and makes zero HTTP contacts", async () => {
	const owner = createPackageInspectionOwner();
	try {
		owner.startVault();
		const sentinel = await owner.startHttpSentinel();
		owner.writeBoard("clean", cleanScene());
		const before = owner.snapshot();
		const result = owner.runInspection("clean", ["--strict"], {
			EXPRESS_SERVER_URL: sentinel.url,
		});
		const after = owner.snapshot();
		expect(result).toMatchObject({ status: 0, stderr: "" });
		expect(CheckResultSchema.parse(JSON.parse(result.stdout)).clean).toBe(true);
		expect(after).toEqual(before);
		expect(after.map(({ path }) => path)).toEqual(["clean.excalidraw.md"]);
		expect(sentinel.contacts()).toBe("");
		expect(() =>
			ingestScene([{ id: "bad", type: "rectangle", x: 0, y: 0, width: null, height: 2 }]),
		).toThrow();
	} finally {
		await owner.dispose();
	}
});
