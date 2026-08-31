import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import {
	assertImmutableProvenance,
	assertReviewedComponents,
	assertReviewedFixture,
	componentsPath,
	expectedProbeCommands,
	fatalProbeFailures,
	parseProposedFiles,
	probeSnapshot,
	readJson,
	repoRoot,
	reviewedComponentsJson,
	reviewedFixtures,
	runShadcnProbe,
	sha256,
	type ProbeRunner,
	type ProbeSnapshot,
} from "./support/shadcn-base-probe.ts";

const capturedInfo = JSON.stringify({
	project: { frameworkName: "vite", importAlias: "@" },
	config: {
		style: "base-nova",
		base: "base",
		iconLibrary: "lucide",
		aliases: {
			components: "@/ui",
			utils: "@/ui/ui-classnames",
			ui: "@/ui",
			lib: "@/ui",
			hooks: "@/ui",
		},
	},
	preset: { values: { iconLibrary: "lucide", font: "geist" } },
});
const capturedView = `├ src/ui/button.tsx (create) 2 lines
│ ┌────────
│ │ import { cva } from "class-variance-authority"
│ │ import { XIcon } from "lucide-react"
│ └────────
├ src/ui/dialog.tsx (create) 2 lines
│ ┌────────
│ │ import { XIcon } from "lucide-react"
│ │ const className = "rounded-xl bg-primary"
│ └────────`;

function capturedRunner(calls: string[][], view = capturedView): ProbeRunner {
	return (args) => {
		calls.push([...args]);
		return args[0] === "info"
			? { status: 0, stdout: capturedInfo, stderr: "" }
			: { status: 0, stdout: view, stderr: "" };
	};
}

function stableSnapshot(): ProbeSnapshot {
	return { status: "", binaryHeadDiffSha256: "empty", treeHashes: { "components.json": "pinned" } };
}

function failedRunner(calls: string[][]): ProbeRunner {
	return (args) => {
		calls.push([...args]);
		return { status: 1, stdout: "", stderr: "registry unavailable" };
	};
}

function expectFatal(report: ReturnType<typeof runShadcnProbe>, reason: string): void {
	expect(fatalProbeFailures(report)).toContain(reason);
}

