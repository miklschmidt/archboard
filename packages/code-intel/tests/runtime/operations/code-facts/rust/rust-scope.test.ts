import { afterAll, expect, test } from "bun:test";
import { createCodeFacts } from "#runtime/services/code-facts/reader.ts";
import { fixtureCheckout } from "#tests/runtime/support/code-facts/checkout.ts";

const checkout = fixtureCheckout({
	"Cargo.toml": '[package]\nname = "scope"\nversion = "0.1.0"\nedition = "2021"\n',
	"src/lib.rs": "mod api;\nmod other;\nmod client;\n",
	"src/api.rs": "pub fn call() {}\n",
	"src/other.rs": "pub fn call() {}\n",
	"src/client.rs": [
		"use crate::api::call;",
		"fn local(call: fn()) { call(); }",
		"fn actual() { call(); }",
		"fn block() {",
		"    call();",
		"    let call = || {};",
		"    call();",
		"}",
		"// A separately scoped module.",
		"mod tests {",
		"    use crate::other::call;",
		"    fn test_call() { call(); }",
		"}",
		"mod sibling {",
		"    use crate::api::*;",
		"    fn glob_call() { call(); }",
		"}",
	].join("\n"),
});
afterAll(() => checkout.remove());

test("Rust imports resolve in their lexical scope and locals shadow only later uses in their block", async () => {
	const pass = createCodeFacts().pass(new AbortController().signal);
	const facts = await pass.read(checkout, "src/client.rs");
	if (facts === undefined || facts.adapter === "text") throw new Error("missing Rust facts");
	expect(
		facts.references
			.filter(
				(use) => (use.symbol === "call" || use.symbol === "tests.call") && use.kind === "call",
			)
			.map((use) => [use.line, use.target?.path]),
	).toEqual([
		[2, undefined],
		[3, "src/api.rs"],
		[12, "src/other.rs"],
		[16, "src/api.rs"],
	]);
});
