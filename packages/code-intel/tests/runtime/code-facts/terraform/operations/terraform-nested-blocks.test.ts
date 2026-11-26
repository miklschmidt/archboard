// Depth-1 named nested blocks of Terraform and OpenTofu resources (TASK-682.01):
// positional address normalization, HCL string unescaping, AST extraction with
// duplicate suppression, lookup/definition-site/symbol-line resolution, and
// resource-level invariants in the root module address space.

import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import type { CodeBinding } from "@archboard/code-binding/bindings";
import { definitionSite } from "#runtime/code-facts/operations/definition-site.ts";
import type { SyntaxFacts } from "#runtime/code-facts/operations/facts.ts";
import { findSymbol } from "#runtime/code-facts/operations/lookup.ts";
import { symbolLine } from "#runtime/code-facts/operations/symbol-line.ts";
import { createCodeFacts } from "#runtime/code-facts/services/reader.ts";
import {
	declarationAddress,
	decodeHclString,
	namesOf,
	parseTerraformAddress,
	splitAddressSegments,
} from "#runtime/code-facts/terraform/operations/terraform-address.ts";
import { terraformConfiguration } from "#runtime/code-facts/terraform/operations/terraform-configuration.ts";
import { fixtureCheckout } from "#tests/runtime/support/code-facts/checkout.ts";

