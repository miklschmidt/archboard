import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const nativeFingerprint = new Set([
	"id",
	"type",
	"x",
	"y",
	"width",
	"height",
	"angle",
	"strokeColor",
	"backgroundColor",
	"fillStyle",
	"strokeWidth",
	"strokeStyle",
	"roughness",
	"opacity",
]);

interface Violation {
	file: string;
	declaration: string;
	reason: string;
}

function handwrittenViolations(file: string, source: string): Violation[] {
	const violations: Violation[] = [];
	const declarations = source.matchAll(
		/\b(?:interface|type)\s+(\w+)[^{=]*(?:=[^{]*)?\{([\s\S]*?)\}\s*;?/g,
	);
	for (const match of declarations) {
		const declaration = match[1]!;
		const text = match[0];
		const properties = new Set(
			[...text.matchAll(/\b([A-Za-z_]\w*)\??\s*:/g)].map((property) => property[1]!),
		);
		const overlap = [...nativeFingerprint].filter((name) => properties.has(name));
		const styles = [
			"strokeColor",
			"backgroundColor",
			"fillStyle",
			"strokeWidth",
			"strokeStyle",
			"roughness",
			"opacity",
		].filter((name) => properties.has(name));
		if (
			["id", "type", "x", "y"].every((name) => properties.has(name)) &&
			overlap.length >= 10 &&
			styles.length >= 4
		) {
			violations.push({
				file,
				declaration,
				reason: "handwritten Excalidraw native-field fingerprint",
			});
		}
		if (text.includes("Record<string, unknown>") && properties.has("type") && styles.length >= 4) {
			violations.push({ file, declaration, reason: "Record intersection compatibility element" });
		}
	}
	return violations;
}

function productionFiles(root: string): string[] {
	const files: string[] = [];
	for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
		const target = path.join(root, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== "tests") files.push(...productionFiles(target));
		} else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) files.push(target);
	}
	return files;
}

function ambientExceptionIsExact(source: string): boolean {
	const compact = source.replace(/\s+/g, " ");
	return (
		(source.match(/export type /g)?.length ?? 0) === 2 &&
		compact.includes(
			'LocalPoint = [x: number, y: number] & { _brand: "excalimath__localpoint" }',
		) &&
		compact.includes('Radians = number & { _brand: "excalimath__radian" }')
	);
}

describe("vendor-derived board element policy", () => {
	test("rejects renamed native copies, transport bags, Record intersections, and old optional shapes", () => {
		const cases = [
			`interface Renamed { id:string; type:string; x:number; y:number; width:number; height:number; angle:number; strokeColor:string; backgroundColor:string; fillStyle:string; strokeWidth:number; strokeStyle:string; roughness:number; opacity:number }`,
			`type Transport = { id?:string; type?:string; x?:number; y?:number; width?:number; height?:number; angle?:number; strokeColor?:string; backgroundColor?:string; fillStyle?:string; strokeWidth?:number; strokeStyle?:string; roughness?:number; opacity?:number }`,
			`type ServerElement = Record<string, unknown> & { id:string; type:string; x:number; y:number; width?:number; height?:number; angle?:number; strokeColor?:string; backgroundColor?:string; fillStyle?:string; strokeWidth?:number; strokeStyle?:string; roughness?:number; opacity?:number }`,
		];
		for (const source of cases)
			expect(handwrittenViolations("synthetic.ts", source)).not.toEqual([]);
	});

	test("allows vendor-derived and narrow domain projections", () => {
		for (const source of [
			`type Exact = Extract<VendorElement, { type: "text" }>;`,
			`type Geometry = Pick<VendorElement, "id" | "type" | "x" | "y" | "width" | "height">;`,
			`type Update = Partial<Omit<VendorElement, "type">>;`,
		])
			expect(handwrittenViolations("synthetic.ts", source)).toEqual([]);
	});

	test("production declarations contain no handwritten native copy", () => {
		const violations = productionFiles(path.join(repoRoot, "src")).flatMap((file) =>
			handwrittenViolations(path.relative(repoRoot, file), fs.readFileSync(file, "utf8")),
		);
		expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
	});

	test("the pinned ambient exception has exactly the two 0.18.1 declarations", () => {
		const file = path.join(repoRoot, "src/shared/board-elements/vendor-math-0.18.1.d.ts");
		const source = fs.readFileSync(file, "utf8");
		expect(ambientExceptionIsExact(source)).toBeTrue();
		for (const inaccurate of [
			source.replace("[x: number, y: number]", "readonly [x: number, y: number]"),
			source.replace("excalimath__radian", "radian"),
			source.replace("\n}", "\n\texport type Vector = number[];\n}"),
		])
			expect(ambientExceptionIsExact(inaccurate)).toBeFalse();
		expect(source).toContain("0.18.1");
		expect(
			fs.readFileSync(path.join(repoRoot, "docs/design/excalidraw-json-schema.md"), "utf8"),
		).toContain("vendor-math-0.18.1.d.ts");
	});
});
