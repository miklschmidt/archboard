// The build dependencies between the packages of one flake (ADR 0046,
// TASK-367.22): an input of a derivation that is another output of the same
// flake, or of one of its overlays, is a reference of kind `build-dependency`
// from the depending output to that output, at the line that names the input,
// and it leads to the same `flake.nix`. What the static reading cannot follow
// is an unparsed part with no names at its lines: unknown, never absent.

import { afterAll, expect, test } from "bun:test";
import { createCodeFacts } from "#runtime/services/code-facts/reader.ts";
import { findSymbol } from "#runtime/operations/code-facts/lookup.ts";
import { type SyntaxFacts } from "#runtime/operations/code-facts/facts.ts";
import { fixtureCheckout } from "#tests/runtime/support/code-facts/checkout.ts";

const checkout = fixtureCheckout({
	"packages/flake.nix": `{
  outputs = { self, nixpkgs }:
    let
      forAllSystems = nixpkgs.lib.genAttrs [ "x86_64-linux" ];
    in {
      packages = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.\${system};
          core = pkgs.stdenv.mkDerivation { pname = "core"; };
        in {
          inherit core;
          lib = pkgs.stdenv.mkDerivation {
            pname = "lib";
            propagatedBuildInputs = [ core ];
          };
          app = pkgs.stdenv.mkDerivation (finalAttrs: {
            pname = "app";
            buildInputs = [
              self.packages.\${system}.lib
            ];
          });
          cli = pkgs.callPackage ./cli.nix { inherit (self.packages.\${system}) lib; };
          tool = pkgs.callPackage ./tool.nix { };
          docs = pkgs.stdenv.mkDerivation {
            pname = "docs";
            nativeBuildInputs = [ pkgs.mdbook ];
          };
        });
    };
}
`,
	"overlay/flake.nix": `{
  outputs = { self, nixpkgs }: {
    overlays.default = final: prev: {
      lib = prev.stdenv.mkDerivation { pname = "lib"; };
      app = prev.stdenv.mkDerivation {
        pname = "app";
        buildInputs = [ final.lib ];
      };
      cli = final.callPackage ./cli.nix { };
    };
  };
}
`,
	"utils/flake.nix": `{
  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.\${system};
        helper = pkgs.stdenv.mkDerivation { buildInputs = [ self.packages.\${system}.lib ]; };
      in {
        packages.lib = pkgs.stdenv.mkDerivation { pname = "lib"; };
        packages.app = pkgs.stdenv.mkDerivation { buildInputs = [ helper ]; };
        packages.default = self.packages.\${system}.app;
      });
}
`,
	"shared/flake.nix": `{
  outputs = { self, nixpkgs }:
    let
      forAllSystems = nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-linux" ];
    in {
      packages = forAllSystems (system:
        let
          mk = nixpkgs.legacyPackages.\${system}.stdenv.mkDerivation;
          core = mk { pname = "core"; };
          lib = mk { pname = "lib"; };
          app = mk { pname = "app"; buildInputs = [ lib ]; };
          patched = lib // { meta = { }; };
        in {
          inherit core lib app;
          tool = mk { buildInputs = [ self.packages.\${system}.core ]; };
          docs = mk { buildInputs = [ self.packages.\${system}.tool ]; };
          cli = mk { buildInputs = [ patched ]; };
        });
    };
}
`,
	// 150,000 inputs, and 100 inputs that each name a package 3,000 outputs give, each output on a line of its own.
	"budget/flake.nix": `{ outputs = { self, nixpkgs }: let lib = nixpkgs.stdenv.mkDerivation { }; in { packages.x86_64-linux = {\ninherit lib;\napp = nixpkgs.stdenv.mkDerivation { buildInputs = [ ${"lib ".repeat(150_000)}]; };\n}; }; }`,
	"aliases/flake.nix": `{ outputs = { self, nixpkgs }: let lib = nixpkgs.stdenv.mkDerivation { }; in { packages.s = {\n${Array.from({ length: 3000 }, (_, at) => `p${at} = lib;`).join("\n")}\napp = nixpkgs.stdenv.mkDerivation { buildInputs = [ ${"lib ".repeat(100)}]; };\n}; }; }`,
});
const facts = createCodeFacts();

afterAll(() => {
	checkout.remove();
});

/**
 * Read one `flake.nix`.
 * @param relative The file.
 * @returns Its facts.
 */
async function flake(relative: string): Promise<SyntaxFacts> {
	const found = await facts.pass(new AbortController().signal).read(checkout, relative);
	if (found?.adapter !== "nix") throw new Error(`${relative} was not read as Nix`);
	return found;
}

