// Imported expressions are read as part of the flake, without evaluating Nix.
import { afterAll, expect, test } from "bun:test";
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { createCodeFacts, type SyntaxFacts } from "@/runtime/code-facts/index";
import { fixtureCheckout } from "@/runtime/code-facts/tests/checkout";

const checkout = fixtureCheckout({
	"flake.nix": `{
  outputs = { self, nixpkgs }: {
    packages.s = rec {
      core = nixpkgs.stdenv.mkDerivation {};
      app = nixpkgs.callPackage ./app { inherit core; };
      imported = builtins.import ./app/default.nix { inherit core; stdenv = nixpkgs.stdenv; };
      ignored = nixpkgs.callPackage ./ignored.nix { inherit core; };
    };
    lib.invoke = arg: arg;
    lib.version = "1";
    overlays.default = final: prev: {
      core = prev.stdenv.mkDerivation {};
      app = final.callPackage ./auto.nix {};
    };
  };
}`,
	"app/default.nix": "args: import ./nested.nix args",
	"app/nested.nix": "{ stdenv, core }: stdenv.mkDerivation { buildInputs = [ core ]; }",
	"auto.nix": "{ stdenv, core }: stdenv.mkDerivation { propagatedBuildInputs = [ core ]; }",
	"ignored.nix": "{ stdenv, core }: stdenv.mkDerivation {}",
	"defaults/flake.nix": `{
  outputs = { self, nixpkgs }: {
    packages.s.core = nixpkgs.stdenv.mkDerivation {};
    packages.s.app = callPackage ./app.nix { inherit (self.packages.s) core; };
  };
}`,
	"defaults/app.nix": "{ core, helper ? core }: mkDerivation { buildInputs = [ helper ]; }",
	"limit/flake.nix": `{
  outputs = { self, nixpkgs }: {
    packages.s.first = nixpkgs.callPackage ./first.nix {};
    packages.s.second = nixpkgs.callPackage ./second.nix {};
  };
}`,
	"limit/first.nix": `{ stdenv }: stdenv.mkDerivation { buildInputs = [ ${"null ".repeat(60_000)}]; }`,
	"limit/second.nix": `{ stdenv }: stdenv.mkDerivation { buildInputs = [ ${"null ".repeat(60_000)}]; }`,
	"outside/flake.nix": `{
  outputs = { self, nixpkgs }: {
    packages.s.core = nixpkgs.stdenv.mkDerivation {};
    packages.s.parent = nixpkgs.callPackage ../../outside.nix {};
    packages.s.link = nixpkgs.callPackage ./link.nix {};
    packages.s.cycle = import ./cycle.nix;
  };
}`,
	"outside/cycle.nix": "import ./cycle.nix",
});
const external = fixtureCheckout({ "outside.nix": "mkDerivation {}" });
symlinkSync(join(external.root, "outside.nix"), join(checkout.root, "outside/link.nix"));
const listed = new Set([...checkout.files, "outside/link.nix"]);
const facts = createCodeFacts();

afterAll(() => {
	checkout.remove();
	external.remove();
});

/**
 * Read the flake through the public facts pass.
 * @param file Its path.
 * @returns The static facts.
 */
async function read(file = "flake.nix"): Promise<SyntaxFacts> {
	const found = await facts
		.pass(new AbortController().signal)
		.read({ ...checkout, files: listed }, file);
	if (found?.adapter !== "nix") throw new Error("The flake was not read as Nix");
	return found;
}

test("local imports and callPackage follow nested relative paths and actual build inputs", async () => {
	const found = await read();
	const refs = found.references.map(({ line, target }) => [line, target?.symbol]);
	expect(refs).toEqual([
		[5, "packages.s.core"],
		[6, "packages.s.core"],
		[13, "overlays.default.core"],
	]);
	expect(found.definitions.find(({ symbol }) => symbol === "lib.invoke")?.kind).toBe("function");
	expect(found.definitions.find(({ symbol }) => symbol === "lib.version")?.kind).toBe("value");
	// Passing core to an unused formal does not make it a build dependency.
	expect(found.unparsed.some(({ start, end }) => start <= 7 && 7 <= end)).toBe(false);
});

test("an imported file edit is visible on the next pass, including a nested import", async () => {
	checkout.write("app/nested.nix", "{ stdenv, core }: stdenv.mkDerivation {}");
	const found = await read();
	expect(found.references.map(({ target }) => target?.symbol)).toEqual(["overlays.default.core"]);
	checkout.write(
		"app/nested.nix",
		"{ stdenv, core }: stdenv.mkDerivation { buildInputs = [ core ]; }",
	);
});

test("callPackage keeps unknown automatic arguments unknown instead of taking formal defaults", async () => {
	const found = await read("defaults/flake.nix");
	expect(found.references).toEqual([]);
	expect(found.unparsed.some(({ source }) => source?.path === "defaults/app.nix")).toBe(true);
});

test("an outside path, an outside symlink and an import cycle remain skipped at owning file lines", async () => {
	const found = await read("outside/flake.nix");
	expect(found.references).toEqual([]);
	expect(
		found.unparsed.filter(({ under }) => under === undefined).map(({ start }) => start),
	).toEqual([4, 5, 6]);
	expect(
		found.unparsed.find(({ start, under }) => start === 6 && under === undefined)?.source,
	).toEqual({ path: "outside/cycle.nix", start: 1, end: 1 });
});

test("imported files share the 200000 operation limit and preserve the imported source of a skip", async () => {
	const found = await read("limit/flake.nix");
	expect(found.references).toEqual([]);
	expect(found.unparsed.some(({ source }) => source?.path === "limit/second.nix")).toBe(true);
});
