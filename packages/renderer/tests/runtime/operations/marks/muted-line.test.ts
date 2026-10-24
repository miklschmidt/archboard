// A muted line is quieter by its ink alone (TASK-409).
//
// What this catches: a muted line drawn thinner than a default one, drawn with
// opacity, drawn as loud as a default one or too faint to read, and a head or a
// pulse that does not follow the muted ink. The numbers come from the drawn
// picture and the theme's tokens, so a change of either is measured, not copied.

import { expect, test } from "bun:test";

import { renderArchitecture } from "#runtime/operations/render.ts";
import {
	APCA,
	hueOf,
	lightnessContrast,
	luminance,
	seenIn,
} from "#tests/runtime/support/drawn-colours.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import type { DiagramTheme } from "@archboard/board/render-reply";
import { themeColor } from "#runtime/store/theme/source.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/** A default and a muted line, neutral and coloured, the muted ones with traffic. */
const CONTENT = orderedFixture({
	nodes: ["a", "b", "c", "d", "e"].map((id) => ({ id, name: id.toUpperCase(), kind: "service" })),
	edges: [
		{ id: "plain", from: "a", to: "b", kind: "call", emphasis: "normal" },
		{ id: "quiet", from: "a", to: "c", kind: "call", emphasis: "muted", traffic: {} },
		{ id: "sky", from: "a", to: "d", kind: "http", emphasis: "normal" },
		{ id: "pale", from: "a", to: "e", kind: "http", emphasis: "muted", traffic: {} },
	],
});

const THEMES: DiagramTheme[] = ["light", "dark"];

/**
 * The line of one relationship: its own tag, its ink, its width and its head's ink.
 * @param svg The drawn document, painted in literals.
 * @param id The relationship.
 * @returns What it is drawn with.
 */
function lineOf(svg: string, id: string) {
	const group = svg.split(`data-semantic-id="${id}"`)[1]!.split("data-semantic-id=")[0]!;
	const tag = /<path (?![^>]*ab-halo)[^>]*marker-end="url\(#([^)]+)\)"[^>]*>/u.exec(group)![0];
	const head = /marker-end="url\(#([^)]+)\)"/u.exec(tag)![1]!;
	const marker = new RegExp(`<marker id="${head}"[\\s\\S]*?</marker>`, "u").exec(svg)![0];
	return {
		tag,
		ink: /stroke="(#[0-9a-f]{6})"/u.exec(tag)![1]!,
		width: Number(/stroke-width="([\d.]+)"/u.exec(tag)![1]),
		headInk: /(?:fill|stroke)="(#[0-9a-f]{6})"/u.exec(marker)![1]!,
	};
}

/**
 * The colours of the pulses that ride one relationship: the stops of their gradient.
 * @param svg The drawn document, painted in literals.
 * @param id The relationship.
 * @returns The colours.
 */
function pulseInks(svg: string, id: string): string[] {
	const layer = svg.split(`data-traffic="${id}"`)[1]!.split(/data-(?:semantic-id|traffic)=/u)[0]!;
	return [...layer.matchAll(/stop-color="(#[0-9a-f]{6})/gu)].map((found) => found[1]!);
}

test.each(THEMES)(
	"a muted line is as wide as a default one and quieter by its ink (%s)",
	async (theme) => {
		const { svg } = seenIn(
			await renderArchitecture({ policy: DEFAULT_SEMANTIC_POLICY, content: CONTENT }),
			theme,
		);
		const page = themeColor(theme, "--background");
		for (const [loud, soft] of [
			["plain", "quiet"],
			["sky", "pale"],
		] as const) {
			const [normal, muted] = [lineOf(svg, loud), lineOf(svg, soft)];
			expect(muted.width).toBe(normal.width);
			expect(muted.tag).not.toMatch(/opacity/u);
			expect(lightnessContrast(muted.ink, page)).toBeLessThan(
				lightnessContrast(normal.ink, page) * 0.8,
			);
			expect(muted.headInk).toBe(muted.ink);
			const pulses = pulseInks(svg, soft);
			expect(pulses.length).toBeGreaterThan(0);
			for (const pulse of pulses) expect(luminance(pulse)).toBeGreaterThan(luminance(muted.ink));
		}
		// A muted neutral line still reads, and a muted coloured line keeps its hue.
		expect(lightnessContrast(lineOf(svg, "quiet").ink, page)).toBeGreaterThanOrEqual(APCA.quiet);
		expect(Math.abs(hueOf(lineOf(svg, "pale").ink) - hueOf(lineOf(svg, "sky").ink))).toBeLessThan(
			6,
		);
	},
);
