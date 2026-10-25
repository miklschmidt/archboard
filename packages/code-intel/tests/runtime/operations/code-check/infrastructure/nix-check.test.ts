// The code pass reads parts bound to a Nix flake (ADR 0046, TASK-367.21): a
// part bound to a flake output by its attribute path gets the binding check,
// a relationship to a flake input is supported by the lock, and an input that
// is a flake of the same checkout joins the parts bound to the two. The pass
// never runs `nix`: the flake below would fetch from the network if it were
// evaluated, and every process the pass starts is noted (the code check
// starts processes through `Bun.spawn` alone: Git, and language servers).
//
// The checkout `shop`: its flake gives a CLI per system and checks it imports
// from a tarball; its lock pins nixpkgs and two flakes of the checkout,
// `tools` and `vendor`.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import { board, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-nix-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
let outcome: CodeCheckOutcome;
/** The command of every process the pass started. */
const started: string[] = [];

/**
 * A part, bound to code in the checkout or to nothing.
 * @param id Its id.
 * @param path Its bound path, if any.
 * @param symbol Its bound symbol, if any.
 * @returns The node.
 */
function part(id: string, path?: string, symbol?: string) {
	return {
		id,
		name: id,
		kind: "module",
		order: id.charCodeAt(1) * 10,
		...(path === undefined
			? {}
			: { binding: { repo: SHOP, path, ...(symbol === undefined ? {} : { symbol }) } }),
	};
}

/**
 * A relationship.
 * @param id Its id.
 * @param ends Its start and end.
 * @param kind Its kind.
 * @param anchor The symbol its anchor names in `flake.lock`, if any.
 * @returns The relationship.
 */
function edge(id: string, ends: readonly [string, string], kind: string, anchor?: string) {
	const [from, to] = ends;
	return {
		id,
		order: Number(id.slice(1)) * 10,
		from,
		to,
		kind,
		...(anchor === undefined ? {} : { anchor: { repo: SHOP, path: "flake.lock", symbol: anchor } }),
	};
}

/**
 * A lock node pinned to a path of the checkout.
 * @param where The path.
 * @returns The node.
 */
function pathNode(where: string) {
	return { locked: { path: where, type: "path" }, original: { path: where, type: "path" } };
}

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, shop, "init", "-q", "-b", "main");
	git(scratch, shop, "remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		"flake.nix": [
			"{",
			'  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";',
			'  inputs.tools.url = "path:./tools";',
			'  inputs.vendor.url = "path:./vendor";',
			"  outputs = { self, nixpkgs, tools, vendor }:",
			"    let",
			'      forAllSystems = nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-linux" ];',
			"    in {",
			"      packages = forAllSystems (system: {",
			"        cli = nixpkgs.legacyPackages.${system}.callPackage ./cli.nix { };",
			"      });",
			'      checks = import (builtins.fetchTarball "https://example.invalid/checks.tar.gz") { inherit self; };',
			"      imported = import ./unknown.nix;",
			"    };",
			"}",
			"",
		].join("\n"),
		"flake.lock": JSON.stringify(
			{
				nodes: {
					nixpkgs: {
						original: { owner: "NixOS", ref: "nixos-unstable", repo: "nixpkgs", type: "github" },
					},
					tools: pathNode("./tools"),
					vendor: pathNode("./vendor"),
					root: { inputs: { nixpkgs: "nixpkgs", tools: "tools", vendor: "vendor" } },
				},
				root: "root",
				version: 7,
			},
			undefined,
			2,
		),
		"unknown.nix": 'builtins.fetchTarball "https://example.invalid/source.tar.gz"\n',
		"cli.nix": '{ stdenv }: stdenv.mkDerivation { pname = "cli"; }\n',
		"tools/flake.nix": "{ outputs = { self }: { lib.version = 1; }; }\n",
		"vendor/flake.nix": "{ outputs = { self }: { }; }\n",
	});
	git(scratch, shop, "add", "-A");
	git(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", "the flake");
	register(scratch, { [SHOP]: shop });
	board(vault, "Shop", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("pF", "flake.lock"),
					part("pP", "flake.nix", "packages.x86_64-linux.cli"),
					part("pG", "flake.nix", "packages.x86_64-linux.gone"),
					part("pC", "flake.nix", "checks.x86_64-linux.lint"),
					part("pI", "flake.nix", "imported.tools"),
					part("pT", "tools"),
					part("pV", "vendor"),
					part("pN"),
				],
				edges: [
					// The lock pins nixpkgs: a dependency it supports.
					edge("e1", ["pP", "pN"], "dependency", "inputs.nixpkgs"),
					// A build dependency is no call, and the lock is sure of it.
					edge("e2", ["pP", "pN"], "call", "nixpkgs"),
					// The lock pins no such input.
					edge("e3", ["pP", "pN"], "dependency", "inputs.gone"),
					// The flake is built from the tools flake, and the board says so.
					edge("e4", ["pF", "pT"], "dependency"),
				],
			},
		},
	]);
	const check = await import("#tests/runtime/support/code-check/pass.ts");
	const read = check.readBoardsToCheck(vault, undefined);
	if (!read.ok) throw new Error("no boards");
	const { spawn, spawnSync } = Bun;
	Bun.spawn = ((command: { cmd: string[] } | string[], options?: object) => {
		started.push((Array.isArray(command) ? command : command.cmd).join(" "));
		return Array.isArray(command) ? spawn(command, options) : spawn(command);
	}) as typeof Bun.spawn;
	Bun.spawnSync = ((command: { cmd: string[] } | string[], options?: object) => {
		started.push((Array.isArray(command) ? command : command.cmd).join(" "));
		return Array.isArray(command) ? spawnSync(command, options) : spawnSync(command);
	}) as typeof Bun.spawnSync;
	try {
		outcome = await check.checkCode(vault, read.boards, new AbortController().signal);
	} finally {
		Bun.spawn = spawn;
		Bun.spawnSync = spawnSync;
	}
});

afterAll(() => {
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

test("a part bound to a flake output is held to the outputs the flake gives, and an output the reading cannot follow is skipped", () => {
	const found = outcome.findings.map((each) => `${each.code} ${each.subject?.id} ${each.severity}`);
	expect(found.toSorted()).toEqual(
		[
			"ANCHOR_MISMATCH e2 warning",
			"ANCHOR_SYMBOL_MISSING e3 warning",
			"BINDING_SYMBOL_MISSING pG warning",
			"RELATIONSHIP_UNDRAWN pV warning",
		].toSorted(),
	);
	const skipped = outcome.skipped.filter((each) => each.reason === "expression-not-followed");
	expect(skipped.map((each) => [each.subject?.id, each.detail])).toEqual([
		["pC", "flake.nix:12"],
		["pI", "unknown.nix:1"],
	]);
});

test("an input that is a flake of the checkout joins the part that owns the lock to the part bound to that flake", () => {
	const undrawn = outcome.findings.find((each) => each.code === "RELATIONSHIP_UNDRAWN");
	expect(undrawn?.evidence).toEqual([
		{
			kind: "build-dependency",
			resolution: "resolved",
			from: "pF",
			to: "pV",
			repo: SHOP,
			path: "flake.lock",
			line: expect.any(Number),
			symbol: "inputs.vendor",
		},
	]);
});

test("the check never runs nix, though the flake would fetch if it were evaluated", () => {
	// Git lists the checkout's files, itself or through the process owner that runs it.
	expect(started.length).toBeGreaterThan(0);
	expect(started.filter((command) => !command.split(" ").includes("git"))).toEqual([]);
});
