// The uses of a Rust module's exports that `EXPOSED_UNUSED` must see
// (TASK-646.16), each a false finding of an audit of this repository's crates.
//
// The checkout is a workspace. The crate `svg` uses the other crates: `Group`,
// which `scene::scene` passes on beside the variant `Item::Group`; `outline`,
// a function `text` passes on from its module of the same name, and `note!`,
// a macro `#[macro_export]` puts at the root of `text`; and `route`,
// which `svg` calls from a method of its own named `route`. In the crate
// `paint`, files outside the folder of the module `between` call `departure`,
// a function of the module's file of the same name, and `frame_of`. The crate
// `wasm` exports functions to JavaScript through `#[wasm_bindgen]`, and types
// to TypeScript through ts-rs's `#[derive(TS)]`. `svg` calls
// `hidden::made`, which a macro of `hidden` defines, so the check cannot tell
// which name of `hidden` it uses. `svg` calls `ink::colour` and `ink::shape`
// by their paths: the root of `ink` defines `colour` and passes `shape` on,
// each beside a private module of the same name, which no other crate sees.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultSemanticPolicy } from "@archboard/model/policy";
import type { CodeCheckAnswer } from "#shared/protocol/code-check.ts";
import { git as fixtureGit, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "archboard-rust-uses-")));
const shop = join(scratch, "shop");
const vault = join(shop, ".archboard", "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
let answer: CodeCheckAnswer;

/**
 * A library crate's manifest.
 * @param name The crate.
 * @param dependencies The crates of the workspace it depends on.
 * @returns The manifest.
 */
function manifest(name: string, dependencies: readonly string[] = []): string {
	const needs = dependencies.map((each) => `${each} = { workspace = true }`);
	return [`[package]\nname = "${name}"\nversion = "0.1.0"\n\n[dependencies]`, ...needs, ""].join(
		"\n",
	);
}

/**
 * One module of the model, bound to a path of the checkout.
 * @param id Its id in the model.
 * @param path Its bound path.
 * @param order Its order.
 */
function module(id: string, path: string, order: number): void {
	write(vault, {
		[`${id}.module.json`]: JSON.stringify({
			schemaVersion: 1,
			id: `Shop#${id}`,
			name: id,
			kind: "module",
			order,
			binding: { repo: SHOP, path },
			outgoing: [],
		}),
	});
}

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	fixtureGit(scratch, shop, "init", "-q", "-b", "main");
	fixtureGit(scratch, shop, "remote", "add", "origin", `https://${SHOP}.git`);
	const crates = ["scene", "text", "router", "hidden", "ink", "svg", "paint", "wasm"];
	write(shop, {
		"Cargo.toml": [
			'[workspace]\nresolver = "2"\nmembers = ["crates/*"]\n\n[workspace.dependencies]',
			...crates.map((each) => `${each} = { path = "crates/${each}" }`),
			"",
		].join("\n"),
		"crates/scene/Cargo.toml": manifest("scene"),
		"crates/scene/src/lib.rs": "pub mod scene;\n",
		"crates/scene/src/scene/mod.rs": [
			"mod group;",
			"pub use group::Group;",
			"pub enum Item {",
			"    Group(Group),",
			"    Empty,",
			"}",
			"",
		].join("\n"),
		"crates/scene/src/scene/group.rs": "pub struct Group {\n    pub size: u32,\n}\n",
		"crates/text/Cargo.toml": manifest("text"),
		"crates/text/src/lib.rs": "pub mod diag;\nmod outline;\npub use outline::outline;\n",
		"crates/text/src/diag.rs":
			"#[macro_export]\nmacro_rules! note {\n    () => {\n        1\n    };\n}\n",
		"crates/text/src/outline.rs": "pub fn outline(size: u32) -> u32 {\n    size + 1\n}\n",
		"crates/router/Cargo.toml": manifest("router"),
		"crates/router/src/lib.rs": "pub fn route(lanes: u32) -> u32 {\n    lanes * 2\n}\n",
		"crates/hidden/Cargo.toml": manifest("hidden"),
		"crates/hidden/src/lib.rs": [
			"macro_rules! make {",
			"    ($name:ident) => {",
			"        pub fn $name() -> u32 {",
			"            1",
			"        }",
			"    };",
			"}",
			"make!(made);",
			"pub fn shown() -> u32 {",
			"    2",
			"}",
			"",
		].join("\n"),
		"crates/ink/Cargo.toml": manifest("ink"),
		"crates/ink/src/lib.rs": [
			"mod colour;",
			"mod shape;",
			"pub use shape::shape;",
			"pub fn colour(tone: u32) -> u32 {",
			"    colour::css(tone)",
			"}",
			"",
		].join("\n"),
		"crates/ink/src/colour.rs": "pub fn css(tone: u32) -> u32 {\n    tone + 1\n}\n",
		"crates/ink/src/shape.rs": "pub fn shape(words: u32) -> u32 {\n    words * 2\n}\n",
		"crates/svg/Cargo.toml": manifest("svg", ["scene", "text", "router", "hidden", "ink"]),
		"crates/svg/src/lib.rs": [
			"use router::route;",
			"use scene::scene::{Group, Item};",
			"use text::outline;",
			"pub struct Trunks;",
			"impl Trunks {",
			"    pub fn route(&self) -> u32 {",
			"        route(3)",
			"    }",
			"}",
			"pub fn draw(group: &Group, item: Item) -> u32 {",
			"    let _ = (item, Item::Empty);",
			"    outline(group.size) + hidden::made() + text::note!() + ink::colour(1) + ink::shape(2)",
			"}",
			"",
		].join("\n"),
		"crates/paint/Cargo.toml": manifest("paint"),
		"crates/paint/src/lib.rs": "pub mod between;\npub mod flight;\npub mod stage;\n",
		"crates/paint/src/between/mod.rs": [
			"mod departure;",
			"pub use departure::departure;",
			"pub(crate) fn frame_of(scene: u32) -> u32 {",
			"    scene + 1",
			"}",
			"",
		].join("\n"),
		"crates/paint/src/between/departure.rs": "pub fn departure(at: u32) -> u32 {\n    at * 3\n}\n",
		"crates/paint/src/flight.rs":
			"use crate::between::departure;\npub fn fly() -> u32 {\n    departure(1)\n}\n",
		"crates/paint/src/stage/mod.rs":
			"use crate::between::frame_of;\npub fn arrive() -> u32 {\n    frame_of(2)\n}\n",
		"crates/wasm/Cargo.toml": manifest("wasm"),
		"crates/wasm/src/lib.rs": [
			"use wasm_bindgen::prelude::*;",
			"use ts_rs::TS;",
			"pub mod layout;",
			"#[derive(Clone, Debug, PartialEq, TS)]",
			"#[ts(export)]",
			"pub struct Legend {",
			"    pub rows: u32,",
			"}",
			"#[derive(ts_rs::TS)]",
			"pub enum Mode {",
			"    Light,",
			"}",
			"#[wasm_bindgen(js_name = sourceHash)]",
			"pub fn source_hash() -> u32 {",
			"    7",
			"}",
			"pub fn helper() -> u32 {",
			"    1",
			"}",
			"",
		].join("\n"),
		"crates/wasm/src/layout.rs": [
			"use wasm_bindgen::prelude::*;",
			"#[wasm_bindgen]",
			"pub struct Picture {",
			"    width: u32,",
			"}",
			"#[wasm_bindgen]",
			"impl Picture {",
			"    pub fn width(&self) -> u32 {",
			"        self.width",
			"    }",
			"}",
			"#[wasm_bindgen(js_name = layOutPicture)]",
			"pub async fn lay_out_picture(graph: u32) -> u32 {",
			"    graph",
			"}",
			"",
		].join("\n"),
	});
	write(vault, {
		"model.json": JSON.stringify({
			schemaVersion: 1,
			id: "Shop",
			name: "Shop",
			current: { id: "Built", name: "Built" },
		}),
		".archboard/config.yaml": Bun.YAML.stringify(defaultSemanticPolicy()),
	});
	module("Scene", "crates/scene/src/scene", 10);
	module("Text", "crates/text", 20);
	module("Router", "crates/router", 30);
	module("Motion", "crates/paint/src/between/mod.rs", 40);
	module("Wasm", "crates/wasm", 50);
	module("Hidden", "crates/hidden", 60);
	module("Ink", "crates/ink", 70);
	fixtureGit(scratch, shop, "add", "-A");
	fixtureGit(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", "the code");
	register(scratch, { [SHOP]: shop });
	const codeCheck = (await import("#runtime/api/code-check-run.ts")).createCodeCheck();
	const read = await codeCheck.run({
		vault,
		variant: undefined,
		everyDraft: false,
		plans: [],
		signal: new AbortController().signal,
	});
	if (!("states" in read)) throw new Error(read.error);
	answer = read;
});

