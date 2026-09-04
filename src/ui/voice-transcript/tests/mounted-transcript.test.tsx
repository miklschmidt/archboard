import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";

import {
	loadRenderedUiTools,
	registerHappyDom,
	unregisterHappyDom,
} from "../../dom-testing/index.js";
import { CROSS_LINK_IDS, transcriptRecord, voiceSession } from "./fixtures.js";

registerHappyDom();
const ui = await loadRenderedUiTools();
const { VoiceTranscript } = await import("../index.js");

afterEach(() => ui.cleanup());
afterAll(unregisterHappyDom);

function transcript(overrides: Partial<Parameters<typeof VoiceTranscript>[0]> = {}) {
	return createElement(VoiceTranscript, {
		records: [],
		session: voiceSession(),
		crossLinkIds: CROSS_LINK_IDS,
		...overrides,
	});
}

function region(container: HTMLElement): HTMLElement {
	const node = container.querySelector<HTMLElement>("[data-voice-transcript]");
	if (node === null) throw new Error("Voice transcript region was not rendered");
	return node;
}

function record(container: HTMLElement, itemId: string): HTMLElement {
	const node = container.querySelector<HTMLElement>(
		`[data-transcript-record][data-transcript-item-id="${itemId}"]`,
	);
	if (node === null) throw new Error(`Transcript record ${itemId} was not rendered`);
	return node;
}

describe("mounted voice transcript accessibility", () => {
	test("owns one atomic session announcer using the canonical accessible status", () => {
		const recoverable = voiceSession("failed", {
			label: "Voice failed",
			detail: "Microphone access failed.",
			accessibleStatus:
				"Voice failed. Microphone access failed. Reconnect the microphone and restart voice.",
			failure: { code: "device", recoverable: true, message: "Microphone access failed." },
			outcome: {
				kind: "retry",
				control: "restart",
				label: "Restart voice",
				recovery: "Reconnect the microphone and restart voice.",
			},
		});
		const terminal = voiceSession("failed", {
			label: "Voice failed",
			detail: "The realtime session is invalid.",
			accessibleStatus:
				"Voice failed. The realtime session is invalid. Close voice and start a new session.",
			failure: { code: "session", recoverable: false, message: "Invalid session." },
			outcome: {
				kind: "terminal",
				label: "Close voice",
				recovery: "Close voice and start a new session.",
			},
		});
		const rendered = ui.render(transcript({ session: recoverable }));

		for (const session of [recoverable, terminal]) {
			rendered.rerender(transcript({ session }));
			const announcers = rendered.container.querySelectorAll<HTMLElement>(
				'[aria-live="polite"][aria-atomic="true"]',
			);
			expect(announcers).toHaveLength(1);
			expect(announcers[0]?.textContent).toContain(session.accessibleStatus);
			expect(
				announcers[0]
					?.querySelector<HTMLElement>("[data-transcript-visible-status]")
					?.getAttribute("aria-hidden"),
			).toBe("true");
		}
	});

	test("batches streaming log announcements without replacing the canonical item node", () => {
		const provisional = transcriptRecord("spoken-item", 3, {
			status: "provisional",
			text: "move",
		});
		const rendered = ui.render(transcript({ records: [provisional] }));
		const log = ui.screen.getByRole("log", { name: "Voice transcript" });
		const itemBefore = record(rendered.container, "spoken-item");
		const addedNodes: Node[] = [];
		const observer = new MutationObserver((changes) => {
			for (const change of changes) {
				if (change.type === "childList") addedNodes.push(...change.addedNodes);
			}
		});
		observer.observe(log, { childList: true, subtree: true, characterData: true });

		expect(log.getAttribute("aria-relevant")).toBe("additions");
		expect(log.getAttribute("aria-busy")).toBe("true");

		rendered.rerender(
			transcript({
				records: [transcriptRecord("spoken-item", 3, { status: "final", text: "move it" })],
			}),
		);
		observer.disconnect();

		expect(record(rendered.container, "spoken-item")).toBe(itemBefore);
		expect(addedNodes).toEqual([]);
		expect(log.getAttribute("aria-busy")).toBe(null);
		expect(itemBefore.textContent).toContain("move it");
	});

	test("gives the log and sibling links visible keyboard focus paths", async () => {
		const user = ui.userEvent.setup();
		const rendered = ui.render(transcript());
		const log = ui.screen.getByRole("log", { name: "Voice transcript" });

		await user.tab();
		expect(document.activeElement).toBe(log);
		expect(log.className).toContain("focus-visible:ring-2");
		await user.tab();
		const firstLink = ui.screen.getByRole("link", { name: "Inspect delegation record" });
		expect(document.activeElement).toBe(firstLink);
		expect(firstLink.className).toContain("focus-visible:outline-2");
		expect(firstLink.className).toContain("min-h-touch-target");
		expect(region(rendered.container).querySelectorAll(".min-h-touch-target")).toHaveLength(6);
	});

	test("renders only the six labeled fragment links", () => {
		ui.render(transcript());

		expect(
			ui.screen.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")]),
		).toEqual([
			["Delegation", "#delegation-record"],
			["Queue", "#queue-record"],
			["Steer", "#steer-record"],
			["Approval", "#approval-record"],
			["Callback", "#callback-record"],
			["Workhorse result", "#workhorse-result-record"],
		]);
	});
});

