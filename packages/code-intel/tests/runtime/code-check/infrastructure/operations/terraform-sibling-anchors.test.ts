// End-to-end verification of 1-hop sibling-block anchors and bound vs. unbound
// nested-block HCL reference ownership in Terraform (ADR 0046, TASK-682.03).

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/code-check/operations/check.ts";
import { document, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = mkdtempSync(join(tmpdir(), "archboard-tf-sibling-check-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";

let outcome: CodeCheckOutcome;

const GATEWAY_TF = [
	'resource "azurerm_linux_web_app" "device" {',
	'  name = "device"',
	"}",
	'resource "azurerm_linux_web_app" "other" {',
	'  name = "other"',
	"}",
	'resource "azurerm_log_analytics_workspace" "access" {',
	'  name = "access"',
	"}",
	'resource "azurerm_application_gateway" "ingress" {',
	'  name = "ingress"',
	"  http_listener {",
	'    name = "device-https"',
	"  }",
	"  http_listener {",
	'    name = "public-https"',
	"  }",
	"  backend_address_pool {",
	'    name  = "device-pool"',
	"    fqdns = [azurerm_linux_web_app.device.default_hostname]",
	"  }",
	"  backend_address_pool {",
	'    name  = "unbound-pool"',
	"    fqdns = [azurerm_linux_web_app.other.default_hostname]",
	"  }",
	"  request_routing_rule {",
	'    name                       = "device"',
	'    http_listener_name         = "device-https"',
	'    backend_address_pool_names = ["device-pool", var.extra_pool]',
	"  }",
	"  request_routing_rule {",
	'    name                       = "default-device"',
	'    default_http_listener_name = "device-https"',
	"  }",
	"  request_routing_rule {",
	'    name               = "public"',
	'    http_listener_name = "public-https"',
	"  }",
	"  url_path_map {",
	'    name = "device-paths"',
	"    path_rule {",
	'      name                      = "api"',
	'      backend_address_pool_name = "device-pool"',
	"    }",
	"  }",
	"}",
	'resource "azurerm_application_gateway" "other" {',
	"  http_listener {",
	'    name = "device-https"',
	"  }",
	"  request_routing_rule {",
	'    name               = "device"',
	'    http_listener_name = "device-https"',
	"  }",
	"}",
	'resource "azurerm_monitor_diagnostic_setting" "access" {',
	'  name                       = "access"',
	"  target_resource_id         = azurerm_application_gateway.ingress.id",
	"  log_analytics_workspace_id = azurerm_log_analytics_workspace.access.id",
	"}",
	'variable "extra_pool" {',
	'  default = ""',
	"}",
	'module "gw_a" {',
	'  source = "./modules/gw"',
	"}",
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
	"  http_listener {",
	'    name = "public-https"',
	"  }",
	"  backend_address_pool {",
	'    name = "device-pool"',
	"  }",
	"  request_routing_rule {",
	'    name                      = "device"',
	'    http_listener_name        = "device-https"',
	'    backend_address_pool_name = "device-pool"',
	"  }",
	"  request_routing_rule {",
	'    name               = "public"',
	'    http_listener_name = "public-https"',
	"  }",
	"}",
	"",
].join("\n");

/**
 * Create a module node bound to a path and optional symbol.
 * @param id Node id.
 * @param path File or directory path.
 * @param symbol Optional symbol.
 * @param parent Optional parent node id.
 * @returns Node entry.
 */
function part(id: string, path: string, symbol?: string, parent?: string) {
	return {
		id,
		name: id,
		kind: "module",
		order: id.charCodeAt(0) * 100 + id.length,
		...(parent === undefined ? {} : { parent }),
		binding: { repo: SHOP, path, ...(symbol === undefined ? {} : { symbol }) },
	};
}

/**
 * Create a relationship, optionally anchored to a file and symbol.
 * @param id Edge id.
 * @param ends Start and end node ids.
 * @param kind Relationship kind.
 * @param anchor Optional file and symbol pair.
 * @returns Edge entry.
 */
function edge(id: string, ends: [string, string], kind: string, anchor?: [string, string]) {
	return {
		id,
		order: Number(id.slice(1)) * 10,
		from: ends[0],
		to: ends[1],
		kind,
		...(anchor === undefined ? {} : { anchor: { repo: SHOP, path: anchor[0], symbol: anchor[1] } }),
	};
}

/**
 * Write a document with one current variant.
 * @param name Document name.
 * @param nodes Nodes.
 * @param edges Edges.
 */
function current(name: string, nodes: unknown[], edges: unknown[]): void {
	document(vault, name, [
		{ id: "v1", name: "Built", lifecycle: "current", content: { nodes, edges } },
	]);
}

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, shop, "init", "-q", "-b", "main");
	git(scratch, shop, "remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		"infra/main.tf": GATEWAY_TF,
		"infra/modules/gw/main.tf": MODULE_GW_TF,
	});
	git(scratch, shop, "add", "-A");
	git(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", "fixtures");
	register(scratch, { [SHOP]: shop });

	current(
		"Sibling anchors",
		[
			part(
				"DevLst",
				"infra",
				'azurerm_application_gateway.ingress["blue"].http_listener["device-https"]',
			),
			part(
				"DevBep",
				"infra",
				'azurerm_application_gateway.ingress.backend_address_pool["device-pool"]',
			),
			part(
				"DevRule",
				"infra",
				'azurerm_application_gateway.ingress.request_routing_rule["device"]',
			),
			part("DevApp", "infra", "azurerm_linux_web_app.device"),
			part("OtherApp", "infra", "azurerm_linux_web_app.other"),
			part(
				"ModLstA",
				"infra",
				'module.gw_a[0].azurerm_application_gateway.ingress.http_listener["device-https"]',
			),
			part(
				"ModBepA",
				"infra",
				'module.gw_a.azurerm_application_gateway.ingress.backend_address_pool["device-pool"]',
			),
		],
		[
			// Positive: 1-hop sibling anchor via http_listener_name
			edge("e1", ["DevLst", "DevBep"], "http", [
				"infra/main.tf",
				'azurerm_application_gateway.ingress.request_routing_rule["device"]',
			]),
			// Positive: 1-hop via default_http_listener_name
			edge("e2", ["DevLst", "DevBep"], "http", [
				"infra/main.tf",
				'azurerm_application_gateway.ingress.request_routing_rule["default-device"]',
			]),
			// Positive: 1-hop via deep sub-block attribute in url_path_map
			edge("e3", ["DevLst", "DevBep"], "http", [
				"infra/main.tf",
				'azurerm_application_gateway.ingress.url_path_map["device-paths"]',
			]),
			// Positive: reverse direction (bound rule citing its referenced http_listener)
			edge("e4", ["DevRule", "OtherApp"], "http", [
				"infra/main.tf",
				'azurerm_application_gateway.ingress.http_listener["device-https"]',
			]),
			// Positive: 1-hop sibling anchor inside local module
			edge("e5", ["ModLstA", "ModBepA"], "http", [
				"infra/modules/gw/main.tf",
				'azurerm_application_gateway.ingress.request_routing_rule["device"]',
			]),
			// Satisfy DevBep -> DevApp evidence
			edge("e6", ["DevBep", "DevApp"], "http"),
			// Negative: wrong sibling routing rule
			edge("e7", ["DevLst", "DevBep"], "http", [
				"infra/main.tf",
				'azurerm_application_gateway.ingress.request_routing_rule["public"]',
			]),
			// Negative: wrong sibling listener
			edge("e8", ["DevLst", "DevBep"], "http", [
				"infra/main.tf",
				'azurerm_application_gateway.ingress.http_listener["public-https"]',
			]),
			// Negative: 2-hop sibling (DevLst -> OtherApp citing backend_address_pool["device-pool"])
			edge("e9", ["DevLst", "OtherApp"], "http", [
				"infra/main.tf",
				'azurerm_application_gateway.ingress.backend_address_pool["device-pool"]',
			]),
			// Negative: sibling block in a DIFFERENT resource
			edge("e10", ["DevLst", "DevBep"], "http", [
				"infra/main.tf",
				'azurerm_application_gateway.other.request_routing_rule["device"]',
			]),
			// Negative: whole enclosing resource on nested-block-to-nested-block edge
			edge("e11", ["DevLst", "DevBep"], "http", [
				"infra/main.tf",
				"azurerm_application_gateway.ingress",
			]),
			// Negative: whole enclosing resource on nested-block-to-external edge
			edge("e12", ["DevLst", "DevApp"], "http", [
				"infra/main.tf",
				"azurerm_application_gateway.ingress",
			]),
			// Negative: wrong sibling in local module
			edge("e13", ["ModLstA", "ModBepA"], "http", [
				"infra/modules/gw/main.tf",
				'azurerm_application_gateway.ingress.request_routing_rule["public"]',
			]),
		],
	);

	current(
		"No intra-resource evidence",
		[
			part("DevLst", "infra", 'azurerm_application_gateway.ingress.http_listener["device-https"]'),
			part(
				"DevBep",
				"infra",
				'azurerm_application_gateway.ingress.backend_address_pool["device-pool"]',
			),
			part(
				"DevRule",
				"infra",
				'azurerm_application_gateway.ingress.request_routing_rule["device"]',
			),
		],
		[],
	);

	const agwNodes = [
		part("AgwBox", "infra", "azurerm_application_gateway.ingress"),
		part("Gateway", "infra", "azurerm_application_gateway.ingress", "AgwBox"),
		part(
			"DevLst",
			"infra",
			'azurerm_application_gateway.ingress.http_listener["device-https"]',
			"AgwBox",
		),
		part(
			"DevBep",
			"infra",
			'azurerm_application_gateway.ingress.backend_address_pool["device-pool"]',
			"AgwBox",
		),
		part("DevApp", "infra", "azurerm_linux_web_app.device"),
		part("OtherApp", "infra", "azurerm_linux_web_app.other"),
		part("Logs", "infra", "azurerm_log_analytics_workspace.access"),
	];
	current("Ownership undrawn", agwNodes, []);
	current("Ownership drawn", agwNodes, [
		edge("e1", ["DevBep", "DevApp"], "http"),
		edge("e2", ["Gateway", "OtherApp"], "http"),
		edge("e3", ["Gateway", "Logs"], "storage"),
	]);

	current(
		"Sibling children tie",
		[
			part("AgwBox", "infra", "azurerm_application_gateway.ingress"),
			part("GwA", "infra", "azurerm_application_gateway.ingress", "AgwBox"),
			part("GwB", "infra", "azurerm_application_gateway.ingress", "AgwBox"),
			part("Logs", "infra", "azurerm_log_analytics_workspace.access"),
		],
		[],
	);

	const check = await import("#tests/runtime/support/code-check/pass.ts");
	const read = check.readStatesToCheck(vault, undefined);
	if (!read.ok) throw new Error("no documents");
	outcome = await check.checkCode(vault, read.states, new AbortController().signal);
});

