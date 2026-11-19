// What module depth reads from C and C++ code (TASK-646.12): the kind of each
// export, the pieces of logic behind them, the call a function only passes
// on, and the math a caller writes around a use. The rules themselves are the
// TypeScript tests'; these assert what the C and C++ grammars decide.
//
// `src/timing` is a C module: a value macro, a function macro, an `extern`
// value, a struct, a typedef, an enum, a getter, a function that decides, one
// that only passes its call on and one nobody calls. `codex` and `relay`
// write the same math on `restart_base` and on the getter, `relay` through a
// local; `relay` reads `RESTART_MAX` with no math. `src/config` exports only a
// value. `cpp/store` is a C++ class in a namespace with a constructor, a
// destructor, an operator, public and private methods, a struct, an alias, a
// constant and a function; `cpp/app` uses them.

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { CodeCheckAnswer } from "#shared/protocol/code-check.ts";
import {
	depthByModule,
	depthCheckout,
	depthFindings,
} from "#tests/runtime/support/code-check/depth-checkout.ts";

let shop: Awaited<ReturnType<typeof depthCheckout>>;
let answer: CodeCheckAnswer;

beforeAll(async () => {
	shop = await depthCheckout(
		{
			"src/timing/timing.h": [
				"#ifndef TIMING_H",
				"#define TIMING_H",
				"#define RESTART_MAX 30000",
				"#define SQUARE(x) ((x) * (x))",
				"extern const int restart_base;",
				"struct durations { int base; int max; };",
				"typedef int millis;",
				"enum mode { MODE_FAST, MODE_SLOW };",
				"int jitter_ms(void);",
				"int timing_scale(int value);",
				"int timing_forward(int value);",
				"int timing_unused(int value);",
				"#endif",
				"",
			].join("\n"),
			"src/timing/timing.c": [
				'#include "timing.h"',
				"const int restart_base = 1000;",
				"static int hidden = 3;",
				"int jitter_ms(void) { return 50; }",
				"int timing_scale(int value) {",
				"\tif (value > 0) { return value * hidden; }",
				"\treturn 0;",
				"}",
				"int timing_forward(int value) { return timing_scale(value); }",
				"int timing_unused(int value) { return value + 1; }",
				"",
			].join("\n"),
			"src/config/config.h": "extern const int config_retries;\n",
			"src/config/config.c": '#include "config.h"\nconst int config_retries = 3;\n',
			"src/codex/codex.c": [
				'#include "../timing/timing.h"',
				'#include "../config/config.h"',
				"int codex_delay(int attempt) {",
				"\treturn restart_base * attempt + 7;",
				"}",
				"int codex_spread(int seed) {",
				"\treturn jitter_ms() * seed + 1;",
				"}",
				"int codex_retries(void) { return config_retries; }",
				"int codex_forward(int value) { return timing_forward(value); }",
				"",
			].join("\n"),
			"src/relay/relay.c": [
				'#include "../timing/timing.h"',
				"int relay_wait(int tries) {",
				"\tconst int base = restart_base;",
				"\treturn 7 + tries * base;",
				"}",
				"int relay_noise(int n) { return (1 + n * jitter_ms()); }",
				"int relay_cap(void) { return RESTART_MAX; }",
				"int relay_mode(enum mode m, millis t, struct durations *d) {",
				"\treturn m == MODE_FAST ? SQUARE(t) : timing_scale(d->base);",
				"}",
				"",
			].join("\n"),
			"cpp/store/store.hpp": [
				"namespace shop {",
				"class Store {",
				"public:",
				"\tStore();",
				"\t~Store();",
				"\tbool operator==(const Store &other) const;",
				"\tvoid save(int item);",
				"\tint count() const;",
				"private:",
				"\tvoid flush();",
				"\tint items_;",
				"};",
				"struct Point { int x; int y; };",
				"using Id = int;",
				"extern const int kLimit;",
				"int scaled(int value);",
				"}",
				"",
			].join("\n"),
			"cpp/store/store.cpp": [
				'#include "store.hpp"',
				"void db_save(int item);",
				"namespace shop {",
				"const int kLimit = 3;",
				"Store::Store() : items_(0) {}",
				"Store::~Store() {}",
				"bool Store::operator==(const Store &other) const { return items_ == other.items_; }",
				"void Store::save(int item) { db_save(item); }",
				"int Store::count() const { return items_ * 2; }",
				"void Store::flush() {}",
				"int scaled(int value) {",
				"\tfor (int i = 0; i < value; i++) { flush_all(); }",
				"\treturn value;",
				"}",
				"}",
				"",
			].join("\n"),
			"cpp/app/app.cpp": [
				'#include "../store/store.hpp"',
				"int run() {",
				"\tshop::Store store;",
				"\tstore.save(shop::kLimit);",
				"\tshop::Point p{1, 2};",
				"\tshop::Id id = shop::scaled(p.x);",
				"\treturn store.count() + id;",
				"}",
				"",
			].join("\n"),
		},
		{
			Timing: "src/timing",
			Config: "src/config",
			Codex: "src/codex",
			Relay: "src/relay",
			Store: "cpp/store",
			App: "cpp/app",
		},
	);
	answer = await shop.check();
});

