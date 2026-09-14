// One CLI invocation from argv to exit code: help and version, retired-command guidance,
// global flag capture, dispatch, and an interruptible run of the selected contract.
//
// Help is answered first and from the command table alone. A help request is
// resolved before any global flag is applied, any prerequisite checked, any
// input read or any handler run, so `--help` anywhere in an invocation prints
// help and exits 0 whatever else the invocation got wrong.
import { CliUsageError } from "@/cli/command-contract/contract";
import type { AnyCommandContract, SharedOptionKey } from "@/cli/command-contract/contract";
import type { CliBootstrap } from "@/cli/command-contract/bootstrap";
import { isHelpInvocation } from "@/cli/command-contract/bootstrap";
import { runCommand } from "@/cli/command-contract/runner";
import {
	inapplicableSharedOptions,
	SHARED_OPTIONS,
	SHARED_OPTION_KEYS,
} from "@/cli/command-contract/shared-options";
import {
	setExpectedVersion,
	setRequestedBoard,
	setWriteDoing,
	setWriteSession,
} from "@/runtime/engine/canvas-client";
import { packageVersion } from "@/runtime/engine/package-version";
import { CLI_INTERRUPT_CLEANUP_MS } from "@/shared/timing/timing";
import type { CommandRoutes, RouteOwner } from "@/cli/command-routing/lib/route";
import { helpText, usageLine } from "@/cli/command-routing/lib/help";
import { dispatchedCommand } from "@/cli/command-routing/lib/dispatch";
import { exitCodeFor, reportFailure } from "@/cli/command-routing/lib/exit-codes";
import {
	takeBoardFlag,
	takeDoingFlag,
	takeSessionFlag,
	takeExpectVersionFlag,
} from "@/cli/command-routing/lib/global-flags";

/**
 * Runs a command contract while forwarding SIGINT and SIGTERM as an abort, then re-raises
 * the signal once cleanup has finished (or after the cleanup grace period, whichever is first).
 * @param commandContract - The contract to run.
 * @param argv - The contract's own arguments.
 */
async function runInterruptibleCommand(
	commandContract: AnyCommandContract,
	argv: readonly string[],
): Promise<void> {
	const controller = new AbortController();
	let interrupted: NodeJS.Signals | undefined;
	let forceTimer: ReturnType<typeof setTimeout> | undefined;
	/**
	 * Detaches the signal handlers so a second signal takes the default path.
	 */
	const remove = (): void => {
		process.off("SIGINT", interrupt);
		process.off("SIGTERM", interrupt);
	};
	/**
	 * First signal: abort the command and arm the grace timer that force-exits if cleanup hangs.
	 * @param signal - The signal received.
	 */
	const interrupt = (signal: NodeJS.Signals): void => {
		if (interrupted) {
			return;
		}
		interrupted = signal;
		controller.abort(new Error(`CLI interrupted by ${signal}.`));
		forceTimer = setTimeout(() => {
			remove();
			process.kill(process.pid, signal);
		}, CLI_INTERRUPT_CLEANUP_MS);
	};
	process.on("SIGINT", interrupt);
	process.on("SIGTERM", interrupt);
	try {
		await runCommand(commandContract, argv, controller.signal);
	} finally {
		remove();
		if (forceTimer !== undefined) {
			clearTimeout(forceTimer);
		}
		if (interrupted) {
			process.kill(process.pid, interrupted);
		}
	}
}

const RETIRED_COMMANDS: Readonly<Record<string, string>> = {
	pane: "Use `archboard browser open` or `archboard browser close <pane>`.",
	panes: "Use `archboard browser panes`.",
	selection: "Use `archboard browser selection --pane <spec>`.",
	viewport: "Use `archboard browser viewport --pane <spec> ...`.",
	screenshot: "Use `archboard browser capture --pane <spec> ...`.",
};

/**
 * Explains an unknown command on stderr: a retired spelling points at its replacement, and
 * the removed `inject` says where board changes now go.
 * @param name - The command name that matched nothing.
 */
function reportUnknownCommand(name: string): void {
	const retired = RETIRED_COMMANDS[name];
	if (retired !== undefined) {
		process.stderr.write(`Command "${name}" was removed. ${retired}\n`);
		return;
	}
	const migration =
		name === "inject"
			? " Board changes now reach the linked Codex workbench; inspect or test the connection there."
			: "";
	process.stderr.write(
		`Unknown command "${name}".${migration} Run \`archboard help\` for the list.\n`,
	);
}

/**
 * Whether an argument is a help flag, wherever it appears.
 * @param name - An argument.
 * @returns True for `--help` or `-h`.
 */
function isHelpFlag(name: string): boolean {
	return name === "--help" || name === "-h";
}

