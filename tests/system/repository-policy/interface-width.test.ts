import { describe, expect, test } from "bun:test";
import { parse } from "@babel/parser";
import { getBindingIdentifiers, type Declaration } from "@babel/types";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ownersIn, resolveSource, type Owner } from "./support/package-sources.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const packagesRoot = path.resolve(here, "../../../packages");

// The width of an interface is the number of names its public entries export (ADR 0058). Each
// package has a recorded ceiling, and a package that exports more names fails. Lower a ceiling
// when a package gets narrower. Never raise one: design a deeper operation instead.
const CEILINGS = JSON.parse(
	fs.readFileSync(path.join(here, "interface-width-ceilings.json"), "utf8"),
) as Record<string, number>;

const CODE_FILE = /\.tsx?$/;

function declaredNames(declaration: Declaration | null | undefined): string[] {
	if (!declaration) return [];
	if (declaration.type === "VariableDeclaration")
		return declaration.declarations.flatMap(({ id }) => Object.keys(getBindingIdentifiers(id)));
	return "id" in declaration && declaration.id?.type === "Identifier" ? [declaration.id.name] : [];
}

/** The names a module exports, with each `export *` followed to the names of its source. */
function exportedNames(
	file: string,
	owners: readonly Owner[],
	seen = new Set<string>(),
): Set<string> {
	const names = new Set<string>();
	if (seen.has(file)) return names;
	seen.add(file);
	const { program } = parse(fs.readFileSync(file, "utf8"), {
		sourceType: "unambiguous",
		plugins: ["typescript", "jsx"],
	});
	for (const statement of program.body) {
		if (statement.type === "ExportDefaultDeclaration") names.add("default");
		if (statement.type === "ExportAllDeclaration") {
			const source = resolveSource(file, statement.source.value, owners);
			for (const name of source ? exportedNames(source, owners, seen) : [])
				if (name !== "default") names.add(name);
		}
		if (statement.type !== "ExportNamedDeclaration") continue;
		for (const { exported } of statement.specifiers)
			names.add(exported.type === "Identifier" ? exported.name : exported.value);
		for (const name of declaredNames(statement.declaration)) names.add(name);
	}
	return names;
}

/** The names that the code entries of a package's `exports` export, summed over its entries. */
function interfaceWidth(owner: Owner, owners: readonly Owner[]): number {
	return Object.values(owner.exports)
		.filter((target) => CODE_FILE.test(target))
		.reduce(
			(width, target) => width + exportedNames(path.resolve(owner.directory, target), owners).size,
			0,
		);
}

describe("interface width", () => {
	const packages = ownersIn(packagesRoot, "");

	test("the ceiling file lists exactly the packages that exist", () => {
		expect(Object.keys(CEILINGS).toSorted()).toEqual(packages.map(({ id }) => id).toSorted());
	});

	test("no package exports more names than its ceiling", () => {
		const over = packages.flatMap((owner) => {
			const width = interfaceWidth(owner, packages);
			const ceiling = CEILINGS[owner.id] ?? 0;
			return width > ceiling
				? [
						`${owner.id} exports ${width} names, over its ceiling of ${ceiling}. ` +
							"Design a deeper operation that callers need instead of raising the ceiling (ADR 0058).",
					]
				: [];
		});
		expect(over).toEqual([]);
	});

	test("the count sees every form of export, in a synthetic package", () => {
		// Catches a count that misses a form of export, so an interface could grow unseen.
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-interface-width-"));
		try {
			const files: Record<string, string> = {
				"alpha/package.json": JSON.stringify({
					name: "@archboard/alpha",
					imports: { "#*": "./src/*" },
					exports: { ".": "./src/api/entry.ts", "./theme.css": "./assets/theme.css" },
				}),
				"alpha/src/api/entry.ts": [
					`export { a, b as renamed } from "#rules/a.ts";`,
					`export type { T } from "#rules/a.ts";`,
					`export { type U } from "#rules/a.ts";`,
					`export * from "#rules/star.ts";`,
					`export * as namespace from "#rules/star.ts";`,
					`export const c = 1, { d } = { d: 2 };`,
					`export function f(x: string): string;`,
					`export function f(x: string) { return x; }`,
					`export class K {}`,
					`export interface I {}`,
					`export type J = string;`,
					`export enum E { A }`,
					`export default 1;`,
				].join("\n"),
				"alpha/src/rules/star.ts": `export const s = 1;\nexport default 2;\nexport * from "../api/entry.ts";\n`,
			};
			for (const [file, text] of Object.entries(files)) {
				fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
				fs.writeFileSync(path.join(root, file), text);
			}
			const owners = ownersIn(root, "");
			const [alpha] = owners;
			if (!alpha) throw new Error("the synthetic package is missing");
			const entry = path.join(alpha.directory, "src/api/entry.ts");
			expect([...exportedNames(entry, owners)].toSorted()).toEqual(
				"E I J K T U a c d default f namespace renamed s".split(" "),
			);
			expect(interfaceWidth(alpha, owners)).toBe(14);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
