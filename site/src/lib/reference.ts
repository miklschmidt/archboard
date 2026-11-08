// The reference that scripts/reference.ts writes from the CLI's own registry, read at build time.
// The shapes here are what that script writes; the script is the one place that knows the CLI.
import { readFileSync } from "node:fs";
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
	| { kind: "list"; items: string[] }
	| { kind: "head"; text: string };

/**
 * A command's description as blocks. The CLI writes a description as paragraphs and as lists
 * whose items start with "- ", under a line that ends with a colon.
 */
export function descriptionBlocks(text: string): DescriptionBlock[] {
	const blocks: DescriptionBlock[] = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "") continue;
		const last = blocks.at(-1);
		if (trimmed.startsWith("- ")) {
			const item = trimmed.slice(2);
			if (last?.kind === "list") last.items.push(item);
			else blocks.push({ kind: "list", items: [item] });
		} else if (trimmed.endsWith(":") && trimmed.length < 90) {
			blocks.push({ kind: "head", text: trimmed.slice(0, -1) });
		} else {
			blocks.push({ kind: "paragraph", text: trimmed });
		}
	}
	return blocks;
}

/**
 * Words with `code` in backticks, and the codes and commands that the CLI writes bare, set as
 * HTML with inline code. The text is escaped first, so it is never read as markup.
 */
export function inlineCode(text: string): string {
	const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
	return escaped
		.replace(/`([^`]+)`/g, "<code>$1</code>")
		.replace(
			/(^|[\s(])(--[a-z][a-z0-9-]*(?:=[^\s,;)]+)?|-C\b|[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)(?=[\s,.;:)]|$)/g,
			"$1<code>$2</code>",
		);
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
