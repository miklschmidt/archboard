import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const mainSource = fs.readFileSync(path.join(repoRoot, "frontend/main.tsx"), "utf8");
const htmlSource = fs.readFileSync(path.join(repoRoot, "frontend/index.html"), "utf8");

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
});
