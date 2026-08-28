import { describe, expect, test } from "bun:test";

import { canMeasure, faceFileFor, measureLineWidth, measureText } from "../measure-text.ts";
import { faceStack, familyOf, fontRegistry, lineHeightOf, loadFace } from "../fonts.ts";

const TOLERANCE = 0.002;
const EXCALIFONT = 5;
const VIRGIL = 1;
const HELVETICA = 2;
const NUNITO = 6;
const LIBERATION = 9;

function expectWidth(got: number, chrome: number): void {
	expect(Math.abs(got - chrome)).toBeLessThanOrEqual(TOLERANCE);
}

function advanceSum(text: string, fontSize: number, fontFamily: number): number {
	return Array.from(text).reduce(
		(total, character) => total + measureLineWidth(character, fontSize, fontFamily),
		0,
	);
}

describe("browser-captured text widths", () => {
	test.each([
		["a standalone caption", 203.6598],
		["AuthService", 114.4999],
		["Queue", 58.7599],
		["Gate", 48.92],
		["gRPC", 52.36],
	] as const)('Excalifont measures "%s" within 0.002 px of Chrome', (text, chrome) => {
		expectWidth(measureLineWidth(text, 20, EXCALIFONT), chrome);
	});

	test("Virgil matches the independent 16 px board measurement within 0.01 px", () => {
		const measured = measureLineWidth("AuthService", 16, VIRGIL);
		expectWidth(measured, 90.544);
		expect(Math.abs(measured - 90.54)).toBeLessThan(0.01);
	});

	test.each([12, 14, 16, 20, 28, 36])("Excalifont width remains linear at %i px", (size) => {
		expectWidth(measureLineWidth("AuthService", size, EXCALIFONT), (114.4999 * size) / 20);
	});
});

describe("font shaping", () => {
	test.each([
		["To", 1.8],
		["P.", 2.0],
		["LT", 1.4],
		["postgres://primary", 4.0],
		["Kafka topic: orders.v2", 1.0],
	] as const)('Excalifont kerns "%s" by the browser-captured amount', (text, saving) => {
		const measured = measureLineWidth(text, 20, EXCALIFONT);
		expectWidth(advanceSum(text, 20, EXCALIFONT) - measured, saving);
	});

	test.each(["office", "ffi", "ffl"])(
		"the chained contextual lookup ligates %s by 1.82 px",
		(text) => {
			const measured = measureLineWidth(text, 20, EXCALIFONT);
			expectWidth(advanceSum(text, 20, EXCALIFONT) - measured, 1.82);
		},
	);

	test("ffi is narrower than the same glyphs in a non-ligating order", () => {
		expect(measureLineWidth("ffi", 20, EXCALIFONT)).toBeLessThan(
			measureLineWidth("fif", 20, EXCALIFONT),
		);
	});

	test("Liberation Sans does not kern across a space", () => {
		const measured = measureLineWidth(" A", 100, LIBERATION);
		expectWidth(measured, 94.4824);
		expectWidth(measured, advanceSum(" A", 100, LIBERATION));
	});

	test.each(["a\u00adb", "a\u200bb"])("%s lays out like ab", (text) => {
		expectWidth(measureLineWidth(text, 20, EXCALIFONT), measureLineWidth("ab", 20, EXCALIFONT));
	});
});

