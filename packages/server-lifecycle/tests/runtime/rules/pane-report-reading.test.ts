import { expect, test } from "bun:test";
import type { SemanticPaneContextSchema } from "@archboard/board/pane-context";
import type { z } from "zod";
import { buildPanesReport, type PaneRegistration } from "#runtime/rules/panes.ts";

// A pane that shows a canonical model reports no board key at all. What it shows is the model
// reading it reported, so the report must say that and not that nothing is drawn.

const pane: PaneRegistration = {
	clientId: "c1",
	paneId: "A",
	vault: "/vault",
	board: null,
	primary: true,
	focused: true,
	rect: { x: 0, y: 0, width: 1920, height: 1080 },
	at: "2026-09-23T00:00:00.000Z",
};
const reading = {
	model: "Shop",
	expectedRevision: "a".repeat(64),
	subjects: [],
	reading: { focus: [], relationshipKinds: [], grammar: "architecture" as const },
	vault: "/vault",
	selection: { state: "Nightly batch", against: "Starting point" },
};

/**
 * The report for one pane.
 * @param architecture What the pane reported, if anything.
 * @returns The report.
 */
function reportOf(architecture: z.infer<typeof SemanticPaneContextSchema>["architecture"]) {
	return buildPanesReport([pane], {
		identity: () => null,
		reading: () => null,
		architecture: () => architecture,
		whereabouts: () => ({ repository: null, checkout: "/checkout" }),
		caller: null,
	});
}

test("a pane's line names the model and the states it reported, and carries them in the pane entry", () => {
	const report = reportOf(reading);
	for (const word of ["Shop", "Nightly batch", "Starting point"]) {
		expect(report.text).toContain(word);
	}
	expect(report.panes[0]?.architecture?.selection).toEqual(reading.selection);
});

test("a pane that reported no reading is not given one", () => {
	const report = reportOf(null);
	expect(report.text).not.toContain("Shop");
	expect(report.panes[0]?.architecture).toBeNull();
});

test("display labels describe the accepted reading while selectors keep their identities", () => {
	const display = {
		model: "Web shop",
		state: "Nightly fulfillment",
		comparison: "Compared with its base",
	};
	const architecture = { ...reading, selection: { state: "DraftId" }, display };
	const report = reportOf(architecture);
	expect(report.panes[0]?.architecture).toEqual(architecture);
	for (const label of Object.values(display)) expect(report.text).toContain(label);
	expect(report.text).not.toContain("state DraftId");
	expect(report.panes[0]).toMatchObject({ position: 1, place: "the only pane" });
});
