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
const EXECUTABLE_RUN_SCRIPT = /\bbun\s+run\s+([\w:-]+)(?=\s|$|[;&|(){}`])/g;
const ECHO_ONLY_PREFIX =
	/^(?:(?:if|elif|while|until|then|else|do)\s+)?(?:(?:env\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*|command\s+)?(?:echo|printf)\b/;
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

function startsShellComment(text: string, index: number, first = 0): boolean {
	return text[index] === "#" && (index === first || /[\s;&|(){}`]/.test(text[index - 1] ?? ""));
}

function unquotedShellText(command: string): string {
	let result = "";
	let quote: "'" | '"' | undefined;
	let escaped = false;
	let comment = false;
	for (let index = 0; index < command.length; index += 1) {
		const character = command[index];
		if (comment) {
			if (character === "\n") {
				comment = false;
				result += "\n";
			}
			continue;
		}
		if (escaped) {
			escaped = false;
			result += character;
			continue;
		}
		if (quote) {
			if (character === "\\" && quote === '"') escaped = true;
			else if (character === quote) quote = undefined;
			result += character === "\n" ? "\n" : " ";
			continue;
		}
		if (character === "\\") {
			escaped = true;
			result += character;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			result += " ";
			continue;
		}
		if (startsShellComment(command, index)) {
			comment = true;
			continue;
		}
		result += character;
	}
	return result;
}

function dollarSubstitutionAt(
	text: string,
	start: number,
): { body: string; end: number } | undefined {
	if (text[start] !== "$" || text[start + 1] !== "(") return undefined;
	let depth = 1;
	let quote: "'" | '"' | "`" | undefined;
	let escaped = false;
	let comment = false;
	for (let index = start + 2; index < text.length; index += 1) {
		const character = text[index];
		if (comment) {
			if (character === "\n") comment = false;
			continue;
		}
		if (escaped) {
			escaped = false;
			continue;
		}
		if (character === "\\" && quote !== "'") {
			escaped = true;
			continue;
		}
		if (quote) {
			if (character === quote) quote = undefined;
			continue;
		}
		if (startsShellComment(text, index, start + 2)) {
			comment = true;
			continue;
		}
		if (character === "'" || character === '"' || character === "`") {
			quote = character;
			continue;
		}
		if (character === "(") depth += 1;
		if (character !== ")") continue;
		depth -= 1;
		if (depth === 0) return { body: text.slice(start + 2, index), end: index };
	}
	return { body: text.slice(start + 2), end: text.length - 1 };
}

function backtickSubstitutionAt(
	text: string,
	start: number,
): { body: string; end: number } | undefined {
	if (text[start] !== "`") return undefined;
	let escaped = false;
	for (let index = start + 1; index < text.length; index += 1) {
		const character = text[index];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (character === "\\") {
			escaped = true;
			continue;
		}
		if (character === "`") return { body: text.slice(start + 1, index), end: index };
	}
	return { body: text.slice(start + 1), end: text.length - 1 };
}

function doubleQuotedSubstitutionBodies(command: string): string[] {
	const bodies: string[] = [];
	let quote: "'" | '"' | undefined;
	let escaped = false;
	let comment = false;
	for (let index = 0; index < command.length; index += 1) {
		const character = command[index];
		if (comment) {
			if (character === "\n") comment = false;
			continue;
		}
		if (escaped) {
			escaped = false;
			continue;
		}
		if (character === "\\" && quote !== "'") {
			escaped = true;
			continue;
		}
		if (quote === "'") {
			if (character === "'") quote = undefined;
			continue;
		}
		if (quote === '"') {
			if (character === '"') {
				quote = undefined;
				continue;
			}
			const substitution =
				dollarSubstitutionAt(command, index) ?? backtickSubstitutionAt(command, index);
			if (substitution) {
				bodies.push(substitution.body);
				index = substitution.end;
			}
			continue;
		}
		if (character === "'") quote = "'";
		else if (character === '"') quote = '"';
		else if (startsShellComment(command, index)) {
			comment = true;
		}
	}
	return bodies;
}

function echoOnly(text: string, invocationIndex: number): boolean {
	let boundary = invocationIndex - 1;
	while (boundary >= 0 && !/[\n;&|(){}`]/.test(text[boundary] ?? "")) boundary -= 1;
	return ECHO_ONLY_PREFIX.test(text.slice(boundary + 1, invocationIndex).trim());
}

function executableRunScripts(command: string): string[] {
	const texts = [unquotedShellText(command)];
	const pending = doubleQuotedSubstitutionBodies(command);
	for (const body of pending) {
		texts.push(unquotedShellText(body));
		pending.push(...doubleQuotedSubstitutionBodies(body));
	}
	return [
		...new Set(
			texts.flatMap((text) =>
				[...text.matchAll(EXECUTABLE_RUN_SCRIPT)]
					.filter((match) => !echoOnly(text, match.index))
					.map((match) => match[1])
					.filter((script): script is string => script !== undefined),
			),
		),
	];
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
		for (const script of executableRunScripts(command)) {
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