/**
 * Whether the first argument asks for the version in any of its spellings.
 * @param name - The first argument.
 * @returns True for `version`, `--version` or `-v`.
 */
function isVersionRequest(name: string): boolean {
	return name === "--version" || name === "-v" || name === "version";
}

/**
 * The shared option spelling one token uses, if any.
 * @param token - One invocation token.
 * @returns Its shared spelling, or undefined.
 */
function sharedSpelling(token: string): string | undefined {
	for (const key of SHARED_OPTION_KEYS) {
		const spelling = SHARED_OPTIONS[key].spellings[0];
		if (token === spelling || token.startsWith(`${spelling}=`)) {
			return spelling;
		}
	}
	return undefined;
}

/**
 * Whether a separated shared-option value should be consumed beside its flag.
 * @param token - The option token.
 * @param spelling - Its canonical spelling.
 * @param following - The following token, if any.
 * @returns True when the following token is its value.
 */
function consumesSharedValue(
	token: string,
	spelling: string,
	following: string | undefined,
): boolean {
	return token === spelling && following !== undefined && !isHelpFlag(following);
}

/**
 * The invocation with help flags and shared options, including their values, removed.
 * @param args - The invocation.
 * @returns Only possible command and positional words.
 */
function helpWords(args: readonly string[]): string[] {
	const words: string[] = [];
	for (let index = 0; index < args.length; index += 1) {
		const token = args[index]!;
		if (isHelpFlag(token)) {
			continue;
		}
		const spelling = sharedSpelling(token);
		if (spelling !== undefined) {
			if (consumesSharedValue(token, spelling, args[index + 1])) {
				index += 1;
			}
			continue;
		}
		words.push(token);
	}
	return words;
}

/**
 * The deepest consecutive route named by the words.
 * @param routes - The command table.
 * @param words - Possible command words.
 * @returns The registered path prefix.
 */
function topicPath(routes: CommandRoutes, words: readonly string[]): string[] {
	const root = words[0];
	if (root === undefined) {
		return [];
	}
	const first = routes[root];
	if (first === undefined) {
		return [];
	}
	const topic = [root];
	let route = first;
	for (const word of words.slice(1)) {
		const child = route.children?.[word];
		if (child === undefined) {
			break;
		}
		topic.push(word);
		route = child;
	}
	return topic;
}

/**
 * The command words a help request is about, with shared option values kept
 * from masquerading as subcommands.
 * @param routes - The command table.
 * @param args - The invocation, including the command name.
 * @returns The registered path to look up.
 */
function helpTopic(routes: CommandRoutes, args: readonly string[]): string[] {
	const words = helpWords(args);
	if (words[0] === "help") {
		words.shift();
	}
	return topicPath(routes, words);
}

/**
 * Prints the help an invocation asks for, when it asks for any.
 * @param routes - The command table.
 * @param argv - The arguments after the executable name.
 * @returns True when help was printed.
 */
function printedHelp(routes: CommandRoutes, argv: readonly string[]): boolean {
	if (!isHelpInvocation(argv)) {
		return false;
	}
	process.stdout.write(helpText(routes, packageVersion(), helpTopic(routes, argv)));
	return true;
}

/**
 * Refuses the two removed `board` spellings that used to touch panes.
 * @param name - The command name.
 * @param rest - The remaining arguments.
 */
function refuseRetiredBoardForms(name: string, rest: readonly string[]): void {
	if (name !== "board") {
		return;
	}
	if (rest[0] === "open") {
		throw new CliUsageError("`board open` was removed. Use `browser show <board> --pane <spec>`.");
	}
	if (rest.some((token) => token === "--pane" || token.startsWith("--pane="))) {
		throw new CliUsageError(
			"Board commands do not change panes. Use `browser show <board> --pane <spec>`.",
		);
	}
}

/** The shared options one invocation stated, with their values. */
interface StatedShared {
	readonly url: string | null;
	readonly board: string | null;
	readonly doing: string | null;
	readonly session: string | null;
	readonly expectVersion: number | null;
}

/**
 * Takes the shared options out of the arguments, without applying any of them.
 * @param rest - The arguments after the command name; the flags are spliced out.
 * @param bootstrap - What the bootstrap already took.
 * @returns What was stated.
 */
function takeShared(rest: string[], bootstrap: CliBootstrap): StatedShared {
	return {
		url: bootstrap.url,
		board: takeBoardFlag(rest),
		doing: takeDoingFlag(rest),
		session: takeSessionFlag(rest),
		expectVersion: takeExpectVersionFlag(rest),
	};
}

/**
 * The shared options an invocation stated, by key.
 * @param stated - What was stated.
 * @returns The keys with a value.
 */
