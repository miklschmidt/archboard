// The reference that scripts/reference.ts writes from the CLI's own registry, read at build time.
// The shapes here are what that script writes; the script is the one place that knows the CLI.
import { readFileSync } from "node:fs";
import type {
	ENVIRONMENT,
	EXIT_CODES,
} from "../../../apps/cli/src/cli/routing/protocol/conventions.ts";
import { join } from "node:path";

export interface OptionEntry {
	readonly kind: "option";
	readonly spellings: readonly string[];
	readonly value: "none" | "required" | "optional";
	readonly placeholder: string | null;
	readonly description: string;
	readonly required: boolean;
	readonly requiredWhen: string | null;
	readonly repeatable: boolean;
	readonly choices: readonly string[] | null;
	readonly default: string | null;
}

export interface PositionalEntry {
	readonly kind: "positional";
	readonly name: string;
	readonly choices: readonly string[] | null;
	readonly description: string;
	readonly required: boolean;
	readonly repeatable: boolean;
}

export type ParameterEntry = OptionEntry | PositionalEntry;

export interface CommandEntry {
	readonly name: string;
	readonly parent: string | null;
	/** Set on a command that routes to its subcommands: the subcommand that it runs bare. */
	readonly router: { runs: string | null } | null;
	readonly summary: string;
	readonly description: string;
	readonly examples: readonly string[];
	readonly parameters: readonly ParameterEntry[];
	readonly shared: readonly string[];
	readonly prerequisites: readonly string[];
	readonly effects: readonly string[];
	readonly output: readonly { mode: string; description: string }[];
	readonly outcomes: readonly { id: string; exit: number; description: string }[];
	readonly refusals: readonly { code: string; exit: number; description: string }[];
}

export interface SharedEntry {
	readonly key: string;
	readonly spellings: readonly string[];
	readonly placeholder: string | null;
	readonly description: string;
	readonly default: string | null;
}

export type JsonSchema = { readonly [key: string]: unknown };

export interface SchemaEntry {
	readonly name: string;
	readonly title: string;
	readonly schema: JsonSchema;
}

export interface FindingEntry {
	/** The codes that share this explanation, usually one. */
	readonly codes: readonly string[];
	readonly check: "code" | "embeds" | "semantics";
	readonly severity: "warning" | "error" | "information" | "skip";
	readonly text: string;
}

export interface ActionEntry {
	readonly slug: string;
	readonly uses: string;
	readonly name: string;
	readonly description: string;
	readonly inputs: readonly {
		name: string;
		description: string;
		default: string | null;
		required: boolean;
	}[];
	readonly outputs: readonly { name: string; description: string }[];
}

export interface Reference {
	readonly version: string;
	/** Numbers that the guides state: the release port and the job summary limits. */
	readonly facts: {
		readonly releasePort: number;
		readonly summaryRows: number;
		readonly summaryDetails: number;
		readonly annotationsPerLevel: number;
	};
	readonly exitCodes: typeof EXIT_CODES;
	readonly environment: typeof ENVIRONMENT;
	readonly shared: readonly SharedEntry[];
	readonly commands: readonly CommandEntry[];
	readonly schemas: readonly SchemaEntry[];
	readonly findings: readonly FindingEntry[];
	readonly actions: readonly ActionEntry[];
}

const FILE = join(process.cwd(), "src/generated/reference.json");

/** The reference. A missing file names the command that writes it. */
export const reference: Reference = (() => {
	try {
		return JSON.parse(readFileSync(FILE, "utf8")) as Reference;
	} catch {
		throw new Error(
			`The docs need ${FILE}. Run bun site/scripts/reference.ts from the repository root first.`,
		);
	}
})();

/** The commands under one top-level command, the top-level command first. */
export function commandsUnder(top: string): CommandEntry[] {
	return reference.commands.filter(
		(command) => command.name === top || command.name.startsWith(`${top} `),
	);
}

/** The anchor of a command on its page: `model edit` is `model-edit`. */
export function commandAnchor(name: string): string {
	return name.replaceAll(" ", "-");
}

/** The anchor of a finding code: `RELATIONSHIP_UNDRAWN` is `relationship-undrawn`. */
export function findingAnchor(code: string): string {
	return code.toLowerCase().replaceAll("_", "-");
}

/** The shared options one command reads, in the shared order. */
export function sharedOf(command: CommandEntry): SharedEntry[] {
	return reference.shared.filter((option) => command.shared.includes(option.key));
}

/**
 * The one-line synopsis of a command: its name, its positionals, then each option, with the
 * optional ones in brackets.
 */
