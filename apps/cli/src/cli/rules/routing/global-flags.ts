// The global flags every command shares (-C, --board, --doing, --expect-version,
// --as-session), pulled out of argv before a command's own parser sees them.
import { CliUsageError } from "#cli/protocol/contract/contract.ts";

/**
 * Removes `<flag> value` or `<flag>=value` from argv, in place, and returns the value.
 * @param argv - The arguments to search; the flag and its value are spliced out.
 * @param flag - The flag as it is spelled, dashes included.
 * @returns The flag's value, or null when the flag is absent.
 */
function takeGlobalFlag(argv: string[], flag: string): string | null {
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i]!;
		if (token === flag) {
			const value = argv[i + 1];
			if (value === undefined) {
				throw new CliUsageError(`Flag ${flag} requires a value`);
			}
			argv.splice(i, 2);
			return value;
		}
		if (token.startsWith(`${flag}=`)) {
			argv.splice(i, 1);
			return token.slice(flag.length + 1);
		}
	}
	return null;
}

/**
 * Removes every `<flag> value` and `<flag>=value` from argv, in place, and returns the values.
 * @param argv - The arguments to search; each flag and its value are spliced out.
 * @param flag - The flag as it is spelled, dashes included.
 * @returns The values in the order they were written; none when the flag is absent.
 */
function takeGlobalFlagEach(argv: string[], flag: string): string[] {
	const values: string[] = [];
	for (let value = takeGlobalFlag(argv, flag); value !== null; value = takeGlobalFlag(argv, flag)) {
		values.push(value);
	}
	return values;
}

/**
 * Pull `-C <dir>` out of the arguments before the command sees it.
 *
 * Global for the reason `--board` is: every server call a command makes names
 * the vault, and `-C` says where that vault is found from (ADR 0049). It
 * changes nothing else; a relative `--input` or `--out` still resolves
 * against the working directory.
 * @param argv - The arguments after the command name; the flag is spliced out.
 * @returns The directory as it was written, or null when none was passed.
 */
function takeDirectoryFlag(argv: string[]): string | null {
	return takeGlobalFlag(argv, "-C");
}

/**
 * Pull every `--board <key>` out of the arguments before the command sees it.
 *
 * Global, like `--url`, because it applies to every server request a command
 * makes rather than to one of them. It is the only way to name the persisted
 * board for a command because there is no active or default board (ADR 0020).
 * Stripped here so no command has to declare it and none can forget to pass it
 * on. A command that reads `--board` as an option of its own, to narrow the
 * boards it reads, takes them back from the invocation.
 * @param argv - The arguments after the command name; each flag is spliced out.
 * @returns The board keys in the order they were written; none when none was passed.
 */
function takeBoardFlags(argv: string[]): string[] {
	return takeGlobalFlagEach(argv, "--board");
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
 * Not refused here. The server knows which routes are board writes and it is
 * the only side that should; a second list on this side would be a second
 * answer to the same question, and the two would drift.
 * @param argv - The arguments after the command name; the flag is spliced out.
 * @returns The step being taken, or null when none was passed.
 */
function takeDoingFlag(argv: string[]): string | null {
	return takeGlobalFlag(argv, "--doing");
}

/**
 * And `--as-session <thread>`, which says which agent session is writing.
 *
 * Global for the same reason `--doing` is: one command may make several
 * requests and they are all the same session's. A flag rather than an
 * environment variable on purpose — one private app-server child serves every
 * thread of a workbench, so anything read from that process's environment would
 * stamp one session's identity onto another's writes.
 *
 * Never required and never refused. What it is for is letting a session skip the
 * board news it wrote itself; a write that states nothing is delivered to
 * everybody, its own author included, which is redundancy rather than silence.
 * @param argv - The arguments after the command name; the flag is spliced out.
 * @returns The session writing, or null when none was passed.
 */
function takeSessionFlag(argv: string[]): string | null {
	return takeGlobalFlag(argv, "--as-session");
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
	const raw = takeGlobalFlag(argv, "--expect-version");
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

export { takeBoardFlags, takeDirectoryFlag, takeDoingFlag, takeExpectVersionFlag, takeSessionFlag };
