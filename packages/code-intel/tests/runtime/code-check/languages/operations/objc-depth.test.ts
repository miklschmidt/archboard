// What module depth reads from Objective-C code (TASK-646.12): the kind of
// each export, the pieces of logic behind them, the message a method only
// passes on, and the math a caller writes around a use. The rules themselves
// are the TypeScript tests'; these assert what the Objective-C grammar decides.
//
// `src/timing` exports a constant, a protocol, a class with an initializer,
// `dealloc`, `description`, a method that only sends its argument on, one that
// decides, and a class method, and a C function. `codex` and `relay` write
// the same math on the constant, `relay` through a local.

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
			"src/timing/Timing.h": [
				"#import <Foundation/Foundation.h>",
				"extern const NSInteger TMRestartBase;",
				"@protocol TMClock",
				"- (NSInteger)now;",
				"@end",
				"@interface TMTimer : NSObject",
				"- (instancetype)initWithBase:(NSInteger)base;",
				"- (NSString *)description;",
				"- (void)fire:(NSInteger)count;",
				"- (void)fireLater:(NSInteger)count;",
				"+ (NSInteger)jitter;",
				"@end",
				"NSInteger TMScaled(NSInteger value);",
				"",
			].join("\n"),
			"src/timing/Timing.m": [
				'#import "Timing.h"',
				"const NSInteger TMRestartBase = 1000;",
				"@implementation TMTimer",
				"- (instancetype)initWithBase:(NSInteger)base { self = [super init]; return self; }",
				"- (void)dealloc { }",
				'- (NSString *)description { return @"timer"; }',
				"- (void)fire:(NSInteger)count { [self fireLater:count]; }",
				"- (void)fireLater:(NSInteger)count {",
				'\tif (count > 0) { NSLog(@"%ld", (long)count); }',
				"}",
				"+ (NSInteger)jitter { return 50; }",
				"@end",
				"NSInteger TMScaled(NSInteger value) { return value * 2; }",
				"",
			].join("\n"),
			"src/codex/Codex.m": [
				'#import "../timing/Timing.h"',
				"NSInteger CodexDelay(NSInteger attempt) {",
				"\treturn MIN(TMRestartBase * attempt, 9);",
				"}",
				"void CodexRun(void) {",
				"\tTMTimer *timer = [[TMTimer alloc] initWithBase:TMScaled(1)];",
				"\t[timer fire:2];",
				"}",
				"",
			].join("\n"),
			"src/relay/Relay.m": [
				'#import "../timing/Timing.h"',
				"NSInteger RelayWait(NSInteger tries) {",
				"\tconst NSInteger base = TMRestartBase;",
				"\treturn MIN(9, tries * base);",
				"}",
				"NSInteger RelayNow(id<TMClock> clock) { return [clock now] + [TMTimer jitter]; }",
				"",
			].join("\n"),
		},
		{ Timing: "src/timing", Codex: "src/codex", Relay: "src/relay" },
	);
	answer = await shop.check();
});

afterAll(() => {
	shop.remove();
});

test("an Objective-C module's exports count by kind: a protocol is a type, and a class counts its methods but its initializer, dealloc and description", () => {
	const timing = depthByModule(answer).get("Timing");
	expect(timing?.languages).toEqual(["objc"]);
	expect(timing?.exports).toEqual({ functions: 1, classes: 1, methods: 3, values: 1, types: 1 });
	expect(timing?.names.map(({ name, kind }) => `${name} ${kind}`).toSorted()).toEqual(
		[
			"TMClock type",
			"TMRestartBase value",
			"TMScaled function",
			"TMTimer class",
			"TMTimer::fire: method",
			"TMTimer::fireLater: method",
			"TMTimer::jitter method",
		].toSorted(),
	);
});

test("the pieces of logic of an Objective-C module count its sends", () => {
	// The send to super, the send in `fire:`, `if`, `>`, the call of NSLog, and `*`.
	expect(depthByModule(answer).get("Timing")?.logic).toBe(6);
});

test("every module-depth rule reads the Objective-C grammar's facts: repeated math through MIN and a local, and a method that only sends its call on", () => {
	expect(depthFindings(answer, "Timing").toSorted()).toEqual(
		[
			"TMRestartBase EXPOSED_VALUE_COMPUTED warning",
			"TMTimer::fire: CODE_PASS_THROUGH information",
		].toSorted(),
	);
	const lines = answer.findings
		.find((each) => each.code === "EXPOSED_VALUE_COMPUTED")
		?.evidence?.map((each) => `${each.path}:${each.line}`);
	expect(lines).toEqual(["src/codex/Codex.m:3", "src/relay/Relay.m:4"]);
});
