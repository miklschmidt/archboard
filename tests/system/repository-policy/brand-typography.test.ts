import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	renderWordmarkSvg,
	WORDMARK_SOURCE_SHA256,
	WORDMARK_TRACKING_EM,
} from "../../../scripts/generate-wordmark.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const assetRoot = path.join(repoRoot, "src/ui/shell/assets");
const fontRoot = path.join(assetRoot, "fonts");

const pinnedFiles = new Map([
	["Onest-wght-v1.000.ttf", "3faa4b905661849b2332e394b42f91b5bf5575e553c516caa81811e868a4d589"],
	["Onest-Medium-v1.000.ttf", WORDMARK_SOURCE_SHA256],
	["DMMono-Regular-v1.000.ttf", "55b4c98f123daebb3ed27947ba47b2af00554fc6284d639a540bcef5e6258ad2"],
	["DMMono-Medium-v1.000.ttf", "fd327daf461db87b44a87def475d251bf03b997f7c07d9680592d75dbbfaad0b"],
	["OFL-Onest-1.1.txt", "7805ccc507e6dc0c0796f1afa4f03ad413a9d302a30a24f8dbeb1aeef07a6c17"],
	["OFL-DMMono-1.1.txt", "f5898de81851415b71431c1a8ea527c88a4e79caeb23936483428d2e911af40c"],
]);

function sha256(filename: string): string {
	return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

describe("brand typography assets", () => {
	test("pins the exact redistributable font and license bytes", () => {
		for (const [filename, expectedHash] of pinnedFiles) {
			expect(sha256(path.join(fontRoot, filename))).toBe(expectedHash);
		}
		for (const filename of ["OFL-Onest-1.1.txt", "OFL-DMMono-1.1.txt"]) {
			expect(fs.readFileSync(path.join(fontRoot, filename), "utf8")).toContain(
				"SIL OPEN FONT LICENSE Version 1.1",
			);
		}

		const provenance = fs.readFileSync(path.join(fontRoot, "README.md"), "utf8");
		for (const expectedHash of pinnedFiles.values()) expect(provenance).toContain(expectedHash);
		expect(provenance).toContain("d0754ee7cddf8ba879f1f8884e3ca2b5e1b100f8");
		expect(provenance).toContain("57fadabfb200a77de2812540026c249dc3013077");
		expect(provenance).toContain("ade3d1533e06b2b1462ffcde8e08b129627ca360");
		expect(provenance).toContain("opentype.js` 1.3.4");
	});

	test("keeps the generated mark deterministic and path-only", () => {
		const generated = renderWordmarkSvg();
		expect(renderWordmarkSvg()).toBe(generated);
		expect(fs.readFileSync(path.join(assetRoot, "archboard-wordmark.svg"), "utf8")).toBe(generated);
		expect(generated).toContain(`tracking ${WORDMARK_TRACKING_EM}em`);
		expect(generated).toContain('viewBox="0 0 85.7815 13.209"');
		expect(generated.match(/<path\b/g)).toHaveLength(1);
		expect(generated.match(/<metadata>/g)).toHaveLength(1);
		expect(generated).toContain('fill="currentColor"');
		expect(generated).not.toMatch(
			/<(?:script|style|text|image|use|foreignObject|iframe)\b|\bon\w+\s*=|\b(?:href|src)\s*=/i,
		);
	});

	test("loads only the pinned application families and supported weights", () => {
		const css = fs.readFileSync(path.join(repoRoot, "src/ui/shell/shell.css"), "utf8");
		expect(css).toContain('--font-ui: "Archboard Onest";');
		expect(css).toContain('--font-mono: "Archboard DM Mono";');
		expect(css).toContain("font-synthesis: none;");
		expect(css).toContain("font-weight: 400 700;");
		expect(css).toContain("font-weight: 400;");
		expect(css).toContain("font-weight: 500;");
		expect(css).toContain("--wordmark-tracking: -0.02027027027em;");
		expect(css).toContain('mask: url("./assets/archboard-wordmark.svg")');
		expect(css).not.toMatch(/\b(?:Inter|Geist|Manrope|ui-monospace|SFMono|Consolas)\b/);
		expect(css).not.toContain("Onest-Medium-v1.000.ttf");
		expect([...css.matchAll(/src:\s*url\("([^"]+)"\)/g)].map((match) => match[1])).toEqual([
			"./assets/fonts/Onest-wght-v1.000.ttf",
			"./assets/fonts/DMMono-Regular-v1.000.ttf",
			"./assets/fonts/DMMono-Medium-v1.000.ttf",
		]);

		const boardBar = fs.readFileSync(path.join(repoRoot, "src/ui/shell/BoardBar.tsx"), "utf8");
		expect(boardBar).toContain('<svg className="wordmark" aria-label="archboard">');
		expect(boardBar).toContain("<title>archboard</title>");
		expect(boardBar).not.toContain("dangerouslySetInnerHTML");

		const declaredWeights = [
			...[...css.matchAll(/font-weight:\s*(\d+)(?:\s+(\d+))?/g)].flatMap((match) =>
				match[2] ? [Number(match[1]), Number(match[2])] : [Number(match[1])],
			),
			...[...css.matchAll(/font:\s*(\d+)\s+/g)].map((match) => Number(match[1])),
		];
		expect(declaredWeights.length).toBeGreaterThan(20);
		expect(declaredWeights.every((weight) => [400, 500, 600, 700].includes(weight))).toBe(true);

		const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
			devDependencies: Record<string, string>;
			scripts: Record<string, string>;
		};
		expect(pkg.devDependencies["opentype.js"]).toBe("1.3.4");
		expect(pkg.scripts["generate:wordmark"]).toBe("bun scripts/generate-wordmark.ts");
	});
});