describe("mounted voice transcript states", () => {
	test("uses neutral semantic text for roles and provisional state", () => {
		const rendered = ui.render(
			transcript({
				records: [
					transcriptRecord("user-provisional", 1, { status: "provisional" }),
					transcriptRecord("assistant-final", 2, { role: "assistant" }),
				],
			}),
		);
		const user = ui.within(record(rendered.container, "user-provisional"));
		const assistant = ui.within(record(rendered.container, "assistant-final"));

		expect(user.getByText("User").className).toContain("text-foreground");
		expect(user.getByText("Provisional").className).toContain("text-muted-foreground");
		expect(assistant.getByText("Assistant").className).toContain("text-muted-foreground");
		expect(assistant.getByText("Final").className).toContain("text-foreground");
		expect(user.getByText("User").className).not.toContain("text-primary");
		expect(user.getByText("Provisional").className).not.toContain("text-primary");
	});

	test("keeps stale-session identity visible but never mounts its transcript text", () => {
		const stale = transcriptRecord("stale-item", 41, {
			sessionId: "session-prior" as ReturnType<typeof transcriptRecord>["sessionId"],
			role: "assistant",
			status: "interrupted",
			text: "do not render this prior session text",
		});
		const rendered = ui.render(transcript({ records: [stale] }));
		const row = record(rendered.container, "stale-item");

		expect(row.textContent).toContain("session-prior");
		expect(row.textContent).toContain("stale-item");
		expect(row.textContent).toContain("41");
		expect(row.textContent).toContain("Assistant");
		expect(row.textContent).toContain("Interrupted");
		expect(row.textContent).toContain("belongs to another realtime session");
		expect(rendered.container.textContent).not.toContain("do not render this prior session text");
	});

	test("shows simultaneous empty and processing states without inventing transcript content", () => {
		const rendered = ui.render(transcript({ session: voiceSession("processing") }));
		const root = region(rendered.container);

		expect(root.getAttribute("data-transcript-content-state")).toBe("empty");
		expect(root.getAttribute("data-transcript-session-state")).toBe("processing");
		expect(ui.screen.getByRole("log").getAttribute("aria-busy")).toBe("true");
		expect(rendered.container.textContent).toContain(
			"No transcript items have arrived for this voice session.",
		);
	});

	test("uses identical semantic markup and utilities when the shared theme changes", () => {
		const rendered = ui.render(
			createElement(
				"div",
				{ "data-theme": "light" },
				transcript({ records: [transcriptRecord("a", 1)] }),
			),
		);
		const before = region(rendered.container);
		const markup = before.innerHTML;

		rendered.rerender(
			createElement(
				"div",
				{ "data-theme": "dark" },
				transcript({ records: [transcriptRecord("a", 1)] }),
			),
		);

		const after = region(rendered.container);
		expect(after).toBe(before);
		expect(after.innerHTML).toBe(markup);
		expect(after.innerHTML).not.toContain("dark:");
		expect(after.innerHTML).not.toMatch(/(?:slate|gray|zinc|neutral|stone|red|blue|green)-[0-9]/);
		expect(after.querySelectorAll("dd.font-mono")).toHaveLength(3);
	});
});
