// Which shapes of a canonical model the semantics check warns about, read from
// the machine-readable fields that an agent and a reader act on. The cases
// that stay quiet are the evidence that a job needs no escape of its own.

import { describe, expect, test } from "bun:test";
import { structureDiagnostics } from "@archboard/model/vault-policy";

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
		flows: [{ id: "Shop#Flow", name: "Flow", summary: "It says.", participants, steps: [] }],
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
		const diagnostics = structureDiagnostics(model()).filter(
			({ code }) => code === "CONTAINER_PASS_THROUGH",
		);
		expect(diagnostics).toMatchObject([
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

describe("CONTAINER_LINE_TO_OWN_PART", () => {
	const deep = "Shop#Deep";
	const modules = [...model().modules, part(deep, { parent: first })];

	test("names each relationship between a module and a part it holds, on the file of its source", () => {
		const relationships = [
			relationship(box, first),
			relationship(deep, box),
			relationship(first, second),
			relationship(first, other),
		];
		expect(
			structureDiagnostics(model({ modules, relationships })).filter(
				({ code }) => code === "CONTAINER_LINE_TO_OWN_PART",
			),
		).toMatchObject([
			{
				severity: "warning",
				file: `${box}.module.json`,
				subject: { kind: "edge", id: `${box}>${first}`, name: "Box -> First" },
			},
			{
				severity: "warning",
				file: `${deep}.module.json`,
				subject: { kind: "edge", id: `${deep}>${box}`, name: "Deep -> Box" },
			},
		]);
	});
});

describe("RELATIONSHIP_ON_CONTAINER", () => {
	const ended = (relationships: Structure["relationships"]) =>
		structureDiagnostics(model({ relationships })).filter(
			({ code }) => code === "RELATIONSHIP_ON_CONTAINER",
		);

	test("is an error on each end on a module with parts, on the file of its source, and names the module", () => {
		const reports = ended([relationship(other, box), relationship(box, other)]);
		expect(reports).toMatchObject([
			{
				severity: "error",
				file: `${box}.module.json`,
				subject: { kind: "edge", id: `${box}>${other}`, name: "Box -> Other" },
			},
			{
				severity: "error",
				file: `${other}.module.json`,
				subject: { kind: "edge", id: `${other}>${box}`, name: "Other -> Box" },
			},
		]);
		expect(reports[0]?.message).toContain("Box");
	});

	test("leaves a relationship between parts, and one between a module and a part it holds", () => {
		expect(ended([relationship(first, other), relationship(box, first)])).toEqual([]);
	});
});

test("a current flow with no summary is an error that names the flow and its file", () => {
	const described = flow(first, second);
	const silent = { ...described.flows[0]! };
	delete silent.summary;
	const reports = structureDiagnostics(
		model({ collections: [{ ...described, flows: [silent, described.flows[0]!] }] }),
	);
	expect(reports.filter(({ code }) => code === "FLOW_SUMMARY_MISSING")).toMatchObject([
		{ severity: "error", file: described.file, subject: { kind: "flow", id: silent.id } },
	]);
});

describe("container containment", () => {
	const REPO = BINDING.repo;
	const at = (path: string, symbol?: string) => ({
		repo: REPO,
		path,
		...(symbol === undefined ? {} : { symbol }),
	});
	/** `box` holds `first` and `second`, bound where the case says, and `other` stands outside. */
	function shaped(
		container: Partial<Module>,
		paths: readonly [string, string],
		otherPath?: string,
	): Structure {
		return model({
			modules: [
				part(box, container),
				part(first, { parent: box, binding: at(paths[0]) }),
				part(second, { parent: box, binding: at(paths[1]) }),
				part(other, otherPath === undefined ? {} : { binding: at(otherPath) }),
			],
		});
	}
	function containment(structure: Structure) {
		return structureDiagnostics(structure)
			.filter(({ code }) => code === "CONTAINER_UNBOUND" || code === "CONTAINER_PARTS_OUTSIDE")
			.map(({ code, subject, suggestedBinding }) => ({ code, id: subject?.id, suggestedBinding }));
	}

	test("asks an unbound container to bind the directory that holds every part", () => {
		expect(
			containment(shaped({}, ["src/shop/a.ts", "src/shop/cart/b.ts"], "src/other.ts")),
		).toEqual([{ code: "CONTAINER_UNBOUND", id: box, suggestedBinding: at("src/shop") }]);
	});

	test("keeps the shared directory when a nested container already binds it", () => {
		const structure = shaped({}, ["src/shop", "src/shop/cart/b.ts"], "src/other.ts");
		const modules = structure.modules.map((module) =>
			module.id === second ? { ...module, parent: first } : module,
		);
		expect(containment({ ...structure, modules })).toEqual([
			{ code: "CONTAINER_UNBOUND", id: box, suggestedBinding: at("src/shop") },
		]);
	});

	test("suggests a directory when every part binds a symbol of the same file", () => {
		const structure = shaped({}, ["src/shop.ts", "src/shop.ts"]);
		const modules = structure.modules.map((module) =>
			module.binding === undefined
				? module
				: { ...module, binding: { ...module.binding, symbol: module.id } },
		);
		expect(containment({ ...structure, modules })).toEqual([
			{ code: "CONTAINER_UNBOUND", id: box, suggestedBinding: at("src") },
		]);
	});

	test("names no directory when the one that holds the parts holds another module's code", () => {
		expect(containment(shaped({}, ["src/shop/a.ts", "src/shop/b.ts"], "src/shop/c.ts"))).toEqual([
			{ code: "CONTAINER_UNBOUND", id: box, suggestedBinding: undefined },
		]);
	});

	test("names no directory when the parts are in different repositories", () => {
		const structure = shaped({}, ["src/shop/a.ts", "src/shop/b.ts"]);
		const modules = structure.modules.map((module) =>
			module.id === second
				? { ...module, binding: { repo: "github.com/test/other", path: "b.ts" } }
				: module,
		);
		expect(containment({ ...structure, modules })).toEqual([
			{ code: "CONTAINER_UNBOUND", id: box, suggestedBinding: undefined },
		]);
	});

	test("names a bound container with a part outside its binding, and the directory that holds them", () => {
		const structure = shaped({ binding: at("src/shop/api.ts", "api") }, [
			"src/shop/a.ts",
			"src/shop/b.ts",
		]);
		expect(containment(structure)).toEqual([
			{ code: "CONTAINER_PARTS_OUTSIDE", id: box, suggestedBinding: at("src/shop") },
		]);
	});

	test.each<[string, ReturnType<typeof at>]>([
		["a YAML file bound without an address", at("deploy/web.yaml")],
		["a symbol of a code file", at("src/shop.ts", "Shop/cart")],
		["a code symbol in a directory", at("src/shop", "shop.cart")],
		["a YAML configuration key", at("config/app.yaml", "services.web")],
		["a compose filename the reader does not accept", at("compose.prod.yaml", "services.web")],
		["an empty compose service address", at("compose.yaml", "services.")],
	])("still holds the parts of %s", (_case, binding) => {
		expect(containment(shaped({ binding }, ["lib/a.ts", "lib/b.ts"]))).toMatchObject([
			{ code: "CONTAINER_PARTS_OUTSIDE", id: box },
		]);
	});

	test.each([
		"compose.yaml",
		"compose.yml",
		"docker-compose.yaml",
		"docker-compose.yml",
		"compose.override.yaml",
		"compose.override.yml",
		"docker-compose.override.yaml",
		"docker-compose.override.yml",
	])("recognizes a service in %s", (file) => {
		expect(
			containment(shaped({ binding: at(`deploy/${file}`, "services.web.api") }, ["a.ts", "b.ts"])),
		).toEqual([]);
	});

	test("a part outside the container's directory makes its parts spread", () => {
		const structure = shaped(
			{ binding: at("src/shop") },
			["src/shop/a.ts", "lib/b.ts"],
			"other/c.ts",
		);
		expect(containment(structure)).toEqual([
			{ code: "CONTAINER_PARTS_OUTSIDE", id: box, suggestedBinding: undefined },
		]);
	});

	test("suggests the repository root only when no outside module binds code in it", () => {
		expect(containment(shaped({}, ["a.ts", "lib/b.ts"]))).toEqual([
			{ code: "CONTAINER_UNBOUND", id: box, suggestedBinding: at("") },
		]);
		expect(containment(shaped({}, ["a.ts", "lib/b.ts"], "other/c.ts"))).toEqual([
			{ code: "CONTAINER_UNBOUND", id: box, suggestedBinding: undefined },
		]);
	});

	test.each(["", ".", "./"])("a container bound to repository root %j holds its parts", (path) => {
		expect(containment(shaped({ binding: at(path) }, ["a.ts", "lib/b.ts"]))).toEqual([]);
	});

	test("a module around the container may own the directory", () => {
		const structure = shaped({ parent: other }, ["src/shop/a.ts", "src/shop/b.ts"], "src/shop");
		expect(containment(structure)).toEqual([
			{ code: "CONTAINER_UNBOUND", id: box, suggestedBinding: at("src/shop") },
		]);
	});

	test.each<[string, Structure]>([
		[
			"a directory that holds every part",
			shaped({ binding: at("src/shop/") }, ["src/shop/a.ts", "src/shop/b/c.ts"]),
		],
		[
			"one file whose symbols its parts bind",
			shaped({ binding: at("src/shop.ts", "shop") }, ["src/shop.ts", "src/shop.ts"]),
		],
		[
			"no bound part",
			model({
				modules: [part(box), part(first, { parent: box }), part(other, { binding: BINDING })],
			}),
		],
		[
			"a model that binds no code",
			model({ modules: [part(box), part(first, { parent: box }), part(other)] }),
		],
		[
			"a Kubernetes workload that runs code from another repository",
			model({
				modules: [
					part(box, {
						binding: { repo: "infra", path: "deploy/web.yaml", symbol: "Deployment/web" },
					}),
					part(first, { parent: box, binding: at("services/web/src/a.ts") }),
					part(other, { binding: at("services/api") }),
				],
			}),
		],
		[
			"a compose service",
			shaped({ binding: at("compose.yaml", "services.web") }, ["web/a.ts", "web/b.ts"]),
		],
		[
			"a Terraform resource in its root module's directory",
			shaped({ binding: at("infra", "module.api.aws_lambda_function.api") }, [
				"api/a.ts",
				"api/b.ts",
			]),
		],
	])("stays quiet for %s", (_case, structure) => {
		expect(containment(structure)).toEqual([]);
	});
});

describe("BINDING_SHARED", () => {
	const bound = (id: string, path: string, symbol?: string): Module =>
		part(id, {
			binding: { repo: BINDING.repo, path, ...(symbol === undefined ? {} : { symbol }) },
		});
	const roots = (...modules: Module[]): Structure => ({
		modules,
		relationships: [],
		collections: [],
	});

	test("names each later module bound to the same code, on its own file, and the first one", () => {
		const diagnostics = structureDiagnostics(
			roots(
				bound(first, "src/a.ts", "run"),
				bound(second, "src/a.ts/", "run"),
				bound(other, "./src/a.ts", "run"),
			),
		).filter(({ code }) => code === "BINDING_SHARED");
		expect(diagnostics).toMatchObject([
			{ severity: "warning", file: `${second}.module.json`, subject: { id: second } },
			{ severity: "warning", file: `${other}.module.json`, subject: { id: other } },
		]);
		expect(diagnostics[0]?.message).toContain("src/a.ts#run, as First is");
	});

	test.each<[string, Module, Module]>([
		["a folder and a file inside it", bound(first, "src"), bound(second, "src/a.ts")],
		["two symbols of one file", bound(first, "src/a.ts", "run"), bound(second, "src/a.ts", "stop")],
		["a file and a symbol in it", bound(first, "src/a.ts"), bound(second, "src/a.ts", "run")],
		[
			"the same path in two repositories",
			bound(first, "src/a.ts"),
			part(second, { binding: { repo: "github.com/test/other", path: "src/a.ts" } }),
		],
	])("stays quiet for %s", (_case, one, two) => {
		expect(warned(roots(one, two), "BINDING_SHARED")).toEqual([]);
	});
});

describe("RELATIONSHIP_REPEATED", () => {
	const anchored = (id: string, to: string, symbol: string): Relationship => ({
		...relationship(first, to),
		id,
		anchor: { repo: BINDING.repo, path: "src/a.ts", symbol },
	});
	const connected = (...relationships: Relationship[]): Structure => ({
		modules: [part(first), part(second), part(other)],
		relationships,
		collections: [],
	});

	test("names each later relationship with the same ends and anchor, on the file of its source", () => {
		expect(
			structureDiagnostics(
				connected(anchored("Shop#One", other, "run"), anchored("Shop#Two", other, "run")),
			).filter(({ code }) => code === "RELATIONSHIP_REPEATED"),
		).toMatchObject([
			{
				severity: "warning",
				file: `${first}.module.json`,
				subject: { kind: "edge", id: "Shop#Two" },
			},
		]);
	});

	test.each<[string, Relationship, Relationship]>([
		["two anchors", anchored("Shop#One", other, "run"), anchored("Shop#Two", other, "stop")],
		["two targets", anchored("Shop#One", other, "run"), anchored("Shop#Two", second, "run")],
		["no anchor", relationship(first, other), { ...relationship(first, other), id: "Shop#Two" }],
	])("stays quiet for %s", (_case, one, two) => {
		expect(warned(connected(one, two), "RELATIONSHIP_REPEATED")).toEqual([]);
	});
});
