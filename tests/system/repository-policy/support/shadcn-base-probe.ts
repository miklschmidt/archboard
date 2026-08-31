import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
export const componentsPath = path.join(repoRoot, "components.json");
export const pinnedCommit = "b4a618b97e35f5dadf3a00d51f410c84a2567d4d";

export const reviewedComponentsJson = `{
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

export const reviewedFixtures = [
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

export type ProbeResult = { status: number | null; stdout: string; stderr: string };
export type ProbeRunner = (args: readonly string[]) => ProbeResult;
export type ProbeSnapshot = {
	status: string;
	binaryHeadDiffSha256: string;
	treeHashes: Record<string, string>;
};
export type ProposedFile = { path: string; action: string };
export type CheckoutAdoption = { packageOrLockFiles: string[]; productSourceFiles: string[] };
export type ProbeReport = {
	commands: string[][];
	proposedFiles: ProposedFile[];
	generatedDestinations: string[];
	generatedImports: string[];
	generatedSources: Record<string, string>;
	defaults: { base: string | undefined; iconLibrary: string | undefined; font: string | undefined };
	refusals: string[];
	before: ProbeSnapshot;
	after: ProbeSnapshot;
};

export const expectedProbeCommands = [
	["info", "--json"],
	["add", "button", "dialog", "--dry-run", "--yes", "--view"],
] as const;
const probeTreePaths = [
	"package.json",
	"bun.lock",
	"components.json",
	...reviewedFixtures.map((fixture) => fixture.path),
];

export function sha256(relativePath: string): string {
	return createHash("sha256")
		.update(fs.readFileSync(path.join(repoRoot, relativePath)))
		.digest("hex");
}

export function assertReviewedComponents(source: string): void {
	if (source !== reviewedComponentsJson) {
		throw new Error("components.json drifted; re-review the literal before changing it");
	}
}

export function assertReviewedFixture(relativePath: string, expectedHash: string): void {
	const actualHash = sha256(relativePath);
	if (actualHash !== expectedHash) {
		throw new Error(
			`${relativePath} drifted; expected SHA-256 ${expectedHash}, received ${actualHash}. Re-review the immutable source before updating it.`,
		);
	}
}

export function assertImmutableProvenance(url: string): void {
	if (!url.includes(`/${pinnedCommit}/`) || url.includes("/main/")) {
		throw new Error("shadcn provenance must use the full reviewed commit, never mutable main");
	}
}

export function gitStatus(): string {
	const result = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
		cwd: repoRoot,
		encoding: "utf8",
	});
	if (result.status !== 0) throw new Error(result.stderr || "git status failed");
	return result.stdout;
}

export function readJson(relativePath: string): unknown {
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

function checkoutAdoption(): CheckoutAdoption {
	const packageOrLockFiles = ["package.json", "bun.lock"].filter((relativePath) => {
		const source = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
		return /lucide-react|class-variance-authority|IconPlaceholder|@\/registry\/bases\/base/.test(
			source,
		);
	});
	return { packageOrLockFiles, productSourceFiles: productSourceFiles() };
}

function runLocalShadcn(args: readonly string[]): ProbeResult {
	const result = spawnSync("bunx", ["--no-install", "shadcn", ...args], {
		cwd: repoRoot,
		encoding: "utf8",
		env: { ...process.env, NO_COLOR: "1" },
	});
	return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function treeHash(relativePath: string): string {
	const file = path.join(repoRoot, relativePath);
	return fs.existsSync(file) ? sha256(relativePath) : "missing";
}

export function probeSnapshot(): ProbeSnapshot {
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

export function parseProposedFiles(view: string): ProposedFile[] {
	const proposals: ProposedFile[] = [];
	for (const line of view.split(/\r?\n/)) {
		const match = line.match(/^[│├└-]\s+(.+?)\s+\(([^()\s]+)\)(?:\s|$)/);
		if (match?.[1] && match[2]) proposals.push({ path: match[1], action: match[2] });
	}
	return proposals;
}

function generatedSources(view: string): Record<string, string> {
	const sources: Record<string, string> = {};
	let current: string | undefined;
	let lines: string[] = [];
	let reading = false;
	for (const line of view.split(/\r?\n/)) {
		const header = line.match(/^[│├└-]\s+(.+?)\s+\(([^()\s]+)\)(?:\s|$)/);
		if (header) {
			current =
				header[2] === "create" &&
				(header[1] === "src/ui/button.tsx" || header[1] === "src/ui/dialog.tsx")
					? header[1]
					: undefined;
			lines = [];
			reading = false;
		}
		if (current && line.includes("│ ┌")) reading = true;
		const sourceLine = line.match(/^│ │ ?(.*)$/);
		const content = sourceLine?.[1];
		if (current && reading && content !== undefined) lines.push(content);
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

function addRefusal(refusals: Set<string>, reason: string): void {
	refusals.add(reason);
}

export function runShadcnProbe(
	options: {
		run?: ProbeRunner;
		snapshot?: () => ProbeSnapshot;
		addArgs?: readonly string[];
		checkout?: () => CheckoutAdoption;
	} = {},
): ProbeReport {
	const run = options.run ?? runLocalShadcn;
	const snapshot = options.snapshot ?? probeSnapshot;
	const checkout = options.checkout ?? checkoutAdoption;
	const addArgs = [...(options.addArgs ?? expectedProbeCommands[1])];
	const before = snapshot();
	const refusals = new Set<string>();
	const commands = [[...expectedProbeCommands[0]], addArgs];
	if (before.status !== "") addRefusal(refusals, "dirty-before");
	const infoResult = run(expectedProbeCommands[0]);
	const safeDryRun =
		addArgs.join(" ") === expectedProbeCommands[1].join(" ") &&
		addArgs.includes("--dry-run") &&
		addArgs.includes("--view") &&
		!addArgs.some((arg) => ["init", "--all", "--overwrite", "install"].includes(arg));
	const viewResult = safeDryRun
		? run(addArgs)
		: { status: null, stdout: "", stderr: "blocked unsafe shadcn command" };
	if (!safeDryRun) addRefusal(refusals, "unsafe command");
	if (infoResult.status !== 0 || viewResult.status !== 0)
		addRefusal(refusals, "network unable-to-verify");

	let info: unknown;
	try {
		info = JSON.parse(infoResult.stdout);
	} catch {
		addRefusal(refusals, "config drift");
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
	)
		addRefusal(refusals, "default/icon drift");
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
	)
		addRefusal(refusals, "config drift");
	if (fs.readFileSync(componentsPath, "utf8") !== reviewedComponentsJson)
		addRefusal(refusals, "config drift");
	for (const fixture of reviewedFixtures) {
		try {
			assertReviewedFixture(fixture.path, fixture.hash);
			assertImmutableProvenance(fixture.upstream);
		} catch {
			addRefusal(refusals, "pinned fixture/provenance drift");
		}
	}

	const proposedFiles = parseProposedFiles(viewResult.stdout);
	const sources = generatedSources(viewResult.stdout);
	const destinations = proposedFiles.map((file) => file.path);
	const imports = generatedImports(sources).toSorted();
	const expectedFiles = reviewedFixtures.map((fixture) => ({
		path: `src/ui/${path.basename(fixture.path)}`,
		action: "create",
	}));
	if (JSON.stringify(proposedFiles) !== JSON.stringify(expectedFiles))
		addRefusal(refusals, "generated destination/action drift");
	for (const fixture of reviewedFixtures) {
		const generated = sources[`src/ui/${path.basename(fixture.path)}`];
		const tracked = fs.readFileSync(path.join(repoRoot, fixture.path), "utf8");
		if (generated === undefined || generated !== tracked)
			addRefusal(refusals, "registry upstream drift");
	}
	if (imports.some((source) => /lucide|IconPlaceholder|class-variance-authority/.test(source)))
		addRefusal(refusals, "registry package/source drift");
	if (Object.values(sources).some((source) => /rounded-xl|bg-primary|components\/ui/.test(source)))
		addRefusal(refusals, "registry package/source drift");
	const adoption = checkout();
	if (adoption.packageOrLockFiles.length > 0 || adoption.productSourceFiles.length > 0)
		addRefusal(refusals, "checkout package/source adoption");

	const after = snapshot();
	if (
		after.status !== before.status ||
		after.binaryHeadDiffSha256 !== before.binaryHeadDiffSha256 ||
		JSON.stringify(after.treeHashes) !== JSON.stringify(before.treeHashes)
	)
		addRefusal(refusals, "dry-run mutation");
	return {
		commands,
		proposedFiles,
		generatedDestinations: destinations,
		generatedImports: imports,
		generatedSources: sources,
		defaults,
		refusals: [...refusals].toSorted(),
		before,
		after,
	};
}

export const fatalProbeRefusals = [
	"dirty-before",
	"dry-run mutation",
	"network unable-to-verify",
	"config drift",
	"default/icon drift",
	"unsafe command",
	"generated destination/action drift",
	"pinned fixture/provenance drift",
	"checkout package/source adoption",
] as const;

export function fatalProbeFailures(report: ProbeReport): string[] {
	const failures = new Set<string>();
	if (report.before.status !== "") failures.add("dirty-before");
	if (JSON.stringify(report.before) !== JSON.stringify(report.after))
		failures.add("dry-run mutation");
	for (const reason of report.refusals) {
		if (fatalProbeRefusals.includes(reason as (typeof fatalProbeRefusals)[number]))
			failures.add(reason);
	}
	return [...failures].toSorted();
}