/**
 * The build dependencies of a flake, each with its line and where it leads.
 * @param read The flake's facts.
 * @returns Each reference's symbol, line, kind and target.
 */
function dependencies(read: SyntaxFacts): (string | number | undefined)[][] {
	return read.references.map((each) => [
		each.symbol,
		each.line,
		each.kind,
		each.target?.path,
		each.target?.symbol,
	]);
}

/**
 * The lines whose build inputs the reading cannot follow: the parts with no names.
 * @param read The flake's facts.
 * @returns Each part's first and last line.
 */
function unknownInputs(read: SyntaxFacts): number[][] {
	return read.unparsed
		.filter((part) => part.names.length === 0 && part.under === undefined)
		.map((part) => [part.start, part.end])
		.toSorted(([left = 0], [right = 0]) => left - right);
}

test("an input that is another package of the flake is a build dependency, through self, a let binding, finalAttrs and callPackage's arguments", async () => {
	const read = await flake("packages/flake.nix");
	const file = "packages/flake.nix";
	expect(dependencies(read).toSorted()).toEqual(
		[
			// lib from the core a `let` binds and the set inherits.
			["packages.x86_64-linux.core", 14, "build-dependency", file, "packages.x86_64-linux.core"],
			// app from self.packages, at the line that names it.
			["packages.x86_64-linux.lib", 19, "build-dependency", file, "packages.x86_64-linux.lib"],
			// cli from an argument of callPackage.
			["packages.x86_64-linux.lib", 22, "build-dependency", file, "packages.x86_64-linux.lib"],
		].toSorted(),
	);
	// callPackage's package files are not followed, and nor is a package of nixpkgs.
	expect(unknownInputs(read)).toEqual([
		[22, 22],
		[23, 23],
		[26, 26],
	]);
	// A part whose inputs are unknown hides no name: an output the flake does not give is absent.
	expect(findSymbol(read, "packages.x86_64-linux.gone", "definition").status).toBe("absent");
	expect(findSymbol(read, "gone", "definition").status).toBe("absent");
});

test("an overlay's packages are outputs below it, and final names the overlay's own", async () => {
	const read = await flake("overlay/flake.nix");
	expect(read.definitions.map((each) => each.symbol).toSorted()).toEqual([
		"overlays",
		"overlays.default",
		"overlays.default.app",
		"overlays.default.cli",
		"overlays.default.lib",
	]);
	expect(dependencies(read)).toEqual([
		["overlays.default.lib", 7, "build-dependency", "overlay/flake.nix", "overlays.default.lib"],
	]);
	expect(unknownInputs(read)).toEqual([[9, 9]]);
});

test("a system the reading cannot tell, and a derivation that is no output, pass the dependency on", async () => {
	const read = await flake("utils/flake.nix");
	expect(dependencies(read).toSorted()).toEqual(
		[
			// app is built from the helper, which is built from lib: at the line where app names the helper.
			["packages.*.lib", 9, "build-dependency", "utils/flake.nix", "packages.*.lib"],
			// default is app itself, written outside app's span: at default's line.
			["packages.*.lib", 10, "build-dependency", "utils/flake.nix", "packages.*.lib"],
		].toSorted(),
	);
	expect(unknownInputs(read)).toEqual([]);
});

test("a line that two packages share gives no build dependency: it is unknown there", async () => {
	const read = await flake("shared/flake.nix");
	const file = "shared/flake.nix";
	// docs from tool, whose lines only tool shares, with itself for the other system.
	expect(dependencies(read).toSorted()).toEqual(
		[
			["packages.aarch64-linux.tool", 16, "build-dependency", file, "packages.aarch64-linux.tool"],
			["packages.x86_64-linux.tool", 16, "build-dependency", file, "packages.x86_64-linux.tool"],
		].toSorted(),
	);
	// app from lib at the line app shares with core and lib; tool from core, whose line lib and app share; cli from a set lib's value is merged into.
	expect(unknownInputs(read)).toEqual([
		[14, 14],
		[15, 15],
		[17, 17],
	]);
});

test("reading the inputs spends the reading's budget, and what it does not reach is unknown", async () => {
	for (const [file, line] of [
		["budget/flake.nix", 3],
		["aliases/flake.nix", 3002],
	] as const) {
		const read = await flake(file);
		expect(read.definitions.length).toBeGreaterThan(1);
		expect(unknownInputs(read)).toEqual([[line, line]]);
	}
});
