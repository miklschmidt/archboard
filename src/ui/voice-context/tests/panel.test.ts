import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";

import { loadRenderedUiTools, registerHappyDom, unregisterHappyDom } from "@/ui/dom-testing";

registerHappyDom();
const { cleanup, render, screen, userEvent, waitFor } = await loadRenderedUiTools();
const { createVoiceContextHistory, VoiceContextPanel } = await import("../index.js");
const { ledgerEntry, SESSION_A, sessionStart, startBrief } = await import("./support/fixtures.js");

afterEach(cleanup);
afterAll(unregisterHappyDom);

function populatedHistory(focusFreshness: "fresh" | "stale" = "fresh") {
	const history = createVoiceContextHistory();
	const canonicalBrief =
		"exact canonical start brief that is intentionally longer than the preview";
	history.start(sessionStart(SESSION_A, { brief: startBrief({ canonicalBrief, focusFreshness }) }));
	for (let index = 1; index <= 4; index += 1)
		history.append({
			identity: SESSION_A,
			entry: ledgerEntry(String(index), {
				kind: index === 4 ? "callback" : "semantic",
				body: `exact body ${index} that is intentionally longer than the preview`,
				outcome: index === 4 ? "outcome_unknown" : "delivered",
				reason: index === 4 ? "response_lost" : null,
				connection: index === 4 ? "disconnected" : "connected",
			}),
		});
	return { history, canonicalBrief };
}

describe("voice context panel", () => {
	test("renders named baseline and ordered delivery regions with explicit states", () => {
		const { history } = populatedHistory("stale");
		history.markBriefStale({
			identity: SESSION_A,
			markedAtMs: 1_800_000_004_000,
			reasons: ["Selection changed after capture."],
		});
		history.stop({ identity: SESSION_A, stoppedAtMs: 1_800_000_005_000 });
		render(
			createElement(VoiceContextPanel, {
				history,
				limits: { collapsedEntries: 2, collapsedBodyCharacters: 16 },
			}),
		);

		expect(screen.getByRole("region", { name: "Voice context" })).toBeTruthy();
		expect(screen.getByRole("region", { name: "Captured start brief" })).toBeTruthy();
		expect(screen.getByRole("region", { name: "Later deliveries" })).toBeTruthy();
		expect(screen.getByLabelText("Voice context session status: Stopped")).toBeTruthy();
		expect(screen.getByText(/Stale brief/u)).toBeTruthy();
		expect(screen.getByText("Focus freshness")).toBeTruthy();
		expect(screen.getByText("Stale at capture")).toBeTruthy();
		expect(screen.getByText("Selection freshness")).toBeTruthy();
		expect(screen.getByText("Fresh at capture")).toBeTruthy();
		expect(screen.getByText("Outcome unknown")).toBeTruthy();
		expect(screen.getByText("Recorded while disconnected")).toBeTruthy();
		expect(
			screen.getByRole("list", { name: "Later voice context deliveries" }).children,
		).toHaveLength(2);
	});

	test("copies exact canonical strings and announces success", async () => {
		const user = userEvent.setup();
		const copied: string[] = [];
		const { history, canonicalBrief } = populatedHistory();
		render(
			createElement(VoiceContextPanel, {
				history,
				clipboard: { writeText: async (value: string) => void copied.push(value) },
				limits: { collapsedEntries: 2, collapsedBodyCharacters: 12 },
			}),
		);

		await user.click(
			screen.getByRole("button", {
				name: "Copy exact captured start brief for realtime-a",
			}),
		);
		await waitFor(() => expect(copied).toEqual([canonicalBrief]));
		expect(screen.getByText("Captured start brief copied.")).toBeTruthy();

		await user.click(screen.getByRole("button", { name: "Copy exact body for callback entry 4" }));
		await waitFor(() =>
			expect(copied).toEqual([
				canonicalBrief,
				"exact body 4 that is intentionally longer than the preview",
			]),
		);
		expect(screen.getByText("Callback body copied.")).toBeTruthy();
	});

	test("announces clipboard failure with a recovery action", async () => {
		const user = userEvent.setup();
		const { history } = populatedHistory();
		render(
			createElement(VoiceContextPanel, {
				history,
				clipboard: { writeText: () => Promise.reject(new Error("denied")) },
			}),
		);
		await user.click(
			screen.getByRole("button", {
				name: "Copy exact captured start brief for realtime-a",
			}),
		);

		await waitFor(() => {
			expect(screen.getByText(/Copy failed/u).textContent).toContain(
				"Select the exact text in the panel and copy it manually.",
			);
		});
		expect(document.querySelector("[data-voice-context-copy-status='failure']")).toBeTruthy();
	});

	test("expands bounded rows and exact bodies from keyboard, pointer, and touch input", async () => {
		const user = userEvent.setup();
		const { history, canonicalBrief } = populatedHistory();
		render(
			createElement(VoiceContextPanel, {
				history,
				limits: { collapsedEntries: 2, collapsedBodyCharacters: 12 },
			}),
		);

		const rows = screen.getByRole("button", { name: "Show 2 earlier deliveries" });
		rows.focus();
		await user.keyboard("{Enter}");
		expect(
			screen.getByRole("list", { name: "Later voice context deliveries" }).children,
		).toHaveLength(4);

		const startBriefButton = screen.getByRole("button", { name: "Show exact start brief" });
		await user.click(startBriefButton);
		expect(startBriefButton.getAttribute("aria-expanded")).toBe("true");
		expect(screen.getByText(canonicalBrief)).toBeTruthy();

		const bodyButton = screen.getAllByRole("button", { name: "Show exact body" })[0]!;
		await user.pointer([
			{ keys: "[TouchA>]", target: bodyButton },
			{ keys: "[/TouchA]", target: bodyButton },
		]);
		expect(bodyButton.getAttribute("aria-expanded")).toBe("true");
		expect(
			screen.getByText("exact body 1 that is intentionally longer than the preview"),
		).toBeTruthy();
	});
});