if (process.env.ARCHBOARD_SHADCN_LIVE === "1") {
	const report = runShadcnProbe();
	const fatal = fatalProbeFailures(report);
	process.stdout.write(
		`${JSON.stringify({
			commands: report.commands,
			proposedFiles: report.proposedFiles,
			generatedDestinations: report.generatedDestinations,
			generatedImports: report.generatedImports,
			defaults: report.defaults,
			refusals: report.refusals,
			fatal,
			before: report.before,
			after: report.after,
		})}\n`,
	);
	if (fatal.length > 0) process.exitCode = 1;
} else {
	describe("shadcn Base UI adoption policy", () => {
		test("keeps the reviewed components literal byte-equivalent and icon-library-free", () => {
			const source = fs.readFileSync(componentsPath, "utf8");
			assertReviewedComponents(source);
			expect(source).toBe(reviewedComponentsJson);
			expect(sha256("components.json")).toBe(
				"b5d8f37341a1f185337f79c5ef8447e914d280bc0670a635fadeac023c7f0a8c",
			);
			expect(readJson("components.json")).toEqual({
				$schema: "https://ui.shadcn.com/schema.json",
				style: "base-nova",
				rsc: false,
				tsx: true,
				tailwind: {
					config: "",
					css: "src/ui/theme/app.css",
					baseColor: "neutral",
					cssVariables: true,
					prefix: "",
				},
				aliases: {
					components: "@/ui",
					ui: "@/ui",
					lib: "@/ui",
					utils: "@/ui/ui-classnames",
					hooks: "@/ui",
				},
			});
			expect(source).not.toContain("iconLibrary");
		});

		test("rejects hostile config, fixture, and mutable-provenance variants", () => {
			for (const variant of [
				reviewedComponentsJson.replace('"style": "base-nova"', '"style": "default"'),
				reviewedComponentsJson.replace('"hooks": "@/ui"', '"hooks": "@/other"'),
				reviewedComponentsJson.replace(
					'\t"aliases": {',
					'\t"iconLibrary": "lucide",\n\t"aliases": {',
				),
				reviewedComponentsJson.slice(0, -2) + ',\n\t"extra": true\n}\n',
				reviewedComponentsJson.replaceAll("\n", "\r\n"),
			]) {
				expect(() => assertReviewedComponents(variant)).toThrow();
			}
			expect(() => assertReviewedFixture(reviewedFixtures[0].path, "0".repeat(64))).toThrow();
			expect(() =>
				assertImmutableProvenance(
					reviewedFixtures[0].upstream.replace("b4a618b97e35f5dadf3a00d51f410c84a2567d4d", "main"),
				),
			).toThrow();
		});

		test("pins the exact named upstream fixture bytes and rejects extra vendor source", () => {
			const vendorRoot = path.join(repoRoot, "docs/design/vendor/shadcn-base");
			expect(fs.readdirSync(vendorRoot).toSorted()).toEqual(["button.tsx", "dialog.tsx"]);
			for (const fixture of reviewedFixtures) {
				assertReviewedFixture(fixture.path, fixture.hash);
				assertImmutableProvenance(fixture.upstream);
			}
		});

		test("keeps Vite, TypeScript, and Oxlint on the completed single source alias", () => {
			const vite = fs.readFileSync(path.join(repoRoot, "vite.config.js"), "utf8");
			const rootTypes = fs.readFileSync(path.join(repoRoot, "tsconfig.json"), "utf8");
			const frontendTypes = fs.readFileSync(path.join(repoRoot, "tsconfig.frontend.json"), "utf8");
			const oxlint = fs.readFileSync(
				path.join(repoRoot, "tools/oxlint-plugin-archboard.js"),
				"utf8",
			);
			expect(vite).toContain('"@": sourceRoot');
			expect(rootTypes).toContain('"@/*": ["./src/*"]');
			expect(frontendTypes).toContain('"@/*": ["./src/*"]');
			expect(oxlint).toContain('const SOURCE_ALIAS_PREFIX = "@/";');
			expect(oxlint).toContain('path.posix.join("src", source.slice(SOURCE_ALIAS_PREFIX.length))');
		});

		test("reports mutable registry defaults and refuses unreviewed source adoption", () => {
			const calls: string[][] = [];
			const report = runShadcnProbe({ run: capturedRunner(calls), snapshot: stableSnapshot });
			expect(calls).toEqual(expectedProbeCommands.map((command) => Array.from(command)));
			expect(report.proposedFiles).toEqual([
				{ path: "src/ui/button.tsx", action: "create" },
				{ path: "src/ui/dialog.tsx", action: "create" },
			]);
			expect(report.generatedImports).toEqual([
				"class-variance-authority",
				"lucide-react",
				"lucide-react",
			]);
			expect(report.defaults).toEqual({ base: "base", iconLibrary: "lucide", font: "geist" });
			expect(report.refusals).toEqual(["package/source adoption attempt", "upstream drift"]);
			expect(fatalProbeFailures(report)).toEqual([]);
			expect(report.before).toEqual(report.after);
			expect(fs.existsSync(path.join(repoRoot, "src/ui/button.tsx"))).toBe(false);
			expect(fs.existsSync(path.join(repoRoot, "src/ui/dialog.tsx"))).toBe(false);
		});

		test("parses every proposed file and action before comparing reviewed sources", () => {
			const third = `${capturedView}\n├ src/ui/helper.tsx (create) 1 lines`;
			const update = capturedView.replace(
				"src/ui/dialog.tsx (create)",
				"src/ui/dialog.tsx (update)",
			);
			expect(parseProposedFiles(third)).toContainEqual({
				path: "src/ui/helper.tsx",
				action: "create",
			});
			expect(parseProposedFiles(update)).toContainEqual({
				path: "src/ui/dialog.tsx",
				action: "update",
			});
			for (const view of [third, update]) {
				const report = runShadcnProbe({
					run: capturedRunner([], view),
					snapshot: stableSnapshot,
				});
				expect(report.refusals).toContain("generated destination/action drift");
			}
		});

		test("fails closed for mutation, dirty-before, and failed-runner hostile outcomes", () => {
			let snapshotCall = 0;
			const mutated = runShadcnProbe({
				run: capturedRunner([]),
				snapshot: () =>
					snapshotCall++ === 0
						? stableSnapshot()
						: { ...stableSnapshot(), status: " M created-by-probe" },
			});
			expectFatal(mutated, "dry-run mutation");

			const dirty = runShadcnProbe({
				run: capturedRunner([]),
				snapshot: () => ({ ...stableSnapshot(), status: " M pre-existing" }),
			});
			expectFatal(dirty, "dirty-before");

			const failed = runShadcnProbe({ run: failedRunner([]), snapshot: stableSnapshot });
			expect(failed.refusals).toContain("network unable-to-verify");
			expectFatal(failed, "network unable-to-verify");
		});

		test("blocks unsafe add commands before a runner or registry can execute them", () => {
			const calls: string[][] = [];
			const report = runShadcnProbe({
				run: capturedRunner(calls),
				snapshot: stableSnapshot,
				addArgs: ["add", "button", "dialog", "--yes", "--overwrite"],
			});
			expect(calls).toEqual([["info", "--json"]]);
			expect(report.refusals).toContain("unsafe command");
			expectFatal(report, "unsafe command");
			expect(report.before).toEqual(report.after);
		});

		test("the standard owner uses only offline runner doubles", () => {
			const before = probeSnapshot();
			const report = runShadcnProbe({ run: capturedRunner([]), snapshot: stableSnapshot });
			const after = probeSnapshot();
			expect(report.before).toEqual(report.after);
			expect(after).toEqual(before);
		});
	});
}
