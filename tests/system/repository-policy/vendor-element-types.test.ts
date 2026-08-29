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

const inputIngressAllowlist = new Set([
	"src/runtime/engine/apply-element-input.ts",
	"src/runtime/engine/expand-elements.ts",
	"src/runtime/engine/labels.ts",
	"src/runtime/engine/lib/agent-element-input.ts",
	"src/runtime/engine/lib/element-input-schema.ts",
]);

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
		const relationshipFields = [
			"isDeleted",
			"containerId",
			"boundElements",
			"startBinding",
			"endBinding",
			"frameId",
			"groupIds",
		].filter((name) => properties.has(name));
		if (properties.has("id") && properties.has("type") && relationshipFields.length >= 4) {
			violations.push({
				file,
				declaration,
				reason: "handwritten Excalidraw relationship projection",
			});
		}
	}
	return violations;
}

function aliasReadViolations(file: string, source: string): Violation[] {
	if (inputIngressAllowlist.has(file)) return [];
	if (!file.startsWith("src/runtime/") && !file.startsWith("src/ui/")) return [];
	const patterns = [
		{
			reason: "runtime input alias read",
			re: /(?<!\.)\b(?:element|el|input|raw|rest|source|statement)\s*\.\s*(?:label|start|end|startElementId|endElementId)\b/,
		},
		{
			reason: "runtime input alias indexed read",
			re: /\[\s*["'](?:label|start|end|startElementId|endElementId)["']\s*\]/,
		},
		{
			reason: "runtime object-point input read",
			re: /Array\.isArray\([^\n]*(?:point|entry)[^\n]*\)[^\n]*\?[^\n]*:[^\n]*(?:point|entry)\s*\.\s*[xy]\b/,
		},
		{
			reason: "runtime string-font input read",
			re: /typeof\s+[^\n;]*fontFamily[^\n;]*===\s*["']string["']/,
		},
		{
			reason: "runtime binding extension read",
			re: /(?:\b(?:binding|startBinding|endBinding)\s*\.\s*mode\b|\.\.\.\s*(?:startBinding|endBinding|startRecord|endRecord)\b)/,
		},
	];
	return patterns.flatMap(({ reason, re }) =>
		re.test(source) ? [{ file, declaration: "runtime source", reason }] : [],
	);
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
			`type QuietCopy = { id:string; type:string; isDeleted?:boolean; containerId?:string|null; boundElements?:unknown[]; startBinding?:unknown; endBinding?:unknown }`,
		];
		for (const source of cases)
			expect(handwrittenViolations("synthetic.ts", source)).not.toEqual([]);
	});

	test("rejects runtime input-alias reads outside the named ingress owners", () => {
		for (const source of [
			`const value = element.label;`,
			`const value = raw["start"];`,
			`const value = input.endElementId;`,
			`const point = Array.isArray(entry) ? entry : [entry.x, entry.y];`,
			`const family = typeof raw.fontFamily === "string" ? raw.fontFamily : 5;`,
			`const binding = { ...startBinding, elementId };`,
			`const mode = binding.mode;`,
		])
			expect(aliasReadViolations("src/runtime/engine/consumer.ts", source)).not.toEqual([]);
		expect(
			aliasReadViolations("src/runtime/engine/lib/agent-element-input.ts", `raw.start; raw.label`),
		).toEqual([]);
		expect(
			aliasReadViolations(
				"src/runtime/engine/consumer.ts",
				`type View = Pick<RuntimeBoardElement, "id" | "type">; const point = geometry.x;`,
			),
		).toEqual([]);
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
		const violations = productionFiles(path.join(repoRoot, "src")).flatMap((file) => {
			const relative = path.relative(repoRoot, file);
			const source = fs.readFileSync(file, "utf8");
			return handwrittenViolations(relative, source).concat(aliasReadViolations(relative, source));
		});
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
