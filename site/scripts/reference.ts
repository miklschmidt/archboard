// Write the reference that the docs pages draw: every command of the CLI with its options,
// examples and exit codes, the JSON Schemas of the model files and requests, the findings and
// skip reasons of the checks, and the inputs of the GitHub Actions. Each comes from the program
// itself, so the docs never describe another CLI than the one this checkout builds. The answer
// is ignored by Git, like the paintings, and the site's build makes it again.
//
// Run from the repository root:
//   bun site/scripts/reference.ts
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cliContractRegistry } from "../../apps/cli/src/cli/routing/operations/run.ts";
import {
	CHECK_CODE_HELP,
	CHECK_EMBEDS_HELP,
	CHECK_SEMANTICS_HELP,
} from "../../apps/cli/src/cli/commands/vault/operations/check-help.ts";
import { EMBED_CODES } from "../../apps/cli/src/cli/commands/vault/protocol/embeds-answer.ts";
import {
	SCHEMA_NAMES,
	jsonSchema,
} from "../../apps/cli/src/cli/commands/model/operations/schema.ts";
import {
	SHARED_OPTIONS,
	SHARED_OPTION_KEYS,
} from "../../apps/cli/src/cli/contract/protocol/shared-options.ts";
import { RELEASE_PORT } from "../../packages/workspace/src/runtime/services/source-checkout.ts";
import { DETAILED_FINDINGS, TABLE_ROWS } from "../../actions/check/summary.ts";

const ROOT = join(import.meta.dir, "../..");
const OUT = join(import.meta.dir, "../src/generated");

/** The port a release listens on. A checkout's own port would leak into the docs otherwise. */
const RELEASE_URL = `http://127.0.0.1:${String(RELEASE_PORT)}`;

/** A default that names this checkout's server is the release's server in the docs. */
function releaseDefault(value: string | undefined): string | undefined {
	return value?.startsWith("http://127.0.0.1:") ? RELEASE_URL : value;
}

const registry = cliContractRegistry();

/** The command that each router runs bare, such as `check all` for `check`, by the router. */
const bareRouters = new Map(
	registry.flatMap(({ name, bare }) =>
		bare?.kind === "default" ? [[`${name} ${bare.child}`, name] as const] : [],
	),
);

/**
 * A command's examples, each of which must run that command, by its name or by the router that
 * runs it bare. An example that names another command, such as one that was renamed, fails the
 * build so that the docs never show it.
 * @param name The command, such as `model config`.
 * @param examples The examples of its contract.
 * @returns The examples.
 * @throws {Error} When an example runs another command.
 */
function examplesOf(name: string, examples: readonly string[]): string[] {
	const spellings = [name, bareRouters.get(name)].filter((one) => one !== undefined);
	// The global options can come before the command: --text, -C <dir> and --url <url>.
	const command = (example: string) =>
		example.replace(/^archboard (?:(?:--text|-C \S+|--url \S+) )*/u, "archboard ");
	const stale = examples.filter(
		(example) =>
			!spellings.some((spelling) => `${command(example)} `.startsWith(`archboard ${spelling} `)),
	);
	if (stale.length > 0) {
		throw new Error(`The examples of "archboard ${name}" run another command: ${stale.join("; ")}`);
	}
	return [...examples];
}

/** The most words and sentences that one paragraph or list item of a description holds. */
const WALL = { words: 120, sentences: 6 };

/**
 * A command's description, refused when one of its paragraphs or list items is a wall of text.
 * The description follows the format of the terminal help (`help-style.ts`): a blank line starts
 * a paragraph, and a line that starts with `-` or `1.` is a list item.
 * @param name The command.
 * @param description The description.
 * @returns The description.
 */
function descriptionOf(name: string, description: string): string {
	const parts = description
		.split(/\n\s*\n|\n(?=\s*(?:[-*]|\d+\.)\s)/u)
		.map((part) => part.replaceAll(/\s+/gu, " ").trim());
	const walls = parts.filter(
		(part) =>
			part.split(" ").length > WALL.words ||
			(part.match(/[.!?](?:\s|$)/gu) ?? []).length > WALL.sentences,
	);
	if (walls.length > 0) {
		throw new Error(
			`The description of "archboard ${name}" has a wall of text, more than ${String(WALL.words)} words or ${String(WALL.sentences)} sentences: split it into paragraphs or a list. It starts: ${walls.map((wall) => wall.slice(0, 80)).join("; ")}`,
		);
	}
	return description;
}

const commands = registry.map(({ name, parent, bare, contract }) => ({
	name,
	parent: parent ?? null,
	// A command that only routes to its subcommands: the one it runs bare, or none.
	router: bare
		? bare.kind === "default"
			? { runs: `${name} ${bare.child}` }
			: { runs: null }
		: null,
	summary: contract.summary,
	description: descriptionOf(name, contract.description),
	examples: examplesOf(name, contract.examples),
	parameters: contract.parameters
		.filter((parameter) => !parameter.hidden)
		.map((parameter) =>
			parameter.kind === "option"
				? {
						kind: "option" as const,
						spellings: [...parameter.spellings],
						value: parameter.value,
						placeholder: parameter.placeholder ?? null,
						description: parameter.description,
						required: parameter.required === true,
						requiredWhen: parameter.requiredWhen ?? null,
						repeatable: parameter.occurrences === "append",
						choices: parameter.choices ? [...parameter.choices] : null,
						default: releaseDefault(parameter.default) ?? null,
					}
				: {
						kind: "positional" as const,
						name: parameter.name,
						description: parameter.description,
						required: parameter.required === true,
						repeatable: parameter.repeatable === true,
					},
		),
	shared: [...contract.shared],
	prerequisites: [...contract.prerequisites],
	effects: [...contract.effects],
	output: contract.output.cases.map((entry) => ({
		mode: entry.mode,
		description: entry.description,
	})),
	outcomes: (contract.outcomes ?? []).map(({ id, exit, description }) => ({
		id,
		exit,
		description,
	})),
	refusals: contract.refusals.map(({ code, exit, description }) => ({ code, exit, description })),
}));

