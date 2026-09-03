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

const EXECUTABLE_RUN_SCRIPT = /\bbun\s+run\s+([\w:-]+)(?=\s|$|[;&|(){}`])/g;
const ECHO_ONLY_PREFIX =
	/^(?:(?:if|elif|while|until|then|else|do)\s+)?(?:(?:env\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*|command\s+)?(?:echo|printf)\b/;
const BUN_TEST = /\bbun\s+test\b([^&;|]*)/g;
const NORMAL_TEST_LANES = new Set([
	"test:modules",
	"test:system",
	"test:repository",
	"test:serial-browser",
]);
const OPT_IN_TEST_LANES = new Set([
	"test:opt-in:capacity",
	"test:opt-in:tooling",
	"test:opt-in:topology",
	"test:opt-in:browser-performance",
]);
const OPT_IN_PACKAGE_SCRIPTS = new Set([
	...OPT_IN_TEST_LANES,
	"opt-in:renderer-chromium",
	"opt-in:renderer-emulation",
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

function executableRunScripts(command: string, unique = true): string[] {
	const texts = [unquotedShellText(command)];
	const pending = doubleQuotedSubstitutionBodies(command);
	for (const body of pending) {
		texts.push(unquotedShellText(body));
		pending.push(...doubleQuotedSubstitutionBodies(body));
	}
	const scripts = texts.flatMap((text) =>
		[...text.matchAll(EXECUTABLE_RUN_SCRIPT)]
			.filter((match) => !echoOnly(text, match.index))
			.map((match) => match[1])
			.filter((script): script is string => script !== undefined),
	);
	return unique ? [...new Set(scripts)] : scripts;
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
	return executableRunScripts(command, false);
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
	return /(?:^|\/)[^/]+(?:\.|_)(?:test|spec)\.(?:ts|tsx)$/.test(file);
}

function testSelections(command: string): Array<{ selectors: string[]; ignores: string[] }> {
	const selections: Array<{ selectors: string[]; ignores: string[] }> = [];
	for (const match of command.matchAll(BUN_TEST)) {
		const selectors: string[] = [];
		const ignores: string[] = [];
		const segment = match[1] ?? "";
		const tokens = segment.trim().split(/\s+/);
		for (let index = 0; index < tokens.length; index += 1) {
			const token = tokens[index]?.replace(/^['"]|['"]$/g, "") ?? "";
			if (!token) continue;
			if (token === "--path-ignore-patterns") {
				const ignored = tokens[++index]?.replace(/^['"]|['"]$/g, "");
				if (ignored) ignores.push(normalize(ignored));
				continue;
			}
			if (token.startsWith("--path-ignore-patterns=")) {
				ignores.push(normalize(token.slice("--path-ignore-patterns=".length)));
				continue;
			}
			if (!token.startsWith("-")) selectors.push(normalize(token));
		}
		selections.push({ selectors, ignores });
	}
	return selections;
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
	const roots = [
		path.join(repoRoot, "src"),
		path.join(repoRoot, "tests", "system"),
		path.join(repoRoot, "tests", "opt-in"),
	];
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
	for (const script of OPT_IN_PACKAGE_SCRIPTS) {
		if ((reachability.counts.get(script) ?? 0) > 0)
			errors.push(`opt-in package script \`${script}\` is reachable from \`${pushScript}\``);
	}

	for (const suiteName of Object.keys(input.scripts).filter((candidate) =>
		candidate.startsWith("test:"),
	)) {
		const normal = NORMAL_TEST_LANES.has(suiteName);
		const optIn = OPT_IN_TEST_LANES.has(suiteName);
		if (!normal && !optIn) {
			errors.push(
				`package test lane \`${suiteName}\` is undeclared; classify it as a normal or explicit opt-in lane`,
			);
		}
		const count = reachability.counts.get(suiteName) ?? 0;
		if (normal && count === 0)
			errors.push(`package test lane \`${suiteName}\` is absent from \`${pushScript}\``);
		if (normal && count > 1)
			errors.push(`package test lane \`${suiteName}\` is reached ${count} times`);
	}

	const scriptOwners = new Map<string, string[]>();
	for (const [name, command] of Object.entries(input.scripts)) {
		const adapter = adapterFiles(command);
		if (adapter.error) errors.push(`browser adapter lane \`${name}\` is invalid: ${adapter.error}`);
		const occurrences = [...adapter.files];
		for (const selection of testSelections(command)) {
			for (const selector of selection.selectors) {
				for (const file of input.nativeTests) {
					if (
						selected(file, selector) &&
						!selection.ignores.some((ignored) => selected(file, ignored))
					)
						occurrences.push(file);
				}
			}
		}
		if (occurrences.length > 0) scriptOwners.set(name, occurrences);
	}
	const nativeLanes = new Map(
		[...scriptOwners].filter(
			([name]) => NORMAL_TEST_LANES.has(name) || OPT_IN_TEST_LANES.has(name),
		),
	);

	for (const file of input.nativeTests) {
		const owners = [...nativeLanes]
			.map(([name, files]) => ({
				name,
				occurrences: files.filter((owned) => owned === file).length,
			}))
			.filter((owner) => owner.occurrences > 0);
		if (owners.length === 0) errors.push(`native test \`${file}\` belongs to no package lane`);
		const optInOwners = owners.filter((owner) => OPT_IN_TEST_LANES.has(owner.name));
		const normalOwners = owners.filter((owner) => NORMAL_TEST_LANES.has(owner.name));
		if (optInOwners.length > 0 && normalOwners.length > 0) {
			errors.push(
				`native test \`${file}\` belongs to both normal and opt-in lanes: ${owners.map((owner) => owner.name).join(", ")}`,
			);
		}
		const optInRuns = optInOwners.reduce((total, owner) => total + owner.occurrences, 0);
		if (optInRuns > 1) {
			errors.push(
				`opt-in native test \`${file}\` is selected ${optInRuns} times through: ${optInOwners.map((owner) => owner.name).join(", ")}`,
			);
		}
		const ownerRuns = [...scriptOwners]
			.map(([name, files]) => ({
				name,
				count:
					(reachability.counts.get(name) ?? 0) * files.filter((owned) => owned === file).length,
			}))
			.filter((owner) => owner.count > 0);
		const totalRuns = ownerRuns.reduce((total, owner) => total + owner.count, 0);
		if (optInRuns > 0 && totalRuns > 0) {
			errors.push(
				`opt-in native test \`${file}\` is reachable from \`${pushScript}\` through package scripts: ${ownerRuns.map((owner) => owner.name).join(", ")}`,
			);
		}
		if (normalOwners.length > 0 && totalRuns === 0) {
			errors.push(
				`native test \`${file}\` runs zero times from \`${pushScript}\`; matching package lanes: ${owners.map((owner) => owner.name).join(", ")}`,
			);
		}
		if (normalOwners.length > 0 && totalRuns > 1) {
			errors.push(
				`native test \`${file}\` runs ${totalRuns} times from \`${pushScript}\` through package lanes: ` +
					ownerRuns.map((owner) => `${owner.name} (${owner.count})`).join(", "),
			);
		}
	}

	return { errors, nativeLanes, reachableScripts: reachability.counts };
}
