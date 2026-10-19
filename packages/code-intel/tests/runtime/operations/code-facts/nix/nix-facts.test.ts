// The code facts of Nix flakes (ADR 0046, TASK-367.21): the outputs of a
// `flake.nix` as definitions addressed by attribute path, found by a static
// reading of the shapes flakes are written in, the names that reading cannot
// tell as unknown, never absent, and the inputs of a `flake.lock` as build
// dependencies of the flake.

import { afterAll, expect, test } from "bun:test";
import { createCodeFacts } from "#runtime/services/code-facts/reader.ts";
import { findSymbol } from "#runtime/operations/code-facts/lookup.ts";
import { type FileFacts, type SyntaxFacts } from "#runtime/operations/code-facts/facts.ts";
import { fixtureCheckout } from "#tests/runtime/support/code-facts/checkout.ts";

const checkout = fixtureCheckout({
	"plain/flake.nix": `{
  description = "outputs written out, with let ... in";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }:
    let
      pkgs = nixpkgs.legacyPackages.x86_64-linux;
      tool = pkgs.callPackage ./tool.nix { };
    in {
      packages.x86_64-linux.tool = tool;
      packages.x86_64-linux.default = self.packages.x86_64-linux.tool;
      nixosConfigurations.host = nixpkgs.lib.nixosSystem { modules = [ ./host.nix ]; };
      overlays.default = final: prev: { tool = final.callPackage ./tool.nix { }; };
      lib = { greet = name: "hi \${name}"; };
    };
}
`,
	"plain/tool.nix": '{ stdenv }: stdenv.mkDerivation { pname = "tool"; }\n',
	"systems/flake.nix": `{
  outputs = { self, nixpkgs, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-darwin" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.\${system});
    in {
      packages = forAllSystems (pkgs: {
        server = pkgs.callPackage ./server.nix { };
      });
      devShells = forAllSystems (pkgs: { default = pkgs.mkShell { }; });
    };
}
`,
	"library/flake.nix": `{
  outputs = { self, nixpkgs }:
    let
      inherit (nixpkgs.lib) genAttrs;
      forAllSystems = genAttrs [ "x86_64-linux" ];
      linux = forAllSystems (system: { server = 1; });
    in {
      checks = builtins.mapAttrs (system: set: { unit = set.server; }) linux;
      apps = builtins.foldl' nixpkgs.lib.recursiveUpdate { } [
        (forAllSystems (system: { a = 1; }))
        (forAllSystems (system: nixpkgs.lib.optionalAttrs (system == "x86_64-linux") { b = 2; }))
      ];
    };
}
`,
	"utils/flake.nix": `{
  inputs.flake-utils.url = "github:numtide/flake-utils";
  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let pkgs = nixpkgs.legacyPackages.\${system}; in {
        packages.cli = pkgs.hello;
        apps.cli = { type = "app"; program = "\${pkgs.hello}/bin/hello"; };
      }) // {
      overlays.default = final: prev: { };
    };
}
`,
	"parts/flake.nix": `{
  inputs.flake-parts.url = "github:hercules-ci/flake-parts";
  outputs = inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [ "x86_64-linux" ];
      perSystem = { pkgs, system, ... }: {
        packages.web = pkgs.hello;
        treefmt.enable = true;
      };
      flake.nixosModules.web = ./module.nix;
    };
}
`,
	"unknown/flake.nix": `{
  inputs.systems.url = "github:nix-systems/default";
  outputs = { self, nixpkgs, systems }:
    let eachSystem = nixpkgs.lib.genAttrs (import systems); in {
      packages = eachSystem (system: { app = nixpkgs.legacyPackages.\${system}.hello; });
      checks = import ./checks.nix { inherit self; };
      formatter.x86_64-linux = nixpkgs.legacyPackages.x86_64-linux.nixfmt;
    };
}
`,
	"opaque/flake.nix": `{
  outputs = inputs: import ./outputs.nix inputs;
}
`,
	"defaults/flake.nix": `{
  outputs = { self, nixpkgs, systems ? [ "x86_64-linux" ] }: {
    packages = nixpkgs.lib.genAttrs systems (system: { app = 1; });
    legacyPackages.x86_64-linux = nixpkgs.legacyPackages.x86_64-linux or { };
    lib = let known = { a = 1; }; in known.b or { c = 2; };
    checks.x86_64-linux.unit = 1;
    checks.x86_64-linux.broken-test = (( ;
  };
}
`,
	"locked/flake.lock": `{
  "nodes": {
    "nixpkgs": {
      "locked": { "owner": "NixOS", "repo": "nixpkgs", "rev": "0123abcd", "type": "github" },
      "original": { "owner": "NixOS", "ref": "nixos-unstable", "repo": "nixpkgs", "type": "github" }
    },
    "tools": {
      "locked": { "path": "./tools", "type": "path" },
      "original": { "path": "./tools", "type": "path" },
      "parent": []
    },
    "utils": {
      "inputs": { "nixpkgs": ["nixpkgs"] },
      "locked": { "owner": "numtide", "repo": "flake-utils", "rev": "4567ef", "type": "github" },
      "original": { "owner": "numtide", "repo": "flake-utils", "type": "github" }
    },
    "root": {
      "inputs": {
        "nixpkgs": "nixpkgs",
        "tools": "tools",
        "utils": "utils"
      }
    }
  },
  "root": "root",
  "version": 7
}
`,
	"locked/flake.nix": "{ outputs = { self, ... }: { }; }\n",
	"locked/tools/flake.nix": "{ outputs = { self }: { }; }\n",
	"broken/flake.lock": '{ "nodes": { "root": { "inputs": { "nixpkgs": ',
	...blowUps(),
});
const facts = createCodeFacts();

