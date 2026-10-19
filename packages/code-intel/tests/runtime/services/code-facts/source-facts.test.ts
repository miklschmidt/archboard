import { expect, test } from "bun:test";
import { createSourceFacts } from "#runtime/services/code-facts/reader.ts";
import { definitionSite } from "#runtime/operations/code-facts/definition-site.ts";
import {
	terraformConfiguration,
	terraformRootOf,
} from "#runtime/operations/code-facts/terraform/terraform-configuration.ts";
import { fixtureCheckout } from "#tests/runtime/support/code-facts/checkout.ts";

test.each([
	{
		file: "main.ts",
		prefix: "/* é🙂 */ ",
		declaration: "export function first() { return '🙂'; }",
		tail: " console.log('unrelated'); export function second() {}",
		symbol: "first",
	},
	{
		file: "main.py",
		prefix: "# é🙂\n",
		declaration: "@decorate\ndef first():\n    return '🙂'",
		tail: "\n\ndef second():\n    return 2\n",
		symbol: "first",
	},
	{
		file: "constants.ts",
		prefix: "/* é🙂 */ ",
		declaration: "export const first = '🙂', second = 2;",
		tail: " console.log('unrelated');",
		symbol: "first",
	},
	{
		file: "main.cs",
		prefix: "#if YES\n// first branch\n#else\n// é🙂\n#endif\n",
		declaration: 'public class First { public string Run() => "🙂"; }',
		tail: " public class Second {}",
		symbol: "First",
	},
	{
		file: "main.c",
		prefix: "/* é🙂 */ ",
		declaration: "int first(void) { return 1; }",
		tail: " int second(void) { return 2; }",
		symbol: "first",
	},
	{
		file: "main.cpp",
		prefix: "/* é🙂 */ ",
		declaration: "int first() { return 1; }",
		tail: " int second() { return 2; }",
		symbol: "first",
	},
	{
		file: "main.m",
		prefix: "/* é🙂 */ ",
		declaration: "@interface First\n- (void)run;\n@end",
		tail: "\n@interface Second\n@end",
		symbol: "First",
	},
	{
		file: "main.swift",
		prefix: "/* é🙂 */ ",
		declaration: 'public func first() -> String { return "🙂" }',
		tail: "\npublic func second() {}",
		symbol: "first",
	},
	{
		file: "main.tf",
		prefix: "/* é🙂 */ ",
		declaration: 'resource "aws_sqs_queue" "first" { name = "🙂" }',
		tail: '\nresource "aws_sqs_queue" "second" { name = "second" }',
		symbol: "aws_sqs_queue.first",
	},
])(
	"$file source ranges slice only the declaration and count UTF-16 code units",
	async ({ file, prefix, declaration, tail, symbol }) => {
		const text = prefix + declaration + tail;
		const sources = new Map([[file, text]]);
		const checkout = { root: `/source-ranges/${file}`, files: new Set(sources.keys()) };
		const pass = createSourceFacts().pass(checkout, sources);
		const facts = await pass.read(checkout, file);
		if (facts === undefined || facts.adapter === "text") throw new Error(`${file} was not parsed`);
		const found = facts.definitions.find((definition) => definition.symbol === symbol);
		expect(found?.source).toEqual({
			start: prefix.length,
			end: prefix.length + declaration.length,
		});
		expect(text.slice(found?.source?.start, found?.source?.end)).toBe(declaration);
	},
);

test("historical sources resolve imported definitions and refresh resolution around cached bytes", async () => {
	const sources = new Map([
		["src/use.ts", 'import { run } from "@/target";\nexport function start() { run(); }\n'],
		["src/one.ts", "export function run() {}\n"],
		["src/two.ts", "\nexport function run() {}\n"],
		["tsconfig.json", '{"compilerOptions":{"paths":{"@/*":["src/one.ts"]}}}'],
	]);
	const checkout = { root: "/historical-code-facts", files: new Set(sources.keys()) };
	const facts = createSourceFacts();
	const first = facts.pass(checkout, sources);
	expect(await definitionSite(first, checkout, "src/use.ts", "run")).toMatchObject({
		path: "src/one.ts",
		definition: { start: 1, end: 1 },
	});
	const nextSources = new Map(sources);
	nextSources.set("tsconfig.json", '{"compilerOptions":{"paths":{"@/*":["src/two.ts"]}}}');
	const next = facts.pass(checkout, nextSources);
	expect(await definitionSite(next, checkout, "src/use.ts", "run")).toMatchObject({
		path: "src/two.ts",
		definition: { start: 2, end: 2 },
	});
	expect(next.stats.cached).toBe(1);
	expect(next.stats.parsed).toBe(1);
	const changedSources = new Map(nextSources);
	changedSources.set("src/use.ts", "export function changed() {}\n");
	const changed = facts.pass(checkout, changedSources);
	expect(await changed.read(checkout, "src/use.ts")).toMatchObject({
		definitions: [{ symbol: "changed" }],
	});
	expect(changed.stats.parsed).toBe(1);
});

test("historical Terraform roots resolve nested module addresses and each instance of shared definitions", async () => {
	const sources = new Map([
		[
			"infra/main.tf",
			'module "app" { source = "../shared" }\nmodule "worker" { source = "../shared" }\n',
		],
		["shared/main.tofu", 'module "queue" { source = "./queue" }\n'],
		["shared/queue/main.tf", 'resource "aws_sqs_queue" "jobs" {\n  name = "jobs"\n}\n'],
	]);
	const checkout = { root: "/historical-terraform-facts", files: new Set(sources.keys()) };
	const facts = createSourceFacts();
	const pass = facts.pass(checkout, sources);
	expect(terraformRootOf("infra", "directory", checkout.files)).toBe("infra");
	expect(terraformRootOf("infra/main.tf", "file", checkout.files)).toBe("infra");
	const configuration = await terraformConfiguration(pass, checkout, "infra");
	for (const instance of ["app", "worker"]) {
		expect(
			configuration.declared(`module.${instance}.module.queue.aws_sqs_queue.jobs[0]`),
		).toMatchObject({
			status: "found",
			site: {
				path: "shared/queue/main.tf",
				definition: { symbol: "aws_sqs_queue.jobs", start: 1, end: 3 },
			},
		});
	}
	expect(configuration.addressesAt("shared/queue/main.tf", 1)).toEqual([
		"module.app.module.queue.aws_sqs_queue.jobs",
		"module.worker.module.queue.aws_sqs_queue.jobs",
	]);
});

test("source passes never fall back to disk for missing texts and retain file-read exclusions", async () => {
	const checkout = fixtureCheckout({
		"main.ts": "export function current() {}\n",
		"missing.ts": "export function onDisk() {}\n",
		"private.tfvars": "secret = true\n",
	});
	try {
		const sources = new Map([
			["main.ts", "export function historical() {}\n"],
			["unlisted.ts", "export function unlisted() {}\n"],
			["private.tfvars", "secret = false\n"],
		]);
		const pass = createSourceFacts().pass(checkout, sources);
		expect(await pass.read(checkout, "main.ts")).toMatchObject({
			definitions: [{ symbol: "historical" }],
		});
		expect(await pass.read(checkout, "missing.ts")).toBeUndefined();
		expect(await pass.read(checkout, "unlisted.ts")).toBeUndefined();
		expect(await pass.read(checkout, "private.tfvars")).toBeUndefined();
	} finally {
		checkout.remove();
	}
});
