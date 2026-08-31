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

type ProbeResult = { status: number | null; stdout: string; stderr: string };
type ProbeRunner = (args: readonly string[]) => ProbeResult;
type ProbeSnapshot = {
	status: string;
	binaryHeadDiffSha256: string;
	treeHashes: Record<string, string>;
};
type ProbeReport = {
	commands: string[][];
	generatedDestinations: string[];
	generatedImports: string[];
	generatedSources: Record<string, string>;
	defaults: { base: string | undefined; iconLibrary: string | undefined; font: string | undefined };
	refusals: string[];
	before: ProbeSnapshot;
	after: ProbeSnapshot;
};

const probeTreePaths = [
	"package.json",
	"bun.lock",
	"components.json",
	...reviewedFixtures.map((fixture) => fixture.path),
];
const expectedProbeCommands = [
	["info", "--json"],
	["add", "button", "dialog", "--dry-run", "--yes", "--view"],
] as const;

function runLocalShadcn(args: readonly string[]): ProbeResult {
	const result = spawnSync("bunx", ["--no-install", "shadcn", ...args], {
		cwd: repoRoot,
		encoding: "utf8",
		env: { ...process.env, NO_COLOR: "1" },
	});
	return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export function runShadcnProbe(
	options: {
		run?: ProbeRunner;
		snapshot?: () => ProbeSnapshot;
		addArgs?: readonly string[];
	} = {},
): ProbeReport {
	const run = options.run ?? runLocalShadcn;
	const snapshot = options.snapshot ?? probeSnapshot;
	const addArgs = [...(options.addArgs ?? expectedProbeCommands[1])];
	const before = snapshot();
	const refusals = new Set<string>();
	const commands = [[...expectedProbeCommands[0]], addArgs];
	const infoResult = run(expectedProbeCommands[0]);
	const safeDryRun =
		addArgs.join(" ") === expectedProbeCommands[1].join(" ") &&
		addArgs.includes("--dry-run") &&
		addArgs.includes("--view") &&
		!addArgs.some((arg) => ["init", "--all", "--overwrite", "install"].includes(arg));
	const viewResult = safeDryRun
		? run(addArgs)
		: { status: null, stdout: "", stderr: "blocked unsafe shadcn command" };
	if (!safeDryRun) refusal(refusals, "package/source adoption attempt");
	if (infoResult.status !== 0 || viewResult.status !== 0)
		refusal(refusals, "network unable-to-verify");

	let info: unknown;
	try {
		info = JSON.parse(infoResult.stdout);
	} catch {
		refusal(refusals, "config drift");
	}
	const defaults = {
		base: stringAt(info, ["config", "base"]),
		iconLibrary:
			stringAt(info, ["config", "iconLibrary"]) ??
			stringAt(info, ["preset", "values", "iconLibrary"]),
		font: stringAt(info, ["preset", "values", "font"]),
	};
	if (
		stringAt(info, ["config", "style"]) !== "base-nova" ||
		defaults.base !== "base" ||
		defaults.font !== "geist" ||
		defaults.iconLibrary !== "lucide"
	) {
		refusal(refusals, "default/icon drift");
	}
	const aliases = recordAt(info, ["config", "aliases"]);
	if (
		JSON.stringify(aliases) !==
		JSON.stringify({
			components: "@/ui",
			utils: "@/ui/ui-classnames",
			ui: "@/ui",
			lib: "@/ui",
			hooks: "@/ui",
		})
	) {
		refusal(refusals, "config drift");
	}
	if (fs.readFileSync(componentsPath, "utf8") !== reviewedComponentsJson)
		refusal(refusals, "config drift");
	for (const fixture of reviewedFixtures) {
		try {
			assertReviewedFixture(fixture.path, fixture.hash);
			assertImmutableProvenance(fixture.upstream);
		} catch {
			refusal(refusals, "upstream drift");
		}
	}

	const sources = generatedSources(viewResult.stdout);
	const destinations = Object.keys(sources).toSorted();
	const imports = generatedImports(sources).toSorted();
	const expectedDestinations = reviewedFixtures
		.map((fixture) => `src/ui/${path.basename(fixture.path)}`)
		.toSorted();
	if (destinations.join("\n") !== expectedDestinations.join("\n"))
		refusal(refusals, "package/source adoption attempt");
	for (const fixture of reviewedFixtures) {
		const generated = sources[`src/ui/${path.basename(fixture.path)}`];
		const tracked = fs.readFileSync(path.join(repoRoot, fixture.path), "utf8");
		if (generated === undefined || generated !== tracked) refusal(refusals, "upstream drift");
	}
	if (imports.some((source) => /lucide|IconPlaceholder|class-variance-authority/.test(source))) {
		refusal(refusals, "package/source adoption attempt");
	}
	if (
		Object.values(sources).some((source) => /rounded-xl|bg-primary|components\/ui/.test(source))
	) {
		refusal(refusals, "package/source adoption attempt");
	}
	const packageJson = readJson("package.json") as {
		dependencies: Record<string, string>;
		devDependencies: Record<string, string>;
	};
	if (
		Object.hasOwn({ ...packageJson.dependencies, ...packageJson.devDependencies }, "lucide-react")
	) {
		refusal(refusals, "package/source adoption attempt");
	}
	if (productSourceFiles().length > 0) refusal(refusals, "package/source adoption attempt");

	const after = snapshot();
	if (
		after.status !== before.status ||
		after.binaryHeadDiffSha256 !== before.binaryHeadDiffSha256 ||
		JSON.stringify(after.treeHashes) !== JSON.stringify(before.treeHashes)
	) {
		refusal(refusals, "dry-run mutation");
	}
	return {
		commands,
		generatedDestinations: destinations,
		generatedImports: imports,
		generatedSources: sources,
		defaults,
		refusals: [...refusals].toSorted(),
		before,
		after,
	};
}

function treeHash(relativePath: string): string {
	const file = path.join(repoRoot, relativePath);
	return fs.existsSync(file) ? sha256(relativePath) : "missing";
}

function probeSnapshot(): ProbeSnapshot {
	const diff = spawnSync("git", ["diff", "--binary", "HEAD", "--"], {
		cwd: repoRoot,
		encoding: "buffer",
	});
	if (diff.status !== 0) throw new Error(diff.stderr?.toString() || "git binary diff failed");
	return {
		status: gitStatus(),
		binaryHeadDiffSha256: createHash("sha256").update(diff.stdout).digest("hex"),
		treeHashes: Object.fromEntries(probeTreePaths.map((file) => [file, treeHash(file)])),
	};
}

function recordAt(value: unknown, keys: readonly string[]): unknown {
	let current: unknown = value;
	for (const key of keys) {
		if (typeof current !== "object" || current === null) return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

function stringAt(value: unknown, keys: readonly string[]): string | undefined {
	const result = recordAt(value, keys);
	return typeof result === "string" ? result : undefined;
}

function generatedSources(view: string): Record<string, string> {
	const sources: Record<string, string> = {};
	let current: string | undefined;
	let lines: string[] = [];
	let reading = false;
	for (const line of view.split(/\r?\n/)) {
		const target = line.match(/^[│├-]\s+(src\/ui\/(?:button|dialog)\.tsx)\s+\(create\)/);
		if (target?.[1]) {
			current = target[1];
			lines = [];
		}
		if (line.includes("│ ┌")) reading = true;
		const sourceLine = line.match(/^│ │ ?(.*)$/);
		const content = sourceLine?.[1];
		if (reading && content !== undefined) lines.push(content);
		if (line.includes("│ └")) {
			if (current) sources[current] = `${lines.join("\n")}\n`;
			reading = false;
		}
	}
	return sources;
}

function generatedImports(sources: Record<string, string>): string[] {
	return Object.values(sources).flatMap((source) =>
		[...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1] ?? ""),
	);
}

function refusal(refusals: Set<string>, reason: string): void {
	refusals.add(reason);
}

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
const capturedView = `├ src/ui/button.tsx (create) 2 lines\n│ ┌────────\n│ │ import { cva } from "class-variance-authority"\n│ │ import { XIcon } from "lucide-react"\n│ └────────\n├ src/ui/dialog.tsx (create) 2 lines\n│ ┌────────\n│ │ import { XIcon } from "lucide-react"\n│ │ const className = "rounded-xl bg-primary"\n│ └────────`;

function capturedRunner(calls: string[][]): ProbeRunner {
	return (args) => {
		calls.push([...args]);
		return args[0] === "info"
			? { status: 0, stdout: capturedInfo, stderr: "" }
			: { status: 0, stdout: capturedView, stderr: "" };
	};
}

function stableSnapshot(): ProbeSnapshot {
	return { status: "", binaryHeadDiffSha256: "empty", treeHashes: { "components.json": "pinned" } };
}

if (process.env.ARCHBOARD_SHADCN_LIVE === "1") {
	const report = runShadcnProbe();
	process.stdout.write(
		`${JSON.stringify({
			commands: report.commands,
			generatedDestinations: report.generatedDestinations,
			generatedImports: report.generatedImports,
			defaults: report.defaults,
			refusals: report.refusals,
			cleanBeforeAfter: JSON.stringify(report.before) === JSON.stringify(report.after),
			before: report.before,
			after: report.after,
		})}\n`,
	);
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
			const oxlint = fs.readFileSync(
				path.join(repoRoot, "tools/oxlint-plugin-archboard.js"),
				"utf8",
			);

			expect(vite).toContain('"@": sourceRoot');
			expect(rootTypes).toContain('"@/*": ["./src/*"]');
			expect(frontendTypes).toContain('"@/*": ["./src/*"]');
			expect(oxlint).toContain('const SOURCE_ALIAS_PREFIX = "@/";');
			expect(oxlint).toContain('path.posix.join("src", source.slice(SOURCE_ALIAS_PREFIX.length))');
			expect(JSON.stringify(readJson("components.json"))).toContain("@/ui");
		});

		test("reports registry defaults while refusing icon and unreviewed source adoption", () => {
			const calls: string[][] = [];
			const report = runShadcnProbe({ run: capturedRunner(calls), snapshot: stableSnapshot });
			expect(calls).toEqual([
				["info", "--json"],
				["add", "button", "dialog", "--dry-run", "--yes", "--view"],
			]);
			expect(report.defaults).toEqual({ base: "base", iconLibrary: "lucide", font: "geist" });
			expect(report.generatedDestinations).toEqual(["src/ui/button.tsx", "src/ui/dialog.tsx"]);
			expect(report.generatedImports).toEqual([
				"class-variance-authority",
				"lucide-react",
				"lucide-react",
			]);
			expect(report.refusals).toEqual(["package/source adoption attempt", "upstream drift"]);
			expect(report.before).toEqual(report.after);
			expect(fs.existsSync(path.join(repoRoot, "src/ui/button.tsx"))).toBe(false);
			expect(fs.existsSync(path.join(repoRoot, "src/ui/dialog.tsx"))).toBe(false);
		});

		test("blocks unsafe add commands before a runner or registry can execute them", () => {
			const calls: string[][] = [];
			const report = runShadcnProbe({
				run: capturedRunner(calls),
				snapshot: stableSnapshot,
				addArgs: ["add", "button", "dialog", "--yes", "--overwrite"],
			});
			expect(calls).toEqual([["info", "--json"]]);
			expect(report.refusals).toContain("package/source adoption attempt");
			expect(report.refusals).toContain("network unable-to-verify");
			expect(report.before).toEqual(report.after);
		});

		test("the default local owner stays offline and non-mutating", () => {
			const before = probeSnapshot();
			const report = runShadcnProbe({ run: capturedRunner([]), snapshot: stableSnapshot });
			const after = probeSnapshot();
			expect(report.before).toEqual(report.after);
			expect(after).toEqual(before);
			expect(report.commands).toEqual(expectedProbeCommands.map((command) => Array.from(command)));
		});
	});
}