afterAll(() => {
	shop.remove();
});

test("a C module's exports count by kind: a function macro and a prototype are functions, a struct, a typedef and an enum are types, an enumerator is its enum's", () => {
	const timing = depthByModule(answer).get("Timing");
	expect(timing?.languages).toEqual(["c"]);
	expect(timing?.exports).toEqual({ functions: 5, classes: 0, methods: 0, values: 2, types: 3 });
	expect(timing?.names.map(({ name, kind }) => `${name} ${kind}`).toSorted()).toEqual(
		[
			"RESTART_MAX value",
			"SQUARE function",
			"durations type",
			"jitter_ms function",
			"millis type",
			"mode type",
			"restart_base value",
			"timing_forward function",
			"timing_scale function",
			"timing_unused function",
		].toSorted(),
	);
});

test("the pieces of logic of a C module are its conditions, operators and calls, and its hidden values", () => {
	// `if`, `>`, `*`, the call in `timing_forward`, `+`, and the hidden `hidden`.
	expect(depthByModule(answer).get("Timing")?.logic).toBe(6);
});

test("the pieces of logic of a C++ module are those of its bodies, and a private field is no hidden value", () => {
	// `==`, the two calls, `*`, `for`, `<` and `++`.
	expect(depthByModule(answer).get("Store")?.logic).toBe(7);
});

test("a C++ class counts its public methods, but no constructor, destructor or operator", () => {
	const store = depthByModule(answer).get("Store");
	expect(store?.languages).toEqual(["cpp"]);
	expect(store?.exports).toEqual({ functions: 1, classes: 1, methods: 2, values: 1, types: 2 });
	expect(store?.names.map(({ name, kind }) => `${name} ${kind}`).toSorted()).toEqual(
		[
			"shop::Id type",
			"shop::Point type",
			"shop::Store class",
			"shop::Store::count method",
			"shop::Store::save method",
			"shop::kLimit value",
			"shop::scaled function",
		].toSorted(),
	);
});

test("every module-depth rule reads the C grammar's facts: values, repeated math on a value and a getter, a pass-through and an unused function", () => {
	expect(depthFindings(answer, "Timing").toSorted()).toEqual(
		[
			"restart_base EXPOSED_VALUE_COMPUTED warning",
			"jitter_ms EXPOSED_VALUE_COMPUTED warning",
			"RESTART_MAX EXPOSED_VALUE warning",
			"timing_forward CODE_PASS_THROUGH information",
			"timing_unused EXPOSED_UNUSED warning",
		].toSorted(),
	);
	expect(depthFindings(answer, "Config")).toEqual([
		"config_retries EXPOSED_VALUE warning",
		"(module) MODULE_SHALLOW warning",
	]);
});

test("the C++ grammar names a method that only passes its call on, and a constant callers read", () => {
	expect(depthFindings(answer, "Store").toSorted()).toEqual(
		[
			"shop::Store::save CODE_PASS_THROUGH information",
			"shop::kLimit EXPOSED_VALUE warning",
		].toSorted(),
	);
});

test("the repeated math is evidenced at each caller line, through a local variable too", () => {
	const lines = answer.findings
		.find((each) => each.code === "EXPOSED_VALUE_COMPUTED" && each.export === "restart_base")
		?.evidence?.map((each) => `${each.path}:${each.line}`);
	expect(lines).toEqual(["src/codex/codex.c:4", "src/relay/relay.c:4"]);
});
