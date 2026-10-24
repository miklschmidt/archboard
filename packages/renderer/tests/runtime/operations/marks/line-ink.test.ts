// The ink and the head of a line, as a reader sees them on each ground
// (TASK-404).
//
// What this catches: a neutral line, a message or a lifeline that falls under
// the APCA floor for a mark against the page or a tray's floor in either theme,
// a neutral line that is as loud as text, and an arrowhead whose length depends
// on the emphasis of its line. The numbers come from the drawn picture and the theme's tokens, so a
// change of either is measured, not copied.

import { describe, expect, test } from "bun:test";

import { renderArchitecture, renderDataFlow } from "#runtime/operations/render.ts";
import { APCA, lightnessContrast, seenIn } from "#tests/runtime/support/drawn-colours.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import type { DiagramTheme } from "@archboard/board/render-reply";
import { themeColor } from "#runtime/store/theme/source.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/** Three neutral lines of each emphasis inside a container, and one exchange. */
const CONTENT = orderedFixture({
	nodes: [
		{ id: "host", name: "Host", kind: "service" },
		{ id: "a", name: "Reader", kind: "module", parent: "host" },
		{ id: "b", name: "Writer", kind: "module", parent: "host" },
		{ id: "c", name: "Store", kind: "datastore", parent: "host" },
	],
	edges: [
		{ id: "loud", from: "a", to: "b", kind: "call", emphasis: "hero" },
		{ id: "plain", from: "b", to: "c", kind: "call", emphasis: "normal" },
		{ id: "quiet", from: "c", to: "a", kind: "call", emphasis: "muted" },
	],
	flows: [
		{
			id: "f",
			name: "One read",
			participants: ["a", "b"],
			steps: [
				{ id: "asks", from: "a", to: "b", label: "asks", kind: "sync" },
				{ id: "answers", from: "b", to: "a", label: "answers", kind: "return" },
			],
		},
	],
});

const THEMES: DiagramTheme[] = ["light", "dark"];

/** A line that ends in a head: its ink, its width and the marker it ends in. */
const LINE =
	/<path (?![^>]*ab-halo)[^>]*marker-end="url\(#([^)]+)\)"[^>]*stroke="(#[0-9a-f]{6})" stroke-width="([\d.]+)"/gu;

/**
 * Every line that ends in a head, in the subject group that draws it.
 * @param svg The drawn document, painted in literals.
 * @returns The id of the subject, the ink, the width and the head's marker.
 */
function headedLines(svg: string): { id: string; ink: string; width: number; head: string }[] {
	return svg.split("data-semantic-id=").flatMap((part) => {
		const id = /^"([^"]+)"/u.exec(part)?.[1];
		return id === undefined
			? []
			: [...part.matchAll(LINE)].map(([, head, ink, width]) => ({
					id,
					ink: ink!,
					width: Number(width),
					head: head!,
				}));
	});
}

/**
 * How long a marker draws its head on a line of one width: its side is in
 * widths of that line.
 * @param svg The drawn document.
 * @param head The marker's id.
 * @param width The line's width.
 * @returns The length, in the page's units.
 */
function headLength(svg: string, head: string, width: number): number {
	const marker = new RegExp(`<marker id="${head}"[^>]*markerWidth="([\\d.]+)"`, "u").exec(svg);
	expect(marker, `no marker ${head}`).not.toBeNull();
	return Number(marker![1]) * width;
}

/**
 * The grounds a line crosses, and the text it must stay quieter than.
 * @param theme The theme.
 * @returns The colours.
 */
function grounds(theme: DiagramTheme) {
	return {
		page: themeColor(theme, "--background"),
		floor: themeColor(theme, "--tray-floor"),
		text: themeColor(theme, "--diagram-text"),
	};
}

describe("a neutral line reads on every ground and stays quieter than text", () => {
	test.each(THEMES)("a relationship and its head (%s)", async (theme) => {
		const { svg } = seenIn(
			await renderArchitecture({ policy: DEFAULT_SEMANTIC_POLICY, content: CONTENT }),
			theme,
		);
		const { page, floor, text } = grounds(theme);
		const lines = headedLines(svg).filter(({ id }) => id === "loud" || id === "plain");
		expect(lines).toHaveLength(2);
		for (const { ink } of lines) {
			expect(lightnessContrast(ink, page)).toBeGreaterThanOrEqual(APCA.mark);
			expect(lightnessContrast(ink, floor)).toBeGreaterThanOrEqual(APCA.mark);
			// Quieter than the words: at most three quarters of their contrast.
			expect(lightnessContrast(ink, page)).toBeLessThan(lightnessContrast(text, page) * 0.75);
		}
	});

	test.each(THEMES)("a message and a lifeline (%s)", (theme) => {
		const { svg } = seenIn(
			renderDataFlow({ policy: DEFAULT_SEMANTIC_POLICY, content: CONTENT }),
			theme,
		);
		const { page, floor } = grounds(theme);
		const messages = headedLines(svg).map(({ ink }) => ink);
		const lifelines = [
			...svg.matchAll(/<line (?![^>]*ab-halo)[^>]*stroke="(#[0-9a-f]{6})"[^>]*stroke-dasharray/gu),
		].map((found) => found[1]!);
		expect(messages.length).toBeGreaterThan(0);
		expect(lifelines.length).toBeGreaterThan(0);
		for (const ink of [...messages, ...lifelines]) {
			expect(lightnessContrast(ink, page)).toBeGreaterThanOrEqual(APCA.mark);
			expect(lightnessContrast(ink, floor)).toBeGreaterThanOrEqual(APCA.mark);
		}
	});
});

test("every arrowhead has one length, whatever the emphasis of its line", async () => {
	const { svg } = seenIn(
		await renderArchitecture({ policy: DEFAULT_SEMANTIC_POLICY, content: CONTENT }),
	);
	const lengths = headedLines(svg).map(({ head, width }) => headLength(svg, head, width));
	expect(lengths).toHaveLength(3);
	for (const length of lengths) expect(length).toBeCloseTo(lengths[0]!, 1);
});