function statedKeys(stated: StatedShared): SharedOptionKey[] {
	const keys: SharedOptionKey[] = [];
	if (stated.url !== null) keys.push("url");
	if (stated.board !== null) keys.push("board");
	if (stated.doing !== null) keys.push("doing");
	if (stated.expectVersion !== null) keys.push("expect-version");
	if (stated.session !== null) keys.push("as-session");
	return keys;
}

/**
 * Refuses a shared option the selected command does not read. Accepting it
 * would let a person believe it did something — a `--doing` on a read, an
 * `--expect-version` on a command that checks no version.
 * @param selected - The command that will run.
 * @param stated - What the invocation stated.
 * @param argv - The selected command's local arguments, for conditional exclusions.
 * @throws {CliUsageError} Naming the refused options and the command.
 */
function assertSharedApplies(
	selected: RouteOwner,
	stated: StatedShared,
	argv: readonly string[] = [],
): void {
	const excluded = new Set(
		selected.contract.parameters.flatMap((parameter) => {
			if (parameter.kind !== "option" || parameter.excludesShared === undefined) {
				return [];
			}
			const present = argv.some((token) =>
				parameter.spellings.some(
					(spelling) => token === spelling || token.startsWith(`${spelling}=`),
				),
			);
			return present ? parameter.excludesShared : [];
		}),
	);
	const applicable = selected.contract.shared.filter((key) => !excluded.has(key));
	const refused = inapplicableSharedOptions(applicable, statedKeys(stated));
	if (refused.length === 0) {
		return;
	}
	const path = selected.contract.path.join(" ");
	const reads = selected.contract.shared.length === 0 ? "none of the shared options" : "";
	throw new CliUsageError(
		`${refused.join(", ")} does not apply to \`archboard ${path}\`${reads ? `, which reads ${reads}` : ""}. ` +
			`Run \`archboard help ${path}\` to see the options it reads.`,
	);
}

/**
 * Resolves what runs. A namespace that refuses its bare form is still asked
 * whether the shared options apply to it first, so a person who wrote one that
 * does not is told about the flag rather than only about the missing subcommand.
 * @param command - The top-level route.
 * @param rest - The arguments after the command name, shared options removed.
 * @param stated - What the invocation stated.
 * @returns The dispatch.
 */
function dispatchedTo(
	command: CommandRoutes[string],
	rest: readonly string[],
	stated: StatedShared,
): ReturnType<typeof dispatchedCommand> {
	try {
		return dispatchedCommand(command, rest);
	} catch (error) {
		assertSharedApplies(command.owner, stated, rest);
		throw error;
	}
}

/**
 * Makes what the invocation stated the fact every later request carries.
 * @param stated - What the invocation stated.
 */
function applyShared(stated: StatedShared): void {
	setRequestedBoard(stated.board);
	setWriteDoing(stated.doing);
	setWriteSession(stated.session);
	setExpectedVersion(stated.expectVersion);
}

/**
 * The route an invocation runs, once the forms that print and exit — help,
 * the version, an unknown command — have been answered.
 * @param routes - The command table.
 * @param argv - The arguments after the executable name.
 * @returns The route, or null when the invocation has already been answered.
 */
function commandToRun(
	routes: CommandRoutes,
	argv: readonly string[],
): CommandRoutes[string] | null {
	if (printedHelp(routes, argv)) {
		return null;
	}
	const name = argv[0];
	if (name === undefined) {
		return null;
	}
	if (isVersionRequest(name)) {
		process.stdout.write(`${packageVersion()}\n`);
		return null;
	}
	const command = routes[name];
	if (command === undefined) {
		reportUnknownCommand(name);
		process.exitCode = 2;
		return null;
	}
	return command;
}

/**
 * Runs one CLI invocation against the command table and sets the process exit code.
 * @param routes - The command table.
 * @param argv - The arguments after the executable name.
 * @param bootstrap - What the bootstrap took before runtime configuration loaded.
 */
async function runCliWith(
	routes: CommandRoutes,
	argv: string[],
	bootstrap: CliBootstrap = { url: null, help: false },
): Promise<void> {
	const command = commandToRun(routes, argv);
	if (command === null) {
		return;
	}
	const [name = "", ...rest] = argv;
	let selected: RouteOwner = command.owner;
	try {
		refuseRetiredBoardForms(name, rest);
		const stated = takeShared(rest, bootstrap);
		const dispatched = dispatchedTo(command, rest, stated);
		selected = dispatched.selected;
		assertSharedApplies(selected, stated, dispatched.argv);
		applyShared(stated);
		await runInterruptibleCommand(selected.contract, dispatched.argv);
	} catch (error) {
		reportFailure(error, usageLine(routes, selected.contract.path));
		process.exitCode = exitCodeFor(error, selected);
	}
}

export { runCliWith, type CliBootstrap };
