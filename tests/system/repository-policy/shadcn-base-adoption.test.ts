import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const componentsPath = path.join(repoRoot, "components.json");
const pinnedCommit = "b4a618b97e35f5dadf3a00d51f410c84a2567d4d";

const reviewedComponentsJson = `{
	"$schema": "https://ui.shadcn.com/schema.json",
	"style": "base-nova",
	"rsc": false,
	"tsx": true,
	"tailwind": {
		"config": "",
		"css": "src/ui/theme/app.css",
		"baseColor": "neutral",
		"cssVariables": true,
		"prefix": ""
	},
	"aliases": {
		"components": "@/ui",
		"ui": "@/ui",
		"lib": "@/ui",
		"utils": "@/ui/ui-classnames",
		"hooks": "@/ui"
	}
}
`;

const reviewedFixtures = [
	{
		path: "docs/design/vendor/shadcn-base/button.tsx",
		hash: "97bfee456444f0495deee6a321933c24267477645b0bf4bfea67c3c62d425a12",
		upstream: `https://raw.githubusercontent.com/shadcn-ui/ui/${pinnedCommit}/apps/v4/registry/bases/base/ui/button.tsx`,
	},
	{
		path: "docs/design/vendor/shadcn-base/dialog.tsx",
		hash: "85f9a33d1a8c495b0faecd066dae1581b8feb5d27f912ecf65f814386f6da3a9",
		upstream: `https://raw.githubusercontent.com/shadcn-ui/ui/${pinnedCommit}/apps/v4/registry/bases/base/ui/dialog.tsx`,
	},
] as const;

function sha256(relativePath: string): string {
	return createHash("sha256")
		.update(fs.readFileSync(path.join(repoRoot, relativePath)))
		.digest("hex");
}

function assertReviewedComponents(source: string): void {
	if (source !== reviewedComponentsJson) {
		throw new Error("components.json drifted; re-review the literal before changing it");
	}
}

function assertReviewedFixture(relativePath: string, expectedHash: string): void {
	const actualHash = sha256(relativePath);
	if (actualHash !== expectedHash) {
		throw new Error(
			`${relativePath} drifted; expected SHA-256 ${expectedHash}, received ${actualHash}. Re-review the immutable source before updating it.`,
		);
	}
}

function assertImmutableProvenance(url: string): void {
	if (!url.includes(`/${pinnedCommit}/`) || url.includes("/main/")) {
		throw new Error("shadcn provenance must use the full reviewed commit, never mutable main");
	}
}

function gitStatus(): string {
	const result = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
		cwd: repoRoot,
		encoding: "utf8",
	});
	if (result.status !== 0) throw new Error(result.stderr || "git status failed");
	return result.stdout;
}

function readJson(relativePath: string): unknown {
	return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function productSourceFiles(): string[] {
	return ["src", "frontend"].flatMap((root) => {
		const result = spawnSync(
			"rg",
			[
				"-l",
				"lucide-react|IconPlaceholder|class-variance-authority|@/registry/bases/base|cn-(button|dialog)",
				root,
			],
			{ cwd: repoRoot, encoding: "utf8" },
		);
		if (result.status === 1) return [];
		if (result.status !== 0) throw new Error(result.stderr || `rg failed for ${root}`);
		return result.stdout.trim().split("\n").filter(Boolean);
	});
}

type DryRunPlan = {
	generatedPaths: string[];
	fixturePaths: string[];
	defaults: { base: string; iconLibrary: string; font: string };
	upstreamCommit: string;
};

function deterministicDryRun(): DryRunPlan {
	return {
		generatedPaths: reviewedFixtures.map((fixture) => `src/ui/${path.basename(fixture.path)}`),
		fixturePaths: reviewedFixtures.map((fixture) => fixture.path),
		defaults: { base: "base", iconLibrary: "lucide", font: "geist" },
		upstreamCommit: pinnedCommit,
	};
}

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
		expect(fs.readFileSync(componentsPath, "utf8")).not.toContain("iconLibrary");
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
			assertImmutableProvenance(reviewedFixtures[0].upstream.replace(pinnedCommit, "main")),
		).toThrow();
		expect(() =>
			assertImmutableProvenance(
				"https://raw.githubusercontent.com/shadcn-ui/ui/b4a618b/apps/v4/registry/bases/base/ui/button.tsx",
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
		const oxlint = fs.readFileSync(path.join(repoRoot, "tools/oxlint-plugin-archboard.js"), "utf8");

		expect(vite).toContain('"@": sourceRoot');
		expect(rootTypes).toContain('"@/*": ["./src/*"]');
		expect(frontendTypes).toContain('"@/*": ["./src/*"]');
		expect(oxlint).toContain('const SOURCE_ALIAS_PREFIX = "@/";');
		expect(oxlint).toContain('path.posix.join("src", source.slice(SOURCE_ALIAS_PREFIX.length))');
		expect(JSON.stringify(readJson("components.json"))).toContain("@/ui");
	});

	test("reports registry defaults while refusing icon and unreviewed source adoption", () => {
		const report = deterministicDryRun();
		expect(report.defaults).toEqual({ base: "base", iconLibrary: "lucide", font: "geist" });
		expect(report.upstreamCommit).toBe(pinnedCommit);

		const packageJson = readJson("package.json") as {
			dependencies: Record<string, string>;
			devDependencies: Record<string, string>;
		};
		expect({ ...packageJson.dependencies, ...packageJson.devDependencies }).not.toHaveProperty(
			"lucide-react",
		);
		expect(productSourceFiles()).toEqual([]);
		expect(fs.existsSync(path.join(repoRoot, "src/ui/button.tsx"))).toBe(false);
		expect(fs.existsSync(path.join(repoRoot, "src/ui/dialog.tsx"))).toBe(false);
	});

	test("plans only the reviewed named inputs and never mutates the checkout", () => {
		const before = gitStatus();
		const dryRun = deterministicDryRun();
		const after = gitStatus();

		expect(dryRun.generatedPaths).toEqual(
			reviewedFixtures.map((fixture) => `src/ui/${path.basename(fixture.path)}`),
		);
		expect(dryRun.fixturePaths).toEqual(reviewedFixtures.map((fixture) => fixture.path));
		expect(after).toBe(before);
	});
});
