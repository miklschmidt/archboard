// Regressions for sol-loop Round 5 findings on Terraform nested-block bindings
// (ADR 0046, TASK-682): direction-independent qualified anchor support across
// multiple roots calling the same local module, grapheme-cluster flush heredoc
// indentation, and Object.prototype keyword safety in address parsing.

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
	"  listener {",
	"    name = <<-EOF",
	" \u0301first",
	"  second",
	"    EOF",
	"  }",
	"  listener {",
	"    name = <<-EOF",
	" \u0301",
	"  second",
	"    EOF",
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
					node(
						"Grapheme",
						"Grapheme heredoc",
						"edges/main.tf",
						'constructor.gateway.listener["first\\n second\\n"]',
					),
					node(
						"GraphAcc",
						"Grapheme accent-only line heredoc",
						"edges/main.tf",
						'constructor.gateway.listener["\\n second\\n"]',
					),
				],
				edges: [
					edge("eFwd", "OtherA", "RuleB", "mod/main.tf", anchorSym),
					edge("eRev", "RuleB", "OtherA", "mod/main.tf", anchorSym),
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

test("R5 #3, #4, R6 #2: flush heredoc counts indent by code point, strips by grapheme cluster, and constructor resource type parses cleanly", () => {
	expect(findingsFor("CtorApi")).toEqual([]);
	expect(findingsFor("Grapheme")).toEqual([]);
	expect(findingsFor("GraphAcc")).toEqual([]);
});
