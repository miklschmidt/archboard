import { expect, jest, test } from "bun:test";
import { existsSync } from "node:fs";

import { CheckResultSchema } from "../../../src/runtime/board-inspection/index.js";
import { ingestScene } from "../../../src/runtime/engine/board-io.js";
import { cleanScene } from "./fixtures/package-cases.js";
import { createPackageInspectionOwner } from "./support/package-inspection.js";

test("package inspection is read-only and makes zero HTTP contacts", async () => {
	const owner = createPackageInspectionOwner();
	let artifacts: string[] = [];
	try {
		owner.startVault();
		jest.useFakeTimers();
		let sentinel: Awaited<ReturnType<typeof owner.startHttpSentinel>>;
		try {
			sentinel = await owner.startHttpSentinel();
			expect(jest.getTimerCount()).toBe(0);
		} finally {
			jest.useRealTimers();
		}
		owner.writeBoard("clean", cleanScene());
		const before = owner.snapshot();
		const order: string[] = [];
		const eventLoopTurn = Bun.sleep(0).then(() => order.push("event-loop"));
		const inspection = owner
			.runInspection("clean", ["--strict"], { EXPRESS_SERVER_URL: sentinel.url })
			.then((result) => {
				order.push("inspection");
				return result;
			});
		const [result] = await Promise.all([inspection, eventLoopTurn]);
		expect(order[0]).toBe("event-loop");
		const after = owner.snapshot();
		expect(result).toMatchObject({ status: 0, stderr: "" });
		expect(CheckResultSchema.parse(JSON.parse(result.stdout)).clean).toBe(true);
		expect(after).toEqual(before);
		expect(after.map(({ path }) => path)).toEqual(["clean.excalidraw.md"]);
		expect(sentinel.contacts()).toBe("");
		expect(() =>
			ingestScene([{ id: "bad", type: "rectangle", x: 0, y: 0, width: null, height: 2 }]),
		).toThrow();
		artifacts = owner.artifactPaths();
	} finally {
		await owner.dispose();
	}
	expect(artifacts).toHaveLength(2);
	for (const artifact of artifacts) expect(existsSync(artifact)).toBe(false);
});
