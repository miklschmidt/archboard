// One CLI invocation from argv to exit code: help and version, retired-command guidance,
// global flag capture, dispatch, and an interruptible run of the selected contract.
//
// Help is answered first and from the command table alone. A help request is
// resolved before any global flag is applied, any prerequisite checked, any
// input read or any handler run, so `--help` anywhere in an invocation prints
// help and exits 0 whatever else the invocation got wrong.
import { CliUsageError } from "#cli/protocol/contract/contract.ts";
import type { AnyCommandContract, SharedOptionKey } from "#cli/protocol/contract/contract.ts";
import type { AnsweredVault } from "#cli/protocol/contract/schemas.ts";
import type { CliBootstrap } from "#cli/operations/bootstrap/bootstrap.ts";
import { isHelpInvocation } from "#cli/operations/bootstrap/bootstrap.ts";
import { runCommand } from "#cli/operations/execution/runner.ts";
import {
	inapplicableSharedOptions,
	SHARED_OPTIONS,
	SHARED_OPTION_KEYS,
} from "#cli/protocol/contract/shared-options.ts";
import { stateInvocation } from "@archboard/server-lifecycle/server-client";
import { packageVersion } from "#cli/store/package-version/package-version.ts";
import { CLI_INTERRUPT_CLEANUP_MS } from "@archboard/timing";
import type { CommandRoutes, RouteOwner } from "#cli/protocol/routing/route.ts";
import { helpText, usageLine } from "#cli/rules/routing/help.ts";
import { dispatchedCommand } from "#cli/rules/routing/dispatch.ts";
import { exitCodeFor, reportFailure } from "#cli/operations/invocation/exit-codes.ts";
import {
	takeBoardFlags,
	takeDirectoryFlag,
	takeDoingFlag,
	takeSessionFlag,
	takeExpectVersionFlag,
} from "#cli/rules/routing/global-flags.ts";
import { addressVault, VaultNotFoundError } from "#cli/operations/invocation/addressed-vault.ts";

/**
 * Where an invocation runs: the vault it addresses, or for a command that runs
 * without a vault, the Git checkout that holds none.
 */
interface Addressed {
	readonly vault: AnsweredVault | null;
	readonly checkout: string | null;
}

/**
 * Runs a command contract while forwarding SIGINT and SIGTERM as an abort, then re-raises
 * the signal once cleanup has finished (or after the cleanup grace period, whichever is first).
 * @param commandContract - The contract to run.
 * @param argv - The contract's own arguments.
 * @param addressed - The vault the invocation addresses, or the checkout without one.
 */
async function runInterruptibleCommand(
	commandContract: AnyCommandContract,
	argv: readonly string[],
	addressed: Addressed,
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
		await runCommand(commandContract, argv, controller.signal, addressed.vault, addressed.checkout);
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
	selection: "Use `archboard browser panes`: it lists what each pane shows and what is selected.",
	screenshot: "Use `archboard semantic rasterize <board> --out <file.png>`.",
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
			? " Board changes now reach the Codex workhorse of each browser tab. Ask it in the conversation."
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
	readonly directory: string | null;
	/** Every `--board` stated, in order. */
	readonly board: readonly string[];
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
		directory: takeDirectoryFlag(rest),
		board: takeBoardFlags(rest),
		doing: takeDoingFlag(rest),
		session: takeSessionFlag(rest),
		expectVersion: takeExpectVersionFlag(rest),
	};
}

/** Which field of what was stated holds each shared option. */
const STATED_FIELDS: Readonly<Record<SharedOptionKey, keyof StatedShared>> = {
	url: "url",
	directory: "directory",
	board: "board",
	doing: "doing",
	"expect-version": "expectVersion",
	"as-session": "session",
};

/**
 * The shared options an invocation stated, by key.
 * @param stated - What was stated.
 * @returns The keys with a value.
 */
function statedKeys(stated: StatedShared): SharedOptionKey[] {
	return SHARED_OPTION_KEYS.filter((key) => {
		const value = stated[STATED_FIELDS[key]];
		return typeof value === "object" && value !== null ? value.length > 0 : value !== null;
	});
}

/**
 * What a command is given of the `--board` flags routing took out. A command
 * that reads `--board` as an option of its own, to name the boards it narrows
 * to, gets the flags back with its arguments, and the invocation names no one
 * board for its requests. Any other command keeps the one shared board.
 * @param contract - The command that will run.
 * @param stated - What the invocation stated.
 * @param argv - The command's local arguments.
 * @returns What was stated and the arguments the command parses.
 */
function boardsAsOptions(
	contract: AnyCommandContract,
	stated: StatedShared,
	argv: readonly string[],
): { readonly stated: StatedShared; readonly argv: readonly string[] } {
	const reads = contract.parameters.some(
		(parameter) => parameter.kind === "option" && parameter.spellings.includes("--board"),
	);
	return reads
		? {
				stated: { ...stated, board: [] },
				argv: [...argv, ...stated.board.flatMap((board) => ["--board", board])],
			}
		: { stated, argv };
}

/**
 * The shared options a command reads in this invocation: those it declares,
 * less any that a local option present in its arguments excludes.
 * @param contract - The command that will run.
 * @param argv - The command's local arguments.
 * @returns The keys that apply.
 */
function applicableShared(
	contract: AnyCommandContract,
	argv: readonly string[],
): SharedOptionKey[] {
	const excluded = new Set(
		contract.parameters.flatMap((parameter) => {
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
	return contract.shared.filter((key) => !excluded.has(key));
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
	const applicable = applicableShared(selected.contract, argv);
	const refused = inapplicableSharedOptions(applicable, statedKeys(stated));
	if (refused.length === 0) {
		if (stated.board.length > 1) {
			throw new CliUsageError(
				`--board names one board for \`archboard ${selected.contract.path.join(" ")}\`, ` +
					`and it was stated ${stated.board.length} times.`,
			);
		}
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
	stateInvocation({
		board: stated.board[0] ?? null,
		doing: stated.doing,
		session: stated.session,
		expectedVersion: stated.expectVersion,
	});
}

/**
 * The vault the invocation addresses, found before the command starts anything
 * or reaches a server. A command that does not read `-C` in this invocation
 * finds none, and its answer names none. A command that runs without a vault
 * runs in a Git checkout that holds none, instead of being refused.
 * @param contract - The command that will run.
 * @param argv - The command's local arguments.
 * @param stated - What the invocation stated.
 * @returns The vault, or the checkout without one, or neither when the command finds none.
 * @throws {VaultNotFoundError} When there is no vault, and no checkout the command runs in.
 */
async function addressedVault(
	contract: AnyCommandContract,
	argv: readonly string[],
	stated: StatedShared,
): Promise<Addressed> {
	if (!applicableShared(contract, argv).includes("directory")) {
		return { vault: null, checkout: null };
	}
	try {
		return { vault: await addressVault(stated.directory), checkout: null };
	} catch (error) {
		const checkout = error instanceof VaultNotFoundError ? error.checkoutWithoutVault : undefined;
		if (contract.runsWithoutVault !== true || checkout === undefined) throw error;
		return { vault: null, checkout };
	}
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
		const given = boardsAsOptions(selected.contract, stated, dispatched.argv);
		assertSharedApplies(selected, given.stated, given.argv);
		applyShared(given.stated);
		const addressed = await addressedVault(selected.contract, given.argv, given.stated);
		await runInterruptibleCommand(selected.contract, given.argv, addressed);
	} catch (error) {
		reportFailure(error, usageLine(routes, selected.contract.path));
		process.exitCode = exitCodeFor(error, selected);
	}
}

export { runCliWith, type CliBootstrap };
