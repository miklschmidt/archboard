import { expect } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function waitForRecordedPid(file: string): Promise<number> {
	const deadline = Date.now() + 2_000;
	while (!existsSync(file) || readFileSync(file, "utf8").trim().length === 0) {
		if (Date.now() >= deadline) throw new Error("Delayed Git process did not start.");
		await Bun.sleep(5);
	}
	return Number(readFileSync(file, "utf8").trim().split(/\s+/u).at(-1));
}

export async function waitForRecordedPids(file: string, count: number): Promise<number[]> {
	const deadline = Date.now() + 2_000;
	for (;;) {
		const pids = existsSync(file)
			? readFileSync(file, "utf8")
					.trim()
					.split("\n")
					.filter(Boolean)
					.map((line) => Number(line.split(/\s+/u)[0]))
			: [];
		if (new Set(pids).size >= count) return [...new Set(pids)];
		if (Date.now() >= deadline) throw new Error(`Expected ${count} delayed Git processes.`);
		await Bun.sleep(5);
	}
}

export async function expectPidAbsent(pid: number): Promise<void> {
	const deadline = Date.now() + 1_000;
	while (existsSync(`/proc/${pid}`) && Date.now() < deadline) await Bun.sleep(5);
	expect(existsSync(`/proc/${pid}`), `Git pid ${pid} survived canvas teardown`).toBeFalse();
}

export function createDelayedCheckoutOwner(name: string, checkoutCount = 1) {
	const root = join(tmpdir(), `archboard-checkout-lifetime-${name}-${crypto.randomUUID()}`);
	const vault = join(root, "vault");
	const checkouts = Array.from({ length: checkoutCount }, (_, index) =>
		join(root, `checkout-${index}`),
	);
	const bin = join(root, "bin");
	const pids = join(root, "git-pids");
	const release = join(root, "release-git");
	const realGit = Bun.which("git");
	if (!realGit) throw new Error("Git is required for checkout lifetime coverage.");
	mkdirSync(vault, { recursive: true });
	for (const [index, checkout] of checkouts.entries()) {
		mkdirSync(join(checkout, "src"), { recursive: true });
		for (const file of ["concurrent.ts", "original.ts", "replacement.ts"])
			writeFileSync(join(checkout, "src", file), `export const checkout = ${index};\n`);
		for (const args of [
			["init", "-q"],
			["remote", "add", "origin", `https://github.com/acme/delayed-${index}.git`],
		] as const) {
			const result = Bun.spawnSync([realGit, ...args], { cwd: checkout, stderr: "pipe" });
			if (result.exitCode !== 0) throw new Error(result.stderr.toString());
		}
	}
	mkdirSync(bin);
	const git = join(bin, "git");
	writeFileSync(
		git,
		`#!/bin/sh
case "$*" in
  *rev-parse*|*remote\\ get-url*)
    echo "$$ $*" >> "${pids}"
    while [ ! -e "${release}" ]; do sleep 1; done
    exec ${JSON.stringify(realGit)} "$@"
    ;;
  *) exec ${JSON.stringify(realGit)} "$@" ;;
esac
`,
	);
	chmodSync(git, 0o700);
	const registry = join(root, "repos.json");
	const entries = JSON.stringify(
		checkouts.map((checkout, index) => ({
			repo: `github.com/acme/delayed-${index}`,
			root: checkout,
			source: "declared",
			addedAt: "2026-09-02T00:00:00.000Z",
		})),
	);
	writeFileSync(registry, "[]");
	return {
		root,
		vault,
		pids,
		release: () => writeFileSync(release, "release\n"),
		env: { ARCHBOARD_REPOS: registry, PATH: `${bin}:${process.env.PATH ?? ""}` },
		enable: () => writeFileSync(registry, entries),
		dispose: () => rmSync(root, { recursive: true, force: true }),
	};
}
