// What module depth reads from Swift code (TASK-646.12): the kind of each
// export, the pieces of logic behind them, the call a method only passes on,
// and the math a caller writes around a use. The rules themselves are the
// TypeScript tests'; these assert what the Swift grammar decides.
//
// The target `Timing` exports two values, an enum with a method in an
// extension in another file, a protocol, an alias, a struct with no method, a class with an initializer, a deinitializer, `hash(into:)`,
// a method that only passes its call on and one that decides, a getter, a
// function that decides, one nobody calls, and one that constructs a class
// from its parameter, which passes nothing on. `Codex` and `Relay` write the
// same math on both values and on the getter, `Relay` through a local.

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
			"Package.swift": [
				"// swift-tools-version:5.9",
				"import PackageDescription",
				"",
				"let package = Package(",
				'    name: "Shop",',
				"    targets: [",
				'        .target(name: "Timing"),',
				'        .target(name: "Codex", dependencies: ["Timing"]),',
				'        .target(name: "Relay", dependencies: ["Timing"]),',
				"    ]",
				")",
				"",
			].join("\n"),
			"Sources/Timing/Timing.swift": [
				"public let restartBase = 1000",
				"public let restartMax = 30000",
				"let hidden = 3",
				"public enum Mode { case fast, slow }",
				"public protocol Clock { func now() -> Int }",
				"public typealias Millis = Int",
				"public struct Point { public let x: Int }",
				"public final class Timer {",
				"    public init(base: Int) { self.base = base }",
				"    deinit {}",
				"    public func fire(_ count: Int) { fireLater(count) }",
				"    public func fireLater(_ count: Int) {",
				"        if count > 0 { print(count) }",
				"    }",
				"    public func hash(into hasher: inout Hasher) {}",
				"    private let base: Int",
				"}",
				"public func jitter() -> Int { 50 }",
				"public func scaled(_ value: Int) -> Int { value * hidden }",
				"public func unused(_ value: Int) -> Int { value + 1 }",
				"public func make(_ base: Int) -> Timer { Timer(base: base) }",
				"",
			].join("\n"),
			"Sources/Timing/Mode+Label.swift": [
				"extension Mode {",
				'    public func label() -> String { "mode" }',
				"}",
				"",
			].join("\n"),
			"Sources/Codex/Codex.swift": [
				"import Timing",
				"public func delay(_ attempt: Int) -> Int {",
				"    return min(restartBase * attempt, restartMax)",
				"}",
				"public func spread(_ seed: Int) -> Int { jitter() * seed + 1 }",
				"public func run(_ m: Mode, _ c: Clock, _ t: Millis, _ p: Point) -> Int {",
				"    let timer: Timer = make(scaled(p.x))",
				"    timer.fire(t)",
				"    return c.now()",
				"}",
				"",
			].join("\n"),
			"Sources/Relay/Relay.swift": [
				"import Timing",
				"public func wait(_ tries: Int) -> Int {",
				"    let base = restartBase",
				"    return min(restartMax, tries * base)",
				"}",
				"public func noise(_ n: Int) -> Int { (1 + n * jitter()) }",
				"",
			].join("\n"),
		},
		{ Timing: "Sources/Timing", Codex: "Sources/Codex", Relay: "Sources/Relay" },
	);
	answer = await shop.check();
});

afterAll(() => {
	shop.remove();
});

test("a Swift target's exports count by kind: a protocol, an alias and a struct or an enum with no method are types, an enum with a method in an extension is a class, and a class counts its methods but its initializer and hash(into:)", () => {
	const timing = depthByModule(answer).get("Timing");
	expect(timing?.languages).toEqual(["swift"]);
	// A protocol's requirement counts once, for the protocol.
	expect(timing?.exports).toEqual({ functions: 4, classes: 2, methods: 4, values: 2, types: 3 });
	expect(timing?.names.map(({ name, kind }) => `${name} ${kind}`).toSorted()).toEqual(
		[
			"Clock type",
			"Clock.now method",
			"Millis type",
			"Mode class",
			"Mode.label method",
			"Point type",
			"Timer class",
			"Timer.fire method",
			"Timer.fireLater method",
			"jitter function",
			"make function",
			"restartBase value",
			"restartMax value",
			"scaled function",
			"unused function",
		].toSorted(),
	);
});

test("the pieces of logic of a Swift target are its conditions, operators and calls, and its hidden values", () => {
	// The calls in `fire`, `fireLater` and `make`, `if`, `>`, `*`, `+`, and the hidden `hidden`.
	expect(depthByModule(answer).get("Timing")?.logic).toBe(8);
});

test("every module-depth rule reads the Swift grammar's facts: repeated math through min and a local, a getter, a pass-through and an unused function", () => {
	expect(depthFindings(answer, "Timing").toSorted()).toEqual(
		[
			"restartBase EXPOSED_VALUE_COMPUTED warning",
			"restartMax EXPOSED_VALUE_COMPUTED warning",
			"jitter EXPOSED_VALUE_COMPUTED warning",
			"Timer.fire CODE_PASS_THROUGH information",
			"unused EXPOSED_UNUSED warning",
			// Ten names hide eight pieces of logic.
			"(module) MODULE_SHALLOW warning",
		].toSorted(),
	);
	const lines = answer.findings
		.find((each) => each.code === "EXPOSED_VALUE_COMPUTED" && each.export === "restartBase")
		?.evidence?.map((each) => `${each.path}:${each.line}`);
	expect(lines).toEqual(["Sources/Codex/Codex.swift:3", "Sources/Relay/Relay.swift:4"]);
});