const shared = SHARED_OPTION_KEYS.map((key) => {
	const option = SHARED_OPTIONS[key];
	return {
		key,
		spellings: [...option.spellings],
		placeholder: option.placeholder ?? null,
		description: option.description,
		default: releaseDefault(option.default) ?? null,
	};
});

const schemas = SCHEMA_NAMES.map((name) => {
	const schema = jsonSchema(name);
	return { name, title: String(schema.title), schema };
});

/** Which severity a list heading of the check help gives the items under it. */
function severityOf(heading: string): "warning" | "error" | "information" | "skip" | null {
	if (heading.startsWith("Warnings")) return "warning";
	if (heading.startsWith("Errors")) return "error";
	if (heading.startsWith("Information")) return "information";
	if (heading.startsWith("What it skips")) return "skip";
	return null;
}

/**
 * The findings and skip reasons a check's help lists: one entry for each line, which names one
 * code or several codes that share the explanation.
 * @param check The check whose help it is.
 * @param help The help text.
 * @returns The codes of each line, with their severity and their explanation as a sentence.
 */
function catalog(check: "code" | "embeds" | "semantics", help: string) {
	const entries: { codes: string[]; check: string; severity: string; text: string }[] = [];
	let severity: ReturnType<typeof severityOf> = null;
	for (const line of help.split("\n")) {
		if (!line.startsWith("- ")) {
			if (line.endsWith(":")) severity = severityOf(line);
			continue;
		}
		if (severity === null) continue;
		const match = /^- ([A-Za-z_, -]+?): (.*)$/.exec(line);
		if (!match) continue;
		const codes = match[1].split(", ").map((code) => code.trim());
		const valid =
			severity === "skip"
				? codes.every((code) => /^[a-z]+(-[a-z]+)+$/.test(code))
				: codes.every((code) => /^[A-Z]+(_[A-Z]+)+$/.test(code));
		if (!valid) continue;
		const text = match[2];
		entries.push({
			codes,
			check,
			severity,
			text: `${text.charAt(0).toUpperCase()}${text.slice(1)}`,
		});
	}
	return entries;
}

const findings = [
	...catalog("semantics", CHECK_SEMANTICS_HELP),
	...catalog("code", CHECK_CODE_HELP),
	...catalog("embeds", CHECK_EMBEDS_HELP),
];

// Every code the embeds check can report must be in its help, so the docs list it.
const unlisted = EMBED_CODES.filter(
	(code) => !findings.some((entry) => entry.codes.includes(code)),
);
if (unlisted.length > 0) {
	throw new Error(`The help of "archboard check embeds" lists no ${unlisted.join(", ")}`);
}

/** The GitHub Actions of this repository, read from their metadata. */
function actions() {
	const directory = join(ROOT, "actions");
	if (!existsSync(directory)) return [];
	return readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(join(directory, entry.name, "action.yml")))
		.map((entry) => {
			const meta = Bun.YAML.parse(
				readFileSync(join(directory, entry.name, "action.yml"), "utf8"),
			) as {
				name: string;
				description: string;
				inputs?: Record<string, { description?: string; default?: string; required?: boolean }>;
				outputs?: Record<string, { description?: string }>;
			};
			return {
				slug: entry.name,
				uses: `miklschmidt/archboard/actions/${entry.name}`,
				name: meta.name,
				description: meta.description,
				inputs: Object.entries(meta.inputs ?? {}).map(([name, input]) => ({
					name,
					description: input.description ?? "",
					default: input.default === undefined ? null : String(input.default),
					required: input.required === true,
				})),
				outputs: Object.entries(meta.outputs ?? {}).map(([name, output]) => {
					// An input and an output share the anchor `<action>-<name>` in the reference.
					if (meta.inputs?.[name] !== undefined) {
						throw new Error(`The Action ${entry.name} has an input and an output named ${name}`);
					}
					return { name, description: output.description ?? "" };
				}),
			};
		});
}

const version = (
	JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string }
).version;

/** Numbers that the guides state, so that a guide reads them here and never copies them. */
const facts = {
	/** The port of a release server. */
	releasePort: RELEASE_PORT,
	/** The findings that the job summary of the check Action lists. */
	summaryRows: TABLE_ROWS,
	/** The errors and warnings whose evidence that summary shows. */
	summaryDetails: DETAILED_FINDINGS,
};

mkdirSync(OUT, { recursive: true });
writeFileSync(
	join(OUT, "reference.json"),
	`${JSON.stringify({ version, facts, shared, commands, schemas, findings, actions: actions() }, null, "\t")}\n`,
);
console.log(
	`reference: ${commands.length} commands, ${schemas.length} schemas, ${findings.length} findings and skips`,
);
