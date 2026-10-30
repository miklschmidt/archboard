import { directGit, GitCommandError } from "#tests/runtime/operations/proposals/direct-git.ts";

Bun.plugin({
	name: "direct-git",
	setup(build) {
		build.module("@archboard/process/git", () => ({
			exports: { git: directGit, GitCommandError },
			loader: "object",
		}));
	},
});
