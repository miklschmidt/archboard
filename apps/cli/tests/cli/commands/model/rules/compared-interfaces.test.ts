// What `model compare` says ahead of its answer: the structure of the lines, and
// which containers they name. The system owner reads the real command.

import { describe, expect, test } from "bun:test";
import type { Model } from "@archboard/model/content";
import { describedComparison } from "#cli/commands/model/rules/compared-interfaces.ts";

type Comparison = NonNullable<Model["comparison"]>;
type Row = Comparison["interfaceMeasures"]["containers"][number];
type Column = Comparison["interfaceMeasures"]["states"][number];

const counts = (entryPoints: number) => ({
	holdsParts: true as const,
	measures: { entryPoints, hiddenParts: 1, callers: 1, outgoing: 0, passThrough: 0 },
	entryPoints: [],
	passThrough: [],
});

const row = (name: string, ...entries: readonly number[]): Row => ({
	container: { id: `Shop#${name}`, name, kind: "module" },
	byState: entries.map(counts),
});

const column = (id: string, name: string): Column => ({
	state: { id, name, lifecycle: "draft" },
});

/**
 * The words of a reading with these measures.
 * @param states The columns.
 * @param containers The rows.
 * @returns The lines.
 */
function linesOf(states: Column[], containers: Row[]): string[] {
	const comparison: Comparison = {
		reason: "current",
		against: null,
		revision: { digest: "0", files: [] },
		interfaceChanges: { changed: [], unchanged: [] },
		interfaceMeasures: { states, containers },
		subjects: [],
	};
	return describedComparison({ success: true, comparison } as Model);
}

describe("the words of a comparison", () => {
	test("independent proposals that share a name stay apart by their identities", () => {
		const lines = linesOf(
			[column("One", "Queued"), column("Two", "Queued")],
			[row("Store", 1, 2)],
		).join("\n");
		expect(lines).toContain("Queued (One)");
		expect(lines).toContain("Queued (Two)");
	});

	test("a name no other state has stands alone", () => {
		const lines = linesOf(
			[column("One", "Queued"), column("Two", "Batched")],
			[row("Store", 1, 2)],
		);
		expect(lines.join("\n")).not.toContain("(One)");
	});

	test("a container whose counts match is counted, and one whose counts differ is listed", () => {
		const lines = linesOf(
			[column("One", "Queued"), column("Two", "Batched")],
			[row("Store", 1, 2), row("Queue", 3, 3)],
		).join("\n");
		expect(lines).toContain("Store");
		expect(lines).not.toContain('Queue"');
	});

	test("a selection that compares nothing says so, and a refusal says nothing here", () => {
		expect(describedComparison({ success: true } as Model)).toHaveLength(1);
		expect(describedComparison({ success: false })).toEqual([]);
	});
});
