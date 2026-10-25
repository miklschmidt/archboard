import { afterAll, expect, test } from "bun:test";
import { createCodeFacts } from "#runtime/services/code-facts/reader.ts";
import { definitionSite } from "#runtime/operations/code-facts/definition-site.ts";
import { moduleExposure } from "#runtime/operations/code-facts/modules/module-exposure.ts";
import { fixtureCheckout } from "#tests/runtime/support/code-facts/checkout.ts";

const checkout = fixtureCheckout({
	"Cargo.toml":
		'[workspace]\nresolver = "2"\nmembers = ["crates/*"]\n[workspace.dependencies]\nrenamed = { package = "provider", path = "crates/provider" }\n',
	"crates/provider/Cargo.toml":
		'[package]\nname = "provider"\nversion = "0.1.0"\nedition = "2021"\n',
	"crates/provider/src/lib.rs":
		"pub mod api;\npub fn root() {}\npub mod inline { pub mod child; pub fn parent() {} }\n",
	"crates/provider/src/inline/child.rs":
		"use super as parent;\nuse crate::{self as root};\npub fn run() { parent::parent(); root::root(); }\n",
	"crates/provider/src/api.rs": "pub mod child;\npub fn send() {}\n",
	"crates/provider/src/api/child.rs":
		"pub fn run() { super::super::root(); crate::root(); super::send(); }\n",
	"crates/facade/Cargo.toml":
		'[package]\nname = "facade"\nversion = "0.1.0"\nedition = "2021"\n[dependencies]\nrenamed.workspace = true\n',
	"crates/facade/src/lib.rs":
		"pub use renamed::api::*;\npub mod nested { pub use renamed::api::send as forwarded; }\npub fn local() { nested::forwarded(); }\n",
	"crates/client/Cargo.toml":
		'[package]\nname = "client"\nversion = "0.1.0"\nedition = "2021"\n[dependencies]\nfacade = { path = "../facade" }\nrenamed.workspace = true\n',
	"crates/client/src/lib.rs": [
		"use renamed::api::{self as api, child::{self, run}, send as deliver};",
		"pub fn call() { api::send(); child::run(); run(); deliver(); }",
		"pub mod globbed { use facade::*; pub fn call() { send(); } }",
		"pub mod nested { use facade::nested::*; pub fn call() { forwarded(); } }",
		"pub mod qualified { pub fn call() { facade::nested::forwarded(); } }",
	].join("\n"),
});
afterAll(() => checkout.remove());
const facts = createCodeFacts();

/** Find a reference through every re-export in a fresh pass. */
async function site(file: string, symbol: string) {
	return definitionSite(facts.pass(new AbortController().signal), checkout, file, symbol);
}

test("nested use trees, module self aliases and renamed workspace dependencies keep their targets", async () => {
	const file = "crates/client/src/lib.rs";
	for (const symbol of ["api.send", "deliver"]) {
		expect(await site(file, symbol)).toMatchObject({
			path: "crates/provider/src/api.rs",
			definition: { symbol: "send" },
		});
	}
	for (const symbol of ["child.run", "run"]) {
		expect(await site(file, symbol)).toMatchObject({
			path: "crates/provider/src/api/child.rs",
			definition: { symbol: "run" },
		});
	}
});

test("a module in foo.rs owns foo/ and resolves repeated super and crate paths", async () => {
	const file = "crates/provider/src/api/child.rs";
	for (const symbol of ["super.super.root", "crate.root"]) {
		expect(await site(file, symbol)).toMatchObject({
			path: "crates/provider/src/lib.rs",
			definition: { symbol: "root" },
		});
	}
	expect(await site(file, "super.send")).toMatchObject({
		path: "crates/provider/src/api.rs",
		definition: { symbol: "send" },
	});
	const exposure = await moduleExposure(
		facts.pass(new AbortController().signal),
		checkout,
		"crates/provider/src/api",
	);
	expect(exposure?.rootFiles).toEqual(["crates/provider/src/api.rs"]);
	expect(exposure?.outside).not.toContain("crates/provider/src/api.rs");
});

test("glob imports follow public re-export chains and inline module namespaces across crates", async () => {
	for (const symbol of ["send", "forwarded", "facade.nested.forwarded"]) {
		expect(await site("crates/client/src/lib.rs", symbol)).toMatchObject({
			path: "crates/provider/src/api.rs",
			definition: { symbol: "send" },
		});
	}
	expect(await site("crates/facade/src/lib.rs", "nested.forwarded")).toMatchObject({
		path: "crates/provider/src/api.rs",
		definition: { symbol: "send" },
	});
	const exposure = await moduleExposure(
		facts.pass(new AbortController().signal),
		checkout,
		"crates/facade/src",
	);
	expect(exposure?.exposed.map((each) => each.name)).toContain("nested.forwarded");
	expect(exposure?.exposed.map((each) => each.name)).not.toContain("forwarded");
});

test("module aliases and file modules below an inline module reach their definitions", async () => {
	const file = "crates/provider/src/inline/child.rs";
	expect(await site(file, "parent.parent")).toMatchObject({
		path: "crates/provider/src/lib.rs",
		definition: { symbol: "inline.parent" },
	});
	expect(await site(file, "root.root")).toMatchObject({
		path: "crates/provider/src/lib.rs",
		definition: { symbol: "root" },
	});
});
