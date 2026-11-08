// Refuse a guide that names what the program does not have. The reference pages come from the
// program, but the guides are written by hand, so this reads every guide against the reference that
// `reference.ts` wrote and fails the build on the first drift:
// - an `archboard …` line in code that runs no command, or passes a flag that its command lacks;
// - a `with:` key under one of this repository's Actions that the Action has no input for;
// - a workflow that sets up another Node.js than the check Action's default;
// - an `ARCHBOARD_…` environment variable that the CLI does not read;
// - a permission for an Action that its `action.yml` does not name, and a workflow that runs an
//   Action that needs the whole history without `fetch-depth: 0`;
// - a code span that names an Action input, an Action output or a finding code without linking to
//   its row in the reference. The link makes a rename visible: `links.ts` fails on its anchor;
// - a CLI version or an Action ref pinned by hand. A guide writes `{{version}}` and `{{ref}}`, and
//   each version of the docs fills in its own (`src/lib/remark-version.mjs`, ADR 0077).
//
// Run from the repository root, after `reference.ts`:
//   bun site/scripts/guides.ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import reference from "../src/generated/reference.json" with { type: "json" };
import type { CommandEntry } from "../src/lib/reference";

const GUIDES = join(import.meta.dir, "../src/content/docs");

/** Options that every command reads, before or after its name. */
const GLOBAL_FLAGS = new Set(["--text", "--help", "-h", "--version", "-v"]);
/** Words after `archboard` that are no command of the registry but still run. */
const BUILT_INS = new Set(["help", "version"]);

const commands = new Map(
	reference.commands.map((command) => [command.name, command as CommandEntry]),
);
const shared = new Map(reference.shared.map((option) => [option.key, option.spellings]));
const actions = new Map(reference.actions.map((action) => [action.slug, action]));
const environment = new Set<string>(reference.environment.map((entry) => entry.name));
const findings = new Set(reference.findings.flatMap((finding) => finding.codes));

/**
 * Read one `archboard …` invocation: the longest command name that it starts with, then its flags.
 * @param file The guide.
 * @param line The invocation, from `archboard` to the end of the shell command.
 */
function checkInvocation(file: string, line: string, problems: string[]): void {
	// A quoted directory or option value stays one word.
	const words = (line.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/gu) ?? []).slice(1);
	// The global options can come before the command: --text, -C <dir> and --url <url>.
	while (
		words[0] === "--text" ||
		words[0] === "-C" ||
		words[0] === "--url" ||
		words[0]?.startsWith("--url=")
	) {
		words.splice(0, words[0] === "--text" || words[0]?.startsWith("--url=") ? 1 : 2);
	}
	const first = words[0];
	if (first === undefined || first.startsWith("<") || BUILT_INS.has(first)) return;
	let name = "";
	for (const word of words) {
		const longer = name === "" ? word : `${name} ${word}`;
		if (!commands.has(longer)) break;
		name = longer;
	}
	const command = commands.get(name);
	if (command === undefined) {
		problems.push(`${file}: "${line}" runs no command of the CLI`);
		return;
	}
	const rest = words.slice(name.split(" ").length);
	const next = rest[0];
	if (command.router && next !== undefined && /^[a-z][a-z-]*$/u.test(next)) {
		problems.push(`${file}: "${line}": "${name}" has no command "${next}"`);
	}
	const target = command.router?.runs ? (commands.get(command.router.runs) ?? command) : command;
	const flags = new Set([
		...GLOBAL_FLAGS,
		...target.parameters.flatMap((parameter) =>
			parameter.kind === "option" ? parameter.spellings : [],
		),
		...target.shared.flatMap((key) => shared.get(key) ?? []),
	]);
	const values = new Set([
		...target.parameters.flatMap((parameter) =>
			parameter.kind === "option" && parameter.value === "required" ? parameter.spellings : [],
		),
		...target.shared.flatMap((key) => shared.get(key) ?? []),
	]);
	for (let index = 0; index < rest.length; index += 1) {
		const word = rest[index] ?? "";
		if (word === "--") break;
		const flag = /^(--?[A-Za-z][\w-]*)/u.exec(word)?.[1];
		if (flag !== undefined && !flags.has(flag)) {
			problems.push(`${file}: "${line}": "archboard ${name}" has no option ${flag}`);
		}
		if (flag !== undefined && values.has(flag) && !word.includes("=")) index += 1;
	}
}

