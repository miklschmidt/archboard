// Running one Git command in a detached process group of its own, bounded, cancellable and ended as a group.
export { git } from "#runtime/processes/git-command.ts";
export { GitCommandError } from "#runtime/processes/git-failure.ts";
export { CLI_INTERRUPT_CLEANUP_MS, GIT_MS } from "#runtime/constants/durations.ts";
