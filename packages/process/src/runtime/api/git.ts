// Running one Git command in a detached process group of its own, bounded, cancellable and ended as a group.
export { git } from "#runtime/processes/git-command.ts";
export { GitCommandError } from "#runtime/processes/git-failure.ts";
