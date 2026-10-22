import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { cssProblems, cssReferences, stylesheetFiles } from "../../../tools/css-imports.ts";
import { linkInto, repoRoot, withProject } from "./support/oxlint-project.ts";

const stylesheet = "apps/web/src/ui/theme/app.css";

function fixture(): Record<string, string> {
	return {
		"apps/web/package.json": JSON.stringify({
			name: "@archboard-app/web",
			imports: { "#*": "./src/*" },
		}),
		[stylesheet]: '@import "@archboard/renderer/theme.css" source(none);',
		"apps/web/src/ui/theme/local.css": "",
		"apps/web/src/ui/theme/local.woff2": "font",
		"packages/renderer/package.json": JSON.stringify({
			name: "@archboard/renderer",
			imports: { "#*": "./src/*" },
			exports: {
				"./theme.css": "./assets/theme.css",
				"./font.woff2": "./assets/font.woff2",
				"./server.css": "./src/server/styles/server.css",
				"./testing": "./tests/style.css",
			},
		}),
		"packages/renderer/assets/theme.css": "",
		"packages/renderer/assets/font.woff2": "font",
		"packages/renderer/assets/private.css": "",
		"packages/renderer/src/server/styles/server.css": "",
		"packages/renderer/tests/style.css": "",
	};
}

describe("CSS import boundaries", () => {
	test("the native parser reads Tailwind imports, escapes and URLs without comments, text or scan globs", () => {
		const code = String.raw`
/* @import "../comment.css"; url("../comment.woff2") */
@import "@archboard/renderer/theme.css" source(none);
@reference "#ui/theme/local.css";
@source "../../../../../packages/*/src/ui/**/*";
.a { content: 'url("../text.woff2")'; background: URL("\40 archboard/renderer/font.woff2"); }
.b { mask: url(#mask); background: url(data:image/svg+xml,test); }
@import "https://example.com/theme.css";
`;
		const references = cssReferences(code, stylesheet);
		expect(references.map(({ url }) => url)).toEqual([
			"@archboard/renderer/theme.css",
			"#ui/theme/local.css",
			"@archboard/renderer/font.woff2",
		]);
		expect(references[0]?.loc.line).toBe(3);
	});

	test("manifest imports, public assets and external packages pass", async () => {
		await withProject(fixture(), (root) => {
			const code = `
@import "tailwindcss" source(none);
@import "@archboard/renderer/theme.css?inline#theme";
@import "#ui/theme/local.css";
@font-face { src: url("@archboard/renderer/font.woff2"); }
`;
			expect(cssProblems(root, stylesheet, code)).toEqual([]);
		});
	});

	test("private assets, app imports, server exports and unresolved aliases earn the existing rule reasons", async () => {
		await withProject(fixture(), (root) => {
			const refused: [string, string][] = [
				[
					'@import "@archboard/renderer/assets/private.css" source(none);',
					"noDeepImportAcrossPackages",
				],
				['@reference "@archboard/renderer/assets/private.css";', "noDeepImportAcrossPackages"],
				['@import "@archboard-app/web";', "noImportOfApp"],
				['.a { background: url("@archboard/renderer/server.css"); }', "noForbiddenAreaImport"],
				['@import "@archboard/renderer/testing";', "noProductTestImport"],
				['@import "#ui/theme/missing.css";', "noUnresolvedSubpathImport"],
				['@import "@/ui/theme/local.css";', "noRetiredAlias"],
				['.a { background: url("local.woff2"); }', "useAlias"],
				['@import "./local.css";', "useAlias"],
			];
			for (const [code, reason] of refused) {
				expect(
					cssProblems(root, stylesheet, code).map(({ messageId }) => messageId),
					code,
				).toContain(reason);
			}
		});
	});

	test("filesystem and workspace symlink paths cannot bypass private asset ownership", async () => {
		await withProject(fixture(), (root) => {
			linkInto(root, "node_modules/@archboard/renderer", "packages/renderer");
			for (const target of [
				"../../../../../packages/renderer/assets/private.css",
				"../../../../../node_modules/@archboard/renderer/assets/private.css",
			]) {
				const problems = cssProblems(root, stylesheet, `@import "${target}";`);
				expect(problems.map(({ messageId }) => messageId)).toEqual([
					"noDeepImportAcrossPackages",
					"useAlias",
				]);
			}
			expect(
				cssProblems(
					root,
					"packages/renderer/assets/theme.css",
					'@import "@archboard-app/web";',
				).map(({ messageId }) => messageId),
			).toContain("noImportOfApp");
		});
	});

	test("the lint command discovers package assets and exits nonzero for a boundary violation", async () => {
		await withProject(fixture(), (root) => {
			const command = [process.execPath, path.join(repoRoot, "scripts/lint-css.ts")];
			const clean = Bun.spawnSync(command, { cwd: root, stdout: "pipe", stderr: "pipe" });
			expect(clean.exitCode, clean.stderr.toString()).toBe(0);
			const target = "packages/renderer/assets/theme.css";
			expect(stylesheetFiles(root)).toContain(target);
			fs.writeFileSync(path.join(root, target), '@import "@archboard-app/web";');
			const refused = Bun.spawnSync(command, { cwd: root, stdout: "pipe", stderr: "pipe" });
			expect(refused.exitCode).toBe(1);
			expect(refused.stderr.toString()).toContain("(noImportOfApp)");
		});
	});
});