describe("text boxes and line heights", () => {
	test("height is font size times family line height times line count", () => {
		expect(measureText("one line", 20, EXCALIFONT).height).toBe(20 * 1.25);
		expect(measureText("two\nlines", 20, EXCALIFONT).height).toBe(20 * 1.25 * 2);
		expect(measureText("two\nlines", 20, NUNITO).height).toBe(20 * 1.35 * 2);
	});

	test("a multi-line text is as wide as its widest line", () => {
		expect(measureText("a\nbb\nc", 20, EXCALIFONT).width).toBe(
			measureLineWidth("bb", 20, EXCALIFONT),
		);
	});

	test.each([
		["Excalifont", 1.25],
		["Virgil", 1.25],
		["Comic Shanns", 1.25],
		["Nunito", 1.35],
		["Cascadia", 1.2],
		["Lilita One", 1.15],
		["Liberation Sans", 1.15],
	] as const)("%s uses Excalidraw's %f line height", (name, lineHeight) => {
		const family = fontRegistry().get(name);
		expect(family?.lineHeight).toBe(lineHeight);
		if (family?.fontFamily !== undefined) expect(lineHeightOf(family.fontFamily)).toBe(lineHeight);
	});
});

describe("font registry", () => {
	test.each([
		["Excalifont", 7],
		["Nunito", 5],
		["Comic Shanns", 4],
		["Lilita One", 2],
		["Cascadia", 1],
		["Virgil", 1],
		["Liberation Sans", 1],
		["Xiaolai", 209],
	] as const)("the shipped %s registry has %i faces", (name, count) => {
		expect(fontRegistry().get(name)?.faces).toHaveLength(count);
	});

	test.each([
		[1, "Virgil"],
		[3, "Cascadia"],
		[5, "Excalifont"],
		[6, "Nunito"],
		[7, "Lilita One"],
		[8, "Comic Shanns"],
		[9, "Liberation Sans"],
	] as const)("font family %i names %s", (number, name) => {
		expect(familyOf(number)?.name).toBe(name);
	});

	test("local Helvetica refuses measurement and reports every character missing", () => {
		expect(canMeasure(HELVETICA)).toBe(false);
		expect(canMeasure(EXCALIFONT)).toBe(true);
		expect(canMeasure(VIRGIL)).toBe(true);
		expect(measureText("anything", 20, HELVETICA).missing).toHaveLength(8);
	});
});

describe("face selection", () => {
	test("Nunito ASCII follows its declared unicode range instead of cmap coverage", () => {
		const nunito = fontRegistry().get("Nunito")!;
		const carriesA = nunito.faces.filter((face) => loadFace(face.file).font.cmap.has(0x41));
		const declaresA = nunito.faces.filter(
			(face) =>
				face.ranges === null || face.ranges.some(([start, end]) => 0x41 >= start && 0x41 <= end),
		);
		expect(carriesA.length).toBeGreaterThan(1);
		expect(declaresA.length).toBeGreaterThanOrEqual(1);
		expect(carriesA[0]).not.toBe(declaresA.at(-1));
		expect(faceFileFor(0x41, NUNITO)).toBe(declaresA.at(-1)?.file);
	});

	test("Excalifont Latin comes from the subset that declares Latin", () => {
		expect(faceFileFor(0x41, EXCALIFONT)).toBe(fontRegistry().get("Excalifont")?.faces[0]?.file);
	});

	test("Excalifont falls through its seven faces before Xiaolai's 209", () => {
		const stack = faceStack(EXCALIFONT);
		expect(stack).toHaveLength(2);
		expect(stack[0]).toHaveLength(7);
		expect(stack[1]).toHaveLength(209);
		expect(measureText("A", 20, EXCALIFONT).missing).toHaveLength(0);
		expect(measureLineWidth("A", 20, EXCALIFONT)).toBe(measureLineWidth("A", 20, EXCALIFONT));
	});
});

describe("font cache", () => {
	test("one face file parses once per process", () => {
		const file = fontRegistry().get("Excalifont")!.faces[0]!.file;
		expect(loadFace(file)).toBe(loadFace(file));
	});

	test("2,000 warm measurements complete within 500 ms", () => {
		measureLineWidth("AuthService", 20, EXCALIFONT);
		const started = performance.now();
		for (let iteration = 0; iteration < 2_000; iteration += 1) {
			measureLineWidth("AuthService", 20, EXCALIFONT);
		}
		expect(performance.now() - started).toBeLessThan(500);
	});
});
