// The global flags every command shares (--board, --doing, --expect-version), pulled out of
// argv before a command's own parser sees them.
import { CliUsageError } from "@/cli/command-contract/contract";

/**
 * Removes `--name value` or `--name=value` from argv, in place, and returns the value.
 * @param argv - The arguments to search; the flag and its value are spliced out.
 * @param name - The flag name without dashes.
 * @returns The flag's value, or null when the flag is absent.
 */
function takeGlobalFlag(argv: string[], name: string): string | null {
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i]!;
		if (token === `--${name}`) {
			const value = argv[i + 1];
			if (value === undefined) {
				throw new CliUsageError(`Flag --${name} requires a value`);
			}
			argv.splice(i, 2);
			return value;
		}
		if (token.startsWith(`--${name}=`)) {
			argv.splice(i, 1);
			return token.slice(name.length + 3);
		}
	}
	return null;
}

/**
 * Pull `--board <key>` out of the arguments before the command sees it.
 *
 * Global, like `--url`, because it applies to every canvas request a command
 * makes rather than to one of them. It is the only way to name the persisted
 * board for a command because there is no active or default board (ADR 0020).
 * Stripped here so no command has to declare it and none can forget to pass it
 * on.
 * @param argv - The arguments after the command name; the flag is spliced out.
 * @returns The board key, or null when none was passed.
 */
function takeBoardFlag(argv: string[]): string | null {
	return takeGlobalFlag(argv, "board");
}

/**
 * And `--doing "..."`, for the same reason (TASK-095).
 *
 * Global because a command may make several requests and each of them is the
 * same act: `import` clears the board and then batches the scene in, and both
 * are "restoring the payment path from the export". Stripped before the
 * command's own parser sees it, so no command declares it and none can be the
 * one that dropped it.
 *
 * Not refused here. The canvas knows which routes are board writes and it is
 * the only side that should; a second list on this side would be a second
 * answer to the same question, and the two would drift.
 * @param argv - The arguments after the command name; the flag is spliced out.
 * @returns The step being taken, or null when none was passed.
 */
function takeDoingFlag(argv: string[]): string | null {
	return takeGlobalFlag(argv, "doing");
}

/**
 * And `--expect-version <n>`, which says what the writer was editing (TASK-091).
 *
 * Global for the same reason: a command that makes several requests is making
 * them about one board, so the expectation belongs to the invocation rather
 * than to whichever request happens to be the write.
 *
 * A number here and refused if it is not, because a mistyped precondition that
 * was quietly dropped would leave the writer believing it had one.
 * @param argv - The arguments after the command name; the flag is spliced out.
 * @returns The expected board version, or null when none was passed.
 */
function takeExpectVersionFlag(argv: string[]): number | null {
	const raw = takeGlobalFlag(argv, "expect-version");
	if (raw === null) {
		return null;
	}
	if (!/^\d+$/u.test(raw.trim())) {
		throw new CliUsageError(
			`--expect-version takes a whole number — the version your last write reported, or the one ` +
				`\`board info\` says. Got ${JSON.stringify(raw)}.`,
		);
	}
	return Number(raw.trim());
}

export { takeBoardFlag, takeDoingFlag, takeExpectVersionFlag };
