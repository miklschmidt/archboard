// Regressions for sol-loop Round 2 findings on Terraform nested-block bindings
// (ADR 0046, TASK-682): wrong-module definition anchor rejection, unrelated
// root-file anchor rejection, distinct instance key ownership preservation,
// parenthesized and heredoc literal names + duplicate detection, Unicode NFD
// identifiers, readFileOwners qualified anchor lines, and enclosing-resource
// ANCHOR_MISMATCH messaging.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/code-check/operations/check.ts";
import { readFileOwners } from "#runtime/code-check/operations/file-owners.ts";
import { defaultSemanticPolicy } from "@archboard/model/policy";
import { document, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = mkdtempSync(join(tmpdir(), "archboard-tf-nested-r2-"));
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
	'resource "aws_sqs_queue" "jobs" {',
	'  name = "jobs"',
	"}",
	'resource "aws_lambda_function" "api" {',
	"  count         = 2",
	'  function_name = "api"',
	"  environment {",
	"    variables = {",
	"      QUEUE_URL = aws_sqs_queue.jobs.url",
	"    }",
	"  }",
	"}",
	'resource "azurerm_application_gateway" "cafe\u0301" {',
	'  name = "nfd"',
	"  http_listener {",
	'    name = ("dup")',
	"  }",
	"  http_listener {",
	'    name = "dup"',
	"  }",
	"  http_listener {",
	"    name = <<-EOF",
	"      indented",
	"        nested",
	"    EOF",
	"  }",
	"  http_listener {",
	"    name = <<EOF",
	"raw",
	"EOF",
	"  }",
	"  http_listener {",
	"    name = <<-EOF",
	"      hello $${world} %%{if}",
	"    EOF",
	"  }",
	"  http_listener {",
	"    name = (<<-EOF",
	"      paren-heredoc",
	"    EOF",
	"    )",
	"  }",
	"  http_listener {",
	"    name = <<-EOF",
	"      dyn-${var.env}",
	"    EOF",
	"  }",
	"}",
].join("\n");

