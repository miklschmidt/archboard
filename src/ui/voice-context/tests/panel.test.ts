import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";

import { loadRenderedUiTools, registerHappyDom, unregisterHappyDom } from "@/ui/dom-testing";

registerHappyDom();
const { cleanup, render, screen, userEvent, waitFor } = await loadRenderedUiTools();
const { createVoiceContextHistory, VoiceContextPanel } = await import("../index.js");
const { canonicalBrief, capture, evidence, ledgerEntry, SESSION_A, voiceSession } =
	await import("./support/fixtures.js");

afterEach(cleanup);
afterAll(unregisterHappyDom);

function populatedHistory(stale = false) {
	const history = createVoiceContextHistory();
	const exactBrief = canonicalBrief(SESSION_A, {
		description: "An exact canonical start brief with enough content for several bounded windows.",
		...(stale
			? {
					freshness: {
						capturedAtMs: 1_800_000_000_000,
						freshUntilMs: 1_800_000_000_500,
						state: "stale" as const,
					},
					staleness: {
						state: "stale" as const,
						reasons: ["semantic freshness window expired"],
					},
				}
			: {}),
	});
	history.capture(capture(SESSION_A, { canonicalBrief: exactBrief }));
	for (let index = 1; index <= 5; index += 1)
		history.append({
			session: SESSION_A,
			entry: ledgerEntry(String(index), {
				kind: index === 5 ? "callback" : "semantic",
				body: `exact body ${index} that is intentionally longer than several preview windows`,
				outcome: index === 5 ? "outcome_unknown" : "delivered",
				reason: index === 5 ? "response_lost" : null,
				connection: index === 5 ? "disconnected" : "connected",
				...(index === 5
					? {
							freshness: {
								capturedAtMs: 1_800_000_001_005,
								freshUntilMs: 1_800_000_001_050,
							},
							attemptedAtMs: 1_800_000_001_105,
						}
					: {}),
			}),
		});
	return { history, exactBrief };
}

describe("voice context panel", () => {
	test("renders canonical baseline and delivery evidence with external stopped state", () => {
		const { history } = populatedHistory(true);
		history.observe(
			evidence(
				voiceSession(SESSION_A.binding!, "realtime-a", {
					status: "stopped",
					label: "Stopped",
					detail: "Voice stopped.",
				}),
				1_800_000_005_000,
			),
		);
		render(
			createElement(VoiceContextPanel, {
				history,
				limits: { entryPageSize: 2, bodyWindowCharacters: 16 },
			}),
		);

		expect(screen.getByRole("region", { name: "Voice context" })).toBeTruthy();
		expect(screen.getByRole("region", { name: "Captured start brief" })).toBeTruthy();
		expect(screen.getByRole("region", { name: "Later deliveries" })).toBeTruthy();
		expect(screen.getByLabelText("Voice context session status: Stopped")).toBeTruthy();
		expect(screen.getByText(/Stale brief/u)).toBeTruthy();
		expect(screen.getByText("Freshness")).toBeTruthy();
		expect(screen.getByText("Stale at capture")).toBeTruthy();
		expect(screen.queryByText("Focus freshness")).toBeNull();
		expect(screen.queryByText("Selection freshness")).toBeNull();
		expect(screen.getByText("Stale at attempt")).toBeTruthy();
		expect(screen.getByText("Outcome unknown")).toBeTruthy();
		expect(screen.getByText("Recorded while disconnected")).toBeTruthy();
		expect(
			screen.getByRole("list", { name: "Later voice context deliveries" }).children,
		).toHaveLength(2);
	});

	test("copies exact immutable strings and announces success", async () => {
		const user = userEvent.setup();
		const copied: string[] = [];
		const { history, exactBrief } = populatedHistory();
		render(
			createElement(VoiceContextPanel, {
				history,
				clipboard: { writeText: async (value: string) => void copied.push(value) },
				limits: { entryPageSize: 2, bodyWindowCharacters: 12 },
			}),
		);

		await user.click(
			screen.getByRole("button", {
				name: "Copy exact captured start brief for realtime-a",
			}),
		);
		await waitFor(() => expect(copied).toEqual([exactBrief]));
		expect(screen.getByText("Captured start brief copied.")).toBeTruthy();

		await user.click(screen.getByRole("button", { name: "Copy exact body for callback entry 5" }));
		await waitFor(() =>
			expect(copied).toEqual([
				exactBrief,
				"exact body 5 that is intentionally longer than several preview windows",
			]),
		);
		expect(screen.getByText("Callback body copied.")).toBeTruthy();
	});

	test("auto-expands the exact failed copy target before directing manual copy", async () => {
		const user = userEvent.setup();
		const { history } = populatedHistory();
		const exactBody = "exact body 5 that is intentionally longer than several preview windows";
		render(
			createElement(VoiceContextPanel, {
				history,
				clipboard: { writeText: () => Promise.reject(new Error("denied")) },
				limits: { entryPageSize: 2, bodyWindowCharacters: 12 },
			}),
		);
		expect(screen.queryByText(exactBody)).toBeNull();
		await user.click(screen.getByRole("button", { name: "Copy exact body for callback entry 5" }));

		await waitFor(() => expect(screen.getByText(exactBody)).toBeTruthy());
		expect(screen.getByText(/Copy failed/u).textContent).toContain(
			"The full exact text is expanded below",
		);
		expect(document.querySelector("[data-voice-context-copy-status='failure']")).toBeTruthy();
	});

	test("advances and collapses bounded rows and bodies by keyboard and touch", async () => {
		const user = userEvent.setup();
		const { history } = populatedHistory();
		render(
			createElement(VoiceContextPanel, {
				history,
				limits: { entryPageSize: 2, bodyWindowCharacters: 12 },
			}),
		);

		const list = screen.getByRole("list", { name: "Later voice context deliveries" });
		const rows = screen.getByRole("button", {
			name: "Show next 2 earlier deliveries. 3 remain",
		});
		rows.focus();
		await user.keyboard("{Enter}");
		expect(list.children).toHaveLength(4);
		await user.click(
			screen.getByRole("button", { name: "Show next 1 earlier deliveries. 1 remain" }),
		);
		expect(list.children).toHaveLength(5);
		await user.click(screen.getByRole("button", { name: "Collapse to recent deliveries" }));
		expect(list.children).toHaveLength(2);

		const briefButton = screen.getAllByRole("button", { name: /Show next 12 characters/u })[0]!;
		await user.pointer([
			{ keys: "[TouchA>]", target: briefButton },
			{ keys: "[/TouchA]", target: briefButton },
		]);
		expect(screen.getByRole("button", { name: "Collapse start brief" })).toBeTruthy();
	});
});
