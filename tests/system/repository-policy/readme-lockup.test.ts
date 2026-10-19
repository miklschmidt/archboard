import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MARK } from "../../../scripts/readme-assets/lockup.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Every value one attribute takes in a source text, in order.
 * @param source The text.
 * @param attribute The attribute's name.
 * @returns The values.
 */
function valuesOf(source: string, attribute: string): string[] {
	return [...source.matchAll(new RegExp(`\\b${attribute}="([^"]*)"`, "g"))].map(
		(match) => match[1] ?? "",
	);
}

describe("the README banner's lockup", () => {
	test("draws the mark the shell draws", () => {
		const brand = fs.readFileSync(
			path.join(repoRoot, "apps/web/src/ui/components/shell/Brand.tsx"),
			"utf8",
		);
		const { gradient } = MARK;

		expect(valuesOf(brand, "viewBox")).toEqual([MARK.viewBox]);
		expect(valuesOf(brand, "d")).toEqual([...MARK.fills, MARK.swoosh.d]);
		expect(valuesOf(brand, "strokeWidth")).toEqual([MARK.swoosh.width]);
		expect(["x1", "y1", "x2", "y2"].map((name) => valuesOf(brand, name))).toEqual([
			[gradient.x1],
			[gradient.y1],
			[gradient.x2],
			[gradient.y2],
		]);
	});
});