const GW_TF = [
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
									http_listener: [{ name: { constant_value: "r2-secret" } }],
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
const node = (id: string, name: string, path: string, symbol: string, parent?: string) => ({
	id,
	name,
	kind: "module",
	order: (nextOrder += 10),
	...(parent === undefined ? {} : { parent }),
	binding: { repo: REPO, path, symbol },
});
const edge = (id: string, from: string, to: string, path?: string, symbol?: string) => ({
	id,
	order: (nextOrder += 10),
	from,
	to,
	kind: "http",
	...(path !== undefined && symbol !== undefined ? { anchor: { repo: REPO, path, symbol } } : {}),
});

beforeAll(async () => {
	mkdirSync(repoDir, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	write(repoDir, {
		".gitignore": "plan.json\n",
		"infra/main.tf": MAIN_TF,
		"infra/unrelated.tf": 'resource "azurerm_resource_group" "rg" {\n  name = "rg"\n}\n',
		"infra/gw/main.tf": GW_TF,
	});
	git(scratch, repoDir, "init", "-q", "-b", "main");
	git(scratch, repoDir, "remote", "add", "origin", `https://${REPO}.git`);
	git(scratch, repoDir, "add", "-A");
	git(scratch, repoDir, "commit", "-q", "--no-gpg-sign", "-m", "fixture");
	write(repoDir, { "infra/plan.json": PLAN_JSON });
	register(scratch, { [REPO]: repoDir });

	document(vaultDir, "RegressionsR2", [
		{
			id: "v1",
			name: "Current",
			lifecycle: "current",
			content: {
				nodes: [
					node(
						"RightL",
						"Right listener",
						"infra",
						'module.right[0].azurerm_application_gateway.ingress.http_listener["device"]',
					),
					node(
						"RightP",
						"Right pool",
						"infra",
						'module.right[0].azurerm_application_gateway.ingress.backend_address_pool["device-pool"]',
					),
					node(
						"LeftL",
						"Left listener",
						"infra",
						'module.left[0].azurerm_application_gateway.ingress.http_listener["device"]',
					),
					node(
						"LeftP",
						"Left pool",
						"infra",
						'module.left[0].azurerm_application_gateway.ingress.backend_address_pool["device-pool"]',
					),
					node(
						"RemL",
						"Remote listener",
						"infra",
						'module.remote.azurerm_application_gateway.ingress.http_listener["device"]',
					),
					node("Api0", "API zero", "infra/main.tf", "aws_lambda_function.api[0]"),
					node("Api1", "API one", "infra/main.tf", "aws_lambda_function.api[1]", "Api0"),
					node("Jobs", "Jobs", "infra/main.tf", "aws_sqs_queue.jobs"),
					node("NfdBox", "NFD gateway", "infra/main.tf", "azurerm_application_gateway.cafe\u0301"),
					node(
						"NfdWhole",
						"NFD core",
						"infra/main.tf",
						"azurerm_application_gateway.cafe\u0301",
						"NfdBox",
					),
					node(
						"NfdDup",
						"NFD dup",
						"infra/main.tf",
						'azurerm_application_gateway.cafe\u0301.http_listener["dup"]',
						"NfdBox",
					),
					node(
						"NfdInd",
						"NFD indented",
						"infra/main.tf",
						'azurerm_application_gateway.cafe\u0301.http_listener["indented\\n  nested\\n"]',
						"NfdBox",
					),
					node(
						"NfdRaw",
						"NFD raw",
						"infra/main.tf",
						'azurerm_application_gateway.cafe\u0301.http_listener["raw\\n"]',
						"NfdBox",
					),
					node(
						"NfdEsc",
						"NFD escaped",
						"infra/main.tf",
						'azurerm_application_gateway.cafe\u0301.http_listener["hello ${world} %{if}\\n"]',
						"NfdBox",
					),
					node(
						"NfdPar",
						"NFD paren heredoc",
						"infra/main.tf",
						'azurerm_application_gateway.cafe\u0301.http_listener["paren-heredoc\\n"]',
						"NfdBox",
					),
				],
				edges: [
					// R2 #1: exact definition of module.left cited on a module.right relationship must warn ANCHOR_MISMATCH.
					edge(
						"e1",
						"RightL",
						"RightP",
						"infra/gw/main.tf",
						'module.left[0].azurerm_application_gateway.ingress.http_listener["device"]',
					),
					// R2 #2A: unrelated file in Terraform root citing a local-module symbol must warn ANCHOR_SYMBOL_MISSING.
					edge(
						"e2",
						"LeftL",
						"LeftP",
						"infra/unrelated.tf",
						'module.left[0].azurerm_application_gateway.ingress.request_routing_rule["device"]',
					),
					// R2 #2B: unrelated file in Terraform root citing a plan-only remote symbol must warn ANCHOR_SYMBOL_MISSING (not skip).
					edge(
						"e3",
						"RemL",
						"Jobs",
						"infra/unrelated.tf",
						'module.remote.azurerm_application_gateway.ingress.http_listener["device"]',
					),
					// R2 #4: draw queue edge only on child api[1]; parent api[0] keeps its own undrawn evidence.
					edge("e4", "Api1", "Jobs"),
					// R2 #8: valid qualified anchor on infra/gw/main.tf for readFileOwners.
					edge(
						"e5",
						"LeftL",
						"LeftP",
						"infra/gw/main.tf",
						'module.left[0].azurerm_application_gateway.ingress.request_routing_rule["device"]',
					),
					// R2 #9: enclosing-resource anchor with whole-resource child explains enclosing resource.
					edge(
						"e6",
						"NfdRaw",
						"NfdWhole",
						"infra/main.tf",
						"azurerm_application_gateway.cafe\u0301",
					),
				],
			},
		},
	]);

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

test("R2 #1, #2, #9: wrong-module definition anchor, unrelated root-file anchors, and enclosing-resource message", () => {
	const bySubject = (id: string) => outcome.findings.filter((f) => f.subject?.id === id);
	expect(bySubject("e1").map((f) => f.code)).toEqual(["ANCHOR_MISMATCH"]);
	expect(bySubject("e2").map((f) => f.code)).toEqual(["ANCHOR_SYMBOL_MISSING"]);
	expect(bySubject("e3").map((f) => f.code)).toEqual(["ANCHOR_SYMBOL_MISSING"]);
	expect(outcome.skipped.filter((s) => s.subject?.id === "e3")).toEqual([]);
	expect(bySubject("e5")).toEqual([]);
	const enclosing = bySubject("e6");
	expect(enclosing.map((f) => f.code)).toEqual(["ANCHOR_MISMATCH"]);
	expect(enclosing[0]?.message).toContain("enclosing Terraform resource");
	expect(JSON.stringify(outcome)).not.toContain("r2-secret");
});

test("R2 #4, #6, #7: distinct instance keys preserve parent evidence, parens/heredocs resolve and detect duplicates, and NFD identifiers parse", () => {
	const jobsUndrawn = outcome.findings.filter(
		(f) => f.code === "RELATIONSHIP_UNDRAWN" && f.subject?.id === "Jobs",
	);
	expect(jobsUndrawn.map((f) => f.message).join("\n")).toContain('"API zero"');

	const dup = outcome.findings.find((f) => f.subject?.id === "NfdDup");
	expect(dup?.code).toBe("BINDING_SYMBOL_MISSING");
	expect(dup?.message).toContain("ambiguous");

	for (const id of ["NfdInd", "NfdRaw", "NfdEsc", "NfdPar"]) {
		expect(outcome.findings.filter((f) => f.subject?.id === id)).toEqual([]);
	}
});

test("R2 #8: readFileOwners resolves qualified Terraform nested-block anchor lines in local module files", async () => {
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
		join(canonicalVault, "LeftL.module.json"),
		JSON.stringify({
			schemaVersion: 2,
			id: "Gateway#LeftL",
			name: "Left listener",
			kind: "module",
			order: 0,
			binding: {
				repo: REPO,
				path: "infra",
				symbol: 'module.left[0].azurerm_application_gateway.ingress.http_listener["device"]',
			},
			outgoing: [
				{
					id: "Gateway/LeftL#e5",
					order: 1,
					kind: "http",
					effect: "query",
					emphasis: "normal",
					to: "Gateway#LeftP",
					anchor: {
						repo: REPO,
						path: "infra/gw/main.tf",
						symbol:
							'module.left[0].azurerm_application_gateway.ingress.request_routing_rule["device"]',
					},
				},
			],
		}),
	);
	writeFileSync(
		join(canonicalVault, "LeftP.module.json"),
		JSON.stringify({
			schemaVersion: 2,
			id: "Gateway#LeftP",
			name: "Left pool",
			kind: "module",
			order: 1,
			binding: {
				repo: REPO,
				path: "infra",
				symbol:
					'module.left[0].azurerm_application_gateway.ingress.backend_address_pool["device-pool"]',
			},
			outgoing: [],
		}),
	);

	const result = await readFileOwners({
		vault: canonicalVault,
		repo: REPO,
		path: "infra/gw/main.tf",
		model: "Gateway",
		signal: new AbortController().signal,
	});
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.owners.anchors).toContainEqual({
		subject: "Gateway/LeftL#e5",
		symbol: 'module.left[0].azurerm_application_gateway.ingress.request_routing_rule["device"]',
		line: 9,
	});
});
