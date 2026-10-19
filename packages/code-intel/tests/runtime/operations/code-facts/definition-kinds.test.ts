// The kind a definition's syntax proves, and passed arguments kept apart
// from other value reads (TASK-436.15). Nix owns its static output-kind test.

import { expect, test } from "bun:test";
import { createCodeFacts } from "#runtime/services/code-facts/reader.ts";
import { runsDefinition } from "#runtime/operations/code-facts/runs.ts";
import { type Definition } from "#runtime/operations/code-facts/facts.ts";
import { fixtureCheckout } from "#tests/runtime/support/code-facts/checkout.ts";

const DECLARATIONS: readonly {
	file: string;
	text: string;
	kinds: Readonly<Record<string, Definition["kind"]>>;
}[] = [
	{
		file: "code.ts",
		text: [
			"export function handle() {}",
			"export const arrow = () => 1;",
			"export const expression = function named() {};",
			"export const literalClass = class {};",
			"export class Box { field = 1; method() {} get total() { return 1; } }",
			"export const api = { run() {}, lambda: () => 1, amount: 1 };",
			"export interface Contract { run(): void; amount: number; }",
			"export type Alias = () => void;",
		].join("\n"),
		kinds: {
			handle: "function",
			arrow: "function",
			expression: "function",
			literalClass: "class",
			Box: "class",
			"Box.field": "value",
			"Box.method": "function",
			"Box.total": "value",
			api: "value",
			"api.run": "function",
			"api.lambda": "function",
			"api.amount": "value",
			Contract: "class",
			"Contract.run": "function",
			"Contract.amount": "value",
			Alias: "value",
		},
	},
	{
		file: "code.py",
		text: "@decorate\ndef handle(): pass\narrow = lambda: 1\namount = 1\nclass Box:\n    field = 1\n    def method(self): pass\n",
		kinds: {
			handle: "function",
			arrow: "function",
			amount: "value",
			Box: "class",
			"Box.field": "value",
			"Box.method": "function",
		},
	},
	{
		file: "code.c",
		text: "#define AMOUNT 1\nvoid handle(void) {}\nvoid prototype(void);\nint amount = 1;\nvoid (*pointer)(void);\nstruct Box { int field; };\ntypedef int Alias;\n",
		kinds: {
			AMOUNT: "value",
			handle: "function",
			prototype: "function",
			amount: "value",
			pointer: "value",
			Box: "class",
			"Box::field": "value",
			Alias: "value",
		},
	},
	{
		file: "code.cpp",
		text: "class Box { public: Box() {} void method() {} int field; };\nauto arrow = []() {};\nint amount = 1;\n",
		kinds: {
			Box: "class",
			"Box::Box": "function",
			"Box::method": "function",
			"Box::field": "value",
			arrow: "function",
			amount: "value",
		},
	},
	{
		file: "code.m",
		text: "void handle(void) {}\nint amount = 1;\n@interface Box\n@property int field;\n- (void)method;\n@end\n",
		kinds: {
			handle: "function",
			amount: "value",
			Box: "class",
			"Box::field": "value",
			"Box::method": "function",
		},
	},
	{
		file: "code.cs",
		text: "public class Box { public Box() {} public void Method() {} public int Field; public int Property { get; set; } public System.Action Arrow = () => {}; }\npublic interface Contract { void Run(); }\npublic enum Choice { One }\n",
		kinds: {
			Box: "class",
			"Box.Box": "function",
			"Box.Method": "function",
			"Box.Field": "value",
			"Box.Property": "value",
			"Box.Arrow": "function",
			Contract: "class",
			"Contract.Run": "function",
			Choice: "class",
			"Choice.One": "value",
		},
	},
	{
		file: "code.swift",
		text: "func handle() {}\nlet arrow = { 1 }\nlet amount = 1\nstruct Box { init() {}\nfunc method() {}\nlet field = 1 }\nprotocol Contract { func run()\nvar field: Int { get } }\nenum Choice { case one }\ntypealias Alias = Int\n",
		kinds: {
			handle: "function",
			arrow: "function",
			amount: "value",
			Box: "class",
			"Box.init": "function",
			"Box.method": "function",
			"Box.field": "value",
			Contract: "class",
			"Contract.run": "function",
			"Contract.field": "value",
			Choice: "class",
			"Choice.one": "value",
			Alias: "value",
		},
	},
	{
		file: "code.tf",
		text: 'variable "amount" {}\nlocals { alias = var.amount }\noutput "amount" { value = local.alias }\nresource "test_box" "one" {}\n',
		kinds: {
			"var.amount": "value",
			"local.alias": "value",
			"output.amount": "value",
			"test_box.one": "value",
		},
	},
	{
		file: "compose.yaml",
		text: "services:\n  api:\n    image: api\nvolumes:\n  data: {}\n",
		kinds: { "services.api": "value", "volumes.data": "value" },
	},
	{
		file: "code.yaml",
		text: "apiVersion: v1\nkind: Service\nmetadata:\n  name: api\n",
		kinds: { "Service/api": "value" },
	},
];

