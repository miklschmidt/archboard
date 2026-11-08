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
//   its row in the reference. The link makes a rename visible: `links.ts` fails on its anchor.
//
// Run from the repository root, after `reference.ts`:
//   bun site/scripts/guides.ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import reference from "../src/generated/reference.json" with { type: "json" };

const GUIDES = join(import.meta.dir, "../src/content/docs");

/** Options that every command reads, before or after its name. */
const GLOBAL_FLAGS = new Set(["--text", "--help", "-h", "--version", "-v"]);
/** Words after `archboard` that are no command of the registry but still run. */
const BUILT_INS = new Set(["help", "version"]);

const commands = new Map(reference.commands.map((command) => [command.name, command]));
const shared = new Map(reference.shared.map((option) => [option.key, option.spellings]));
const actions = new Map(reference.actions.map((action) => [action.slug, action]));
const environment = new Set(reference.environment.map((entry) => entry.name));
const findings = new Set(reference.findings.flatMap((finding) => finding.codes));

/** Each problem, as `file: text`. */
const problems: string[] = [];

/**
 * Read one `archboard …` invocation: the longest command name that it starts with, then its flags.
 * @param file The guide.
 * @param line The invocation, from `archboard` to the end of the shell command.
 */
function checkInvocation(file: string, line: string): void {
	const words = line.trim().split(/\s+/u).slice(1);
	// The global options can come before the command: --text, -C <dir> and --url <url>.
	while (words[0] === "--text" || words[0] === "-C" || words[0] === "--url") {
		words.splice(0, words[0] === "--text" ? 1 : 2);
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
	const flags = new Set([
		...GLOBAL_FLAGS,
		...command.parameters.flatMap((parameter) => parameter.spellings),
		...command.shared.flatMap((key) => shared.get(key) ?? []),
	]);
	for (const word of rest) {
		const flag = /^(--?[A-Za-z][\w-]*)/u.exec(word)?.[1];
		if (flag !== undefined && !flags.has(flag)) {
			problems.push(`${file}: "${line}": "archboard ${name}" has no option ${flag}`);
		}
	}
}

/**
 * Read every `archboard …` invocation in a piece of shell or a code span. An invocation ends at a
 * shell operator or a comment.
 */
function checkShell(file: string, text: string): void {
	for (const match of text.matchAll(/(?:^|[\s(;&|$])(archboard(?:[ \t]+[^\s;&|>#)]+)*)/gmu)) {
		checkInvocation(file, match[1] ?? "");
	}
}

/**
 * Read each step of a workflow that uses an Action of this repository, and its `with:` keys.
 * @param file The guide.
 * @param yaml The YAML of one code block.
 */
function checkWorkflow(file: string, yaml: string): void {
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
	// A job that runs an Action whose description asks for `fetch-depth: 0` checks out that deep.
	const deep = [...actions.values()].filter((action) =>
		action.description.includes("`fetch-depth: 0`"),
	);
	for (const action of deep) {
		if (yaml.includes(`actions/${action.slug}@`) && !/fetch-depth:\s*0\b/u.test(yaml)) {
			problems.push(
				`${file}: a workflow runs ${action.slug} without the checkout's fetch-depth: 0`,
			);
		}
	}
	const visit = (node: unknown): void => {
		if (Array.isArray(node)) return node.forEach(visit);
		if (typeof node !== "object" || node === null) return;
		const { uses, with: inputs } = node as { uses?: unknown; with?: unknown };
		const slug =
			typeof uses === "string"
				? /^miklschmidt\/archboard\/actions\/([\w-]+)@/u.exec(uses)?.[1]
				: undefined;
		if (slug !== undefined) {
			const action = actions.get(slug);
			const names = new Set(action?.inputs.map((input) => input.name));
			if (action === undefined) problems.push(`${file}: no Action "${slug}" in actions/`);
			for (const key of Object.keys(typeof inputs === "object" && inputs !== null ? inputs : {})) {
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
function checkPermissions(file: string, prose: string): void {
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
function checkExits(file: string, prose: string): void {
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
function checkValue(file: string, target: string, value: string, line: string): void {
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
function checkValueTables(file: string, prose: string): void {
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
			checkValue(file, target, first.slice(1, -1), line);
	}
}

/**
 * Require a link on each code span that names an Action input or output, or a finding code.
 * @param file The guide.
 * @param prose The guide without its code blocks.
 */
function checkMentions(file: string, prose: string): void {
	const ports = new Set(
		reference.actions.flatMap((action) => [
			...action.inputs.map((input) => input.name),
			...action.outputs.map((output) => output.name),
		]),
	);
	for (const match of prose.matchAll(/(\[)?`([^`\n]+)`(\]\(([^)\s]+)\))?/gu)) {
		const span = match[2] ?? "";
		const target = match[4] ?? "";
		const key = /^([\w-]+)(?::|$)/u.exec(span)?.[1] ?? "";
		if (ports.has(key) && !target.includes("reference/actions/#")) {
			problems.push(
				`${file}: \`${span}\` names an Action port; link it to reference/actions/#<action>-${key}`,
			);
		}
		const value = /^[\w-]+:\s*(.+)$/u.exec(span)?.[1];
		if (value !== undefined) {
			const start = prose.lastIndexOf("\n", match.index) + 1;
			const end = prose.indexOf("\n", match.index);
			checkValue(file, target, value, prose.slice(start, end === -1 ? undefined : end));
		}
		if (findings.has(span) && !target.includes("reference/findings/#")) {
			problems.push(
				`${file}: \`${span}\` names a finding; link it to reference/findings/#${span.toLowerCase().replaceAll("_", "-")}`,
			);
		}
		const variable = /^(ARCHBOARD_[A-Z_]+)(?:=.*)?$/u.exec(span)?.[1];
		if (variable !== undefined && !environment.has(variable)) {
			problems.push(`${file}: the CLI reads no environment variable ${variable}`);
		}
		checkShell(file, span);
	}
}

for (const entry of readdirSync(GUIDES).filter((name) => name.endsWith(".mdx"))) {
	const source = readFileSync(join(GUIDES, entry), "utf8");
	const blocks = [...source.matchAll(/^([ \t]*)```(\w*)[^\n]*\n([\s\S]*?)^\1```/gmu)];
	for (const block of blocks) {
		const [, , lang = "", body = ""] = block;
		if (["bash", "sh", "shell"].includes(lang)) checkShell(entry, body);
		if (["yaml", "yml"].includes(lang)) checkWorkflow(entry, body);
	}
	const prose = blocks.reduce((text, block) => text.replace(block[0], ""), source);
	checkMentions(entry, prose);
	checkExits(entry, prose);
	checkPermissions(entry, prose);
	checkValueTables(entry, prose);
}

if (problems.length > 0) {
	throw new Error(
		`The guides disagree with the program:\n${problems.map((one) => `- ${one}`).join("\n")}`,
	);
}
console.log(`guides: ${readdirSync(GUIDES).length} guides agree with the CLI and the Actions`);
