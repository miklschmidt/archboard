// The orphan guard: what ends a running Git when the process that started it dies.
//
// A Git command leads its own detached group, so the death of its parent does
// not reach it. One small shell per parent process holds the list of groups in
// flight on the read end of a pipe, which only that parent can write to. When
// the parent dies, for whatever reason, the kernel closes the pipe, and the
// shell kills the groups that remain and exits. It sits blocked in a read until
// then, so it costs no CPU, and it is started once, so a command costs a write.
//
// The shell is detached as well. A signal to the group of the parent, such as
// Ctrl-C, leaves it in place until the parent has finished with its commands.
// Its working directory is the root, so that it pins no checkout.

import type { Subprocess } from "bun";

const GUARD_SCRIPT = `
groups=" "
while read -r verb group; do
	case "$verb" in
		add) groups="$groups$group " ;;
		drop)
			case "$groups" in
				*" $group "*) groups="\${groups%% $group *} \${groups#* $group }" ;;
			esac
			;;
	esac
done
for group in $groups; do
	kill -s KILL -- "-$group"
done 2>/dev/null
`;

type GuardProcess = Subprocess<"pipe", "ignore", "ignore">;

let guard: GuardProcess | undefined;

/**
 * Start the guard of this process.
 * @returns The guard, which holds this process open by neither of its handles,
 * because it waits for this process to end.
 */
function startGuard(): GuardProcess {
	const started = Bun.spawn(["/bin/sh", "-c", GUARD_SCRIPT], {
		cwd: "/",
		env: {},
		detached: true,
		stdin: "pipe",
		stdout: "ignore",
		stderr: "ignore",
	});
	started.unref();
	started.stdin.unref();
	return started;
}

/**
 * Tell the guard one line, right now, because a buffered line protects nothing.
 * @param line The instruction.
 * @throws {Error} When the guard is gone, because the pipe then refuses the write.
 */
function tellGuard(line: string): void {
	guard ??= startGuard();
	void guard.stdin.write(line);
	void guard.stdin.flush();
}

/**
 * Have the guard end a group if this process dies. A guard that something else
 * ended is replaced here, so that it costs a command nothing.
 * @param group The process group, which must be alive.
 */
function guardGitGroup(group: number): void {
	const line = `add ${group}\n`;
	try {
		tellGuard(line);
	} catch {
		guard = undefined;
		tellGuard(line);
	}
}

/**
 * Take a finished group off the guard's list, so that its number can never name
 * another process's group.
 * @param group The process group.
 */
function releaseGitGroup(group: number): void {
	try {
		tellGuard(`drop ${group}\n`);
	} catch {
		// A guard that is gone holds no list, and the next command replaces it.
		guard = undefined;
	}
}

export { guardGitGroup, releaseGitGroup };
