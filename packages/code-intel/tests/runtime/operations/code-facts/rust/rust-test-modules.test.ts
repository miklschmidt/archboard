import { afterAll, expect, test } from "bun:test";
import { createCodeFacts } from "#runtime/services/code-facts/reader.ts";
import { fixtureCheckout } from "#tests/runtime/support/code-facts/checkout.ts";

/** `helper` is declared under `#[cfg(test)]` and holds `deep`; `client` is production. */
const checkout = fixtureCheckout({
	"Cargo.toml": '[package]\nname = "shell"\nversion = "0.1.0"\nedition = "2021"\n',
	"src/lib.rs": "mod live;\nmod client;\n#[cfg(test)]\nmod helper;\n",
	"src/live.rs": "pub fn run() {}\n",
	"src/client.rs": "use crate::live::run;\nfn go() { run(); }\n",
	"src/helper.rs": "use crate::live::run;\nmod deep;\nfn check() { run(); }\n",
	"src/helper/deep.rs": "use crate::live::run;\nfn deeper() { run(); }\n",
});
afterAll(() => checkout.remove());

/**
 * Read one file's facts in a pass of their own.
 * @param relative The file.
 * @returns Its facts.
 */
async function read(relative: string) {
	const found = await createCodeFacts().pass(new AbortController().signal).read(checkout, relative);
	if (found === undefined || found.adapter === "text") throw new Error("missing Rust facts");
	return found;
}

test("a file that a #[cfg(test)] mod declares, and every file below it, has no production imports or calls", async () => {
	const client = await read("src/client.rs");
	expect(client.imports.map((each) => each.resolved)).toEqual(["src/live.rs"]);
	expect(client.references.map((each) => each.target?.path)).toContain("src/live.rs");

	for (const file of ["src/helper.rs", "src/helper/deep.rs"]) {
		const found = await read(file);
		expect(found.imports).toEqual([]);
		expect(found.references).toEqual([]);
		expect(found.definitions.length).toBeGreaterThan(0);
	}
});
