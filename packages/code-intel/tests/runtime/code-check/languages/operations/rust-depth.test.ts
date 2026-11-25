// Module depth of Rust modules (TASK-646.10): what the Rust grammar decides
// for the rules that TypeScript's tests own. The kind of each export, the
// pieces of logic behind them, the uses of each name, the math around each
// use, and the calls a function only passes on.
//
// The checkout `shop` is one crate with a canonical vault, each module of the
// crate bound to its directory. `timing` exports durations, a getter and
// values. `codex` and `relay` write the restart backoff on `PROCESS` with
// their own spellings, `relay` through local variables, and `codex` and
// `worker` the same math on the getter `jitter_ms`. `worker` and `relay`
// compare and mask `DEADLINE`, which is no math, and hand it to a method
// named `log`, which is no math either. Only `worker` reads `LIMIT`,
// and only its tests read `UNUSED`. `ledger` exports a trait, a type alias,
// an enum, a function pointer, a type with an associated constant that passes
// calls on, and one that implements the trait and `Drop`.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultSemanticPolicy } from "@archboard/model/policy";
import type { CodeCheckAnswer } from "#shared/protocol/code-check.ts";
import { git as fixtureGit, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "archboard-rust-depth-")));
const shop = join(scratch, "shop");
const vault = join(shop, ".archboard", "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
let answer: CodeCheckAnswer;

/**
 * Run Git in the checkout.
 * @param args Git's arguments.
 */
function git(...args: string[]): void {
	fixtureGit(scratch, shop, ...args);
}

/**
 * One module of the model, bound to its directory of the crate.
 * @param id Its id in the model.
 * @param order Its order.
 */
function module(id: string, order: number): void {
	write(vault, {
		[`${id}.module.json`]: JSON.stringify({
			schemaVersion: 1,
			id: `Shop#${id}`,
			name: id,
			kind: "module",
			order,
			binding: { repo: SHOP, path: `src/${id.toLowerCase()}` },
			outgoing: [],
		}),
	});
}

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git("init", "-q", "-b", "main");
	git("remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		"Cargo.toml": '[package]\nname = "shop"\nversion = "0.1.0"\n',
		"src/lib.rs": "mod codex;\nmod ledger;\nmod relay;\nmod store;\nmod timing;\nmod worker;\n",
		"src/timing/mod.rs": [
			"pub struct Durations {",
			"    pub restart_base: u64,",
			"    pub restart_max: u64,",
			"}",
			"pub const PROCESS: Durations = Durations { restart_base: 1000, restart_max: 30_000 };",
			"pub const DEADLINE: u64 = 5000;",
			"pub static LIMIT: u32 = 3;",
			"pub const UNUSED: u32 = 7;",
			"pub fn jitter_ms() -> u64 {",
			"    50",
			"}",
			"",
		].join("\n"),
		"src/codex/mod.rs": [
			"use crate::timing::{jitter_ms, Durations, PROCESS};",
			"pub fn delay(attempt: u32) -> u64 {",
			"    PROCESS.restart_max.min(PROCESS.restart_base * 2u64.pow(attempt))",
			"}",
			"pub fn spread(seed: u64) -> u64 {",
			"    jitter_ms() * seed + 1",
			"}",
			"pub fn run(port: &dyn crate::ledger::Port, amount: crate::ledger::Amount) -> bool {",
			"    let relay = crate::ledger::Relay::new(Box::new(crate::ledger::Account));",
			"    let _ = (crate::ledger::HANDLER)(amount) + crate::ledger::post(amount);",
			"    let _: Option<&Durations> = None;",
			"    let _ = crate::ledger::Relay::RETRIES;",
			"    relay.send(1) && port.send(2) && crate::ledger::Kind::Debit.is_debit()",
			"}",
			"",
		].join("\n"),
		"src/relay/mod.rs": [
			"use crate::timing;",
			"pub fn wait(tries: u32) -> u64 {",
			"    let base = timing::PROCESS.restart_base;",
			"    let max = timing::PROCESS.restart_max;",
			"    std::cmp::min(2u64.pow(tries) * base, max)",
			"}",
			"pub fn late(elapsed: u64, flags: u64) -> bool {",
			"    elapsed == timing::DEADLINE || (flags & timing::DEADLINE) > 0",
			"}",
			"fn trace(log: &Tracer) -> u64 {",
			"    log.log(timing::DEADLINE)",
			"}",
			"",
		].join("\n"),
		"src/worker/mod.rs": [
			"use crate::timing::{self, DEADLINE};",
			"pub fn noise(n: u64) -> u64 {",
			"    (1 + n * timing::jitter_ms())",
			"}",
			"pub fn due(now: u64) -> bool {",
			"    now != DEADLINE && (now | DEADLINE) > u64::from(timing::LIMIT)",
			"}",
			"fn note(log: &Tracer) -> u64 {",
			"    log.log(DEADLINE)",
			"}",
			"#[cfg(test)]",
			"mod tests {",
			"    use crate::timing::UNUSED;",
			"    #[test]",
			"    fn seven() {",
			"        assert_eq!(UNUSED * 2, 14);",
			"    }",
			"}",
			"",
		].join("\n"),
		"src/store/mod.rs": "pub fn save(amount: i64) -> i64 {\n    amount * 2\n}\n",
		"src/ledger/mod.rs": [
			"use crate::store::save;",
			"const FEE: i64 = 4;",
			"pub trait Port {",
			"    fn send(&self, id: u32) -> bool;",
			"}",
			"pub type Amount = i64;",
			"pub enum Kind {",
			"    Debit,",
			"    Credit,",
			"}",
			"impl Kind {",
			"    pub fn is_debit(&self) -> bool {",
			"        matches!(self, Kind::Debit)",
			"    }",
			"}",
			"pub const HANDLER: fn(Amount) -> Amount = fee;",
			"pub struct Relay {",
			"    target: Box<dyn Port>,",
			"}",
			"impl Relay {",
			"    pub const RETRIES: u32 = 3;",
			"    pub fn new(target: Box<dyn Port>) -> Self {",
			"        Relay { target }",
			"    }",
			"    pub fn send(&self, id: u32) -> bool {",
			"        self.target.send(id)",
			"    }",
			"    fn quiet(&self) {}",
			"}",
			"pub struct Account;",
			"impl Port for Account {",
			"    fn send(&self, id: u32) -> bool {",
			"        id > 0",
			"    }",
			"}",
			"impl Drop for Account {",
			"    fn drop(&mut self) {",
			"        close(self)",
			"    }",
			"}",
			"pub fn post(amount: Amount) -> Amount {",
			"    save(amount)",
			"}",
			"fn fee(amount: Amount) -> Amount {",
			"    if amount > 100 { amount / FEE } else { 0 }",
			"}",
			"fn close(_: &mut Account) {}",
			"#[cfg(test)]",
			"mod tests {",
			"    #[test]",
			"    fn free() {",
			"        assert!(super::fee(1) == 0);",
			"    }",
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
	["Timing", "Codex", "Relay", "Worker", "Store", "Ledger"].forEach((id, index) =>
		module(id, (index + 1) * 10),
	);
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", "the code");
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
 * The depth of one module.
 * @param name The module's name.
 * @returns Its depth record.
 */
function depthOf(name: string) {
	return answer.depth?.find((each) => each.subject.name === name);
}

/**
 * The findings on one module's exports, as the export each names, its code and its severity.
 * @param name The module's name.
 * @returns Each finding.
 */
function findingsOn(name: string) {
	return answer.findings
		.filter((each) => each.subject?.name === name && each.export !== undefined)
		.map((each) => [each.export, each.code, each.severity]);
}

test("a Rust module's exports are counted by kind: a struct and an enum are classes with their public methods and associated items, a trait and a type alias are types, and a function pointer is a function", () => {
	const ledger = depthOf("Ledger");
	expect(ledger?.languages).toEqual(["rust"]);
	expect(ledger?.unjudged).toEqual([]);
	expect(ledger?.names.map(({ name, kind }) => [name, kind])).toEqual([
		["Port", "type"],
		["Amount", "type"],
		["Kind", "class"],
		["HANDLER", "function"],
		["Relay", "class"],
		["Account", "class"],
		["post", "function"],
		["Kind.is_debit", "method"],
		// Read through the type's name, an associated item is an export of its own.
		["Relay.RETRIES", "value"],
		["Relay.new", "function"],
		["Relay.send", "method"],
		// A trait's method on the type that implements it; `drop`, which the language calls, is no export.
		["Account.send", "method"],
	]);
	expect(depthOf("Timing")?.exports).toEqual({
		functions: 1,
		classes: 1,
		methods: 0,
		values: 4,
		types: 0,
	});
});

test("the pieces of logic of a Rust module are its calls, macro calls, operators, conditions and its hidden values, its tests aside", () => {
	// `matches!`, `self.target.send`, `id > 0`, `close`, `save`, the `if`, `>` and `/` of `fee`, and `FEE`.
	expect(depthOf("Ledger")?.logic).toBe(9);
});

test("Rust uses and the math around them judge each export, whatever the spelling or a local variable", () => {
	expect(findingsOn("Timing")).toEqual([
		["PROCESS", "EXPOSED_VALUE_COMPUTED", "warning"],
		// Comparing and masking is no math, nor is a method named `log`.
		["DEADLINE", "EXPOSED_VALUE", "warning"],
		["LIMIT", "EXPOSED_VALUE", "warning"],
		// A test is no user.
		["UNUSED", "EXPOSED_UNUSED", "warning"],
		["jitter_ms", "EXPOSED_VALUE_COMPUTED", "warning"],
	]);
	const lines = (name: string) =>
		answer.findings
			.find((each) => each.code === "EXPOSED_VALUE_COMPUTED" && each.export === name)
			?.evidence?.map((each) => [each.from, each.path, each.line]);
	expect(lines("PROCESS")).toEqual([
		["Shop#Codex", "src/codex/mod.rs", 3],
		["Shop#Relay", "src/relay/mod.rs", 5],
	]);
	expect(lines("jitter_ms")).toEqual([
		["Shop#Codex", "src/codex/mod.rs", 6],
		["Shop#Worker", "src/worker/mod.rs", 3],
	]);
});

test("a Rust function or method that only passes its call on is a pass-through, and a trait's implementation and the members the language calls get no finding", () => {
	expect(findingsOn("Ledger")).toEqual([
		["post", "CODE_PASS_THROUGH", "information"],
		["Relay.RETRIES", "EXPOSED_VALUE", "warning"],
		["Relay.send", "CODE_PASS_THROUGH", "information"],
	]);
});