for (const { file, text, kinds } of DECLARATIONS) {
	test(`${file} records callable definitions, named types and values`, async () => {
		const checkout = fixtureCheckout({ [file]: text });
		try {
			const facts = await createCodeFacts().pass(new AbortController().signal).read(checkout, file);
			if (facts === undefined || facts.adapter === "text")
				throw new Error(`${file} was not parsed`);
			expect(
				Object.fromEntries(
					facts.definitions.map((definition) => [definition.symbol, definition.kind]),
				),
			).toEqual(kinds);
		} finally {
			checkout.remove();
		}
	});
}

const ARGUMENTS = [
	[
		"use.ts",
		"const read = handler; consume(handler, LIMIT); consume((wrapped)); consume(typed as Handler); consume(api.member);",
	],
	[
		"use.py",
		"read = handler\nconsume(handler, LIMIT)\nconsume(named=wrapped)\nconsume(api.member)\n",
	],
	[
		"use.c",
		"void use(void) { void *read = handler; consume(handler, LIMIT); consume(&wrapped); consume(api.member); }",
	],
	[
		"use.cpp",
		"void use() { auto read = handler; consume(handler, LIMIT); consume((wrapped)); consume(api.member); }",
	],
	[
		"use.m",
		"void use(void) { void *read = handler; consume(handler, LIMIT); [Api register:wrapped]; consume(api.member); }",
	],
	[
		"use.cs",
		"class Uses { void Use() { var read = handler; Consume(handler, LIMIT); Consume(named: wrapped); Consume(api.member); } }",
	],
	[
		"use.swift",
		"let read = handler\nconsume(handler, LIMIT)\nconsume(named: wrapped)\nconsume(api.member)\nlet tuple = (unpassed, 1)\nlet indexed = table[subscriptName]\n",
	],
] as const;

for (const [file, text] of ARGUMENTS) {
	test(`${file} marks passed names separately from other value reads`, async () => {
		const checkout = fixtureCheckout({ [file]: text });
		try {
			const facts = await createCodeFacts().pass(new AbortController().signal).read(checkout, file);
			if (facts === undefined || facts.adapter === "text")
				throw new Error(`${file} was not parsed`);
			const handler = facts.references.filter((reference) => reference.symbol === "handler");
			expect(handler.map((reference) => reference.passed === true)).toEqual([false, true]);
			for (const symbol of ["handler", "LIMIT", "wrapped", "api.member"]) {
				expect(
					facts.references.some(
						(reference) => reference.symbol === symbol && reference.passed === true,
					),
				).toBe(true);
			}
			expect(
				facts.references.some(
					(reference) =>
						["unpassed", "subscriptName"].includes(reference.symbol) && reference.passed === true,
				),
			).toBe(false);
		} finally {
			checkout.remove();
		}
	});
}

test("only a known function passed as an argument upgrades a value use to running evidence", () => {
	const passed = { asValue: true, passed: true } as const;
	expect(runsDefinition(passed, { kind: "function" })).toBe(true);
	expect(runsDefinition(passed, { kind: "class" })).toBe(false);
	expect(runsDefinition(passed, { kind: "value" })).toBe(false);
	expect(runsDefinition(passed, undefined)).toBe(false);
	expect(runsDefinition({ asValue: true }, { kind: "function" })).toBe(false);
});
