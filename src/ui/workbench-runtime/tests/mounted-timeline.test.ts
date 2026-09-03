import { describe, expect, test } from "bun:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

import type { BrowserTimeline } from "../../../shared/codex-browser-model/index.js";
import { WorkbenchTimeline } from "../../workbench-timeline/index.tsx";
import { createReadonlyWorkbenchView, ReadonlyWorkbenchThreadProvider } from "../index.js";
import { installMinimalDom, TestElement } from "./minimal-dom.js";

const threadId = "mounted-timeline-thread" as BrowserTimeline["threadId"];
const turnId = "mounted-timeline-turn" as BrowserTimeline["turns"][number]["turnId"];
const sharedItemId =
	"mounted-command" as BrowserTimeline["turns"][number]["items"][number]["itemId"];
const laterItemId = "mounted-later" as BrowserTimeline["turns"][number]["items"][number]["itemId"];

function timeline(includeApproval: boolean): BrowserTimeline {
	return {
		kind: "timeline",
		threadId,
		turns: [
			{
				turnId,
				status: "completed",
				items: [
					{
						media: "command",
						itemId: sharedItemId,
						command: "bun test",
						status: "completed",
					},
					...(includeApproval
						? [
								{
									media: "approval" as const,
									itemId: sharedItemId,
									approvalId: "mounted-approval" as never,
									status: "pending" as const,
								},
							]
						: []),
					{ media: "text", itemId: laterItemId, text: "Later activity" },
				],
				summary: "Mounted timeline",
				outputsIncluded: true,
				outputsTruncated: false,
			},
		],
		nextCursor: null,
	};
}

function elementsWithAttribute(root: TestElement, name: string): readonly TestElement[] {
	const matches: TestElement[] = [];
	const visit = (element: TestElement): void => {
		if (element.getAttribute(name) !== null) matches.push(element);
		for (const child of element.childNodes) {
			if (child instanceof TestElement) visit(child);
		}
	};
	visit(root);
	return matches;
}

function itemElement(root: TestElement, itemId: string): TestElement {
	const element = elementsWithAttribute(root, "data-item-id").find(
		(candidate) => candidate.getAttribute("data-item-id") === itemId,
	);
	if (element === undefined) throw new Error(`Missing rendered item ${itemId}`);
	return element;
}

describe("mounted workbench timeline reconciliation", () => {
	test("keeps item-owned DOM state on later activity when a matching approval arrives", async () => {
		const dom = installMinimalDom();
		const root = createRoot(dom.container as unknown as Element);
		const render = async (runtimeTimeline: BrowserTimeline): Promise<void> => {
			const view = createReadonlyWorkbenchView(
				runtimeTimeline,
				"coordinator",
				"Mounted reconciliation owner.",
			);
			if (view.mode !== "readonly") throw new Error("Expected the read-only provider.");
			await act(async () => {
				root.render(
					createElement(
						ReadonlyWorkbenchThreadProvider,
						{ view },
						createElement(WorkbenchTimeline, {
							threadId,
							turns: [],
							runtimeTimeline,
						}),
					),
				);
			});
		};
		try {
			await render(timeline(false));
			const laterBefore = itemElement(dom.container, laterItemId);
			laterBefore.setAttribute("data-local-state", "belongs-to-later");

			await render(timeline(true));
			const laterAfter = itemElement(dom.container, laterItemId);
			const approval = elementsWithAttribute(dom.container, "data-item-type").find(
				(element) => element.getAttribute("data-item-type") === "approval",
			);
			expect(laterAfter).toBe(laterBefore);
			expect(laterAfter.getAttribute("data-local-state")).toBe("belongs-to-later");
			expect(approval?.getAttribute("data-local-state")).toBeNull();
			expect(
				elementsWithAttribute(dom.container, "data-item-type").map((element) =>
					element.getAttribute("data-item-type"),
				),
			).toEqual(["commandExecution", "approval", "agentMessage"]);
			expect(elementsWithAttribute(dom.container, "data-turn-id")).toHaveLength(1);
		} finally {
			await act(async () => root.unmount());
			dom.restore();
		}
	});
});
