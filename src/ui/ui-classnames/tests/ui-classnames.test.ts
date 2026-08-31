import { describe, expect, test } from "bun:test";

import * as classnames from "../index";
import { cn } from "../index";

describe("cn public module", () => {
	test("exposes only the named cn entrypoint", () => {
		expect(Object.keys(classnames)).toEqual(["cn"]);
		expect(cn).toBeTypeOf("function");
	});

	test("resolves stock and Archboard semantic Tailwind conflicts by precedence", () => {
		expect(
			cn(
				"bg-primary bg-secondary",
				"text-foreground text-muted-foreground",
				"border-border border-border-subtle",
				"px-2 py-1 p-4",
			),
		).toBe("bg-secondary text-muted-foreground border-border-subtle p-4");
	});

	test("preserves named semantic radius tokens that the default merger cannot classify", () => {
		expect(cn("rounded-control rounded-panel")).toBe("rounded-control rounded-panel");
	});

	test("keeps variant conflicts isolated and uses the last class at each variant", () => {
		expect(
			cn("hover:bg-primary hover:bg-secondary", "md:px-2 md:px-4", "focus:text-foreground"),
		).toBe("hover:bg-secondary md:px-4 focus:text-foreground");
	});

	test("accepts ordinary clsx falsy and nested inputs", () => {
		const optionalClass = { hidden: false };

		expect(
			cn(
				"inline-flex",
				optionalClass.hidden && "hidden",
				["items-center", null, ["gap-2", { "gap-4": true, hidden: false }]],
				undefined,
				0,
			),
		).toBe("inline-flex items-center gap-4");
	});

	test("preserves deterministic order, duplicate handling, and unrelated classes", () => {
		const first = cn(
			"pointer-events-none",
			"custom-marker",
			"pointer-events-none",
			"[mask-type:luminance]",
		);
		const second = cn(
			"pointer-events-none",
			"custom-marker",
			"pointer-events-none",
			"[mask-type:luminance]",
		);

		expect(first).toBe("custom-marker pointer-events-none [mask-type:luminance]");
		expect(second).toBe(first);
		expect(cn("custom-marker custom-marker", "vendor-token", "not-a-tailwind-class")).toBe(
			"custom-marker custom-marker vendor-token not-a-tailwind-class",
		);
		expect(cn("flex flex", "items-center items-center")).toBe("flex items-center");
	});

	test("does not mutate caller-owned nested arrays or dictionaries", () => {
		const nested = ["p-2", ["text-foreground", { "font-medium": true }]];
		const classes = { "bg-primary": true, "bg-secondary": false };
		const nestedBefore = structuredClone(nested);
		const classesBefore = structuredClone(classes);

		cn(nested, classes);

		expect(nested).toEqual(nestedBefore);
		expect(classes).toEqual(classesBefore);
	});

	test("keeps independent calls independent", () => {
		expect(cn("bg-primary", "text-foreground")).toBe("bg-primary text-foreground");
		expect(cn("bg-destructive", "text-destructive-foreground")).toBe(
			"bg-destructive text-destructive-foreground",
		);
		expect(cn("bg-primary", "text-foreground")).toBe("bg-primary text-foreground");
	});
});