/**
 * Read every `archboard …` invocation in a piece of shell or a code span. An invocation ends at a
 * shell operator or a comment.
 */
function checkShell(file: string, text: string, problems: string[]): void {
	const joined = text.replaceAll(/\\\r?\n/gu, "");
	for (const match of joined.matchAll(
		/(?:^|[\s(;&|$])((?:\.\/node_modules\/\.bin\/)?archboard(?:[ \t]+[^\s;&|>#)]+)*)/gmu,
	)) {
		checkInvocation(file, match[1] ?? "", problems);
	}
}

/**
 * Read each step of a workflow that uses an Action of this repository, and its `with:` keys.
 * @param file The guide.
 * @param yaml The YAML of one code block.
 */
function checkWorkflow(file: string, yaml: string, problems: string[]): void {
	// The Node.js that a workflow sets up for the CLI is the one that the check Action defaults to.
	const nodeVersion = actions
		.get("check")
		?.inputs.find((input) => input.name === "node-version")?.default;
	for (const match of yaml.matchAll(/(?:node-version:\s*["']?|image:\s*node:)(\d+)/gu)) {
		if (nodeVersion !== undefined && match[1] !== nodeVersion) {
			problems.push(
				`${file}: "${match[0]}" sets up Node.js ${match[1]}; the check Action defaults to ${nodeVersion}`,
			);
		}
	}
	const deep = new Set(
		[...actions.values()]
			.filter((action) => action.description.includes("`fetch-depth: 0`"))
			.map((action) => action.slug),
	);
	const record = (value: unknown): Record<string, unknown> =>
		typeof value === "object" && value !== null && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	const actionSlug = (step: Record<string, unknown>): string | undefined =>
		typeof step.uses === "string"
			? /^miklschmidt\/archboard\/actions\/([\w-]+)@/u.exec(step.uses)?.[1]
			: undefined;
	const pathOf = (value: unknown): string =>
		String(value ?? ".")
			.replace(/^\.\//u, "")
			.replace(/\/$/u, "");
	const history = (steps: unknown[]): void => {
		for (const [index, value] of steps.entries()) {
			const step = record(value);
			const slug = actionSlug(step);
			if (slug === undefined || !deep.has(slug)) continue;
			const action = actions.get(slug);
			const directory = pathOf(
				record(step.with)["working-directory"] ??
					action?.inputs.find((input) => input.name === "working-directory")?.default,
			);
			const checkout = steps
				.slice(0, index)
				.map(record)
				.findLast((prior) => {
					if (typeof prior.uses !== "string" || !prior.uses.startsWith("actions/checkout@"))
						return false;
					const path = pathOf(record(prior.with).path);
					return path === "." || directory === path || directory.startsWith(`${path}/`);
				});
			if (String(record(checkout?.with)["fetch-depth"]) !== "0") {
				problems.push(`${file}: a workflow runs ${slug} without its checkout's fetch-depth: 0`);
			}
		}
	};
	const visit = (node: unknown): void => {
		if (Array.isArray(node)) return node.forEach(visit);
		if (typeof node !== "object" || node === null) return;
		const fields = record(node);
		const inputs = record(fields.with);
		const slug = actionSlug(fields);
		if (Array.isArray(fields.steps)) history(fields.steps);
		for (const key of ["run", "script", "before_script", "after_script"]) {
			const scripts = Array.isArray(fields[key]) ? fields[key] : [fields[key]];
			for (const script of scripts) {
				if (typeof script === "string") checkShell(file, script, problems);
			}
		}
		if (slug !== undefined) {
			const action = actions.get(slug);
			const names = new Set(action?.inputs.map((input) => input.name));
			if (action === undefined) problems.push(`${file}: no Action "${slug}" in actions/`);
			for (const key of Object.keys(inputs)) {
				if (action !== undefined && !names.has(key)) {
					problems.push(`${file}: the Action "${slug}" has no input "${key}"`);
				}
			}
		}
		Object.values(node).forEach(visit);
	};
	try {
		visit(Bun.YAML.parse(yaml));
	} catch (error) {
		problems.push(`${file}: a YAML block does not parse: ${String(error)}\n${yaml}`);
	}
}

/**
 * Refuse a permission that a guide gives an Action on the line that names it, such as
 * `contents: write`, unless the Action's `action.yml` names that permission.
 * @param file The guide.
 * @param prose The guide without its code blocks.
 */
function checkPermissions(file: string, prose: string, problems: string[]): void {
	for (const line of prose.split("\n")) {
		const slug = /miklschmidt\/archboard\/actions\/([\w-]+)/u.exec(line)?.[1];
		const action = slug === undefined ? undefined : actions.get(slug);
		if (action === undefined) continue;
		const text = [action.description, ...action.inputs.map((input) => input.description)].join(" ");
		for (const match of line.matchAll(/`([a-z-]+: (?:read|write))`/gu)) {
			if (!text.includes(`\`${match[1] ?? ""}\``)) {
				problems.push(`${file}: the ${slug} Action's action.yml asks for no \`${match[1] ?? ""}\``);
			}
		}
	}
}

/** An exit code of the CLI written by hand: in prose, or alone in a table cell. 0 means success. */
const HAND_EXITS = [
	/\bexits? (?:code |with )?`?[1-9]\b/iu,
	/\bexit code `?[1-9]\b/iu,
	/\|\s*`[1-9]`\s*\|/u,
];

/**
 * Refuse each line of prose that states an exit code by hand. A guide reads it from the contract
 * with `<Exit refusal="…" />` or `<Exit outcome="…" />`.
 * @param file The guide.
 * @param prose The guide without its code blocks.
 */
function checkExits(file: string, prose: string, problems: string[]): void {
	// Alt text describes a recording as it plays, which no contract changes.
	for (const line of prose.split("\n").filter((one) => !one.trimStart().startsWith("alt="))) {
		if (HAND_EXITS.some((pattern) => pattern.test(line))) {
			problems.push(
				`${file}: "${line.trim().slice(0, 80)}" states an exit code by hand; use <Exit>`,
			);
		}
	}
}

/**
 * Refuse a value of an Action input that its `action.yml` does not name: the input's default, or a
 * value in backticks in its description. Refuse a line that calls another value the default.
 * @param file The guide.
 * @param target The link to the input's row, such as `../reference/actions/#check-fail-on`.
 * @param value The value that the guide gives the input.
 * @param line The line that gives it. A line that calls the value the default must be right.
 */
function checkValue(
	file: string,
	target: string,
	value: string,
	line: string,
	problems: string[],
): void {
	const anchor = /reference\/actions\/#(.+)$/u.exec(target)?.[1];
	const input = reference.actions
		.flatMap((action) =>
			action.inputs.map((one) => ({ anchor: `${action.slug}-${one.name}`, one })),
		)
		.find((entry) => entry.anchor === anchor)?.one;
	if (input === undefined) return;
	if (value !== input.default && !input.description.includes(`\`${value}\``)) {
		problems.push(`${file}: the input ${input.name} takes no value \`${value}\` in its action.yml`);
	} else if (value !== input.default && /\bThe default\b/u.test(line)) {
		problems.push(
			`${file}: calls \`${value}\` the default of ${input.name}, which is \`${input.default}\``,
		);
	}
}

/**
 * Check the values in a table whose first head links to an Action input, such as `out-of-plan`.
 * @param file The guide.
 * @param prose The guide without its code blocks.
 */
function checkValueTables(file: string, prose: string, problems: string[]): void {
	let target: string | undefined;
	for (const line of prose.split("\n")) {
		if (!line.startsWith("|")) {
			target = undefined;
			continue;
		}
		const first = line.split("|")[1]?.trim() ?? "";
		const head = /^\[`[\w-]+`\]\(([^)\s]*reference\/actions\/#[^)\s]+)\)$/u.exec(first)?.[1];
		if (head !== undefined) target = head;
		else if (target !== undefined && /^`[^`]+`$/u.test(first))
			checkValue(file, target, first.slice(1, -1), line, problems);
	}
}

/**
 * Require a link on each code span that names an Action input or output, or a finding code.
 * @param file The guide.
 * @param prose The guide without its code blocks.
 */
function checkMentions(file: string, prose: string, problems: string[]): void {
	const ports = reference.actions.flatMap((action) =>
		[...action.inputs, ...action.outputs].map((port) => ({
			name: port.name,
			anchor: `${action.slug}-${port.name}`,
		})),
	);
	for (const match of prose.matchAll(/(\[)?`([^`\n]+)`(\]\(([^)\s]+)\))?/gu)) {
		const span = match[2] ?? "";
		const target = match[4] ?? "";
		const key = /^([\w-]+)(?::|$)/u.exec(span)?.[1] ?? "";
		const named = ports.filter((port) => port.name === key);
		const actionAnchor = /reference\/actions\/#([^\s]+)$/u.exec(target)?.[1];
		if (named.length > 0 && !named.some((port) => port.anchor === actionAnchor)) {
			problems.push(
				`${file}: \`${span}\` names an Action port; link it to reference/actions/#<action>-${key}`,
			);
		}
		const value = /^[\w-]+:\s*(.+)$/u.exec(span)?.[1];
		if (value !== undefined) {
			const start = prose.lastIndexOf("\n", match.index) + 1;
			const end = prose.indexOf("\n", match.index);
			checkValue(file, target, value, prose.slice(start, end === -1 ? undefined : end), problems);
		}
		const finding = span.toLowerCase().replaceAll("_", "-");
		if (findings.has(span) && !target.endsWith(`reference/findings/#${finding}`)) {
			problems.push(
				`${file}: \`${span}\` names a finding; link it to reference/findings/#${span.toLowerCase().replaceAll("_", "-")}`,
			);
		}
		checkShell(file, span, problems);
	}
}

/** Pins that a guide writes by hand, which go stale with the next release. */
const HAND_PINS = [
	/version:\s*["']?\d+\.\d+/u,
	/(?:^|[\s"'])(?:@archboard\/cli|archboard)@\d/u,
	/"(?:@archboard\/cli|archboard)":\s*"[\^~]?\d/u,
	/miklschmidt\/archboard\/actions\/[\w-]+@(?!\{\{ref\}\})/u,
];

/**
 * Refuse each line that pins a CLI version or an Action ref by hand.
 * @param file The guide.
 * @param source The guide as written.
 * @param problems Where each disagreement goes.
 */
function checkPins(file: string, source: string, problems: string[]): void {
	for (const line of source.split("\n")) {
		if (HAND_PINS.some((pin) => pin.test(line))) {
			problems.push(`${file}: "${line.trim()}" pins by hand; write {{version}} or @{{ref}}`);
		}
	}
}

/** Find disagreements with the program in one authored guide. */
export function guideProblems(file: string, written: string): string[] {
	const problems: string[] = [];
	checkPins(file, written, problems);
	// The rest reads the guide as main's docs show it.
	const source = written.replaceAll("{{version}}", reference.version).replaceAll("{{ref}}", "main");
	for (const variable of new Set(source.match(/\bARCHBOARD_[A-Z0-9_]+\b/gu) ?? [])) {
		if (!environment.has(variable))
			problems.push(`${file}: the CLI reads no environment variable ${variable}`);
	}
	const blocks = [...source.matchAll(/^([ \t]*)```(\w*)[^\n]*\n([\s\S]*?)^\1```/gmu)];
	for (const block of blocks) {
		const [, , lang = "", body = ""] = block;
		if (["bash", "sh", "shell"].includes(lang)) checkShell(file, body, problems);
		if (["yaml", "yml"].includes(lang)) checkWorkflow(file, body, problems);
	}
	const prose = blocks.reduce((text, block) => text.replace(block[0], ""), source);
	checkMentions(file, prose, problems);
	checkExits(file, prose, problems);
	checkPermissions(file, prose, problems);
	checkValueTables(file, prose, problems);
	return problems;
}

if (import.meta.main) {
	const guides = readdirSync(GUIDES).filter((name) => name.endsWith(".mdx"));
	const problems = guides.flatMap((entry) =>
		guideProblems(entry, readFileSync(join(GUIDES, entry), "utf8")),
	);
	if (problems.length > 0) {
		throw new Error(
			`The guides disagree with the program:\n${problems.map((one) => `- ${one}`).join("\n")}`,
		);
	}
	console.log(`guides: ${guides.length} guides agree with the CLI and the Actions`);
}
