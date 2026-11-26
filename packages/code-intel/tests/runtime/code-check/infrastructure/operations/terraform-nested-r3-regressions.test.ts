// Regressions for sol-loop Round 3 findings on Terraform nested-block bindings
// (ADR 0046, TASK-682): cross-root qualified join isolation, plan-only
// resource anchors not passing as source definitions, whole-resource reference
// anchors still warning ANCHOR_MISMATCH while preserving browser use lines,
// same-name distinct block types, and empty-name duplicate handling.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/code-check/operations/check.ts";
import { readFileOwners } from "#runtime/code-check/operations/file-owners.ts";
import { defaultSemanticPolicy } from "@archboard/model/policy";
import { document, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = mkdtempSync(join(tmpdir(), "archboard-tf-nested-r3-"));
const repoDir = join(scratch, "shop");
const vaultDir = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const REPO = "github.com/test/shop";

let outcome: CodeCheckOutcome;

const ROOT_A_TF = 'module "net" {\n  source = "../mod"\n}\n';
const ROOT_B_TF = 'module "net" {\n  source = "../mod"\n}\n';
const MOD_TF = [
	'resource "azurerm_subnet" "app" {',
	'  name = "app"',
	"}",
	'resource "azurerm_network_security_group" "nsg" {',
	'  name = "nsg"',
	"}",
	'resource "azurerm_subnet_network_security_group_association" "link" {',
	"  subnet_id                 = azurerm_subnet.app.id",
	"  network_security_group_id = azurerm_network_security_group.nsg.id",
	"}",
	'resource "azurerm_public_ip" "shared" {',
	'  name = "shared"',
	"}",
	'resource "azurerm_application_gateway" "ingress" {',
	'  name = "ingress"',
	"  backend_address_pool {",
	'    name  = "pool"',
	"    fqdns = [azurerm_public_ip.shared.fqdn]",
	"  }",
	"}",
].join("\n");

const INFRA_MAIN_TF = [
	'module "remote" {',
	'  source = "registry.terraform.io/acme/gw/azurerm"',
	"}",
	'resource "azurerm_application_gateway" "gw" {',
	'  name = "gw"',
	"  http_listener {",
	'    name = "device"',
	"  }",
	"  backend_address_pool {",
	'    name = "device"',
	"  }",
	"  http_listener {",
	'    name = ""',
	"  }",
	"  frontend_port {",
	'    name = ""',
	"  }",
	"  frontend_port {",
	'    name = ""',
	"  }",
	"}",
].join("\n");

const INFRA_CONSUMER_TF = [
	'resource "azurerm_log_analytics_workspace" "logs" {',
	'  name = "logs"',
	"}",
	'resource "azurerm_monitor_diagnostic_setting" "diag" {',
	'  name                       = "diag"',
	"  target_resource_id         = azurerm_application_gateway.gw.id",
	"  log_analytics_workspace_id = azurerm_log_analytics_workspace.logs.id",
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
								expressions: {},
							},
						],
					},
				},
			},
		},
	},
});

