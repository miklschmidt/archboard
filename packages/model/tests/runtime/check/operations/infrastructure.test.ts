// Infrastructure containment and shared-binding rules: Terraform depth-1
// nested blocks are recognized as infrastructure addresses, and at most one
// direct child may share its parent container's infrastructure address without
// triggering BINDING_SHARED.

import { describe, expect, test } from "bun:test";
import { structureDiagnostics } from "@archboard/model/vault-policy";

type Structure = Parameters<typeof structureDiagnostics>[0];
type Module = Structure["modules"][number];
type Binding = NonNullable<Module["binding"]>;

const REPO = "github.com/test/infra";
const box = "Infra#Box";
const first = "Infra#First";
const second = "Infra#Second";
const third = "Infra#Third";
const other = "Infra#Other";

function at(path: string, symbol?: string): Binding {
	return {
		repo: REPO,
		path,
		...(symbol === undefined ? {} : { symbol }),
	};
}

function part(id: string, fields: Partial<Module> = {}): Module {
	return {
		schemaVersion: 1,
		id,
		order: 0,
		name: id.slice("Infra#".length),
		kind: "module",
		file: `${id}.module.json`,
		outgoing: [],
		...fields,
	};
}

function model(modules: readonly Module[]): Structure {
	return {
		modules: [...modules],
		relationships: [],
		collections: [],
	};
}

function containment(binding: Binding) {
	return structureDiagnostics(
		model([
			part(box, { binding }),
			part(first, { parent: box, binding: at("src/api/a.ts") }),
			part(second, { parent: box, binding: at("src/api/b.ts") }),
		]),
	)
		.filter(({ code }) => code === "CONTAINER_UNBOUND" || code === "CONTAINER_PARTS_OUTSIDE")
		.map(({ code, subject }) => ({ code, id: subject?.id }));
}

function sharedBindings(modules: readonly Module[]) {
	return structureDiagnostics(model(modules))
		.filter(({ code }) => code === "BINDING_SHARED")
		.map(({ severity, file, subject, message }) => ({
			severity,
			file,
			id: subject?.id,
			message,
		}));
}