afterAll(() => {
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * The `EXPOSED_UNUSED` findings on one module, as the export each names and its severity.
 * @param name The module's name.
 * @returns Each finding.
 */
function unusedOn(name: string) {
	return answer.findings
		.filter((each) => each.subject?.name === name && each.code === "EXPOSED_UNUSED")
		.map((each) => [each.export, each.severity]);
}

test("a Rust name another crate uses counts as used, past a variant of the same name and a method of the caller's own", () => {
	expect(unusedOn("Scene")).toEqual([]);
	expect(unusedOn("Router")).toEqual([]);
});

test("a call of a Rust function that shares its name with its module reaches the function, from another crate and from outside the module's folder, and a crate's exported macro is used at its root", () => {
	expect(unusedOn("Text")).toEqual([]);
	expect(unusedOn("Motion")).toEqual([]);
});

test("a path from another crate reaches the public function of a crate's root, not its private module of the same name", () => {
	expect(unusedOn("Ink")).toEqual([]);
});

test("an item exported to JavaScript through #[wasm_bindgen], or to TypeScript through #[derive(TS)], is used by the host language", () => {
	expect(unusedOn("Wasm")).toEqual([["helper", "warning"]]);
});

test("a Rust use that leads into a module but reaches no name it defines leaves EXPOSED_UNUSED there as information", () => {
	expect(unusedOn("Hidden")).toEqual([["shown", "information"]]);
});
