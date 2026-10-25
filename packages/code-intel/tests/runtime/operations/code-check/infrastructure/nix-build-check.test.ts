// The code check reads the build dependencies between the packages of a
// flake (ADR 0046, TASK-367.22): a package built from another package that
// the board does not draw is an undrawn dependency, a drawn one is supported,
// and a relationship that starts at a package whose build inputs the static
// reading cannot follow, to another package of the flake, is skipped, never
// reported unsupported. A relationship to code that holds no output of that
// flake is judged.
//
// The checkout `mono`: core, lib built from core, app built from lib, and a
// tool `callPackage` builds with unknown automatic arguments; `ui`,
// TypeScript beside a flake that gives a shell, and `api`, TypeScript.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import { board, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-nix-build-"));
const mono = join(scratch, "mono");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const MONO = "github.com/test/mono";
let outcome: CodeCheckOutcome;

/**
 * A part bound to one package of the flake, or to a path.
 * @param id Its id.
 * @param name The package.
 * @param path The path, for a part bound to one.
 * @returns The node.
 */
function part(id: string, name: string, path?: string) {
	const symbol = `packages.x86_64-linux.${name}`;
	return {
		id,
		name,
		kind: "module",
		order: id.charCodeAt(1) * 10,
		binding: { repo: MONO, ...(path === undefined ? { path: "flake.nix", symbol } : { path }) },
	};
}

/**
 * A dependency with no anchor.
 * @param id Its id.
 * @param from Its start.
 * @param to Its end.
 * @returns The relationship.
 */
function dependency(id: string, from: string, to: string) {
	return { id, order: Number(id.slice(1)) * 10, from, to, kind: "dependency" };
}

beforeAll(async () => {
	mkdirSync(mono, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, mono, "init", "-q", "-b", "main");
	git(scratch, mono, "remote", "add", "origin", `https://${MONO}.git`);
	write(mono, {
		"flake.nix": [
			"{",
			"  outputs = { self, nixpkgs }:",
			"    let pkgs = nixpkgs.legacyPackages.x86_64-linux; in {",
			"      packages.x86_64-linux = {",
			'        core = pkgs.stdenv.mkDerivation { pname = "core"; };',
			'        lib = pkgs.stdenv.mkDerivation { pname = "lib"; buildInputs = [ self.packages.x86_64-linux.core ]; };',
			'        app = pkgs.stdenv.mkDerivation { pname = "app"; buildInputs = [ self.packages.x86_64-linux.lib ]; };',
			"        tool = pkgs.callPackage ./tool.nix { };",
			"        built = pkgs.callPackage ./built.nix { inherit (self.packages.x86_64-linux) lib; };",
			"      };",
			"    };",
			"}",
			"",
		].join("\n"),
		"tool.nix": "{ stdenv, lib }: stdenv.mkDerivation { buildInputs = [ lib ]; }\n",
		"built.nix": "{ stdenv, lib }: stdenv.mkDerivation { buildInputs = [ lib ]; }\n",
		"ui/flake.nix":
			"{ outputs = { self, nixpkgs }: { devShells.x86_64-linux.default = nixpkgs.mkShell { }; }; }\n",
		"ui/main.ts": "export function main(): number {\n\treturn 1;\n}\n",
		"api/server.ts": "export function serve(): number {\n\treturn 2;\n}\n",
	});
	git(scratch, mono, "add", "-A");
	git(scratch, mono, "commit", "-q", "--no-gpg-sign", "-m", "the flake");
	register(scratch, { [MONO]: mono });
	board(vault, "Mono", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("pC", "core"),
					part("pL", "lib"),
					part("pA", "app"),
					part("pT", "tool"),
					part("pB", "built"),
					part("pU", "ui", "ui"),
					part("pS", "api", "api/server.ts"),
				],
				edges: [
					// lib is built from core, and the board says so.
					dependency("e1", "pL", "pC"),
					// tool's inputs come from a package scope the reading cannot tell.
					dependency("e2", "pT", "pL"),
					// core is built from nothing the reading cannot follow.
					dependency("e3", "pC", "pA"),
					// ui's shell is unknown, and api holds no output of its flake.
					dependency("e4", "pU", "pS"),
					// The imported package uses the explicitly supplied local package.
					dependency("e5", "pB", "pL"),
				],
			},
		},
	]);
	const check = await import("#tests/runtime/support/code-check/pass.ts");
	const read = check.readBoardsToCheck(vault, undefined);
	if (!read.ok) throw new Error("no boards");
	outcome = await check.checkCode(vault, read.boards, new AbortController().signal);
});

afterAll(() => {
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

test("a package built from another that the board does not draw is an undrawn dependency, and a drawn one is supported", () => {
	const found = outcome.findings.map((each) => `${each.code} ${each.subject?.id} ${each.severity}`);
	expect(found.toSorted()).toEqual(
		[
			"RELATIONSHIP_UNDRAWN pL warning",
			"RELATIONSHIP_UNSUPPORTED e3 information",
			"RELATIONSHIP_UNSUPPORTED e4 information",
		].toSorted(),
	);
	const undrawn = outcome.findings.find((each) => each.code === "RELATIONSHIP_UNDRAWN");
	expect(undrawn?.evidence).toEqual([
		{
			kind: "build-dependency",
			resolution: "resolved",
			from: "pA",
			to: "pL",
			repo: MONO,
			path: "flake.nix",
			line: 7,
			symbol: "packages.x86_64-linux.lib",
		},
	]);
});

test("a relationship from a package whose build inputs the reading cannot follow to another package of its flake is skipped, never unsupported", () => {
	const skipped = outcome.skipped.filter((each) => each.reason === "expression-not-followed");
	expect(skipped.map((each) => [each.subject?.id, each.repo, each.detail])).toEqual([
		["e2", MONO, "tool: tool.nix:1"],
	]);
});
