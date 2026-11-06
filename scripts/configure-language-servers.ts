#!/usr/bin/env bun
// Configure the language servers of this checkout's code check: register the
// checkout and give Rust the flake's rust-analyzer through scripts/rust-analyzer.
// The registry keeps servers per checkout, so `bun install` runs this in every
// checkout and worktree. A server that runs code of a checkout stays opt-in
// (ADR 0046, TASK-433). This repository opts in for its own checkouts.
//
// Run: bun scripts/configure-language-servers.ts

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

if (Bun.which("nix") === null) {
	console.log("configure-language-servers: nix is not on PATH, so Rust gets no language server.");
	process.exit(0);
}

/**
 * Run this checkout's own CLI and stop the install when it fails.
 * @param args The CLI arguments.
 */
function archboard(...args: string[]): void {
	const ran = spawnSync(join(root, "bin", "archboard"), args, { cwd: root, encoding: "utf8" });
	if (ran.status !== 0) {
		console.error(`configure-language-servers: archboard ${args.join(" ")} failed.`);
		console.error(ran.stdout, ran.stderr);
		process.exit(ran.status ?? 1);
	}
}

archboard("repo", "add", root);
archboard("repo", "language-server", "rust", join(root, "scripts", "rust-analyzer"));
console.log(`configure-language-servers: Rust in ${root} runs scripts/rust-analyzer.`);
