import { describe, expect, test } from "bun:test";
import { act } from "react";

import type { BrowserTimeline } from "../../../shared/codex-browser-model/index.js";
import type { WorkbenchSubmissionResult } from "../index.js";
import { latestExecutable, mountProvider, MutableTransport } from "./mounted-runtime.test.js";

const turnId = "mounted-turn" as BrowserTimeline["turns"][number]["turnId"];

describe("mounted workbench submission fencing", () => {
	for (const result of [
		{ outcome: "not_delivered", reason: "Late rejection" },
		{ outcome: "outcome_unknown", reason: "Late uncertainty" },
		{ outcome: "delivered", turnId },
	] satisfies readonly WorkbenchSubmissionResult[]) {
		test(`fences a replaced transport's deferred ${result.outcome} settlement`, async () => {
			const first = new MutableTransport();
			const second = new MutableTransport();
			const mounted = await mountProvider();
			let settle!: (value: WorkbenchSubmissionResult) => void;
			const deferred = new Promise<WorkbenchSubmissionResult>((resolve) => (settle = resolve));
			try {
				await mounted.render(first, async () => await deferred);
				const runtime = latestExecutable(mounted.contexts).assistantRuntime;
				await act(async () => {
					runtime.thread.composer.setText("submission for A");
					runtime.thread.composer.send();
					await Promise.resolve();
				});
				await mounted.render(second, async () => ({ outcome: "delivered", turnId }));
				expect(latestExecutable(mounted.contexts).assistantRuntime).toBe(runtime);
				await act(async () => {
					runtime.thread.composer.setText("draft for B");
					settle(result);
					await deferred;
				});
				expect(runtime.thread.composer.getState().text).toBe("draft for B");
				expect(mounted.container.queryByRole("status")?.textContent).toBe(
					"The current Codex workhorse is ready.",
				);
			} finally {
				await mounted.close();
			}
		});
	}
});
