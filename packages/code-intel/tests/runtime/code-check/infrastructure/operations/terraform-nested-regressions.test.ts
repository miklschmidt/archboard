// Regressions for sol-loop Round 1 findings on Terraform nested-block bindings
// (ADR 0046, TASK-682): module-qualified and plan-only nested anchors, runner
// reach invariance, enclosing-resource anchor rejection with a whole-resource
// child, comments and HCL template escapes in literal names, and preserving
// non-infrastructure parent-child evidence ownership.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/code-check/operations/check.ts";
import { terraformRunners } from "#runtime/code-check/evidence/operations/terraform-runners.ts";
import { partCodesOf } from "#runtime/code-check/operations/part-code.ts";
import { createCodeFacts } from "#runtime/code-facts/services/reader.ts";
import { terraformConfiguration } from "#runtime/code-facts/terraform/operations/terraform-configuration.ts";
import { snapshotCheckoutAccess } from "@archboard/code-binding/resolution";
import { document, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = mkdtempSync(join(tmpdir(), "archboard-tf-nested-reg-"));
const repoDir = join(scratch, "shop");
const vaultDir = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const REPO = "github.com/test/shop";

let outcome: CodeCheckOutcome;

const MAIN_TF = [
	'module "left" {',
	"  count  = 1",
	'  source = "./gw"',
	"}",
	'module "right" {',
	"  count  = 1",
	'  source = "./gw"',
	"}",
	'module "remote" {',
	'  source = "registry.terraform.io/acme/gw/azurerm"',
	"}",
	'resource "azurerm_log_analytics_workspace" "logs" {',
	'  name = "logs"',
	"}",
	'resource "azurerm_application_gateway" "café" {',
	'  name = "cafe"',
	"  http_listener {",
	'    name = /* comment */ "$${env}"',
	"  }",
	"  http_listener {",
	'    name = "%%{if}"',
	"  }",
	"  http_listener {",
	'    name = ""',
	"  }",
	"  request_routing_rule {",
	'    name               = /* comment */ "route-env"',
	'    http_listener_name = /* comment */ "$${env}"',
	"  }",
	"  backend_address_pool {",
	'    name = "pool"',
	"  }",
	"}",
	'resource "azurerm_monitor_diagnostic_setting" "diag" {',
	'  name                       = "diag"',
	"  target_resource_id         = azurerm_application_gateway.café.id",
	"  log_analytics_workspace_id = azurerm_log_analytics_workspace.logs.id",
	"}",
].join("\n");

const GW_MAIN_TF = [
	'resource "azurerm_application_gateway" "ingress" {',
	'  name = "ingress"',
	"  http_listener {",
	'    name = "device"',
	"  }",
	"  backend_address_pool {",
	'    name = "device-pool"',
	"  }",
	"  request_routing_rule {",
	'    name                      = "device"',
	'    http_listener_name        = "device"',
	'    backend_address_pool_name = "device-pool"',
	"  }",
	"}",
].join("\n");

const RUNNERS_MAIN_TF = [
	'resource "azurerm_postgresql_server" "db" {',
	'  name = "db"',
	"}",
	'resource "azurerm_container_group" "app" {',
	'  name = "app"',
	"  container {",
	'    name = "frontend"',
	"    environment_variables = {",
	"      FRONTEND_DB = azurerm_postgresql_server.db.fqdn",
	"    }",
	"  }",
	"  container {",
	'    name = "worker"',
	"    environment_variables = {",
	"      WORKER_DB = azurerm_postgresql_server.db.fqdn",
	"    }",
	"  }",
	"}",
].join("\n");

const PLAN_JSON = JSON.stringify({
	configuration: {
		root_module: {
			module_calls: {
				remote: {
					module: {
						resources: [
							{
								mode: "managed",
								type: "azurerm_application_gateway",
								name: "ingress",
								expressions: {
									http_listener: [{ name: { constant_value: "secret-listener" } }],
								},
							},
						],
					},
				},
			},
		},
	},
});

let nextOrder = 10;

const node = (
	id: string,
	name: string,
	kind: string,
	path: string,
	symbol?: string,
	parent?: string,
) => ({
	id,
	name,
	kind,
	order: (nextOrder += 10),
	...(parent === undefined ? {} : { parent }),
	binding: { repo: REPO, path, ...(symbol === undefined ? {} : { symbol }) },
});

const edge = (id: string, from: string, to: string, path: string, symbol: string) => ({
	id,
	order: (nextOrder += 10),
	from,
	to,
	kind: "http",
	anchor: { repo: REPO, path, symbol },
});

beforeAll(async () => {
	mkdirSync(repoDir, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	write(repoDir, {
		".gitignore": "plan.json\n",
		"infra/main.tf": MAIN_TF,
		"infra/gw/main.tf": GW_MAIN_TF,
		"infra/other/unrelated.tf": 'resource "azurerm_resource_group" "rg" {\n  name = "rg"\n}\n',
		"runners/main.tf": RUNNERS_MAIN_TF,
		"src/target.ts": "export function ping(): number { return 1; }\n",
		"src/caller.ts":
			'import { ping } from "./target.ts";\nexport function run() { return ping(); }\n',
	});
	git(scratch, repoDir, "init", "-q", "-b", "main");
	git(scratch, repoDir, "remote", "add", "origin", `https://${REPO}.git`);
	git(scratch, repoDir, "add", "-A");
	git(scratch, repoDir, "commit", "-q", "--no-gpg-sign", "-m", "fixture");
	write(repoDir, { "infra/plan.json": PLAN_JSON });
	register(scratch, { [REPO]: repoDir });

	document(vaultDir, "Regressions", [
		{
			id: "v1",
			name: "Current",
			lifecycle: "current",
			content: {
				nodes: [
					node(
						"LeftL",
						"Left listener",
						"module",
						"infra",
						'module.left[0].azurerm_application_gateway.ingress.http_listener["device"]',
					),
					node(
						"LeftP",
						"Left pool",
						"module",
						"infra",
						'module.left[0].azurerm_application_gateway.ingress.backend_address_pool["device-pool"]',
					),
					node(
						"RightL",
						"Right listener",
						"module",
						"infra",
						'module.right[0].azurerm_application_gateway.ingress.http_listener["device"]',
					),
					node(
						"RightP",
						"Right pool",
						"module",
						"infra",
						'module.right[0].azurerm_application_gateway.ingress.backend_address_pool["device-pool"]',
					),
					node(
						"RemoteL",
						"Remote listener",
						"module",
						"infra",
						'module.remote.azurerm_application_gateway.ingress.http_listener["device"]',
					),
					node(
						"CafeBox",
						"Cafe gateway",
						"service",
						"infra/main.tf",
						"azurerm_application_gateway.café",
					),
					node(
						"CafeCore",
						"Cafe core",
						"module",
						"infra/main.tf",
						"azurerm_application_gateway.café",
						"CafeBox",
					),
					node(
						"CafeEnv",
						"Cafe env listener",
						"module",
						"infra/main.tf",
						'azurerm_application_gateway.café.http_listener["${env}"]',
						"CafeBox",
					),
					node(
						"CafeDir",
						"Cafe dir listener",
						"module",
						"infra/main.tf",
						'azurerm_application_gateway.café.http_listener["%{if}"]',
						"CafeBox",
					),
					node(
						"CafeEmp",
						"Cafe empty listener",
						"module",
						"infra/main.tf",
						'azurerm_application_gateway.café.http_listener[""]',
						"CafeBox",
					),
					node(
						"CafePool",
						"Cafe pool",
						"module",
						"infra/main.tf",
						'azurerm_application_gateway.café.backend_address_pool["pool"]',
						"CafeBox",
					),
					node("Logs", "Logs", "service", "infra/main.tf", "azurerm_log_analytics_workspace.logs"),
					node("TsPar", "TS parent", "service", "src/caller.ts"),
					node("TsChd", "TS child", "module", "src/caller.ts", undefined, "TsPar"),
					node("TsTgt", "TS target", "module", "src/target.ts"),
				],
				edges: [
					edge(
						"e1",
						"LeftL",
						"LeftP",
						"infra/gw/main.tf",
						'module.left[0].azurerm_application_gateway.ingress.request_routing_rule["device"]',
					),
					edge(
						"e2",
						"RightL",
						"RightP",
						"infra/gw/main.tf",
						'module.left[0].azurerm_application_gateway.ingress.request_routing_rule["device"]',
					),
					edge(
						"e3",
						"LeftL",
						"LeftP",
						"infra/other/unrelated.tf",
						'module.left[0].azurerm_application_gateway.ingress.request_routing_rule["device"]',
					),
					edge(
						"e4",
						"RemoteL",
						"Logs",
						"infra/main.tf",
						'module.remote.azurerm_application_gateway.ingress.http_listener["device"]',
					),
					edge("e5", "CafeEnv", "CafeCore", "infra/main.tf", "azurerm_application_gateway.café"),
					edge(
						"e6",
						"CafeEnv",
						"CafePool",
						"infra/main.tf",
						'azurerm_application_gateway.café.request_routing_rule["route-env"]',
					),
					edge("e7", "CafeCore", "Logs", "infra/main.tf", "azurerm_application_gateway.café"),
				],
			},
		},
	]);

	const check = await import("#tests/runtime/support/code-check/pass.ts");
	const read = check.readStatesToCheck(vaultDir, undefined);
	if (!read.ok || read.states.length === 0)
		throw new Error(`no documents: ${JSON.stringify(read)}`);
	const plans = await check.readPlans(
		vaultDir,
		[join(repoDir, "infra", "plan.json")],
		new AbortController().signal,
	);
	if (!plans.ok) throw new Error(`plan refused: ${plans.reason}`);
	outcome = await check.checkCode(vaultDir, read.states, new AbortController().signal, plans.plans);
});

afterAll(() => {
	if (caller.ARCHBOARD_REPOS === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = caller.ARCHBOARD_REPOS;
	rmSync(scratch, { recursive: true, force: true });
});

test("module-qualified and plan-only nested anchors preserve module context and report missing files", () => {
	const findings = outcome.findings.map((f) => ({ code: f.code, subject: f.subject?.id }));
	expect(findings.filter((f) => f.subject === "e1")).toEqual([]);
	expect(findings).toContainEqual({ code: "ANCHOR_MISMATCH", subject: "e2" });
	expect(findings).toContainEqual({ code: "ANCHOR_SYMBOL_MISSING", subject: "e3" });
	expect(findings.filter((f) => f.subject === "e4")).toEqual([]);
	expect(outcome.skipped).toContainEqual(
		expect.objectContaining({
			reason: "expression-not-followed",
			detail: "infra/plan.json",
			subject: expect.objectContaining({ id: "e4" }),
		}),
	);
	expect(JSON.stringify(outcome)).not.toContain("secret-listener");
});

test("enclosing whole-resource anchor warns even with a whole-resource child, comments and escapes resolve, and TS ownership is preserved", () => {
	const findings = outcome.findings.map((f) => ({ code: f.code, subject: f.subject?.id }));
	expect(findings).toContainEqual({ code: "ANCHOR_MISMATCH", subject: "e5" });
	expect(findings.filter((f) => f.subject === "e7")).toEqual([]);
	expect(findings.filter((f) => f.subject === "CafeEnv")).toEqual([]);
	expect(findings.filter((f) => f.subject === "CafeDir")).toEqual([]);
	expect(findings.filter((f) => f.subject === "e6")).toEqual([]);
	expect(findings).toContainEqual({ code: "BINDING_SYMBOL_MISSING", subject: "CafeEmp" });
	expect(outcome.skipped.filter((s) => s.subject?.id === "CafeEmp")).toEqual([]);

	const tsUndrawn = outcome.findings.filter(
		(f) => f.code === "RELATIONSHIP_UNDRAWN" && f.subject?.id === "TsTgt",
	);
	expect(tsUndrawn.map((f) => f.message).join("\n")).toContain('"TS parent"');
	expect(tsUndrawn.map((f) => f.message).join("\n")).toContain('"TS child"');
});

test("runner evidence keeps resource-level reach invariance with two named container blocks", async () => {
	const signal = new AbortController().signal;
	const facts = createCodeFacts().pass(signal);
	const files = new Set(["runners/main.tf"]);
	const config = await terraformConfiguration(facts, { root: repoDir, files }, "runners");
	expect(config.reached("azurerm_container_group.app").map(({ link }) => link.line)).toEqual([9]);

	const runnerNodes = [
		node("app", "App", "service", "runners/main.tf", "azurerm_container_group.app"),
		node("db", "DB", "service", "runners/main.tf", "azurerm_postgresql_server.db"),
	];
	const snapshot = await snapshotCheckoutAccess({
		vault: vaultDir,
		signal,
		bindings: runnerNodes.map((entry) => entry.binding),
		timeoutMs: null,
	});
	const checkouts = new Map([[REPO, { status: "read" as const, root: repoDir, files }]]);
	const codes = await partCodesOf(runnerNodes, {
		snapshot,
		checkouts,
		refs: { byRef: new Map(), byRoot: new Map() },
		searchOf: (checkout) => ({ facts, checkout, readAsText: () => {} }),
	});
	const runners = await terraformRunners(codes, facts);
	expect(runners).toHaveLength(1);
	const reachedSettings = runners[0]?.settings
		.filter((setting) => setting.reaches.length > 0)
		.map((setting) => setting.name);
	expect(reachedSettings).toEqual(["FRONTEND_DB"]);
});
