import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";

import { TEST_BOARD_RENDERING_CASE_TIMEOUT_MS } from "../../../shared/timing/timing.ts";
import { createBoardRenderingOwner, DEFAULT_MERMAID_CONFIG } from "../index.ts";

describe("board renderer owner", () => {
	test(
		"shutdown rejects active and queued work and proves complete owned-resource cleanup",
		async () => {
			const owner = createBoardRenderingOwner();
			owner.start();
			await owner.execute({
				kind: "mermaid",
				source: "graph TD; A --> B;",
				config: DEFAULT_MERMAID_CONFIG,
			});
			const identity = owner.status();
			if (!identity.chromiumPid || !identity.profile || !identity.controlPort)
				throw new Error("The renderer did not expose its owned resource identity.");
			process.kill(-identity.chromiumPid, "SIGTERM");
			await expect(
				owner.execute({
					kind: "mermaid",
					source: "graph TD; A --> B;",
					config: DEFAULT_MERMAID_CONFIG,
				}),
			).rejects.toThrow("Board renderer");
			expect(existsSync(identity.profile)).toBeFalse();
			await owner.execute({
				kind: "mermaid",
				source: "graph TD; A --> B;",
				config: DEFAULT_MERMAID_CONFIG,
			});
			const replacement = owner.status();
			expect(replacement.chromiumPid).not.toBe(identity.chromiumPid);
			expect(replacement.profile).not.toBe(identity.profile);

			const active = owner.execute({
				kind: "mermaid",
				source: "graph TD; A --> B; B --> C; C --> D; D --> E;",
				config: DEFAULT_MERMAID_CONFIG,
			});
			await Promise.resolve();
			expect(owner.status().active).toBeTrue();
			const queued = owner.execute({
				kind: "mermaid",
				source: "graph TD; Q --> R;",
				config: DEFAULT_MERMAID_CONFIG,
			});
			const settlement = Promise.allSettled([active, queued]);
			const cleanup = await owner.stop();
			const settled = await settlement;
			expect(settled.every(({ status }) => status === "rejected")).toBeTrue();
			expect(cleanup).toEqual({
				clean: true,
				pids: expect.any(Array),
				processesGone: true,
				survivors: [],
				groupAbsent: true,
				leaderSettled: true,
				stdoutSettled: true,
				stderrSettled: true,
				profileRemoved: true,
				portReleased: true,
				fixtureClosed: true,
				errors: [],
			});
			expect(existsSync(identity.profile)).toBeFalse();
			expect(owner.lastCleanup()).toEqual(cleanup);
			expect(await owner.stop()).toEqual(cleanup);
		},
		TEST_BOARD_RENDERING_CASE_TIMEOUT_MS,
	);
});
