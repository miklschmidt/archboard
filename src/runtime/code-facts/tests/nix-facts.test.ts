// The code facts of Nix flakes (ADR 0046, TASK-367.21): the outputs of a
// `flake.nix` as definitions addressed by attribute path, found by a static
// reading of the shapes flakes are written in, the names that reading cannot
// tell as unknown, never absent, and the inputs of a `flake.lock` as build
// dependencies of the flake.

import { afterAll, expect, test } from "bun:test";
import {
	createCodeFacts,
	findSymbol,
	type FileFacts,
	type SyntaxFacts,
} from "@/runtime/code-facts/index";
import { fixtureCheckout } from "@/runtime/code-facts/tests/checkout";

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
      forAllSystems = nixpkgs.lib.genAttrs [ "x86_64-linux" ];
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
});
const facts = createCodeFacts();

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
		"packages",
		"packages.x86_64-linux",
		"packages.x86_64-linux.default",
		"packages.x86_64-linux.tool",
	]);
	expect(flake.definitions.find((each) => each.symbol === "packages.x86_64-linux.tool")).toEqual({
		symbol: "packages.x86_64-linux.tool",
		start: 9,
		end: 9,
		visibility: "output",
		exposed: true,
	});
	expect(flake.unparsed).toEqual([]);
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
	const systems = ["aarch64-darwin", "aarch64-linux", "x86_64-darwin", "x86_64-linux"];
	expect(await outputs("utils/flake.nix")).toEqual(
		[
			"apps",
			...systems.flatMap((system) => [`apps.${system}`, `apps.${system}.cli`]),
			"overlays",
			"overlays.default",
			"packages",
			...systems.flatMap((system) => [`packages.${system}`, `packages.${system}.cli`]),
		].toSorted(),
	);
	// mapAttrs, foldl' with recursiveUpdate, and optionalAttrs, whose condition the reading cannot tell.
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
	expect((await nix("utils/flake.nix")).unparsed).toEqual([]);
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
