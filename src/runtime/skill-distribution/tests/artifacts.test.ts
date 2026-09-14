// The generated schemas say what the Zod authorities say, as far as JSON
// Schema can say it: a document Zod accepts validates, a document Zod refuses
// for a reason JSON Schema can express is refused too, and what only the
// runtime can check is named as an obligation rather than pretended.

import { Ajv2020 } from "ajv/dist/2020.js";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
	BoardCreateInputSchema,
	parseSemanticBoard,
	SemanticBoardSchema,
	VariantEditInputSchema,
} from "@/shared/semantic-board/index";
import { SemanticBoardConfigurationSchema } from "@/runtime/semantic-board-store/index";
import {
	generatedSchemas,
	INSTALL_DOCUMENT,
	prepareSkillArtifacts,
} from "@/runtime/skill-distribution/index";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const skill = mkdtempSync(join(tmpdir(), "archboard-skill-artifacts-"));
const validators = new Map<string, ReturnType<Ajv2020["compile"]>>();

beforeAll(() => {
	const DateTimeSchema = z.iso.datetime();
	const ajv = new Ajv2020({
		strict: false,
		allErrors: true,
		formats: {
			"date-time": (value: string) => DateTimeSchema.safeParse(value).success,
		},
	});
	const prepared = prepareSkillArtifacts(skill, { root, revision: "test" });
	for (const file of prepared.files) {
		if (file.endsWith(".json")) {
			const document: unknown = JSON.parse(readFileSync(join(skill, file), "utf8"));
			validators.set(file.split("/").at(-1)!, ajv.compile(document as object));
		}
	}
});
afterAll(() => {
	rmSync(skill, { recursive: true, force: true });
});

/**
 * Whether one generated schema accepts a value.
 * @param file The schema file.
 * @param value The value.
 * @returns True when it validates.
 */
function accepts(file: string, value: unknown): boolean {
	const validate = validators.get(file);
	if (validate === undefined) throw new Error(`no schema ${file}`);
	return validate(value) === true;
}

/** A configuration with one of everything, including a group and a real icon. */
const CONFIG = {
	levels: ["system", "service"],
	nodeKinds: {
		service: { name: "Service", icon: "RiServerLine", color: "blue" },
		plain: { name: "Plain", icon: "RiBox3Line" },
	},
	relationshipKinds: { call: { name: "Call", dash: "solid", arrowhead: "filled" } },
	groups: { fulfillment: { name: "Fulfillment" } },
};

/** A persisted family with nested content: a view, a flow, a walkthrough and groups. */
const BOARD = {
	schemaVersion: "2.2.0",
	kind: "semantic-board",
	id: "bd",
	name: "payments",
	level: "system",
	version: 3,
	createdAt: "2026-09-14T00:00:00.000Z",
	updatedAt: "2026-09-14T00:00:00.000Z",
	views: [
		{
			id: "vw",
			name: "Orders only",
			grammar: "architecture",
			scope: { kind: "selection", nodes: ["n1"], edges: [], flows: [] },
		},
	],
	current: "v1",
	variants: [
		{
			id: "v1",
			name: "as built",
			lifecycle: "current",
			content: {
				nodes: [
					{ id: "n1", name: "Orders", kind: "service", groups: ["fulfillment"] },
					{ id: "n2", name: "Ledger", kind: "plain", parent: "n1" },
				],
				edges: [{ id: "e1", from: "n1", to: "n2", kind: "call", emphasis: "normal" }],
				flows: [
					{
						id: "f1",
						name: "Place order",
						participants: ["n1", "n2"],
						steps: [{ id: "s1", from: "n1", to: "n2", label: "store", kind: "sync" }],
					},
				],
				walkthroughs: [
					{
						id: "w1",
						name: "Tour",
						beats: [{ id: "b1", heading: "Start", body: "Here.", subjects: ["n1"] }],
					},
				],
			},
		},
	],
};