const MAIN_TF = [
	'resource "azurerm_application_gateway" "ingress" {',
	'  name = "ingress"',
	"  http_listener {",
	'    name = "device-https"',
	"    frontend_ip_configuration_name = aws_iam_role.api.name",
	"    custom_error_configuration {",
	'      name = "depth-two"',
	"    }",
	"  }",
	"  http_listener {",
	'    name = "example.com"',
	"  }",
	"  http_listener {",
	'    name = "a \\"b\\"/c d"',
	"  }",
	"  http_listener {",
	'    name = "price-$5"',
	"  }",
	"  http_listener {",
	'    name = "dup-listener"',
	"  }",
	"  http_listener {",
	'    name = "dup-listener"',
	"  }",
	"  http_listener {",
	'    name = "dyn-${var.env}"',
	"  }",
	"  http_listener {",
	'    name = "%{if true}dir%{endif}"',
	"  }",
	"  http_listener {",
	"    name = var.listener_name",
	"  }",
	"  http_listener {",
	"    port = 443",
	"  }",
	"  backend_address_pool {",
	'    name = "device-https"',
	"  }",
	'  dynamic "http_listener" {',
	"    for_each = var.extra",
	"    content {",
	'      name = "from-dynamic"',
	"    }",
	"  }",
	"}",
	"",
	'resource "aws_iam_role" "api" {',
	'  name = "api"',
	"}",
	"",
	'data "aws_iam_policy_document" "assume" {',
	"  statement {",
	'    name = "read-only"',
	"  }",
	"}",
	"",
	'ephemeral "random_password" "db" {',
	"  override {",
	'    name = "special"',
	"  }",
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
	"  http_listener {",
	'    name = "device-https"',
	"    target = var.upstream",
	"  }",
	"  http_listener {",
	'    name = "example.com"',
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

test("positional address parser normalizes module/resource keys and preserves valid depth-1 resource block selectors", () => {
	expect(
		declarationAddress(
			'module.api[0].azurerm_application_gateway.ingress["blue"].http_listener["device-https"]',
		),
	).toBe('module.api.azurerm_application_gateway.ingress.http_listener["device-https"]');
	expect(
		declarationAddress('azurerm_application_gateway.ingress.http_listener["example.com"]'),
	).toBe('azurerm_application_gateway.ingress.http_listener["example.com"]');
	expect(
		declarationAddress('azurerm_application_gateway.ingress.http_listener["a \\"b\\"/c d"]'),
	).toBe('azurerm_application_gateway.ingress.http_listener["a \\"b\\"/c d"]');
	expect(
		declarationAddress('azurerm_application_gateway.ingress.http_listener["\\u0061\\t\\n"]'),
	).toBe('azurerm_application_gateway.ingress.http_listener["a\\t\\n"]');
	expect(declarationAddress('aws_route53_record.www["example.com"]')).toBe(
		"aws_route53_record.www",
	);
	expect(declarationAddress('module.a[0].module.b["x"].data.aws_ami.ubuntu[1]')).toBe(
		"module.a.module.b.data.aws_ami.ubuntu",
	);
	expect(declarationAddress('ephemeral.random_password.db["main"]')).toBe(
		"ephemeral.random_password.db",
	);
	expect(declarationAddress("module.queue[0].url")).toBe("module.queue.url");
	expect(declarationAddress("module.queue[0].var.name")).toBe("module.queue.var.name");
	expect(declarationAddress("var.region")).toBe("var.region");
	expect(declarationAddress("local.tags")).toBe("local.tags");
	expect(declarationAddress("output.api_arn")).toBe("output.api_arn");

	expect(
		parseTerraformAddress(
			'module.api[0].azurerm_application_gateway.ingress["blue"].http_listener["example.com"]',
		),
	).toEqual({
		address: 'module.api.azurerm_application_gateway.ingress.http_listener["example.com"]',
		modules: ["api"],
		kind: "block",
		declaration: "module.api.azurerm_application_gateway.ingress",
		resourceType: "azurerm_application_gateway",
		nested: { blockType: "http_listener", name: "example.com" },
	});
	expect(
		splitAddressSegments(
			'module.gw.azurerm_application_gateway.ingress.http_listener["example.com"]',
		),
	).toEqual([
		"module",
		"gw",
		"azurerm_application_gateway",
		"ingress",
		'http_listener["example.com"]',
	]);
	expect(decodeHclString('"a \\"b\\"/c d"')).toBe('a "b"/c d');
	expect(namesOf('module.app[0].aws_instance.web["a.b"].arn')).toEqual([
		"module",
		"app",
		"aws_instance",
		"web",
		"arn",
	]);
});

test("positional address parser rejects numeric nested indices, depth-2 blocks, and non-resource nested selectors", () => {
	const rejected = [
		"azurerm_application_gateway.ingress.http_listener[0]",
		"module.gw[0].azurerm_application_gateway.ingress.http_listener[0]",
		"azurerm_application_gateway.ingress.http_listener[*]",
		"azurerm_application_gateway.ingress.http_listener",
		'azurerm_application_gateway.ingress.http_listener["a"].sub["b"]',
		'azurerm_application_gateway.ingress.http_listener.sub["b"]',
		'data.aws_iam_policy_document.assume.statement["read-only"]',
		'ephemeral.random_password.db.override["special"]',
		'module.gw.http_listener["device-https"]',
		'var.config.item["x"]',
		'local.config.item["x"]',
		'output.config.item["x"]',
		"azurerm_application_gateway.ingress.http_listener['single']",
		'azurerm_application_gateway.ingress.http_listener["unterminated',
		"api",
		"",
	];
	for (const symbol of rejected) {
		expect(parseTerraformAddress(symbol)).toBeUndefined();
	}
	// Numeric nested index must never strip [0] into an unbracketed segment or match a resource.
	expect(declarationAddress("azurerm_application_gateway.ingress.http_listener[0]")).not.toBe(
		"azurerm_application_gateway.ingress.http_listener",
	);
	expect(declarationAddress("azurerm_application_gateway.ingress.http_listener[0]")).not.toBe(
		"azurerm_application_gateway.ingress",
	);
});

test("adapter emits unique depth-1 resource nested blocks and suppresses duplicates, depth-2, dynamic, interpolated, and non-resource blocks", async () => {
	const main = await terraform("infra/main.tf");
	const blocks = main.definitions.filter((each) => each.visibility === "block");
	expect(blocks.map((each) => each.symbol)).toEqual([
		'azurerm_application_gateway.ingress.http_listener["device-https"]',
		'azurerm_application_gateway.ingress.http_listener["example.com"]',
		'azurerm_application_gateway.ingress.http_listener["a \\"b\\"/c d"]',
		'azurerm_application_gateway.ingress.http_listener["price-$5"]',
		'azurerm_application_gateway.ingress.backend_address_pool["device-https"]',
	]);
	const listener = blocks[0];
	expect(listener).toMatchObject({
		kind: "value",
		visibility: "block",
		exposed: false,
		start: 3,
		end: 9,
	});
	expect(listener?.source).toBeDefined();
	const sliced =
		listener?.source === undefined ? "" : MAIN_TF.slice(listener.source.start, listener.source.end);
	expect(sliced.startsWith("http_listener {")).toBe(true);
	expect(sliced.endsWith("}")).toBe(true);
});

test("findSymbol, definitionSite, and symbolLine resolve nested blocks with instance keys and quoted punctuation while rejecting invalid selectors", async () => {
	const main = await terraform("infra/main.tf");
	const pass = facts.pass(new AbortController().signal);

	expect(
		findSymbol(
			main,
			'azurerm_application_gateway.ingress["blue"].http_listener["example.com"]',
			"definition",
		),
	).toMatchObject({ status: "found", line: 10 });
	expect(
		findSymbol(
			main,
			'azurerm_application_gateway.ingress.http_listener["a \\"b\\"/c d"]',
			"definition",
		),
	).toMatchObject({ status: "found", line: 13 });
	expect(
		findSymbol(main, "azurerm_application_gateway.ingress.http_listener[0]", "definition").status,
	).toBe("absent");
	expect(
		findSymbol(
			main,
			'azurerm_application_gateway.ingress.http_listener["dup-listener"]',
			"definition",
		).status,
	).toBe("absent");
	expect(
		findSymbol(main, 'data.aws_iam_policy_document.assume.statement["read-only"]', "definition")
			.status,
	).toBe("absent");

	expect(
		await definitionSite(
			pass,
			checkout,
			"infra/main.tf",
			'azurerm_application_gateway.ingress[0].http_listener["example.com"]',
		),
	).toMatchObject({ path: "infra/main.tf", definition: { start: 10, end: 12 } });
	expect(
		await definitionSite(
			pass,
			checkout,
			"infra/main.tf",
			'azurerm_application_gateway.ingress.http_listener["a \\"b\\"/c d"]',
		),
	).toMatchObject({ path: "infra/main.tf", definition: { start: 13, end: 15 } });
	expect(
		await definitionSite(
			pass,
			checkout,
			"infra/main.tf",
			"azurerm_application_gateway.ingress.http_listener[0]",
		),
	).toBeUndefined();

	const openAt = (symbol: string) => {
		const binding: CodeBinding = { repo: "github.com/test/shop", path: "infra/main.tf", symbol };
		return symbolLine(
			binding,
			{
				ok: true,
				repository: binding.repo,
				root: checkout.root,
				target: join(checkout.root, "infra/main.tf"),
				path: "infra/main.tf",
				kind: "file",
			},
			new AbortController().signal,
		);
	};
	expect(
		await openAt('azurerm_application_gateway.ingress["blue"].http_listener["example.com"]'),
	).toBe(10);
	expect(await openAt('azurerm_application_gateway.ingress.http_listener["a \\"b\\"/c d"]')).toBe(
		13,
	);
	expect(await openAt("azurerm_application_gateway.ingress.http_listener[0]")).toBeUndefined();
});

test("terraformConfiguration resolves nested blocks across local modules while keeping endpoints and references at resource level", async () => {
	const config = await terraformConfiguration(
		facts.pass(new AbortController().signal),
		checkout,
		"infra",
	);
	// Root and local-module nested blocks resolve to exact sites, including quoted dots and instance keys.
	expect(
		config.declared(
			'module.gw[0].azurerm_application_gateway.ingress["blue"].http_listener["example.com"]',
		),
	).toMatchObject({
		status: "found",
		declaration: {
			address: 'module.gw.azurerm_application_gateway.ingress.http_listener["example.com"]',
			kind: "block",
		},
		site: { path: "infra/modules/gw/main.tf", definition: { start: 6, end: 8 } },
	});
	expect(
		config.siteOf('module.gw.azurerm_application_gateway.ingress.http_listener["example.com"]'),
	).toMatchObject({ path: "infra/modules/gw/main.tf", definition: { start: 6, end: 8 } });
	expect(config.addressesAt("infra/modules/gw/main.tf", 2)).toEqual([
		'module.gw.azurerm_application_gateway.ingress.http_listener["device-https"]',
	]);
	// Valid nested block inside unread remote module is unread; numeric nested index is absent.
	expect(
		config.declared(
			'module.remote.azurerm_application_gateway.ingress.http_listener["example.com"]',
		),
	).toEqual({ status: "unread", module: "module.remote" });
	expect(
		config.declared("module.remote.azurerm_application_gateway.ingress.http_listener[0]"),
	).toEqual({ status: "absent" });
	// Endpoints exclude block definitions; references inside nested blocks stay owned by the resource.
	expect(config.endpoints.some((each) => each.kind === "block")).toBe(false);
	expect(config.reached("azurerm_application_gateway.ingress").map(({ to }) => to.address)).toEqual(
		["aws_iam_role.api"],
	);
	expect(
		config.reached('azurerm_application_gateway.ingress.http_listener["device-https"]'),
	).toEqual([]);
});