/**
 * Names written one after another.
 * @param count How many.
 * @param name The name at each place.
 * @returns The names, with a space between each two.
 */
function names(count: number, name: (at: number) => string): string {
	return Array.from({ length: count }, (_, at) => name(at)).join(" ");
}

/**
 * An attribute path under `lib` of one name, many times.
 * @param count How many names below `lib`.
 * @returns The path.
 */
function deep(count: number): string {
	return ["lib", ...Array.from({ length: count }, () => "a")].join(".");
}

/**
 * Flakes that try to blow the bounds of the static reading: a recursion that
 * gives a new set at each level, a list doubled to a million items, an
 * attribute path of 20,000 names, a set of 3,000 names that a fold makes
 * 3,000 times, and 12,000 outputs, more than the reading gives. And a lock
 * nested 50,000 keys deep.
 * @returns Each file and its text.
 */
function blowUps(): Record<string, string> {
	const doubled = names(20, (at) => `l${at + 1} = l${at} ++ l${at};`);
	return {
		"recursion/flake.nix":
			"{ outputs = { self }: let f = n: { a = f n; b = f n; }; in { lib = f 1; }; }",
		"doubling/flake.nix": `{ outputs = { self, nixpkgs }: let l0 = [ "x86_64-linux" ]; ${doubled} in { packages = nixpkgs.lib.genAttrs l20 (system: { app = 1; }); }; }`,
		"path/flake.nix": `{ outputs = { self }: { lib.${names(20_000, (at) => `n${at}`)} = 1; }; }`,
		"fold/flake.nix": `{ outputs = { self }: let set = system: { ${names(3000, (at) => `p${at} = 1;`)} }; in { lib.last = builtins.foldl' (last: system: (set system).p0) 0 [ ${names(3000, (at) => `"s${at}"`)} ]; }; }`,
		"outputs/flake.nix": `{ outputs = { self, nixpkgs }: { packages = nixpkgs.lib.genAttrs [ "s0" "s1" "s2" "s3" ] (system: { ${names(3000, (at) => `p${at} = 1;`)} }); }; }`,
		"deep/flake.lock": `{ "nodes": { "root": { "inputs": { "a": "a" } }, "a": { "original": { "type": "github", "owner": "o", "repo": "a" } }, "x": ${'{ "k": '.repeat(50_000)}1${" }".repeat(50_000)} }, "root": "root", "version": 7 }`,
	};
}

afterAll(() => {
	checkout.remove();
});

/**
 * Read one file's facts in a pass of their own.
 * @param relative The file.
 * @returns Its facts.
 */
async function read(relative: string): Promise<FileFacts | undefined> {
	return facts.pass(new AbortController().signal).read(checkout, relative);
}

/**
 * Read one file the Nix adapter reads.
 * @param relative The file.
 * @returns Its facts.
 */