describe("Terraform nested-block containment", () => {
	test.each<[string, Binding]>([
		[
			"a resource nested block in .tf",
			at("infra/main.tf", 'azurerm_application_gateway.ingress.http_listener["device-https"]'),
		],
		[
			"a resource nested block in .tofu",
			at("infra/main.tofu", 'azurerm_application_gateway.ingress.http_listener["device-https"]'),
		],
		[
			"a resource nested block in a module directory",
			at("infra", 'azurerm_application_gateway.ingress.http_listener["device-https"]'),
		],
		[
			"a resource nested block in a dotted directory with trailing slash",
			at("infra/prod.eu/", 'azurerm_application_gateway.ingress.http_listener["device-https"]'),
		],
		[
			"a nested block inside module calls and an indexed resource",
			at(
				"infra",
				'module.app[0].module.gw["eu.west"].azurerm_application_gateway.ingress["blue"].http_listener["device-https"]',
			),
		],
		[
			"a nested block on a numeric-indexed resource",
			at("infra/main.tf", 'azurerm_application_gateway.ingress[0].backend_address_pool["api"]'),
		],
		[
			"a nested block name containing dots",
			at("infra/main.tf", 'azurerm_application_gateway.ingress.http_listener["example.com"]'),
		],
		[
			"a nested block name containing spaces and slashes",
			at(
				"infra/main.tf",
				'azurerm_application_gateway.ingress.request_routing_rule["api/v1 primary"]',
			),
		],
		[
			"a nested block name containing escaped quotes and backslashes",
			at(
				"infra/main.tf",
				'azurerm_application_gateway.ingress.http_listener["edge \\"a\\" \\\\ b"]',
			),
		],
		[
			"an ephemeral resource inside an indexed module",
			at("infra/main.tf", 'module.sec[0].ephemeral.random_password.db["primary"]'),
		],
		[
			"a Terraform resource with a Unicode HCL identifier",
			at("infra/main.tf", 'aws_s3_bucket.café.cors_rule["edge"]'),
		],
	])("leaves source containment to the parts of %s", (_label, binding) => {
		expect(containment(binding)).toEqual([]);
	});

	test.each<[string, Binding]>([
		[
			"a numeric index on a nested block",
			at("infra/main.tf", "azurerm_application_gateway.ingress.http_listener[0]"),
		],
		[
			"a depth-2 nested block",
			at(
				"infra/main.tf",
				'azurerm_application_gateway.ingress.url_path_map["api"].path_rule["v1"]',
			),
		],
		[
			"a nested block without a quoted name selector",
			at("infra/main.tf", "azurerm_application_gateway.ingress.http_listener"),
		],
		[
			"an empty quoted nested-block name",
			at("infra/main.tf", 'azurerm_application_gateway.ingress.http_listener[""]'),
		],
		[
			"an invalid escape sequence in a nested-block name",
			at("infra/main.tf", String.raw`azurerm_application_gateway.ingress.http_listener["bad\q"]`),
		],
		[
			"a nested block on a data source",
			at("infra/main.tf", 'data.aws_iam_policy_document.api.statement["allow"]'),
		],
		[
			"a nested block on an ephemeral resource",
			at("infra/main.tf", 'ephemeral.random_password.db.field["x"]'),
		],
		["a nested block on a module call", at("infra", 'module.gw.http_listener["device-https"]')],
		["a double instance key on a resource", at("infra/main.tf", "aws_s3_bucket.logs[0][1]")],
		[
			"a nested-block symbol on a non-Terraform source file",
			at("src/gateway.ts", 'azurerm_application_gateway.ingress.http_listener["device-https"]'),
		],
	])("still reports CONTAINER_PARTS_OUTSIDE for %s", (_label, binding) => {
		expect(containment(binding)).toEqual([{ code: "CONTAINER_PARTS_OUTSIDE", id: box }]);
	});
});