afterAll(() => {
	if (caller.ARCHBOARD_REPOS === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = caller.ARCHBOARD_REPOS;
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Findings on one document as `CODE subject severity`.
 * @param name Document name.
 * @returns Sorted summary strings.
 */
function found(name: string): string[] {
	return outcome.findings
		.filter((each) => each.model === name)
		.map((each) => `${each.code} ${each.subject?.id} ${each.severity}`)
		.toSorted();
}

test("1-hop sibling-block anchors pass in both directions and inside local modules, while wrong, 2-hop, other-resource, and whole-resource anchors warn", () => {
	expect(found("Sibling anchors")).toEqual([
		"ANCHOR_MISMATCH e10 warning",
		"ANCHOR_MISMATCH e11 warning",
		"ANCHOR_MISMATCH e12 warning",
		"ANCHOR_MISMATCH e13 warning",
		"ANCHOR_MISMATCH e7 warning",
		"ANCHOR_MISMATCH e8 warning",
		"ANCHOR_MISMATCH e9 warning",
	]);
});

test("co-located nested blocks emit no intra-resource RELATIONSHIP_UNDRAWN warnings", () => {
	expect(found("No intra-resource evidence")).toEqual([]);
});

test("bound nested-block HCL references belong to the nested-block part, unbound ones fall back to the deeper child of the enclosing resource, and drawing on the child leaves zero duplicate findings on the container", () => {
	const undrawn = outcome.findings
		.filter((each) => each.model === "Ownership undrawn")
		.map((each) => ({
			to: each.subject?.id,
			callers: (each.evidence ?? []).map((piece) => piece.from).toSorted(),
		}))
		.toSorted((left, right) => (left.to ?? "").localeCompare(right.to ?? ""));
	expect(undrawn).toEqual([
		{ to: "DevApp", callers: ["DevBep"] },
		{ to: "Logs", callers: ["Gateway"] },
		{ to: "OtherApp", callers: ["Gateway"] },
	]);
	expect(found("Ownership drawn")).toEqual([]);

	const tie = outcome.findings
		.filter((each) => each.model === "Sibling children tie")
		.map((each) => (each.evidence ?? []).map((piece) => piece.from).toSorted());
	expect(tie).toEqual([["GwA", "GwB"]]);
});
