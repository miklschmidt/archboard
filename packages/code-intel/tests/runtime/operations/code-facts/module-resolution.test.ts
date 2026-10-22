import { expect, test } from "bun:test";
import { createModuleResolver } from "#runtime/operations/code-facts/modules/module-resolution.ts";

/**
 * Resolve against listed source texts without a filesystem checkout.
 * @param sources The snapshot files.
 * @returns The resolver.
 */
function resolver(sources: Record<string, string>) {
	return createModuleResolver(
		{ root: "/snapshot-only", files: new Set(Object.keys(sources)) },
		(file) => sources[file],
	);
}

test("local imports use the nearest package and the exact or longest mapping, including blocked targets", () => {
	const resolve = resolver({
		"package.json": JSON.stringify({ imports: { "#root": "./root.ts" } }),
		"root.ts": "",
		"apps/web/package.json": JSON.stringify({
			imports: {
				"#*": "./src/*",
				"#tests/*": "./tests/*",
				"#tests/special": "./special.js",
				"#tests/blocked": null,
				"#tests/missing": "./absent.ts",
				"#tests/*.js": "./specific/*.js",
			},
		}),
		"apps/web/src/ui/main.ts": "",
		"apps/web/src/ui/target.ts": "",
		"apps/web/tests/target.ts": "",
		"apps/web/tests/blocked.ts": "",
		"apps/web/tests/missing.ts": "",
		"apps/web/tests/special.ts": "",
		"apps/web/special.ts": "",
		"apps/web/specific/target.ts": "",
		"apps/web/nested/package.json": "{}",
	}).resolve;
	const from = "apps/web/src/ui/main.ts";
	expect(resolve(from, "#ui/target.ts")).toBe("apps/web/src/ui/target.ts");
	expect(resolve(from, "#tests/target.ts")).toBe("apps/web/tests/target.ts");
	expect(resolve(from, "#tests/special")).toBe("apps/web/special.ts");
	expect(resolve(from, "#tests/target.js")).toBe("apps/web/specific/target.ts");
	expect(resolve(from, "#tests/blocked")).toBeUndefined();
	expect(resolve(from, "#tests/missing")).toBeUndefined();
	expect(resolve(from, "#root")).toBeUndefined();
	expect(resolve("apps/web/nested/main.ts", "#ui/target.ts")).toBeUndefined();
});

test("workspace imports use root membership and declared public exports, without private or dependency fallbacks", () => {
	const resolve = resolver({
		"package.json": JSON.stringify({ workspaces: ["packages/*", "apps/*"] }),
		"tsconfig.json": JSON.stringify({
			compilerOptions: { paths: { "@archboard/kit/*": ["packages/kit/src/*"] } },
		}),
		"packages/kit/package.json": JSON.stringify({
			name: "@archboard/kit",
			exports: {
				".": "./src/main.js",
				"./*": "./src/public/*.js",
				"./parts/*": "./src/parts/*.js",
				"./parts/exact": "./src/exact.ts",
				"./blocked": null,
			},
		}),
		"packages/kit/src/main.ts": "",
		"packages/kit/src/private.ts": "",
		"packages/kit/src/public/item.ts": "",
		"packages/kit/src/public/blocked.ts": "",
		"packages/kit/src/parts/item.ts": "",
		"packages/kit/src/exact.ts": "",
		"packages/plain/package.json": JSON.stringify({ name: "plain", exports: "./main.js" }),
		"packages/plain/main.ts": "",
		"packages/closed/package.json": JSON.stringify({ name: "closed" }),
		"packages/closed/index.ts": "",
		"vendor/external/package.json": JSON.stringify({ name: "external", exports: "./main.ts" }),
		"vendor/external/main.ts": "",
	}).resolve;
	const from = "apps/web/src/main.ts";
	expect(resolve(from, "@archboard/kit")).toBe("packages/kit/src/main.ts");
	expect(resolve(from, "@archboard/kit/item")).toBe("packages/kit/src/public/item.ts");
	expect(resolve(from, "@archboard/kit/parts/item")).toBe("packages/kit/src/parts/item.ts");
	expect(resolve(from, "@archboard/kit/parts/exact")).toBe("packages/kit/src/exact.ts");
	expect(resolve(from, "plain")).toBe("packages/plain/main.ts");
	for (const specifier of [
		"@archboard/kit/private",
		"@archboard/kit/blocked",
		"closed",
		"external",
		"react",
		"node:fs",
	])
		expect(resolve(from, specifier)).toBeUndefined();
});

test("manifest targets and wildcard substitutions cannot traverse outside their package or redirect to dependencies", () => {
	const resolve = resolver({
		"package.json": JSON.stringify({ workspaces: ["packages/*"] }),
		"apps/web/package.json": JSON.stringify({
			imports: {
				"#*": "./src/*",
				"#escape": "./../../../outside.ts",
				"#sibling": "./../../sibling.ts",
				"#absolute": "/outside.ts",
				"#dependency": "external",
			},
		}),
		"packages/kit/package.json": JSON.stringify({
			name: "kit",
			exports: { "./*": "./src/*", "./escape": "./../../../outside.ts" },
		}),
		"outside.ts": "",
		"sibling.ts": "",
		"apps/web/package.ts": "",
		"packages/kit/package.ts": "",
		"packages/kit/src/node_modules/private.ts": "",
	}).resolve;
	for (const specifier of [
		"#escape",
		"#sibling",
		"#absolute",
		"#dependency",
		"#../package.ts",
		"kit/../package.ts",
		"kit/node_modules/private.ts",
		"kit/escape",
	])
		expect(resolve("apps/web/src/main.ts", specifier)).toBeUndefined();
});