async function nix(relative: string): Promise<SyntaxFacts> {
	const found = await read(relative);
	if (found?.adapter !== "nix") throw new Error(`${relative} was not read as Nix`);
	return found;
}

/**
 * The outputs a flake defines.
 * @param relative The `flake.nix`.
 * @returns Their attribute paths.
 */
async function outputs(relative: string): Promise<string[]> {
	return (await nix(relative)).definitions.map((each) => each.symbol).toSorted();
}

/**
 * What a flake holds of each symbol.
 * @param relative The `flake.nix`.
 * @param symbols The symbols.
 * @returns The status of each.
 */
async function held(relative: string, symbols: readonly string[]): Promise<Record<string, string>> {
	const flake = await nix(relative);
	return Object.fromEntries(
		symbols.map((symbol) => [symbol, findSymbol(flake, symbol, "definition").status]),
	);
}

test("a flake's outputs written out are definitions by attribute path, down to the depth the flake schema names them", async () => {
	const flake = await nix("plain/flake.nix");
	expect(flake.definitions.map((each) => each.symbol).toSorted()).toEqual([
		"lib",
		"lib.greet",
		"nixosConfigurations",
		"nixosConfigurations.host",
		"overlays",
		"overlays.default",
		// What an overlay adds is its packages.
		"overlays.default.tool",
		"packages",
		"packages.x86_64-linux",
		"packages.x86_64-linux.default",
		"packages.x86_64-linux.tool",
	]);
	expect(flake.definitions.find((each) => each.symbol === "packages.x86_64-linux.tool")).toEqual({
		symbol: "packages.x86_64-linux.tool",
		kind: "value",
		start: 9,
		end: 9,
		visibility: "output",
		exposed: true,
	});
	// No name is unknown; what the outputs are built from may be (nix-build-dependencies.test.ts).
	expect(flake.unparsed.filter((part) => part.under !== undefined)).toEqual([]);
	// Any other Nix file is read as text.
	expect((await read("plain/tool.nix"))?.adapter).toBe("text");
});

test("outputs given once per system are followed through genAttrs, flake-utils, flake-parts and the library functions that merge sets", async () => {
	expect(await outputs("systems/flake.nix")).toEqual([
		"devShells",
		"devShells.aarch64-darwin",
		"devShells.aarch64-darwin.default",
		"devShells.x86_64-linux",
		"devShells.x86_64-linux.default",
		"packages",
		"packages.aarch64-darwin",
		"packages.aarch64-darwin.server",
		"packages.x86_64-linux",
		"packages.x86_64-linux.server",
	]);
	// A system the helper makes spans the binding of its output, not the helper.
	const spans = (await nix("systems/flake.nix")).definitions.flatMap((each) =>
		each.symbol.endsWith(".x86_64-linux") ? [[each.symbol, each.start, each.end]] : [],
	);
	expect(spans).toEqual([
		["packages.x86_64-linux", 7, 9],
		["devShells.x86_64-linux", 10, 10],
	]);
	// flake-utils' default systems are its `systems` input, which a flake can change.
	expect(await outputs("utils/flake.nix")).toEqual([
		"apps",
		"apps.*",
		"apps.*.cli",
		"overlays",
		"overlays.default",
		"packages",
		"packages.*",
		"packages.*.cli",
	]);
	// inherit (from), mapAttrs, foldl' with recursiveUpdate, and optionalAttrs, whose condition the reading cannot tell.
	expect(await outputs("library/flake.nix")).toEqual([
		"apps",
		"apps.x86_64-linux",
		"apps.x86_64-linux.a",
		"apps.x86_64-linux.b",
		"checks",
		"checks.x86_64-linux",
		"checks.x86_64-linux.unit",
	]);
	// perSystem's options that are no output, such as treefmt, are not outputs.
	expect(await outputs("parts/flake.nix")).toEqual([
		"nixosModules",
		"nixosModules.web",
		"packages",
		"packages.x86_64-linux",
		"packages.x86_64-linux.web",
	]);
	expect(
		(await nix("utils/flake.nix")).unparsed.filter((part) => part.under !== undefined),
	).toEqual([]);
});

