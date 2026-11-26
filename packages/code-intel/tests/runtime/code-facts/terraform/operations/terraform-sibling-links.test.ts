// 1-hop intra-resource sibling name links and nested-block span lookup in
// Terraform and OpenTofu code facts (ADR 0046, TASK-682.03).

import { afterAll, expect, test } from "bun:test";
import type { SyntaxFacts } from "#runtime/code-facts/operations/facts.ts";
import { createCodeFacts } from "#runtime/code-facts/services/reader.ts";
import { terraformConfiguration } from "#runtime/code-facts/terraform/operations/terraform-configuration.ts";
import { fixtureCheckout } from "#tests/runtime/support/code-facts/checkout.ts";

const MAIN_TF = [
	'resource "azurerm_application_gateway" "ingress" {',
	'  name = "ingress"',
	"  http_listener {",
	'    name      = "device-https"',
	'    api_token = "super-secret-token-value"',
	"  }",
	"  http_listener {",
	'    name = "public-https"',
	"  }",
	"  http_listener {",
	'    name = "shared"',
	"  }",
	"  http_listener {",
	'    name = "dup-listener"',
	"  }",
	"  http_listener {",
	'    name = "dup-listener"',
	"  }",
	"  backend_address_pool {",
	'    name  = "device-pool"',
	"    fqdns = [azurerm_linux_web_app.device.default_hostname]",
	"  }",
	"  backend_address_pool {",
	'    name = "backup-pool"',
	"  }",
	"  backend_address_pool {",
	'    name = "shared"',
	"  }",
	"  rule {",
	'    name = "device"',
	"  }",
	"  request_routing_rule {",
	'    name                       = "device"',
	'    http_listener_name         = "device-https"',
	'    default_http_listener_name = "device-https"',
	'    backend_address_pool_names = ["device-pool", var.extra_pool, "backup-pool", "${var.dyn}"]',
	'    overrule_name              = "device"',
	'    http_listener_missing      = "unmatched-secret-literal"',
	"  }",
	"  request_routing_rule {",
	'    name               = "public"',
	'    http_listener_name = "public-https"',
	"  }",
	"  request_routing_rule {",
	'    name               = "to-dup"',
	'    http_listener_name = "dup-listener"',
	"  }",
	"  url_path_map {",
	'    name                              = "device-paths"',
	'    default_backend_address_pool_name = "backup-pool"',
	"    path_rule {",
	'      name                      = "api"',
	'      paths                     = ["/api/*"]',
	'      backend_address_pool_name = "device-pool"',
	"    }",
	"  }",
	"}",
	"",
	'resource "azurerm_application_gateway" "other" {',
	"  http_listener {",
	'    name = "device-https"',
	"  }",
	"  request_routing_rule {",
	'    name               = "device"',
	'    http_listener_name = "device-https"',
	"  }",
	"}",
	"",
	'resource "azurerm_linux_web_app" "device" {',
	'  name = "device"',
	"}",
	"",
	'data "azurerm_application_gateway" "existing" {',
	"  http_listener {",
	'    name = "device-https"',
	"  }",
	"  request_routing_rule {",
	'    name               = "device"',
	'    http_listener_name = "device-https"',
	"  }",
	"}",
	"",
	'module "gw_a" {',
	'  source = "./modules/gw"',
	"}",
	"",
	'module "gw_b" {',
	'  source = "./modules/gw"',
	"}",
	"",
].join("\n");

const MODULE_GW_TF = [
	'resource "azurerm_application_gateway" "ingress" {',
	"  http_listener {",
	'    name = "device-https"',
	"  }",
	"  backend_address_pool {",
	'    name  = "device-pool"',
	"    fqdns = [var.upstream]",
	"  }",
	"  request_routing_rule {",
	'    name                      = "device"',
	'    http_listener_name        = "device-https"',
	'    backend_address_pool_name = "device-pool"',
	"  }",
	"}",
	"",
	'variable "upstream" {',
	'  default = ""',
	"}",
	"",
].join("\n");

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