export function synopsis(command: CommandEntry): string {
	const words = [`archboard ${command.name}`];
	const visible = command.parameters;
	for (const parameter of visible) {
		if (parameter.kind !== "positional") continue;
		const word = `<${parameter.name}>${parameter.repeatable ? "..." : ""}`;
		words.push(parameter.required ? word : `[${word}]`);
	}
	const options = [
		...visible.filter((parameter): parameter is OptionEntry => parameter.kind === "option"),
		...sharedOf(command).map((option) => ({
			kind: "option" as const,
			spellings: option.spellings,
			value: "required" as const,
			placeholder: option.placeholder,
			required: option.key === "doing",
			repeatable: false,
		})),
	];
	for (const option of options) {
		const value = option.value === "none" ? "" : ` <${option.placeholder ?? "value"}>`;
		const word = `${option.spellings[0]}${value}`;
		words.push(option.required ? word : `[${word}]`);
	}
	return words.join(" ");
}

/** A block of a description: a paragraph, a list, or a short head over the block after it. */
export type DescriptionBlock =
	| { kind: "paragraph"; text: string }
	| { kind: "list"; ordered: boolean; items: string[] }
	| { kind: "head"; text: string };

/** A list item's marker, as the CLI's help writes it: `-`, `*` or a number and a period. */
const LIST_ITEM = /^(?:([-*])|\d+\.)\s+/u;

/**
 * A command's description as blocks, in the format that the CLI's terminal help also reads
 * (`apps/cli/src/cli/routing/rules/help-style.ts`): a blank line starts a paragraph, a line
 * that ends with a colon is a head, and a line that starts with `-`, `*` or `1.` is a list item.
 */
export function descriptionBlocks(text: string): DescriptionBlock[] {
	const blocks: DescriptionBlock[] = [];
	let joinable = false;
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		const last = blocks.at(-1);
		if (trimmed === "") {
			joinable = false;
			continue;
		}
		const item = LIST_ITEM.exec(trimmed);
		if (item !== null) {
			const ordered = item[1] === undefined;
			const words = trimmed.slice(item[0].length);
			if (last?.kind === "list" && last.ordered === ordered) last.items.push(words);
			else blocks.push({ kind: "list", ordered, items: [words] });
			joinable = false;
		} else if (trimmed.endsWith(":") && trimmed.length < 90) {
			blocks.push({ kind: "head", text: trimmed.slice(0, -1) });
			joinable = false;
		} else if (joinable && last?.kind === "paragraph") {
			// A line break inside a paragraph is only where the source wrapped it.
			last.text = `${last.text} ${trimmed}`;
		} else {
			blocks.push({ kind: "paragraph", text: trimmed });
			joinable = true;
		}
	}
	return blocks;
}

/** A flag, a code in capitals, a file name with a known extension, or a path with a slash. */
const BARE_CODE = new RegExp(
	String.raw`(^|[\s(])(` +
		[
			String.raw`--[a-z][a-z0-9-]*(?:=[^\s,;)]+)?`,
			String.raw`-C\b`,
			String.raw`[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+`,
			String.raw`(?!Node\.js)[\w.@~-]*[\w-]\.(?:md|json|ya?ml|ts|js|svg|png|wav|mp4|webm|toml|lock)`,
			// A path's segments never end in a period, so the period that ends a sentence stays out.
			String.raw`(?:&lt;[\w-]+&gt;|[\w.~-]*)?(?:\/[\w.*&;-]*[\w*;-])+\/?`,
		].join("|") +
		String.raw`)(?=[\s,.;:)]|$)`,
	"gu",
);

/**
 * Words with `code` in backticks, and the codes and commands that the CLI writes bare, set as
 * HTML with inline code. The text is escaped first, so it is never read as markup.
 */
export function inlineCode(text: string): string {
	const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
	// Spans in backticks first, then, outside them, the words the CLI writes bare: flags, codes in
	// capitals, file names and paths.
	return escaped
		.split(/(`[^`]+`)/u)
		.map((part) =>
			part.startsWith("`") && part.endsWith("`") && part.length > 1
				? `<code>${part.slice(1, -1)}</code>`
				: part.replace(BARE_CODE, "$1<code>$2</code>"),
		)
		.join("");
}

/** What a command needs and does, in a reader's words. */
export function traits(command: CommandEntry): string[] {
	const words: string[] = [];
	if (command.prerequisites.includes("server")) words.push("Needs the server");
	if (command.prerequisites.includes("browser")) words.push("Needs a browser pane");
	if (command.prerequisites.includes("claim")) words.push("Needs a claim");
	const model = command.effects.some(
		(effect) => effect === "write" || effect === "server-state-write",
	);
	const file = command.effects.includes("local-write");
	if (model) words.push("Writes the model");
	if (file) words.push("Writes files");
	if (!model && !file) words.push("Reads only");
	return words;
}