let nextOrder = 10;
const node = (id: string, name: string, path: string, symbol: string, parent?: string) => ({
	id,
	name,
	kind: "module",
	order: (nextOrder += 10),
	...(parent === undefined ? {} : { parent }),
	binding: { repo: REPO, path, symbol },
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
		"root-a/main.tf": ROOT_A_TF,
		"root-b/main.tf": ROOT_B_TF,
		"mod/main.tf": MOD_TF,
		"infra/main.tf": INFRA_MAIN_TF,
		"infra/consumer.tf": INFRA_CONSUMER_TF,
	});
	symlinkSync("main.tf", join(repoDir, "infra", "alias.tf"));
	git(scratch, repoDir, "init", "-q", "-b", "main");
	git(scratch, repoDir, "remote", "add", "origin", `https://${REPO}.git`);
	git(scratch, repoDir, "add", "-A");
	git(scratch, repoDir, "commit", "-q", "--no-gpg-sign", "-m", "fixture");
	write(repoDir, { "infra/plan.json": PLAN_JSON });
	register(scratch, { [REPO]: repoDir });

	document(vaultDir, "RegressionsR3", [
		{
			id: "v1",
			name: "Current",
			lifecycle: "current",
			content: {
				nodes: [
					node(
						"PoolA",
						"Pool A",
						"root-a",
						'module.net.azurerm_application_gateway.ingress.backend_address_pool["pool"]',
					),
					node("IpB", "IP B", "root-b", "module.net.azurerm_public_ip.shared"),
					node("SubB", "Subnet B", "root-b", "module.net.azurerm_subnet.app"),
					node("NsgB", "NSG B", "root-b", "module.net.azurerm_network_security_group.nsg"),
					node("RemMod", "Remote mod", "infra/main.tf", "module.remote"),
					node("Logs", "Logs", "infra/consumer.tf", "azurerm_log_analytics_workspace.logs"),
					node("GwBox", "Gateway", "infra/main.tf", "azurerm_application_gateway.gw"),
					node("GwCore", "GW core", "infra/main.tf", "azurerm_application_gateway.gw", "GwBox"),
					node(
						"GwLst",
						"GW listener",
						"infra/main.tf",
						'azurerm_application_gateway.gw.http_listener["device"]',
						"GwBox",
					),
					node(
						"GwPool",
						"GW pool",
						"infra/main.tf",
						'azurerm_application_gateway.gw.backend_address_pool["device"]',
						"GwBox",
					),
					node(
						"GwEmp",
						"GW empty unique",
						"infra/main.tf",
						'azurerm_application_gateway.gw.http_listener[""]',
						"GwBox",
					),
					node(
						"GwEmpD",
						"GW empty dup",
						"infra/main.tf",
						'azurerm_application_gateway.gw.frontend_port[""]',
						"GwBox",
					),
				],
				edges: [
					// R3 #1: anchor qualified in root-a must NOT borrow join from root-b.
					edge(
						"e1",
						"SubB",
						"NsgB",
						"mod/main.tf",
						"module.net.azurerm_subnet_network_security_group_association.link",
					),
					// R3 #3: plan-only remote resource in module-call file must NOT pass as a definition.
					edge(
						"e2",
						"RemMod",
						"Logs",
						"infra/main.tf",
						"module.remote.azurerm_application_gateway.ingress",
					),
					// R3 #4: citing a whole-resource reference in another .tf file still warns enclosing-resource ANCHOR_MISMATCH.
					edge("e3", "GwLst", "GwCore", "infra/consumer.tf", "azurerm_application_gateway.gw"),
				],
			},
		},
	]);

	// R3 #1 also needs a holder in root-a so root-a is a candidate root for e1; wait: e1's ends are SubB and NsgB!
	// Even better: test explicit root-a anchor via a root-a container or test when root-a is own root:
	const check = await import("#tests/runtime/support/code-check/pass.ts");
	const read = check.readStatesToCheck(vaultDir, undefined);
	if (!read.ok || read.states.length === 0) throw new Error("no documents");
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

function findingsFor(id: string) {
	return outcome.findings.filter((f) => f.subject?.id === id);
}

