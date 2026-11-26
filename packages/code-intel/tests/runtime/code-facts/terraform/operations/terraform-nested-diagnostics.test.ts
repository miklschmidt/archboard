// Diagnostics and edge cases for Terraform depth-1 named nested blocks
// (ADR 0046, TASK-682.04): duplicate-name ambiguity, unfollowed dynamic and
// computed-name blocks, plan-only remote resources, and distinct nested-block
// reach links to a shared target resource.

import { afterAll, expect, test } from "bun:test";
import type { SyntaxFacts } from "#runtime/code-facts/operations/facts.ts";
import { findSymbol } from "#runtime/code-facts/operations/lookup.ts";
import { createCodeFacts } from "#runtime/code-facts/services/reader.ts";
import { terraformConfiguration } from "#runtime/code-facts/terraform/operations/terraform-configuration.ts";
import { readTerraformPlan } from "#runtime/code-facts/terraform/operations/terraform-plan.ts";
import { fixtureCheckout } from "#tests/runtime/support/code-facts/checkout.ts";

const MAIN_TF = [
	'resource "azurerm_application_gateway" "ingress" {',
	"  http_listener {",
	'    name = "dup"',
	"  }",
	"  http_listener {",
	'    name = "dup"',
	"  }",
	'  dynamic "http_listener" {',
	"    for_each = var.extra",
	"    content {",
	'      name = "from-dynamic"',
	"    }",
	"  }",
	"  frontend_port {",
	"    name = var.port_name",
	"  }",
	"  probe {",
	'    name = "${var.env}-health"',
	"  }",
	"  sku {",
	'    tier = "Standard_v2"',
	"  }",
	"  backend_address_pool {",
	'    name  = "device-pool"',
	"    fqdns = [azurerm_public_ip.shared.fqdn]",
	"  }",
	"  backend_address_pool {",
	'    name  = "public-pool"',
	"    fqdns = [azurerm_public_ip.shared.fqdn]",
	"  }",
	"}",
	"",
	'resource "azurerm_application_gateway" "static_only" {',
	"  http_listener {",
	'    name = "only"',
	"  }",
	'  dynamic "backend_address_pool" {',
	"    for_each = var.extra",
	"    content {",
	'      name = "dyn-pool"',
	"    }",
	"  }",
	"}",
	"",
	'resource "azurerm_public_ip" "shared" {',
	'  name = "shared"',
	"}",
	"",
	'module "gw" {',
	'  source = "./modules/gw"',
	"}",
	"",
	'module "remote" {',
	'  source = "registry.terraform.io/example/gw/azurerm"',
	"}",
	"",
].join("\n");

const MODULE_GW_TF = [
	'resource "azurerm_application_gateway" "ingress" {',
	'  dynamic "http_listener" {',
	"    for_each = var.extra",
	"    content {",
	'      name = "mod-dynamic"',
	"    }",
	"  }",
	"  probe {",
	'    name = "${var.env}-probe"',
	"  }",
	"}",
	"",
].join("\n");

const PLAN_JSON = JSON.stringify({
	format_version: "1.2",
	configuration: {
		root_module: {
			module_calls: {
				remote: {
					source: "registry.terraform.io/example/gw/azurerm",
					module: {
						resources: [
							{
								mode: "managed",
								type: "azurerm_application_gateway",
								name: "ingress",
								expressions: {
									http_listener: [{ name: { constant_value: "plan-secret-listener" } }],
								},
							},
						],
					},
				},
			},
		},
	},
});

const checkout = fixtureCheckout({
	"infra/main.tf": MAIN_TF,
	"infra/modules/gw/main.tf": MODULE_GW_TF,
});
const facts = createCodeFacts();

afterAll(() => {
	checkout.remove();
});

/**
 * Read one Terraform file's facts in a fresh pass.
 * @param relative The file path.
 * @returns Its parsed facts.
 */
async function terraform(relative: string): Promise<SyntaxFacts> {
	const read = await facts.pass(new AbortController().signal).read(checkout, relative);
	if (read?.adapter !== "terraform") throw new Error(`${relative} was not read as Terraform`);
	return read;
}

test("adapter emits ambiguousSymbols for duplicate literal names and unparsed under entries for dynamic and computed-name blocks only", async () => {
	const main = await terraform("infra/main.tf");
	expect(main.ambiguousSymbols).toEqual([
		'azurerm_application_gateway.ingress.http_listener["dup"]',
	]);
	expect(main.unparsed).toEqual([
		{
			start: 8,
			end: 13,
			names: [],
			under: "azurerm_application_gateway.ingress.http_listener",
		},
		{
			start: 14,
			end: 16,
			names: [],
			under: "azurerm_application_gateway.ingress.frontend_port",
		},
		{
			start: 17,
			end: 19,
			names: [],
			under: "azurerm_application_gateway.ingress.probe",
		},
		{
			start: 37,
			end: 42,
			names: [],
			under: "azurerm_application_gateway.static_only.backend_address_pool",
		},
	]);
});

