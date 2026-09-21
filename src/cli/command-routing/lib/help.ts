// Help, projected from the command table and the contracts it names.
//
// Commander lays it out: usage, arguments, options, the immediate subcommands
// of a namespace, and the examples and notes a contract or route adds. Nothing
// here is written by hand for one command — what a command's help says is
// what its contract declares, so a flag that parses is a flag help shows.

import { Command } from "commander";
import { declareCommand } from "@/cli/command-contract/commander";
import { SHARED_OPTIONS, SHARED_OPTION_KEYS } from "@/cli/command-contract/shared-options";
import type { CommandRoute, CommandRoutes } from "@/cli/command-routing/lib/route";

/** The program every usage line starts with. */
const PROGRAM = "archboard";

/** The command tree, and what each command's help says after Commander's part. */
interface HelpTree {
	readonly root: Command;
	readonly after: ReadonlyMap<Command, string>;
}

/**
 * One shared option as its usage spells it: the flag and its placeholder.
 * @param key - The shared option.
 * @returns The spelling.
 */
function sharedSpelling(key: (typeof SHARED_OPTION_KEYS)[number]): string {
	const option = SHARED_OPTIONS[key];
	return `${option.spellings[0]} <${option.placeholder ?? "value"}>`;
}

/**
 * What the root help says after the command list: the options every command
 * may share, where the canvas is, and the exit codes.
 * @returns The text.
 */
function conventions(): string {
	const width = Math.max(...SHARED_OPTION_KEYS.map((key) => sharedSpelling(key).length));
	return [
		"",
		"Shared options (each command's help lists the ones it reads; any other is refused):",
		...SHARED_OPTION_KEYS.map(
			(key) => `  ${sharedSpelling(key).padEnd(width)}  ${SHARED_OPTIONS[key].description}`,
		),
		"",
		"Commands that contact the canvas start it when nothing answers, unless",
		"EXCALIDRAW_NO_AUTOSTART=1. Results are JSON on stdout unless a command's help says",
		"otherwise; diagnostics go to stderr.",
		"",
		"Exit codes: 0 ok, 1 error, 2 usage, 3 canvas unreachable, 4 browser pane required,",
		"5 board write refused (held, claim revoked, version moved, or the note changed on disk).",
		"`check` exits 1 while the vault still has diagnostics.",
		"",
		`Inside the archboard checkout, \`./bin/canvas <command>\` runs the CLI from source.`,
		`Run \`${PROGRAM} help <command>\` or \`${PROGRAM} <command> --help\` for one command.`,
		"",
	].join("\n");
}

/**
 * What a route's help says after its options: how the bare namespace behaves,
 * and the contract's examples.
 * @param route - The route.
 * @param path - The route's words, for the examples of the bare form.
 * @returns The text, empty when there is nothing to add.
 */
function afterHelp(route: CommandRoute, path: readonly string[]): string {
	const lines: string[] = [];
	if (route.bare?.kind === "default") {
		const here = `${PROGRAM} ${path.join(" ")}`;
		lines.push("", `Without a subcommand, \`${here}\` runs \`${here} ${route.bare.child}\`.`);
	}
	const { examples } = route.owner.contract;
	if (examples.length > 0) {
		lines.push("", "Examples:", ...examples.map((example) => `  ${example}`));
	}
	return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

/**
 * One route as a Commander command: its contract's parameters and the shared
 * options it reads, then each child as a subcommand of its own.
 * @param name - The route's own word.
 * @param route - The route.
 * @param path - The route's words so far, including its own.
 * @param after - Where each command's trailing help text is kept.
 * @returns The command.
 */
function commandFor(
	name: string,
	route: CommandRoute,
	path: readonly string[],
	after: Map<Command, string>,
): Command {
	const { contract } = route.owner;
	const { command } = declareCommand(contract, "help", name);
	addBareOptions(command, route);
	command
		.summary(contract.summary)
		.description(contract.description)
		.helpOption("-h, --help", "Show this help");
	const children = Object.entries(route.children ?? {});
	// The one help command is the root's `help <path>`; descendants use flags.
	command.helpCommand(false);
	after.set(command, afterHelp(route, path));
	for (const [segment, child] of children) {
		command.addCommand(commandFor(segment, child, [...path, segment], after));
	}
	return command;
}

/**
 * Adds the options accepted by a namespace's bare default to the namespace
 * menu. For example, `repo --text` runs `repo list --text`, so `repo --help`
 * must show `--text` even while it also lists the immediate subcommands.
 * @param command - The namespace's Commander model.
 * @param route - The namespace route.
 */
function addBareOptions(command: Command, route: CommandRoute): void {
	const defaults = bareOptions(route);
	for (const option of defaults) {
		if (!hasOption(command, option)) {
			command.addOption(option);
		}
	}
}

/**
 * The options accepted by a namespace's bare default.
 * @param route - The namespace route.
 * @returns The default child's options, or none.
 */
function bareOptions(route: CommandRoute) {
	if (route.bare?.kind !== "default" || !route.bare.withLeadingOptions) {
		return [];
	}
	const child = route.children?.[route.bare.child];
	return child === undefined ? [] : declareCommand(child.owner.contract, "help").command.options;
}

/**
 * Whether a command already declares an option with the same value key.
 * @param command - The command being extended.
 * @param candidate - The option considered for addition.
 * @returns True when it is already present.
 */
function hasOption(command: Command, candidate: Command["options"][number]): boolean {
	return command.options.some((existing) => existing.attributeName() === candidate.attributeName());
}

/**
 * The whole command table as one Commander tree, rooted at the program.
 * @param routes - The command table.
 * @param version - The program version, for `--version`.
 * @returns The tree and its trailing texts.
 */
function commanderTree(routes: CommandRoutes, version: string): HelpTree {
	const after = new Map<Command, string>();
	const root = new Command(PROGRAM)
		.description(
			"Agent-authored architecture boards: an agent states what an architecture is, " +
				"the canvas draws it, and a user reads, compares and presents it.",
		)
		.version(version, "-v, --version", "Print the version")
		.helpOption("-h, --help", "Show this help")
		.helpCommand("help [command]", "Show help for one command");
	after.set(root, conventions());
	for (const [name, route] of Object.entries(routes)) {
		root.addCommand(commandFor(name, route, [name], after));
	}
	return { root, after };
}

/**
 * The deepest command a topic names: as many of its words as name a command,
 * and the root when none do.
 * @param root - The tree's root.
 * @param topic - The words after `help`, or the command words of an invocation.
 * @returns The command reached.
 */
function commandAt(root: Command, topic: readonly string[]): Command {
	let at = root;
	for (const word of topic) {
		const next = at.commands.find((child) => child.name() === word);
		if (next === undefined) {
			break;
		}
		at = next;
	}
	return at;
}

/**
 * The help one topic asks for.
 * @param routes - The command table.
 * @param version - The program version.
 * @param topic - The command words; none for the root.
 * @returns The help text, complete.
 */
function helpText(routes: CommandRoutes, version: string, topic: readonly string[]): string {
	const tree = commanderTree(routes, version);
	const command = commandAt(tree.root, topic);
	return command.helpInformation() + (tree.after.get(command) ?? "");
}

/**
 * The usage line for one command, for the line printed after a usage error.
 * @param routes - The command table.
 * @param path - The command's words.
 * @returns The usage, program name included.
 */
function usageLine(routes: CommandRoutes, path: readonly string[]): string {
	const command = commandAt(commanderTree(routes, "").root, path);
	return command.createHelp().commandUsage(command);
}

export { commanderTree, helpText, usageLine, type HelpTree };
