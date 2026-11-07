import { afterAll, expect, test } from "bun:test";
import { createCodeFacts } from "#runtime/code-facts/services/reader.ts";
import { fixtureCheckout } from "#tests/runtime/support/code-facts/checkout.ts";

const CALL = "use crate::live::run;\nfn go() { run(); }\n";
const LIBRARY_CALL = "use shell::live::run;\nfn main() { run(); }\n";
const ROOT = [
	"pub mod live;",
	"mod client;",
	"mod shared;",
	"#[cfg(test)] mod helper;",
	"#[cfg(test)] mod folder;",
	"mod inline { #[cfg(test)] mod helper; }",
	"#[cfg(test)] mod inline_tests { mod helper; }",
	"#[cfg(test)] mod paired;",
	"#[cfg(not(test))] mod paired;",
	CALL,
].join("\n");
const checkout = fixtureCheckout({
	"Cargo.toml": '[package]\nname = "shell"\nversion = "0.1.0"\nedition = "2021"\n',
	"src/lib.rs": ROOT,
	"src/live.rs": "pub fn run() {}\n",
	"src/client.rs": CALL,
	"src/shared.rs": CALL,
	"src/paired.rs": CALL,
	"src/orphan.rs": CALL,
	"src/helper.rs": `mod deep;\n${CALL}`,
	"src/helper/deep.rs": `mod nested;\n${CALL}`,
	"src/helper/deep/nested.rs": CALL,
	"src/helper/orphan.rs": CALL,
	"src/folder/mod.rs": `mod deep;\n${CALL}`,
	"src/folder/deep.rs": CALL,
	"src/inline.rs": "",
	"src/inline/helper.rs": CALL,
	"src/inline_tests/helper.rs": CALL,
	"src/main.rs": `#[cfg(test)] mod main_tests;\nmod shared;\n${LIBRARY_CALL}`,
	"src/main_tests.rs": CALL,
	"src/bin/app.rs": `#[cfg(test)] mod helper;\n${LIBRARY_CALL}`,
	"src/bin/helper/mod.rs": LIBRARY_CALL,
	"src/inner.rs": `#![cfg(test)]\n${CALL}`,
});
afterAll(() => checkout.remove());

test("only declared test modules lose imports and calls, across file layouts and crate roots", async () => {
	const pass = createCodeFacts().pass(new AbortController().signal);
	for (const file of [
		"src/helper.rs",
		"src/helper/deep.rs",
		"src/helper/deep/nested.rs",
		"src/folder/mod.rs",
		"src/folder/deep.rs",
		"src/inline/helper.rs",
		"src/inline_tests/helper.rs",
		"src/main_tests.rs",
		"src/bin/helper/mod.rs",
		"src/inner.rs",
	]) {
		const found = await pass.read(checkout, file);
		if (found === undefined || found.adapter === "text") throw new Error(`missing facts: ${file}`);
		expect({ file, imports: found.imports, references: found.references }).toEqual({
			file,
			imports: [],
			references: [],
		});
		expect(found.definitions.length).toBeGreaterThan(0);
	}
	for (const file of [
		"src/client.rs",
		"src/lib.rs",
		"src/main.rs",
		"src/bin/app.rs",
		"src/shared.rs",
		"src/paired.rs",
		"src/orphan.rs",
		"src/helper/orphan.rs",
	]) {
		const found = await pass.read(checkout, file);
		if (found === undefined || found.adapter === "text") throw new Error(`missing facts: ${file}`);
		expect({ file, paths: found.imports.map((each) => each.resolved) }).toMatchObject({
			file,
			paths: expect.arrayContaining(["src/live.rs"]),
		});
		expect(found.references.map((each) => each.target?.path)).toContain("src/live.rs");
	}
	// Parents read by resolution share the same parse cache as directly read files.
	for (const file of checkout.files) if (file.endsWith(".rs")) await pass.read(checkout, file);
	expect(pass.stats.parsed).toBe(checkout.files.size - 1);
});

test("a new pass observes a parent declaration edit without changing descendant files", async () => {
	const reader = createCodeFacts();
	const before = await reader
		.pass(new AbortController().signal)
		.read(checkout, "src/helper/deep.rs");
	if (before === undefined || before.adapter === "text") throw new Error("missing Rust facts");
	expect(before.imports).toEqual([]);
	checkout.write("src/lib.rs", ROOT.replace("#[cfg(test)] mod helper;", "mod helper;"));
	try {
		const pass = reader.pass(new AbortController().signal);
		const after = await pass.read(checkout, "src/helper/deep.rs");
		if (after === undefined || after.adapter === "text") throw new Error("missing Rust facts");
		expect(after.imports.map((each) => each.resolved)).toContain("src/live.rs");
		expect(after.references.map((each) => each.target?.path)).toContain("src/live.rs");
		expect(pass.stats.cached).toBeGreaterThan(0);
	} finally {
		checkout.write("src/lib.rs", ROOT);
	}
});
