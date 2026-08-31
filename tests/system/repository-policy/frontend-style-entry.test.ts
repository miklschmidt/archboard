import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const mainSource = fs.readFileSync(path.join(repoRoot, "frontend/main.tsx"), "utf8");
const htmlSource = fs.readFileSync(path.join(repoRoot, "frontend/index.html"), "utf8");
const appSource = fs.readFileSync(path.join(repoRoot, "src/ui/theme/app.css"), "utf8");

describe("frontend stylesheet entry", () => {
	test("loads the canonical Archboard application stylesheet exactly once", () => {
		const stylesheetImports = [...mainSource.matchAll(/^import ["']([^"']+[.]css)["'];$/gm)].map(
			(match) => match[1],
		);

		expect(stylesheetImports).toEqual(["../src/ui/theme/app.css"]);
		expect(htmlSource).not.toMatch(/href=["'][^"']*src\/ui\/(?:shell|theme)\//);
	});

	test("keeps Excalidraw vendor CSS explicit and ahead of the module entry", () => {
		const stylesheetLinks = [
			...htmlSource.matchAll(/<link rel="stylesheet" href="([^"]+)" \/>/g),
		].map((match) => match[1]);
		const vendorLink = '<link rel="stylesheet" href="/assets/excalidraw.css" />';
		const moduleEntry = '<script type="module" src="./main.tsx"></script>';

		expect(stylesheetLinks).toEqual(["/assets/excalidraw.css"]);
		expect(htmlSource.indexOf(vendorLink)).toBeGreaterThanOrEqual(0);
		expect(htmlSource.indexOf(vendorLink)).toBeLessThan(htmlSource.indexOf(moduleEntry));
	});

	test("builds product Button utilities without test-only candidates", () => {
		const sourceDirectives = [...appSource.matchAll(/^@source(?:\s+not)?\s+"[^"]+";$/gm)].map(
			(match) => match[0],
		);
		expect(sourceDirectives).toEqual([
			'@source "../**/*.{ts,tsx}";',
			'@source not "../**/tests/**/*.{ts,tsx}";',
		]);

		const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-production-css-"));
		try {
			const build = Bun.spawnSync(["bunx", "vite", "build", "--outDir", outputRoot], {
				cwd: repoRoot,
				stdout: "pipe",
				stderr: "pipe",
			});
			const diagnostics = `${new TextDecoder().decode(build.stdout)}${new TextDecoder().decode(build.stderr)}`;
			expect(build.exitCode, diagnostics).toBe(0);

			const builtHtml = fs.readFileSync(path.join(outputRoot, "index.html"), "utf8");
			const applicationCss = [...builtHtml.matchAll(/href="([^"]+[.]css)"/g)]
				.map((match) => match[1])
				.find((href) => href !== "/assets/excalidraw.css");
			if (!applicationCss) throw new Error("Production build emitted no application stylesheet.");
			const css = fs.readFileSync(path.join(outputRoot, applicationCss.replace(/^\//, "")), "utf8");
			for (const selector of ["min-h-touch-target", "size-touch-target", "bg-primary"]) {
				expect(css).toMatch(new RegExp(`\\.${selector}\\s*\\{`));
			}
			expect(css).not.toMatch(/\.duration-150\s*\{/);
		} finally {
			fs.rmSync(outputRoot, { recursive: true, force: true });
		}
	});
});