test("findSymbol reports duplicate-name ambiguity before dynamic unparsed, matches exact under entries, and keeps unrelated selectors absent", async () => {
	const main = await terraform("infra/main.tf");

	// Duplicate literal name takes precedence over dynamic block of the same type.
	expect(
		findSymbol(main, 'azurerm_application_gateway.ingress.http_listener["dup"]', "definition"),
	).toEqual({ status: "absent", ambiguous: true });

	// Unmatched selectors match exact dynamic and computed-name under entries.
	expect(
		findSymbol(main, 'azurerm_application_gateway.ingress.http_listener["other"]', "definition"),
	).toEqual({
		status: "unparsed",
		unparsed: {
			start: 8,
			end: 13,
			names: [],
			under: "azurerm_application_gateway.ingress.http_listener",
		},
	});
	expect(
		findSymbol(main, 'azurerm_application_gateway.ingress.frontend_port["https"]', "definition"),
	).toEqual({
		status: "unparsed",
		unparsed: {
			start: 14,
			end: 16,
			names: [],
			under: "azurerm_application_gateway.ingress.frontend_port",
		},
	});
	expect(
		findSymbol(main, 'azurerm_application_gateway.ingress.probe["health"]', "definition"),
	).toEqual({
		status: "unparsed",
		unparsed: {
			start: 17,
			end: 19,
			names: [],
			under: "azurerm_application_gateway.ingress.probe",
		},
	});

	// No false skips for blocks without name, different block types, or static resources.
	expect(
		findSymbol(main, 'azurerm_application_gateway.ingress.sku["Standard_v2"]', "definition"),
	).toEqual({ status: "absent" });
	expect(
		findSymbol(
			main,
			'azurerm_application_gateway.static_only.http_listener["missing"]',
			"definition",
		),
	).toEqual({ status: "absent" });
	expect(findSymbol(main, "azurerm_application_gateway.missing", "definition")).toEqual({
		status: "absent",
	});
});

test("terraformConfiguration reports ambiguous duplicates, local-module unparsed blocks, and plan-only unfollowed blocks without reading constant_value", async () => {
	const plan = {
		checkoutRoot: checkout.root,
		path: "infra/plan.json",
		module: "infra",
		configuration: readTerraformPlan(PLAN_JSON),
	};
	const config = await terraformConfiguration(
		facts.pass(new AbortController().signal, [plan]),
		checkout,
		"infra",
	);

	expect(config.declared('azurerm_application_gateway.ingress.http_listener["dup"]')).toEqual({
		status: "ambiguous",
	});
	expect(
		config.declared('module.gw.azurerm_application_gateway.ingress.http_listener["dyn"]'),
	).toEqual({
		status: "unparsed",
		path: "infra/modules/gw/main.tf",
		unparsed: {
			start: 2,
			end: 7,
			names: [],
			under: "azurerm_application_gateway.ingress.http_listener",
		},
	});
	expect(config.declared('module.gw.azurerm_application_gateway.ingress.probe["p"]')).toEqual({
		status: "unparsed",
		path: "infra/modules/gw/main.tf",
		unparsed: {
			start: 8,
			end: 10,
			names: [],
			under: "azurerm_application_gateway.ingress.probe",
		},
	});
	expect(
		config.declared(
			'module.remote.azurerm_application_gateway.ingress.http_listener["plan-secret-listener"]',
		),
	).toEqual({ status: "unfollowed", detail: "infra/plan.json" });
	expect(
		config.declared('module.remote.azurerm_application_gateway.missing.http_listener["x"]'),
	).toEqual({ status: "absent" });
	expect(
		config.declared('azurerm_application_gateway.static_only.http_listener["missing"]'),
	).toEqual({ status: "absent" });
});

test("terraformConfiguration.reached stays resource-level by default and separates nested blocks with perBlock", async () => {
	const config = await terraformConfiguration(
		facts.pass(new AbortController().signal),
		checkout,
		"infra",
	);
	const resourceLevel = config
		.reached("azurerm_application_gateway.ingress")
		.filter(({ to }) => to.address === "azurerm_public_ip.shared");
	expect(resourceLevel.map(({ link }) => link.line)).toEqual([25]);

	const perBlock = config
		.reached("azurerm_application_gateway.ingress", { perBlock: true })
		.filter(({ to }) => to.address === "azurerm_public_ip.shared");
	expect(perBlock.map(({ link }) => ({ line: link.line, block: link.block }))).toEqual([
		{
			line: 25,
			block: 'azurerm_application_gateway.ingress.backend_address_pool["device-pool"]',
		},
		{
			line: 29,
			block: 'azurerm_application_gateway.ingress.backend_address_pool["public-pool"]',
		},
	]);
});
