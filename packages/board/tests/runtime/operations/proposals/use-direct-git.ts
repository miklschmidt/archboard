import { mock } from "bun:test";
import { directGit, GitCommandError } from "#tests/runtime/operations/proposals/direct-git.ts";

mock.module("@archboard/process/git", () => ({ git: directGit, GitCommandError }));