test("R3 #1, #3, #4 & R4 #3: plan-only resource is rejected, whole-resource reference warns while keeping browser line, and tracked symlink keeps highlight", async () => {
	expect(findingsFor("e2").map((f) => f.code)).toEqual(["ANCHOR_SYMBOL_MISSING"]);
	expect(findingsFor("e3").map((f) => f.code)).toEqual(["ANCHOR_MISMATCH"]);
	expect(findingsFor("e3")[0]?.message).toContain("enclosing Terraform resource");

	// Verify readFileOwners keeps the reference line (line 6) in infra/consumer.tf for e3.
	const canonicalVault = join(scratch, "canonical-vault");
	mkdirSync(join(canonicalVault, ".archboard"), { recursive: true });
	writeFileSync(
		join(canonicalVault, ".archboard/config.yaml"),
		Bun.YAML.stringify(defaultSemanticPolicy()),
	);
	writeFileSync(
		join(canonicalVault, "model.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Gateway",
			name: "Gateway",
			current: { id: "Current", name: "Built" },
		}),
	);
	writeFileSync(
		join(canonicalVault, "GwLst.module.json"),
		JSON.stringify({
			schemaVersion: 2,
			id: "Gateway#GwLst",
			name: "GW listener",
			kind: "module",
			order: 0,
			binding: {
				repo: REPO,
				path: "infra/main.tf",
				symbol: 'azurerm_application_gateway.gw.http_listener["device"]',
			},
			outgoing: [
				{
					id: "Gateway/GwLst#e3",
					order: 1,
					kind: "http",
					effect: "query",
					emphasis: "normal",
					to: "Gateway#GwCore",
					anchor: {
						repo: REPO,
						path: "infra/consumer.tf",
						symbol: "azurerm_application_gateway.gw",
					},
				},
				{
					id: "Gateway/GwLst#e4",
					order: 2,
					kind: "http",
					effect: "query",
					emphasis: "normal",
					to: "Gateway#GwCore",
					anchor: {
						repo: REPO,
						path: "infra/alias.tf",
						symbol: 'azurerm_application_gateway.gw.http_listener["device"]',
					},
				},
			],
		}),
	);
	writeFileSync(
		join(canonicalVault, "GwCore.module.json"),
		JSON.stringify({
			schemaVersion: 2,
			id: "Gateway#GwCore",
			name: "GW core",
			kind: "module",
			order: 1,
			binding: { repo: REPO, path: "infra/main.tf", symbol: "azurerm_application_gateway.gw" },
			outgoing: [],
		}),
	);
	const owners = await readFileOwners({
		vault: canonicalVault,
		repo: REPO,
		path: "infra/consumer.tf",
		model: "Gateway",
		signal: new AbortController().signal,
	});
	if (!owners.success) throw new Error(JSON.stringify(owners));
	expect(owners.owners.anchors).toContainEqual({
		subject: "Gateway/GwLst#e3",
		symbol: "azurerm_application_gateway.gw",
		line: 6,
	});
	const symlinkOwners = await readFileOwners({
		vault: canonicalVault,
		repo: REPO,
		path: "infra/alias.tf",
		model: "Gateway",
		signal: new AbortController().signal,
	});
	if (!symlinkOwners.success) throw new Error(JSON.stringify(symlinkOwners));
	expect(symlinkOwners.owners.anchors).toContainEqual({
		subject: "Gateway/GwLst#e4",
		symbol: 'azurerm_application_gateway.gw.http_listener["device"]',
		line: 6,
	});
});

test("R3 #1: judgeTerraformDeclaration refuses to borrow a join from another root when site.root conflicts", async () => {
	const { judgeTerraformDeclaration } =
		await import("#runtime/code-check/claims/operations/terraform-support.ts");
	const { createCodeFacts } = await import("#runtime/code-facts/services/reader.ts");
	const signal = new AbortController().signal;
	const facts = createCodeFacts().pass(signal);
	const files = new Set(["root-a/main.tf", "root-b/main.tf", "mod/main.tf"]);
	const checkout = { status: "read" as const, repo: REPO, root: repoDir, files };
	const subB = node("SubB", "Subnet B", "root-b", "module.net.azurerm_subnet.app");
	const nsgB = node("NsgB", "NSG B", "root-b", "module.net.azurerm_network_security_group.nsg");
	const verdict = await judgeTerraformDeclaration(
		{
			kind: "anchor",
			site: {
				model: "RegressionsR3",
				variant: "v1",
				file: "RegressionsR3.semantic.json",
				subject: { kind: "edge", id: "e1", name: "Subnet B -> NSG B" },
			},
			anchor: {
				repo: REPO,
				path: "mod/main.tf",
				symbol: "module.net.azurerm_subnet_network_security_group_association.link",
			},
			ends: [subB, nsgB],
			holders: [subB, nsgB],
			endHolders: [[subB], [nsgB]],
		},
		{
			path: "mod/main.tf",
			definition: {
				start: 7,
				end: 10,
				symbol: "azurerm_subnet_network_security_group_association.link",
			},
			address: "module.net.azurerm_subnet_network_security_group_association.link",
			root: "root-a",
		},
		undefined,
		{
			facts,
			checkout,
			boundFiles: () => ({ files: ["root-b/main.tf"], root: "root-b" }),
			holdingAt: async () => "elsewhere",
		},
	);
	expect(verdict).toBe("outside");
});

test("R3 #5 & R4 #5: cross-root evidence stays isolated, same-name distinct block types resolve, and empty-name uniqueness/duplicates behave consistently", () => {
	expect(
		outcome.findings.filter((f) => f.code === "RELATIONSHIP_UNDRAWN" && f.subject?.id === "IpB"),
	).toEqual([]);
	expect(findingsFor("GwLst")).toEqual([]);
	expect(findingsFor("GwPool")).toEqual([]);
	expect(findingsFor("GwEmp")).toEqual([]);
	expect(findingsFor("GwEmpD").map((f) => f.code)).toEqual(["BINDING_SYMBOL_MISSING"]);
	expect(findingsFor("GwEmpD")[0]?.message).toContain("ambiguous");
});
