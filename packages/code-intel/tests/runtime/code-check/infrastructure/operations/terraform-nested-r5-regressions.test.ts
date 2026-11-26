// Regressions for Terraform nested-block bindings (ADR 0046, TASK-682):
// direction-independent qualified anchor support across multiple roots calling
// the same local module, Object.prototype keyword safety in address parsing,
// and indexed/chained module-output reference anchors.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/code-check/operations/check.ts";
import { document, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = mkdtempSync(join(tmpdir(), "archboard-tf-nested-r5-"));
const repoDir = join(scratch, "shop");
const vaultDir = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const REPO = "github.com/test/shop";

let outcome: CodeCheckOutcome;

const ROOT_A_TF = [
	'module "gateway" {',
	'  source = "../mod"',
	"}",
	'module "other" {',
	'  source = "../other"',
	"}",
].join("\n");

const ROOT_B_TF = ['module "gateway" {', '  source = "../mod"', "}"].join("\n");

const OTHER_TF = 'resource "azurerm_resource_group" "rg" {\n  name = "rg"\n}\n';

const MOD_TF = [
	'resource "azurerm_application_gateway" "ingress" {',
	'  name = "ingress"',
	"  http_listener {",
	'    name = "api"',
	"  }",
	"  request_routing_rule {",
	'    name               = "route-api"',
	'    http_listener_name = "api"',
	"  }",
	"}",
].join("\n");

const EDGE_CASES_TF = [
	'resource "constructor" "gateway" {',
	'  name = "ctor"',
	"  listener {",
	'    name = "api"',
	"  }",
	"}",
].join("\n");

const OUT_TF = [
	'module "api" {',
	"  count  = 1",
	'  source = "../other"',
	"}",
	'resource "aws_lambda_function" "caller" {',
	'  function_name = "caller"',
	"  environment {",
	"    variables = {",
	'      API_URL   = module.api[0].endpoint["blue"]',
	'      API_CHAIN = module.api[0].endpoint["blue"][0]',
	"    }",
	"  }",
	"}",
].join("\n");

let nextOrder = 10;
const node = (id: string, name: string, path: string, symbol: string) => ({
	id,
	name,
	kind: "module",
	order: (nextOrder += 10),
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

function findingsFor(id: string) {
	return outcome.findings.filter((f) => f.subject?.id === id);
}

beforeAll(async () => {
	mkdirSync(repoDir, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	write(repoDir, {
		"root-a/main.tf": ROOT_A_TF,
		"root-b/main.tf": ROOT_B_TF,
		"other/main.tf": OTHER_TF,
		"mod/main.tf": MOD_TF,
		"edges/main.tf": EDGE_CASES_TF,
		"out/main.tf": OUT_TF,
	});
	git(scratch, repoDir, "init", "-q", "-b", "main");
	git(scratch, repoDir, "remote", "add", "origin", `https://${REPO}.git`);
	git(scratch, repoDir, "add", "-A");
	git(scratch, repoDir, "commit", "-q", "--no-gpg-sign", "-m", "fixture");
	register(scratch, { [REPO]: repoDir });

	const anchorSym = 'module.gateway.azurerm_application_gateway.ingress.http_listener["api"]';
	document(vaultDir, "RegressionsR5", [
		{
			id: "v1",
			name: "Current",
			lifecycle: "current",
			content: {
				nodes: [
					node("OtherA", "Other A", "root-a", "module.other.azurerm_resource_group.rg"),
					node(
						"RuleB",
						"Rule B",
						"root-b",
						'module.gateway.azurerm_application_gateway.ingress.request_routing_rule["route-api"]',
					),
					node("CtorApi", "Ctor API", "edges/main.tf", 'constructor.gateway.listener["api"]'),
					node("OutCall", "Out Caller", "out/main.tf", "aws_lambda_function.caller"),
					node("OutApi", "Out Api", "out", "module.api"),
				],
				edges: [
					edge("eFwd", "OtherA", "RuleB", "mod/main.tf", anchorSym),
					edge("eRev", "RuleB", "OtherA", "mod/main.tf", anchorSym),
					edge("eOut", "OutCall", "OutApi", "out/main.tf", 'module.api[0].endpoint["blue"]'),
					edge("eOutCh", "OutCall", "OutApi", "out/main.tf", 'module.api[0].endpoint["blue"][0]'),
					edge("eNumRej", "CtorApi", "OutApi", "edges/main.tf", "constructor.gateway.listener[0]"),
				],
			},
		},
	]);

	const check = await import("#tests/runtime/support/code-check/pass.ts");
	const read = check.readStatesToCheck(vaultDir, undefined);
	if (!read.ok || read.states.length === 0) throw new Error("no documents");
	outcome = await check.checkCode(vaultDir, read.states, new AbortController().signal);
});

afterAll(() => {
	if (caller.ARCHBOARD_REPOS === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = caller.ARCHBOARD_REPOS;
	rmSync(scratch, { recursive: true, force: true });
});

test("R5 #1: qualified anchor support across two roots calling the same local module is direction-independent", () => {
	expect(findingsFor("eFwd")).toEqual([]);
	expect(findingsFor("eRev")).toEqual([]);
});

test("R5 #4 & R7/R8: constructor resource type parses cleanly and indexed/chained module-output anchors resolve while numeric nested-block selectors stay invalid", () => {
	expect(findingsFor("CtorApi")).toEqual([]);
	expect(findingsFor("eOut")).toEqual([]);
	expect(findingsFor("eOutCh")).toEqual([]);
	expect(findingsFor("eNumRej").map((f) => f.code)).toEqual(["ANCHOR_SYMBOL_MISSING"]);
});