describe("generated schemas agree with the Zod authorities", () => {
	test("a configuration with groups and a real icon validates; a fake icon, an unknown field and a bad color do not", () => {
		expect(SemanticBoardConfigurationSchema.safeParse(CONFIG).success).toBe(true);
		expect(accepts("vault-config.schema.json", CONFIG)).toBe(true);
		for (const broken of [
			{
				...CONFIG,
				nodeKinds: { ...CONFIG.nodeKinds, plain: { name: "Plain", icon: "RiNoSuchIconLine" } },
			},
			{ ...CONFIG, stray: true },
			{
				...CONFIG,
				nodeKinds: {
					...CONFIG.nodeKinds,
					plain: { name: "Plain", icon: "RiBox3Line", color: "mauve" },
				},
			},
			{ ...CONFIG, groups: { "Bad Key": { name: "x" } } },
			{ ...CONFIG, groups: { blank: { name: " " } } },
		]) {
			expect(SemanticBoardConfigurationSchema.safeParse(broken).success).toBe(false);
			expect(accepts("vault-config.schema.json", broken)).toBe(false);
		}
		expect(accepts("vault-config.schema.json", { ...CONFIG, groups: undefined })).toBe(true);
	});

	test("configuration uniqueness and nonempty vocabulary constraints survive generation", () => {
		for (const broken of [
			{ ...CONFIG, levels: ["system", "system"] },
			{ ...CONFIG, nodeKinds: {} },
			{ ...CONFIG, relationshipKinds: {} },
		]) {
			expect(SemanticBoardConfigurationSchema.safeParse(broken).success).toBe(false);
			expect(accepts("vault-config.schema.json", broken)).toBe(false);
		}
	});

	test("a persisted family validates; a legacy group label, a bad lifecycle and an unknown field do not", () => {
		expect(SemanticBoardSchema.safeParse(BOARD).success).toBe(true);
		expect(accepts("semantic-board.schema.json", BOARD)).toBe(true);
		const variant = BOARD.variants[0]!;
		for (const broken of [
			{
				...BOARD,
				variants: [
					{
						...variant,
						content: { ...variant.content, nodes: [{ ...variant.content.nodes[0]!, group: "x" }] },
					},
				],
			},
			{
				...BOARD,
				variants: [
					{
						...variant,
						content: {
							...variant.content,
							nodes: [{ ...variant.content.nodes[0]!, groups: ["fulfillment", "fulfillment"] }],
						},
					},
				],
			},
			{ ...BOARD, variants: [{ ...variant, lifecycle: "retired" }] },
			{ ...BOARD, extra: 1 },
			{ ...BOARD, id: "not-a-block-id" },
			{ ...BOARD, updatedAt: "yesterday" },
		]) {
			expect(SemanticBoardSchema.safeParse(broken).success).toBe(false);
			expect(accepts("semantic-board.schema.json", broken)).toBe(false);
		}
	});

	test("inherited subject ids may repeat across variants, while cyclic variant ancestry remains a runtime refusal", () => {
		const variant = BOARD.variants[0]!;
		const inherited = {
			...BOARD,
			variants: [
				variant,
				{ ...variant, id: "v2", name: "proposal", lifecycle: "draft", parent: "v1" },
			],
		};
		expect(parseSemanticBoard(inherited).ok).toBe(true);
		expect(accepts("semantic-board.schema.json", inherited)).toBe(true);

		const cyclic = {
			...inherited,
			variants: [
				{ ...variant, parent: "v2" },
				{ ...inherited.variants[1]!, parent: "v1" },
			],
		};
		expect(parseSemanticBoard(cyclic).ok).toBe(false);
		expect(accepts("semantic-board.schema.json", cyclic)).toBe(true);
	});

	test("authoring payloads validate by name and handle, and refuse what the CLI refuses at the shape", () => {
		const create = {
			level: "system",
			nodes: [
				{ name: "Orders", kind: "service", groups: ["fulfillment", "fulfillment"] },
				{ name: "Ledger", kind: "plain", parent: "Orders" },
			],
			edges: [{ as: "wire", from: "Orders", to: "Ledger", kind: "call", traffic: {} }],
			walkthroughs: [
				{ name: "Tour", beats: [{ heading: "Start", body: "Here.", subjects: ["wire"] }] },
			],
		};
		const CreatePayload = BoardCreateInputSchema.omit({ name: true });
		expect(CreatePayload.safeParse(create).success).toBe(true);
		expect(accepts("semantic-create-input.schema.json", create)).toBe(true);
		const edit = {
			variant: "as built",
			nodes: [{ id: "n1", name: "Orders", kind: "service" }],
			removeEdges: ["e1"],
		};
		expect(VariantEditInputSchema.safeParse(edit).success).toBe(true);
		expect(accepts("semantic-edit-input.schema.json", edit)).toBe(true);
		for (const [file, schema, broken] of [
			["semantic-create-input.schema.json", CreatePayload, { ...create, level: "" }],
			["semantic-create-input.schema.json", CreatePayload, { ...create, nodes: [{ name: "X" }] }],
			[
				"semantic-create-input.schema.json",
				CreatePayload,
				{ ...create, nodes: [{ name: "Two\nlines", kind: "service" }] },
			],
			["semantic-edit-input.schema.json", VariantEditInputSchema, { ...edit, removeAll: true }],
			[
				"semantic-edit-input.schema.json",
				VariantEditInputSchema,
				{ ...edit, flows: [{ name: "F", participants: [], steps: [] }] },
			],
		] as const) {
			expect(schema.safeParse(broken).success).toBe(false);
			expect(accepts(file, broken)).toBe(false);
		}
	});

	test("each schema names its dialect, identity, purpose and runtime obligations", () => {
		for (const generated of generatedSchemas()) {
			const schema = generated.schema;
			expect(schema["$schema"]).toBe("https://json-schema.org/draft/2020-12/schema");
			expect(String(schema["$id"])).toContain(generated.file);
			expect(typeof schema["title"]).toBe("string");
			expect(schema["description"]).toBe(generated.purpose);
			const stamp = schema["x-archboard"] as { runtimeObligations: string[] };
			expect(stamp.runtimeObligations.length).toBeGreaterThan(0);
		}
	});

	test("preparation is deterministic and replaces what an earlier preparation left", () => {
		const again = prepareSkillArtifacts(skill, { root, revision: "test" });
		const bytes = new Map(again.files.map((file) => [file, readFileSync(join(skill, file))]));
		const third = prepareSkillArtifacts(skill, { root, revision: "test" });
		expect(third.files).toEqual(again.files);
		for (const [file, before] of bytes) {
			expect(readFileSync(join(skill, file)).equals(before), file).toBe(true);
		}
		const manual = readFileSync(join(again.directory, INSTALL_DOCUMENT), "utf8");
		expect(manual).toContain("revision test");
		// A link that pointed beside the canonical file points at the checkout now.
		expect(manual).toContain(`](<${join(root, "TESTING.md")}>)`);
	});

	test("installed manual links remain valid Markdown when the checkout path has punctuation", () => {
		const source = mkdtempSync(join(tmpdir(), "archboard source (test) "));
		try {
			writeFileSync(join(source, INSTALL_DOCUMENT), "Read [testing](TESTING.md).\n");
			writeFileSync(join(source, "TESTING.md"), "# Testing\n");
			const prepared = prepareSkillArtifacts(join(source, "skill"), {
				root: source,
				revision: "test",
			});
			const manual = readFileSync(join(prepared.directory, INSTALL_DOCUMENT), "utf8");
			expect(manual).toContain(`](<${join(source, "TESTING.md")}>)`);
		} finally {
			rmSync(source, { recursive: true, force: true });
		}
	});
});