test("names the static reading cannot tell are unknown, never absent", async () => {
	// The systems come from an input: `*` stands for every one.
	expect(await outputs("unknown/flake.nix")).toEqual([
		"checks",
		"formatter",
		"formatter.x86_64-linux",
		"packages",
		"packages.*",
		"packages.*.app",
	]);
	expect(
		await held("unknown/flake.nix", [
			"packages.x86_64-linux.app",
			"app",
			"packages.x86_64-linux.gone",
			// The checks come from another file.
			"checks.x86_64-linux.lint",
			// A tail of a name below an unknown part.
			"lint",
			// The formatter is written out, so a system it does not name is absent.
			"formatter.aarch64-linux",
		]),
	).toEqual({
		"packages.x86_64-linux.app": "found",
		app: "found",
		"packages.x86_64-linux.gone": "absent",
		"checks.x86_64-linux.lint": "unparsed",
		lint: "unparsed",
		"formatter.aarch64-linux": "absent",
	});
	expect(await held("plain/flake.nix", ["packages.x86_64-linux.gone", "gone"])).toEqual({
		"packages.x86_64-linux.gone": "absent",
		gone: "absent",
	});
	// Outputs the reading cannot follow at all leave every name unknown.
	const opaque = await nix("opaque/flake.nix");
	expect(opaque.definitions).toEqual([]);
	expect(findSymbol(opaque, "packages.x86_64-linux.default", "definition").status).toBe("unparsed");
	// A default stands only where the name is surely absent, and never for an
	// input, which Nix always gives; a name written where the file does not
	// parse is unknown, as Nix spells it.
	expect(
		await held("defaults/flake.nix", [
			"packages.aarch64-linux.app",
			"legacyPackages.x86_64-linux.hello",
			"lib.c",
			"lib.d",
			"checks.x86_64-linux.broken-test",
		]),
	).toEqual({
		"packages.aarch64-linux.app": "found",
		"legacyPackages.x86_64-linux.hello": "unparsed",
		"lib.c": "found",
		"lib.d": "absent",
		"checks.x86_64-linux.broken-test": "unparsed",
	});
});

test("a flake that tries to blow the reading's bounds is read in bounded work, and what the reading does not reach is unknown, never absent", async () => {
	expect(await held("recursion/flake.nix", [deep(3), deep(500)])).toEqual({
		[deep(3)]: "found",
		[deep(500)]: "unparsed",
	});
	// The million items spend the budget, so the packages are not read.
	expect(await held("doubling/flake.nix", ["packages.x86_64-linux.app"])).toEqual({
		"packages.x86_64-linux.app": "unparsed",
	});
	const path = ["lib", ...Array.from({ length: 1000 }, (_, at) => `n${at}`)].join(".");
	expect(await held("path/flake.nix", [path])).toEqual({ [path]: "unparsed" });
	expect(await held("fold/flake.nix", ["lib.last"])).toEqual({ "lib.last": "found" });
	expect(await held("outputs/flake.nix", ["packages.s0.p0", "packages.s3.p2999"])).toEqual({
		"packages.s0.p0": "found",
		"packages.s3.p2999": "unparsed",
	});
	const lock = await nix("deep/flake.lock");
	expect(lock.references.map((each) => [each.symbol, each.line])).toEqual([["inputs.a", 1]]);
});

test("the inputs of flake.lock are build dependencies of the flake, and a path input leads to its flake", async () => {
	const lock = await nix("locked/flake.lock");
	expect(lock.references).toEqual([
		{ symbol: "inputs.nixpkgs", line: 19, via: "code", kind: "build-dependency", typeOnly: false },
		{
			symbol: "inputs.tools",
			line: 20,
			via: "code",
			kind: "build-dependency",
			typeOnly: false,
			target: { path: "locked/tools/flake.nix", symbol: "*" },
		},
		{ symbol: "inputs.utils", line: 21, via: "code", kind: "build-dependency", typeOnly: false },
	]);
	expect(lock.imports.map((each) => each.specifier)).toEqual([
		"github:NixOS/nixpkgs/nixos-unstable",
		"path:./tools",
		"github:numtide/flake-utils",
	]);
	expect(findSymbol(lock, "nixpkgs", "definition-or-reference")).toEqual({
		status: "found",
		line: 19,
	});
	// A lock that does not parse holds no facts, and its names are unknown.
	const broken = await nix("broken/flake.lock");
	expect(broken.references).toEqual([]);
	expect(findSymbol(broken, "inputs.nixpkgs", "definition-or-reference").status).toBe("unparsed");
});
