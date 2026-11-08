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
	CHECK_SEMANTICS_HELP,
} from "../../apps/cli/src/cli/commands/vault/operations/check-help.ts";
import {
	SCHEMA_NAMES,
	jsonSchema,
} from "../../apps/cli/src/cli/commands/model/operations/schema.ts";
import {
	SHARED_OPTIONS,
	SHARED_OPTION_KEYS,
} from "../../apps/cli/src/cli/contract/protocol/shared-options.ts";

const ROOT = join(import.meta.dir, "../..");
const OUT = join(import.meta.dir, "../src/generated");

/** The port a release listens on. A checkout's own port would leak into the docs otherwise. */
const RELEASE_URL = "http://127.0.0.1:4242";

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
	description: contract.description,
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
 * The findings and skip reasons a check's help lists, one entry for each code it names.
 * @param check The check whose help it is.
 * @param help The help text.
 * @returns Each code with its severity and its explanation.
 */
function catalog(check: "code" | "semantics", help: string) {
	const entries: { code: string; check: string; severity: string; text: string }[] = [];
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
		for (const code of codes) entries.push({ code, check, severity, text: match[2] });
	}
	return entries;
}

const findings = [
	...catalog("semantics", CHECK_SEMANTICS_HELP),
	...catalog("code", CHECK_CODE_HELP),
];

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
				outputs: Object.entries(meta.outputs ?? {}).map(([name, output]) => ({
					name,
					description: output.description ?? "",
				})),
			};
		});
}

const version = (
	JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string }
).version;

mkdirSync(OUT, { recursive: true });
writeFileSync(
	join(OUT, "reference.json"),
	`${JSON.stringify({ version, shared, commands, schemas, findings, actions: actions() }, null, "\t")}\n`,
);
console.log(
	`reference: ${commands.length} commands, ${schemas.length} schemas, ${findings.length} findings and skips`,
);
