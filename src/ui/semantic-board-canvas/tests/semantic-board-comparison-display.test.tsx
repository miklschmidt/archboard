import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import { PICTURE_ENTRY_MS, PICTURE_TRANSITION_MS } from "@/shared/timing/timing";
import {
	drawing,
	mountStage,
	part,
	renderCalls,
	server,
	settle,
	surface,
} from "@/ui/semantic-board-canvas/tests/stage-harness";

test("the comparison control carries the picture in and out without changing the variant", async () => {
	const compared = drawing(1);
	const variant = { id: "draft", name: "Proposal", lifecycle: "draft" };
	const changes = {
		predecessor: { id: "current", name: "Current", lifecycle: "current" },
		standing: { ghost: "removed", n1: "changed" },
	};
	const decorated = { ...compared, variant, changes };
	const plain = {
		...decorated,
		svg: String(compared["svg"])
			.replace(
				'<g data-semantic-kind="node" data-semantic-id="ghost"><rect id="stray"></rect></g>',
				"",
			)
			.replace('id="card"', 'id="card" data-plain="true"'),
	};
	server.reply = { status: 200, body: decorated };
	const realFrame = globalThis.requestAnimationFrame;
	const realCancel = globalThis.cancelAnimationFrame;
	const frames = new Map<number, FrameRequestCallback>();
	let nextFrame = 0;
	try {
		/**
		 * Keep frames on the test clock until the picture can land.
		 * @param callback The requested frame.
		 * @returns The frame id.
		 */
		globalThis.requestAnimationFrame = (callback): number => {
			frames.set(++nextFrame, callback);
			return nextFrame;
		};
		/**
		 * Cancel a frame from the test clock.
		 * @param id The frame id.
		 */
		globalThis.cancelAnimationFrame = (id): void => {
			frames.delete(id);
		};
		/** Land the current picture on the test clock. */
		function land(): void {
			act(() => {
				for (const callback of frames.values()) {
					callback(performance.now() + PICTURE_ENTRY_MS + PICTURE_TRANSITION_MS + 1);
				}
				frames.clear();
			});
		}

		mountStage();
		await settle();
		land();
		expect(part("semantic-comparison-toggle")).not.toBeNull();
		expect(renderCalls()).toHaveLength(1);

		server.reply = { status: 200, body: plain };
		act(() => {
			fireEvent.click(part("semantic-comparison-toggle"));
		});
		await settle();
		await settle();
		expect(renderCalls().at(-1)).toContain("comparison=off");
		expect(surface().hasAttribute("data-picture-motion")).toBe(true);
		expect(part("semantic-legend").textContent).not.toContain("Added");
		expect(part("semantic-board-stage").getAttribute("data-variant")).toBe("Proposal");
		land();
		expect(surface().hasAttribute("data-picture-motion")).toBe(false);
		expect(surface().innerHTML.includes("stray")).toBe(false);

		server.reply = { status: 200, body: decorated };
		const callsAfterOff = renderCalls().length;
		act(() => {
			fireEvent.click(part("semantic-comparison-toggle"));
		});
		await settle();
		await settle();
		expect(renderCalls()).toHaveLength(callsAfterOff);
		expect(surface().hasAttribute("data-picture-motion")).toBe(true);
		expect(part("semantic-legend").textContent).toContain("Added");
		land();
		expect(surface().hasAttribute("data-picture-motion")).toBe(false);
		expect(surface().innerHTML.includes("stray")).toBe(true);
	} finally {
		globalThis.requestAnimationFrame = realFrame;
		globalThis.cancelAnimationFrame = realCancel;
	}
});
