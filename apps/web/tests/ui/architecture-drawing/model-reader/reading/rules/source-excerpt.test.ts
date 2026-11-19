import { expect, test } from "bun:test";
import { excerptOf } from "#ui/architecture-drawing/model-reader/reading/rules/source-excerpt.ts";

const TEXT = Array.from({ length: 10 }, (_, index) => `line ${index + 1}`).join("\n");

test("the excerpt shows 3 lines on each side of the line, and fewer at the ends of the file", () => {
	expect(excerptOf(TEXT, 5)).toEqual({
		first: 2,
		lines: ["line 2", "line 3", "line 4", "line 5", "line 6", "line 7", "line 8"],
	});
	expect(excerptOf(`${TEXT}\n`, 1)).toEqual({
		first: 1,
		lines: ["line 1", "line 2", "line 3", "line 4"],
	});
	expect(excerptOf(`${TEXT}\r\n`, 10)?.lines.at(-1)).toBe("line 10");
});

test("a line the file does not have has no excerpt, and a long line is cut", () => {
	expect(excerptOf(`${TEXT}\n`, 11)).toBeNull();
	expect(excerptOf("x".repeat(300), 1)?.lines[0]).toBe(`${"x".repeat(240)}…`);
});
