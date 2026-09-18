import { describe, expect, test } from "bun:test";
import { targetedVariant } from "@/cli/commands/semantic";

// Which variant a write lands on, where the command line and the stated change
// both get to say it. The canvas suite owns what lands where; what is owned
// here is the rule itself, on all four of its branches: the flag always decides,
// and it is spoken about exactly when it overrode something else.

describe("the variant a write is aimed at", () => {
	test("no flag leaves the stated change exactly as it arrived", () => {
		const targeted = targetedVariant({ variant: "Queued ingest", nodes: [] }, undefined);
		expect(targeted.stated["variant"]).toBe("Queued ingest");
		expect(targeted.diagnostics).toEqual([]);
	});

	test("no flag and no stated variant leaves the change without one", () => {
		const targeted = targetedVariant({ nodes: [] }, undefined);
		expect(targeted.stated).not.toHaveProperty("variant");
		expect(targeted.diagnostics).toEqual([]);
	});

	test("the flag alone selects the variant, and there is nothing to say about it", () => {
		const targeted = targetedVariant({ nodes: [] }, "Queued ingest");
		expect(targeted.stated["variant"]).toBe("Queued ingest");
		expect(targeted.diagnostics).toEqual([]);
	});

	test("the flag and the stated change written the same way is one statement", () => {
		const targeted = targetedVariant({ variant: " Queued ingest " }, "Queued ingest");
		expect(targeted.stated["variant"]).toBe("Queued ingest");
		expect(targeted.diagnostics).toEqual([]);
	});

	test("a stated variant written otherwise is overridden, and said once naming both", () => {
		const targeted = targetedVariant({ variant: "Current" }, "Queued ingest");
		expect(targeted.stated["variant"]).toBe("Queued ingest");
		expect(targeted.diagnostics).toHaveLength(1);
		expect(targeted.diagnostics[0]).toContain("Queued ingest");
		expect(targeted.diagnostics[0]).toContain("Current");
	});

	test("a stated variant that is not even a name is overridden the same way", () => {
		// The flag decides either way, so this is a line rather than a refusal —
		// but the schema behind it never sees the shape that would have been.
		const targeted = targetedVariant({ variant: 7 }, "Queued ingest");
		expect(targeted.stated["variant"]).toBe("Queued ingest");
		expect(targeted.diagnostics).toHaveLength(1);
	});
});
