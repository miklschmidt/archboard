// End-to-end code-check tests for Terraform nested-block diagnostics
// (ADR 0046, TASK-682.04): duplicate-name ambiguity, unfollowed dynamic /
// computed-name / plan-only selectors, static missing warnings, and distinct
// bound nested-block evidence to a shared target resource.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/code-check/operations/check.ts";
import { document, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = mkdtempSync(join(tmpdir(), "archboard-tf-nested-diag-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";

let outcome: CodeCheckOutcome;

const MAIN_TF = [
	'resource "azurerm_public_ip" "shared" {',
	'  name = "shared"',
	"}",
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
	'module "gw" {',
	'  source = "./modules/gw"',
	"}",
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

const PLAN = {
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
									http_listener: [{ name: { constant_value: "plan-nested-secret" } }],
								},
							},
						],
					},
				},
			},
		},
	},
};

/**
 * Create a module node bound to a path and symbol.
 * @param id Node id.
 * @param symbol Bound symbol.
 * @param path Bound path.
 * @returns Node entry.
 */
function part(id: string, symbol: string, path = "infra") {
	return {
		id,
		name: id,
		kind: "module",
		order: id.charCodeAt(0) * 100 + id.length,
		binding: { repo: SHOP, path, symbol },
	};
}

/**
 * Create a relationship with an optional anchor.
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
		".gitignore": "plan.json\n",
		"infra/main.tf": MAIN_TF,
		"infra/modules/gw/main.tf": MODULE_GW_TF,
		"infra/helper.ts": "export const helper = 1;\n",
	});
	git(scratch, shop, "add", "-A");
	git(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", "fixtures");
	write(shop, { "infra/plan.json": JSON.stringify(PLAN) });
	register(scratch, { [SHOP]: shop });

	current(
		"Diagnostics",
		[
			part("Ok", 'azurerm_application_gateway.static_only.http_listener["only"]'),
			part("SharedIp", "azurerm_public_ip.shared"),
			part("DupBind", 'azurerm_application_gateway.ingress.http_listener["dup"]'),
			part("DynBind", 'azurerm_application_gateway.ingress.http_listener["dyn"]'),
			part("CompBnd", 'azurerm_application_gateway.ingress.frontend_port["https"]'),
			part("IntBind", 'azurerm_application_gateway.ingress.probe["prod-health"]'),
			part("ModDyn", 'module.gw.azurerm_application_gateway.ingress.http_listener["dyn"]'),
			part("ModComp", 'module.gw.azurerm_application_gateway.ingress.probe["prod-probe"]'),
			part(
				"PlanBlk",
				'module.remote.azurerm_application_gateway.ingress.http_listener["any-listener"]',
			),
			part("NoName", 'azurerm_application_gateway.ingress.sku["Standard_v2"]'),
			part("StatMis", 'azurerm_application_gateway.static_only.http_listener["missing"]'),
		],
		[
			edge("e1", ["Ok", "SharedIp"], "http", [
				"infra/main.tf",
				'azurerm_application_gateway.ingress.http_listener["dup"]',
			]),
			edge("e2", ["Ok", "SharedIp"], "http", [
				"infra/main.tf",
				'azurerm_application_gateway.ingress.http_listener["dyn"]',
			]),
			edge("e3", ["Ok", "SharedIp"], "http", [
				"infra/main.tf",
				'azurerm_application_gateway.ingress.probe["prod-health"]',
			]),
			edge("e4", ["Ok", "SharedIp"], "http", [
				"infra/modules/gw/main.tf",
				'azurerm_application_gateway.ingress.http_listener["dyn"]',
			]),
			edge("e5", ["Ok", "SharedIp"], "http", [
				"infra/modules/gw/main.tf",
				'azurerm_application_gateway.ingress.probe["prod-probe"]',
			]),
			edge("e6", ["Ok", "SharedIp"], "http", [
				"infra/main.tf",
				'azurerm_application_gateway.static_only.http_listener["missing"]',
			]),
			edge("e7", ["Ok", "SharedIp"], "http", [
				"infra/main.tf",
				'azurerm_application_gateway.ingress.sku["Standard_v2"]',
			]),
		],
	);

	current(
		"Bound shared",
		[
			part("DevPool", 'azurerm_application_gateway.ingress.backend_address_pool["device-pool"]'),
			part("PubPool", 'azurerm_application_gateway.ingress.backend_address_pool["public-pool"]'),
			part("SharedIp", "azurerm_public_ip.shared"),
		],
		[],
	);

	current(
		"Unbound shared",
		[
			part("Agw", "azurerm_application_gateway.ingress"),
			part("SharedIp", "azurerm_public_ip.shared"),
		],
		[],
	);

	const check = await import("#tests/runtime/support/code-check/pass.ts");
	const read = check.readStatesToCheck(vault, undefined);
	if (!read.ok) throw new Error("no documents");
	const plans = await check.readPlans(
		vault,
		[join(shop, "infra", "plan.json")],
		new AbortController().signal,
	);
	if (!plans.ok) throw new Error(`plan refused: ${plans.reason}`);
	outcome = await check.checkCode(vault, read.states, new AbortController().signal, plans.plans);
});

afterAll(() => {
	if (caller.ARCHBOARD_REPOS === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = caller.ARCHBOARD_REPOS;
	rmSync(scratch, { recursive: true, force: true });
});

test("duplicate literal names report missing-symbol warnings on bindings and anchors even alongside dynamic blocks and non-Terraform files", () => {
	const diagnostics = outcome.findings.filter((each) => each.model === "Diagnostics");
	const dupBind = diagnostics.find((each) => each.subject?.id === "DupBind");
	const dupAnc = diagnostics.find((each) => each.subject?.id === "e1");
	expect(dupBind).toMatchObject({ code: "BINDING_SYMBOL_MISSING", severity: "warning" });
	expect(dupAnc).toMatchObject({ code: "ANCHOR_SYMBOL_MISSING", severity: "warning" });
});

test("dynamic, computed-name, and plan-only nested selectors skip with expression-not-followed naming the file/line or plan path, without leaking constant_value", () => {
	const skips = outcome.skipped
		.filter((each) => each.model === "Diagnostics" && each.reason === "expression-not-followed")
		.map((each) => ({ id: each.subject?.id, detail: each.detail }))
		.toSorted((left, right) => {
			const a = left.id ?? "";
			const b = right.id ?? "";
			return a < b ? -1 : Number(a > b);
		});
	expect(skips).toEqual([
		{ id: "CompBnd", detail: "infra/main.tf:17-19" },
		{ id: "DynBind", detail: "infra/main.tf:11-16" },
		{ id: "IntBind", detail: "infra/main.tf:20-22" },
		{ id: "ModComp", detail: "infra/modules/gw/main.tf:8-10" },
		{ id: "ModDyn", detail: "infra/modules/gw/main.tf:2-7" },
		{ id: "PlanBlk", detail: "infra/plan.json" },
		{ id: "e2", detail: "infra/main.tf:11-16" },
		{ id: "e3", detail: "infra/main.tf:20-22" },
		{ id: "e4", detail: "infra/modules/gw/main.tf:2-7" },
		{ id: "e5", detail: "infra/modules/gw/main.tf:8-10" },
	]);
	expect(JSON.stringify(outcome)).not.toContain("plan-nested-secret");
});

test("static missing nested selectors, different dynamic block types, and blocks without name still warn", () => {
	const diagnostics = outcome.findings
		.filter((each) => each.model === "Diagnostics")
		.map((each) => `${each.code} ${each.subject?.id} ${each.severity}`)
		.toSorted();
	expect(diagnostics).toEqual([
		"ANCHOR_SYMBOL_MISSING e1 warning",
		"ANCHOR_SYMBOL_MISSING e6 warning",
		"ANCHOR_SYMBOL_MISSING e7 warning",
		"BINDING_SYMBOL_MISSING DupBind warning",
		"BINDING_SYMBOL_MISSING NoName warning",
		"BINDING_SYMBOL_MISSING StatMis warning",
	]);
});

test("two bound nested blocks referencing the same target each produce evidence while unbound blocks deduplicate on the resource", () => {
	const boundUndrawn = outcome.findings.filter(
		(each) => each.model === "Bound shared" && each.code === "RELATIONSHIP_UNDRAWN",
	);
	expect(
		boundUndrawn.flatMap((each) => (each.evidence ?? []).map((piece) => piece.from)).toSorted(),
	).toEqual(["DevPool", "PubPool"]);

	const unboundUndrawn = outcome.findings.filter(
		(each) => each.model === "Unbound shared" && each.code === "RELATIONSHIP_UNDRAWN",
	);
	expect(
		unboundUndrawn.flatMap((each) => (each.evidence ?? []).map((piece) => piece.from)),
	).toEqual(["Agw"]);
});
