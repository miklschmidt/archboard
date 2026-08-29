import fs from "node:fs";
import path from "node:path";

import {
	BROWSER_ADAPTER_PATH,
	validateBrowserSelection,
} from "../../browser/support/agent-browser.ts";

export interface InventoryInput {
	repoRoot: string;
	scripts: Record<string, string>;
	pushScript?: string;
	nativeTests: string[];
}

export interface InventoryResult {
	errors: string[];
	nativeLanes: Map<string, string[]>;
	reachableScripts: Map<string, number>;
}

export function browserBundleSnapshot(repoRoot: string): {
	exists: boolean;
	mtimeMs?: number;
	size?: number;
} {
	const bundle = path.join(repoRoot, "dist/frontend/index.html");
	if (!fs.existsSync(bundle)) return { exists: false };
	const stat = fs.statSync(bundle);
	return { exists: true, mtimeMs: stat.mtimeMs, size: stat.size };
}

export function createBrowserPreflightFixture(): {
	root: string;
	bin: string;
	temporary: string;
	browserExecutable: string;
	versionMarker: string;
	ownerPathMarker: string;
	unexpectedMarker: string;
} {
	const root = fs.mkdtempSync(
		path.join(process.env.TMPDIR ?? "/tmp", "archboard-browser-preflight-"),
	);
	const bin = path.join(root, "bin");
	const temporary = path.join(root, "tmp");
	fs.mkdirSync(bin);
	fs.mkdirSync(temporary);
	fs.symlinkSync(process.execPath, path.join(bin, "bun"));
	fs.symlinkSync(process.execPath, path.join(bin, "bunx"));
	const browserExecutable = path.join(root, "chrome");
	fs.writeFileSync(browserExecutable, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
	return {
		root,
		bin,
		temporary,
		browserExecutable,
		versionMarker: path.join(root, "agent-browser-version"),
		ownerPathMarker: path.join(root, "owner-browser-path"),
		unexpectedMarker: path.join(root, "agent-browser-unexpected"),
	};
}

export function installFakeAgentBrowser(
	fixture: ReturnType<typeof createBrowserPreflightFixture>,
): void {
	const executable = path.join(fixture.bin, "agent-browser");
	fs.writeFileSync(
		executable,
		`#!/bin/sh\nif [ "$1" = "--version" ]; then : > "${fixture.versionMarker}"; exit 0; fi\nprintf '%s' "$AGENT_BROWSER_EXECUTABLE_PATH" > "${fixture.ownerPathMarker}"\n: > "${fixture.unexpectedMarker}"\nexit 97\n`,
		{ mode: 0o755 },
	);
}

export function processExists(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

const RUN_SCRIPT = /\bbun run ([\w:-]+)/g;
const DIRECT_RUN_SCRIPT = /^(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*bun\s+run\s+([\w:-]+)(?:\s|$)/;
const BUN_TEST = /\bbun test\b([^&;|]*)/g;
const FINAL_TEST_LANES = new Set([
	"test:modules",
	"test:system",
	"test:repository",
	"test:serial-browser",
]);

function workflowRunCommands(workflow: string): { commands: string[]; error?: string } {
	let document: unknown;
	try {
		document = Bun.YAML.parse(workflow);
	} catch (error) {
		return {
			commands: [],
			error: `the workflow is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
	if (typeof document !== "object" || document === null) return { commands: [] };
	const jobs = (document as { jobs?: unknown }).jobs;
	if (typeof jobs !== "object" || jobs === null) return { commands: [] };
	const commands: string[] = [];
	for (const job of Object.values(jobs)) {
		if (typeof job !== "object" || job === null) continue;
		const steps = (job as { steps?: unknown }).steps;
		if (!Array.isArray(steps)) continue;
		for (const step of steps) {
			if (typeof step !== "object" || step === null) continue;
			const run = (step as { run?: unknown }).run;
			if (typeof run === "string") commands.push(run);
		}
	}
	return { commands };
}

function shellSegments(command: string): string[] {
	const segments: string[] = [];
	let start = 0;
	let quote: "'" | '"' | undefined;
	let escaped = false;
	let comment = false;
	const finish = (end: number): void => {
		const segment = command.slice(start, end).trim();
		if (segment) segments.push(segment);
	};
	for (let index = 0; index < command.length; index += 1) {
		const character = command[index];
		if (comment) {
			if (character === "\n") {
				comment = false;
				start = index + 1;
			}
			continue;
		}
		if (escaped) {
			escaped = false;
			continue;
		}
		if (quote) {
			if (character === "\\" && quote === '"') escaped = true;
			else if (character === quote) quote = undefined;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			continue;
		}
		if (character === "#" && (index === start || /\s/.test(command[index - 1] ?? ""))) {
			finish(index);
			comment = true;
			continue;
		}
		const operator =
			character === "\n" ||
			character === ";" ||
			((character === "&" || character === "|") && command[index + 1] === character);
		if (operator) {
			finish(index);
			if (character === "&" || character === "|") index += 1;
			start = index + 1;
		}
	}
	if (!comment) finish(command.length);
	return segments;
}

export function inspectWorkflow(workflow: string): string[] {
	const parsed = workflowRunCommands(workflow);
	if (parsed.error) return [parsed.error];
	const errors: string[] = [];
	const canonicalCount = parsed.commands.filter((command) => command === "bun run check").length;
	if (canonicalCount !== 1) {
		errors.push(
			`the workflow must contain exactly one standalone \`bun run check\` step; found ${canonicalCount}.`,
		);
	}
	for (const command of parsed.commands) {
		for (const segment of shellSegments(command)) {
			const script = segment.match(DIRECT_RUN_SCRIPT)?.[1];
			if (!script) continue;
			if (script === "check") {
				if (command !== "bun run check") {
					errors.push(
						"the workflow invokes `bun run check` outside the canonical standalone step.",
					);
				}
				continue;
			}
			errors.push(
				`the workflow invokes package script \`${script}\` directly; ` +
					"`bun run check` must be its only package-script invocation.",
			);
		}
	}
	return errors;
}

function normalize(value: string): string {
	return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function referencedScripts(command: string): string[] {
	return [...command.matchAll(RUN_SCRIPT)]
		.map((match) => match[1])
		.filter((name): name is string => name !== undefined);
}

function pushReachability(
	scripts: Record<string, string>,
	root: string,
): { counts: Map<string, number>; cycles: string[] } {
	const counts = new Map<string, number>();
	const cycles: string[] = [];

	function visit(name: string, stack: string[]): void {
		counts.set(name, (counts.get(name) ?? 0) + 1);
		if (stack.includes(name)) {
			cycles.push([...stack, name].join(" -> "));
			return;
		}
		const command = scripts[name];
		if (command === undefined) return;
		for (const child of referencedScripts(command)) visit(child, [...stack, name]);
	}

	visit(root, []);
	return { counts, cycles };
}

function isTestFile(file: string): boolean {
	return /(?:^|\/)[^/]+(?:\.|_)(?:test|spec)\.ts$/.test(file);
}

function selectors(command: string): string[] {
	const found: string[] = [];
	for (const match of command.matchAll(BUN_TEST)) {
		const segment = match[1] ?? "";
		for (const token of segment.trim().split(/\s+/)) {
			if (!token || token.startsWith("-")) continue;
			found.push(normalize(token.replace(/^['"]|['"]$/g, "")));
		}
	}
	return found;
}

function adapterFiles(command: string): { files: string[]; error?: string } {
	const trimmed = command.trim();
	if (!trimmed.startsWith(`bun ${BROWSER_ADAPTER_PATH}`)) return { files: [] };
	try {
		return { files: [...validateBrowserSelection(trimmed.split(/\s+/)).files] };
	} catch (error) {
		return {
			files: [],
			error: error instanceof Error ? error.message.split("\n")[0] : String(error),
		};
	}
}

function selected(testFile: string, selector: string): boolean {
	const normalizedTest = normalize(testFile);
	const normalizedSelector = normalize(selector).replace(/\/$/, "");
	return (
		normalizedTest === normalizedSelector || normalizedTest.startsWith(`${normalizedSelector}/`)
	);
}

export function discoverNativeTests(repoRoot: string): string[] {
	const roots = [path.join(repoRoot, "src"), path.join(repoRoot, "tests", "system")];
	const tests: string[] = [];
	for (const root of roots) {
		if (!fs.existsSync(root)) continue;
		const queue = [root];
		while (queue.length > 0) {
			const current = queue.pop();
			if (!current) continue;
			for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
				const absolute = path.join(current, entry.name);
				if (entry.isDirectory()) queue.push(absolute);
				else {
					const relative = normalize(path.relative(repoRoot, absolute));
					if (isTestFile(relative)) tests.push(relative);
				}
			}
		}
	}
	return tests.toSorted();
}

export function inspectTestInventory(input: InventoryInput): InventoryResult {
	const errors: string[] = [];
	const pushScript = input.pushScript ?? "check";
	const reachability = pushReachability(input.scripts, pushScript);
	for (const cycle of reachability.cycles) errors.push(`package script cycle: ${cycle}`);

	for (const suiteName of Object.keys(input.scripts).filter((candidate) =>
		candidate.startsWith("test:"),
	)) {
		if (!FINAL_TEST_LANES.has(suiteName)) {
			errors.push(
				`package test lane \`${suiteName}\` is transitional; only test:modules, test:system, test:repository, and test:serial-browser are allowed`,
			);
		}
		const count = reachability.counts.get(suiteName) ?? 0;
		if (count === 0)
			errors.push(`package test lane \`${suiteName}\` is absent from \`${pushScript}\``);
		if (count > 1) errors.push(`package test lane \`${suiteName}\` is reached ${count} times`);
	}

	const nativeLanes = new Map<string, string[]>();
	for (const [name, command] of Object.entries(input.scripts)) {
		const laneSelectors = selectors(command);
		const adapter = adapterFiles(command);
		if (adapter.error) errors.push(`browser adapter lane \`${name}\` is invalid: ${adapter.error}`);
		const occurrences = [...adapter.files];
		for (const selector of laneSelectors) {
			for (const file of input.nativeTests) if (selected(file, selector)) occurrences.push(file);
		}
		if (occurrences.length > 0) nativeLanes.set(name, occurrences);
	}

	for (const file of input.nativeTests) {
		const owners = [...nativeLanes]
			.map(([name, files]) => ({
				name,
				occurrences: files.filter((owned) => owned === file).length,
			}))
			.filter((owner) => owner.occurrences > 0);
		if (owners.length === 0) errors.push(`native test \`${file}\` belongs to no package lane`);
		const ownerRuns = owners.map((name) => ({
			name: name.name,
			count: (reachability.counts.get(name.name) ?? 0) * name.occurrences,
		}));
		const totalRuns = ownerRuns.reduce((total, owner) => total + owner.count, 0);
		if (owners.length > 0 && totalRuns === 0) {
			errors.push(
				`native test \`${file}\` runs zero times from \`${pushScript}\`; matching package lanes: ${owners.map((owner) => owner.name).join(", ")}`,
			);
		}
		if (totalRuns > 1) {
			errors.push(
				`native test \`${file}\` runs ${totalRuns} times from \`${pushScript}\` through package lanes: ` +
					ownerRuns.map((owner) => `${owner.name} (${owner.count})`).join(", "),
			);
		}
	}

	return { errors, nativeLanes, reachableScripts: reachability.counts };
}
