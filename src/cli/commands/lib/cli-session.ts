// One CLI invocation from argv to exit code: help and version, retired-command guidance,
// global flag capture, dispatch, and an interruptible run of the selected contract.
import { CliUsageError } from "@/cli/command-contract/contract";
import type { AnyCommandContract } from "@/cli/command-contract/contract";
import { runCommand } from "@/cli/command-contract/runner";
import {
	setExpectedVersion,
	setRequestedBoard,
	setWriteDoing,
} from "@/runtime/engine/canvas-client";
import { packageVersion } from "@/runtime/engine/package-version";
import { CLI_INTERRUPT_CLEANUP_MS } from "@/shared/timing/timing";
import {
	type CommandRoutes,
	type RouteOwner,
	commandSummary,
	commandUsage,
} from "@/cli/commands/lib/command-route";
import { helpFor } from "@/cli/commands/lib/command-registry";
import { dispatchedCommand } from "@/cli/commands/lib/command-dispatch";
import { exitCodeFor, reportFailure } from "@/cli/commands/lib/cli-exit";
import {
	takeBoardFlag,
	takeDoingFlag,
	takeExpectVersionFlag,
} from "@/cli/commands/lib/global-flags";

/**
 * Prints the top-level help: every command's summary and the conventions shared by all.
 * @param routes - The command table.
 */
function printHelp(routes: CommandRoutes): void {
	const lines = [
		`archboard ${packageVersion()} — Excalidraw architecture canvas for AI coding agents`,
		"",
		"Usage:",
		"  archboard                  Show this help",
		"  archboard <command> [...]  Drive the canvas from the command line",
		"",
		"  Inside the archboard checkout, `./bin/canvas <command>` runs the CLI from",
		"  src/ with bun, from any cwd. There is no build step, and the package is",
		"  private — there is nothing to install from npm.",
		"",
		"Commands:",
		...Object.entries(routes).map(
			([name, command]) => `  ${name.padEnd(14)} ${commandSummary(command)}`,
		),
		"",
		"Conventions:",
		"  Results are JSON on stdout — except `describe` (plain text), `browser selection --text`,",
		"  and raw-content output when --out is omitted (`export` scene JSON,",
		"  `browser capture --format svg`).",
		"  Diagnostics go to stderr.",
		"  Named-board reads, writes, Mermaid conversion, inspection, PNG/SVG rendering, and export",
		"    use the persisted vault note through the server and need no browser connection.",
		"  Only `browser ...` commands inspect or control a live pane. Real-browser checks verify",
		"    browser behavior and Excalidraw fidelity; they are not board-work prerequisites.",
		"  --board <key> is global and REQUIRED on every command that touches a board. There is no",
		'    default: a browser pane is never an authority for "the board" (ADR 0020). A call',
		"    without it is refused, and the refusal lists persisted boards.",
		'  --doing "..." is global and REQUIRED on every command that CHANGES a board. One short line',
		'    in the present tense — "adding the payment queue" — which goes up on the canvas as the',
		"    write lands, so the person at the board can see what you are up to. A write without it is",
		"    refused. It is never written to the note. A claim's --reason is the overall reason; this is the",
		"    step, and neither stands in for the other.",
		"  --expect-version <n> is global: the version of the board you were working from, from the",
		"    fingerprint on your last write or from `board info`. The write is refused if the board has",
		"    moved past it, naming both versions. You need it only where the canvas cannot know who you",
		"    are — a CLI process with no claim. Under a claim it fills the version in for you.",
		"  Exit codes: 0 ok, 1 error, 2 usage, 3 canvas unreachable, 4 browser tab required,",
		"               5 board write refused (held, claim revoked, version moved, or the",
		"               note changed on disk).",
		"               check only: 6 warnings, 7 errors, 8 indeterminate coverage.",
		"  Canvas-driving commands auto-start the server (disable with EXCALIDRAW_NO_AUTOSTART=1).",
		"  Canvas URL comes from EXPRESS_SERVER_URL (default http://127.0.0.1:3000) or --url.",
		"",
		"Run `archboard help <command>` for per-command usage.",
	];
	process.stdout.write(`${lines.join("\n")}\n`);
}

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
 * Whether the first argument asks for help in any of its spellings.
 * @param name - The first argument.
 * @returns True for `help`, `--help` or `-h`.
 */
function isHelpRequest(name: string): boolean {
	return name === "help" || name === "--help" || name === "-h";
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
 * Handles the argv forms that print and exit before any command runs.
 * @param routes - The command table.
 * @param name - The first argument.
 * @param rest - The remaining arguments.
 * @returns True when help or the version was printed.
 */
function printedInformation(routes: CommandRoutes, name: string, rest: readonly string[]): boolean {
	if (isHelpRequest(name)) {
		const help = name === "help" ? helpFor(routes, rest) : null;
		if (help) {
			process.stdout.write(help);
		} else {
			printHelp(routes);
		}
		return true;
	}
	if (isVersionRequest(name)) {
		process.stdout.write(`${packageVersion()}\n`);
		return true;
	}
	return false;
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

/**
 * Runs one CLI invocation against the command table and sets the process exit code.
 * @param routes - The command table.
 * @param argv - The arguments after the executable name.
 */
async function runCliWith(routes: CommandRoutes, argv: string[]): Promise<void> {
	const [name, ...rest] = argv;
	if (!name) {
		printHelp(routes);
		return;
	}
	if (printedInformation(routes, name, rest)) {
		return;
	}
	const command = routes[name];
	if (command === undefined) {
		reportUnknownCommand(name);
		process.exitCode = 2;
		return;
	}
	let selected: RouteOwner = command.owner;
	try {
		refuseRetiredBoardForms(name, rest);
		setRequestedBoard(takeBoardFlag(rest));
		setWriteDoing(takeDoingFlag(rest));
		setExpectedVersion(takeExpectVersionFlag(rest));
		const dispatched = dispatchedCommand(command, rest);
		selected = dispatched.selected;
		await runInterruptibleCommand(selected.contract, dispatched.argv);
	} catch (error) {
		reportFailure(error, commandUsage(command));
		process.exitCode = exitCodeFor(error, selected);
	}
}

export { runCliWith };