test("adapter emits deduplicated 1-hop sibling links with resolved block symbols only and never stores raw string values", async () => {
	const main = await terraform("infra/main.tf");
	expect(main.siblingLinks).toEqual([
		{
			from: 'azurerm_application_gateway.ingress.request_routing_rule["device"]',
			to: 'azurerm_application_gateway.ingress.http_listener["device-https"]',
		},
		{
			from: 'azurerm_application_gateway.ingress.request_routing_rule["device"]',
			to: 'azurerm_application_gateway.ingress.backend_address_pool["device-pool"]',
		},
		{
			from: 'azurerm_application_gateway.ingress.request_routing_rule["device"]',
			to: 'azurerm_application_gateway.ingress.backend_address_pool["backup-pool"]',
		},
		{
			from: 'azurerm_application_gateway.ingress.request_routing_rule["public"]',
			to: 'azurerm_application_gateway.ingress.http_listener["public-https"]',
		},
		{
			from: 'azurerm_application_gateway.ingress.url_path_map["device-paths"]',
			to: 'azurerm_application_gateway.ingress.backend_address_pool["backup-pool"]',
		},
		{
			from: 'azurerm_application_gateway.ingress.url_path_map["device-paths"]',
			to: 'azurerm_application_gateway.ingress.backend_address_pool["device-pool"]',
		},
		{
			from: 'azurerm_application_gateway.other.request_routing_rule["device"]',
			to: 'azurerm_application_gateway.other.http_listener["device-https"]',
		},
	]);

	// ADR 0046 secret-safety: every endpoint is a canonical emitted block symbol; no raw strings appear.
	const blockSymbols = new Set(
		main.definitions.filter((each) => each.visibility === "block").map((each) => each.symbol),
	);
	for (const link of main.siblingLinks ?? []) {
		expect(blockSymbols.has(link.from)).toBe(true);
		expect(blockSymbols.has(link.to)).toBe(true);
	}
	const serialized = JSON.stringify(main);
	expect(serialized).not.toContain("super-secret-token-value");
	expect(serialized).not.toContain("unmatched-secret-literal");
});

test("terraformConfiguration exposes symmetric 1-hop sibling adjacency isolated per resource and module instance, and nestedBlockAt lookup", async () => {
	const config = await terraformConfiguration(
		facts.pass(new AbortController().signal),
		checkout,
		"infra",
	);

	// 1-hop symmetric in root resource
	expect(
		config.areLinkedSiblings(
			'azurerm_application_gateway.ingress.request_routing_rule["device"]',
			'azurerm_application_gateway.ingress.http_listener["device-https"]',
		),
	).toBe(true);
	expect(
		config.areLinkedSiblings(
			'azurerm_application_gateway.ingress.http_listener["device-https"]',
			'azurerm_application_gateway.ingress.request_routing_rule["device"]',
		),
	).toBe(true);

	// 2-hop (listener <-> backend pool via routing rule) must be false
	expect(
		config.areLinkedSiblings(
			'azurerm_application_gateway.ingress.http_listener["device-https"]',
			'azurerm_application_gateway.ingress.backend_address_pool["device-pool"]',
		),
	).toBe(false);

	// Different resource must be false
	expect(
		config.areLinkedSiblings(
			'azurerm_application_gateway.ingress.http_listener["device-https"]',
			'azurerm_application_gateway.other.request_routing_rule["device"]',
		),
	).toBe(false);

	// Module instances stay isolated
	expect(
		config.areLinkedSiblings(
			'module.gw_a.azurerm_application_gateway.ingress.http_listener["device-https"]',
			'module.gw_a.azurerm_application_gateway.ingress.request_routing_rule["device"]',
		),
	).toBe(true);
	expect(
		config.areLinkedSiblings(
			'module.gw_a.azurerm_application_gateway.ingress.http_listener["device-https"]',
			'module.gw_b.azurerm_application_gateway.ingress.request_routing_rule["device"]',
		),
	).toBe(false);

	// Sibling links must NEVER enter reached()
	expect(config.reached("azurerm_application_gateway.ingress").map(({ to }) => to.address)).toEqual(
		["azurerm_linux_web_app.device"],
	);
	expect(
		config.reached('azurerm_application_gateway.ingress.request_routing_rule["device"]'),
	).toEqual([]);

	// nestedBlockAt returns the depth-1 block spanning a line, or undefined outside/in duplicates
	expect(config.nestedBlockAt("azurerm_application_gateway.ingress", "infra/main.tf", 21)).toBe(
		'azurerm_application_gateway.ingress.backend_address_pool["device-pool"]',
	);
	expect(
		config.nestedBlockAt("azurerm_application_gateway.ingress", "infra/main.tf", 2),
	).toBeUndefined();
	expect(
		config.nestedBlockAt("azurerm_application_gateway.ingress", "infra/main.tf", 14),
	).toBeUndefined();
	expect(
		config.nestedBlockAt(
			"module.gw_a.azurerm_application_gateway.ingress",
			"infra/modules/gw/main.tf",
			7,
		),
	).toBe('module.gw_a.azurerm_application_gateway.ingress.backend_address_pool["device-pool"]');
	expect(
		config.nestedBlockAt(
			"module.gw_b.azurerm_application_gateway.ingress",
			"infra/modules/gw/main.tf",
			7,
		),
	).toBe('module.gw_b.azurerm_application_gateway.ingress.backend_address_pool["device-pool"]');
});
