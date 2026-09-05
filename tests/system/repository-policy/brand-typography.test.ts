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

test("uses Remix Icon for application icons and shadcn generation", () => {
	const config: unknown = JSON.parse(
		fs.readFileSync(path.join(repoRoot, "components.json"), "utf8"),
	);
	const pkg: unknown = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
	expect(config).toMatchObject({ iconLibrary: "remixicon" });
	expect(pkg).toMatchObject({ dependencies: { "@remixicon/react": expect.any(String) } });
	for (const filename of new Bun.Glob("src/ui/**/*.tsx").scanSync({ cwd: repoRoot })) {
		if (filename.includes("/tests/")) continue;
		const source = fs.readFileSync(path.join(repoRoot, filename), "utf8");
		// The wordmark and canvas path overlay are artwork, not interface icons.
		if (!["src/ui/shell/BoardBar.tsx", "src/ui/canvas/CanvasPane.tsx"].includes(filename)) {
			expect(source, `${filename}: use Remix Icon instead of custom SVG icons`).not.toMatch(
				/<svg\b/,
			);
		}
		expect(source, `${filename}: use Remix Icon instead of text icon substitutes`).not.toMatch(
			/[↗›×⏵⌄⌃]/,
		);
	}
});

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
});
