// Which shapes of a canonical model the semantics check warns about, read from
// the machine-readable fields that an agent and a reader act on. The cases
// that stay quiet are the evidence that a job needs no escape of its own.

import { describe, expect, test } from "bun:test";
import { structureDiagnostics } from "@archboard/board/vault-policy";

type Structure = Parameters<typeof structureDiagnostics>[0];
type Module = Structure["modules"][number];
type Collection = Structure["collections"][number];
type Relationship = Structure["relationships"][number];

const BINDING = { repo: "github.com/test/shop", path: "src/a.ts" };
const box = "Shop#Box";
const first = "Shop#First";
const second = "Shop#Second";
const other = "Shop#Other";

function part(id: string, fields: Partial<Module> = {}): Module {
	return {
		schemaVersion: 1,
		id,
		order: 0,
		name: id.slice("Shop#".length),
		kind: "module",
		file: `${id}.module.json`,
		outgoing: [],
		...fields,
	};
}

function relationship(from: string, to: string): Relationship {
	return { id: `${from}>${to}`, order: 0, from, to, kind: "call", emphasis: "normal" };
}

function flow(...participants: string[]): Collection {
	return {
		schemaVersion: 1,
		id: "Flows",
		name: "Flows",
		file: "Flows.flows.json",
		flows: [{ id: "Shop#Flow", name: "Flow", participants, steps: [] }],
	};
}

/** A connected root beside `box` and its two bound parts, so only the rule under test can warn. */
function model(fields: Partial<Structure> = {}, container: Partial<Module> = {}): Structure {
	return {
		modules: [
			part(box, container),
			part(first, { parent: box, binding: BINDING }),
			part(second, { parent: box, binding: BINDING }),
			part(other),
		],
		relationships: [relationship(first, other)],
		collections: [],
		...fields,
	};
}

function warned(structure: Structure, code: string): (string | undefined)[] {
	return structureDiagnostics(structure)
		.filter((diagnostic) => diagnostic.code === code)
		.map((diagnostic) => diagnostic.subject?.id);
}

describe("CONTAINER_PASS_THROUGH", () => {
	test("names a container whose parts nothing joins, as a warning on its own file", () => {
		expect(structureDiagnostics(model())).toMatchObject([
			{
				severity: "warning",
				code: "CONTAINER_PASS_THROUGH",
				file: `${box}.module.json`,
				subject: { kind: "node", id: box, name: "Box" },
			},
		]);
	});

	test("names a container of one part", () => {
		const modules = [part(box), part(first, { parent: box, binding: BINDING }), part(other)];
		expect(warned(model({ modules }), "CONTAINER_PASS_THROUGH")).toEqual([box]);
	});

	test.each<[string, Structure]>([
		["a binding", model({}, { binding: BINDING })],
		["a relationship on it", model({ relationships: [relationship(other, box)] })],
		["a flow that names it", model({ collections: [flow(box, other)] })],
		[
			"a relationship between its parts",
			model({ relationships: [relationship(first, other), relationship(first, second)] }),
		],
		["a flow across its parts", model({ collections: [flow(first, second)] })],
	])("stays quiet for %s", (_case, structure) => {
		expect(warned(structure, "CONTAINER_PASS_THROUGH")).toEqual([]);
	});

	test("a relationship between parts deep inside two of its parts joins it", () => {
		const modules = [
			...model().modules,
			part("Shop#Deep", { parent: first }),
			part("Shop#Deeper", { parent: second }),
		];
		const relationships = [relationship(first, other), relationship("Shop#Deep", "Shop#Deeper")];
		expect(warned(model({ modules, relationships }), "CONTAINER_PASS_THROUGH")).toEqual([]);
	});

	test("a relationship inside one part joins only that part", () => {
		const modules = [
			...model().modules,
			part("Shop#Deep", { parent: first }),
			part("Shop#Deeper", { parent: first }),
		];
		const relationships = [relationship(first, other), relationship("Shop#Deep", "Shop#Deeper")];
		expect(warned(model({ modules, relationships }), "CONTAINER_PASS_THROUGH")).toEqual([box]);
	});

	test("a model that binds no code stays quiet", () => {
		const modules = [part(box), part(first, { parent: box }), part(other)];
		expect(warned(model({ modules }), "CONTAINER_PASS_THROUGH")).toEqual([]);
	});
});

describe("ROOT_UNCONNECTED", () => {
	test("names a root with no relationship to another root, as a warning on its own file", () => {
		const structure = model({ relationships: [relationship(first, second)] });
		expect(
			structureDiagnostics(structure).filter(({ code }) => code === "ROOT_UNCONNECTED"),
		).toMatchObject([
			{ severity: "warning", file: `${box}.module.json`, subject: { kind: "node", id: box } },
			{ severity: "warning", file: `${other}.module.json`, subject: { kind: "node", id: other } },
		]);
	});

	test("a relationship of a part inside it connects the root", () => {
		expect(warned(model(), "ROOT_UNCONNECTED")).toEqual([]);
	});

	test("a flow does not connect a root", () => {
		const structure = model({ relationships: [], collections: [flow(first, other)] });
		expect(warned(structure, "ROOT_UNCONNECTED")).toEqual([box, other]);
	});

	test("a lone root stays quiet", () => {
		const modules = [part(box), part(first, { parent: box, binding: BINDING })];
		expect(warned(model({ modules, relationships: [] }), "ROOT_UNCONNECTED")).toEqual([]);
	});
});