describe("BINDING_SHARED single-direct-child infrastructure exception", () => {
	const INFRA_BINDINGS: readonly [string, Binding, Binding][] = [
		[
			"a Terraform resource",
			at("infra/main.tf", "azurerm_application_gateway.ingress"),
			at("infra/main.tf", "azurerm_application_gateway.ingress"),
		],
		[
			"a Terraform nested block",
			at("infra/main.tf", 'azurerm_application_gateway.ingress.http_listener["device-https"]'),
			at("infra/main.tf", 'azurerm_application_gateway.ingress.http_listener["device-https"]'),
		],
		[
			"a Terraform module call with normalized paths",
			at("infra", "module.gw"),
			at("./infra/", "module.gw"),
		],
		[
			"a Kubernetes workload",
			at("deploy/web.yaml", "Deployment/web"),
			at("deploy/web.yaml", "Deployment/web"),
		],
		["a Compose service", at("compose.yaml", "services.web"), at("compose.yaml", "services.web")],
	];

	test.each(INFRA_BINDINGS)(
		"exempts one direct child sharing %s when parent precedes child",
		(_label, parentBinding, childBinding) => {
			expect(
				sharedBindings([
					part(box, { binding: parentBinding }),
					part(first, { parent: box, binding: childBinding }),
				]),
			).toEqual([]);
		},
	);

	test.each(INFRA_BINDINGS)(
		"exempts one direct child sharing %s when child precedes parent",
		(_label, parentBinding, childBinding) => {
			expect(
				sharedBindings([
					part(first, { parent: box, binding: childBinding }),
					part(box, { binding: parentBinding }),
				]),
			).toEqual([]);
		},
	);

	test("warns on a second and third direct sibling sharing the parent infrastructure address", () => {
		const binding = at("infra/main.tf", "azurerm_application_gateway.ingress");
		const diagnostics = sharedBindings([
			part(box, { binding }),
			part(first, { parent: box, binding }),
			part(second, { parent: box, binding }),
			part(third, { parent: box, binding }),
		]);
		expect(diagnostics).toMatchObject([
			{ severity: "warning", file: `${second}.module.json`, id: second },
			{ severity: "warning", file: `${third}.module.json`, id: third },
		]);
		expect(diagnostics[0]?.message).toContain("as Box is");
	});

	test("warns on the second direct sibling even when children precede the parent", () => {
		const binding = at("deploy/web.yaml", "Deployment/web");
		const diagnostics = sharedBindings([
			part(first, { parent: box, binding }),
			part(second, { parent: box, binding }),
			part(box, { binding }),
		]);
		expect(diagnostics).toMatchObject([
			{ severity: "warning", file: `${second}.module.json`, id: second },
		]);
		expect(diagnostics[0]?.message).toContain("as Box is");
	});

	test("warns when an indirect descendant shares the infrastructure address", () => {
		const binding = at("infra/main.tf", "azurerm_application_gateway.ingress");
		const diagnostics = sharedBindings([
			part(box, { binding }),
			part(first, { parent: box }),
			part(second, { parent: first, binding }),
		]);
		expect(diagnostics).toMatchObject([
			{ severity: "warning", file: `${second}.module.json`, id: second },
		]);
	});

	test("warns on a grandchild in a three-level chain sharing the same infrastructure address", () => {
		const binding = at("compose.yaml", "services.web");
		const parentFirst = sharedBindings([
			part(box, { binding }),
			part(first, { parent: box, binding }),
			part(second, { parent: first, binding }),
		]);
		const childFirst = sharedBindings([
			part(second, { parent: first, binding }),
			part(first, { parent: box, binding }),
			part(box, { binding }),
		]);
		expect(parentFirst).toMatchObject([{ id: second }]);
		expect(childFirst).toMatchObject([{ id: second }]);
	});

	test("warns when an unrelated module shares the infrastructure address", () => {
		const binding = at("infra/main.tf", "azurerm_application_gateway.ingress");
		const diagnostics = sharedBindings([
			part(box, { binding }),
			part(first, { parent: box, binding }),
			part(other, { binding }),
		]);
		expect(diagnostics).toMatchObject([
			{ severity: "warning", file: `${other}.module.json`, id: other },
		]);
	});

	test.each<[string, Binding]>([
		["a TypeScript file", at("src/shop.ts")],
		["a TypeScript symbol", at("src/shop.ts", "run")],
		["a source directory", at("src/shop")],
		["a YAML file without an infrastructure symbol", at("deploy/web.yaml")],
	])("still warns when parent and direct child share %s", (_label, binding) => {
		const diagnostics = sharedBindings([
			part(box, { binding }),
			part(first, { parent: box, binding }),
		]);
		expect(diagnostics).toMatchObject([
			{ severity: "warning", file: `${first}.module.json`, id: first },
		]);
	});

	test("canonicalizes equivalent quoted nested-block selector spellings before grouping", () => {
		const canonical = at(
			"infra/main.tf",
			'azurerm_application_gateway.ingress.http_listener["device"]',
		);
		const escaped = at(
			"infra/main.tf",
			String.raw`azurerm_application_gateway.ingress.http_listener["dev\u0069ce"]`,
		);
		expect(
			sharedBindings([
				part(box, { binding: canonical }),
				part(first, { parent: box, binding: escaped }),
			]),
		).toEqual([]);
		const diagnostics = sharedBindings([
			part(box, { binding: canonical }),
			part(first, { parent: box, binding: canonical }),
			part(second, { parent: box, binding: escaped }),
		]);
		expect(diagnostics).toMatchObject([
			{ severity: "warning", file: `${second}.module.json`, id: second },
		]);
	});
});
