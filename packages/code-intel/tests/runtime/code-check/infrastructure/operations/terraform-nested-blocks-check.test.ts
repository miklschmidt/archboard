// End-to-end verification of Terraform depth-1 named nested blocks across
// code-check (bindings, anchors, module-call containment, resource-level
// invariance) and code browser file owners (TASK-682.01).

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as CheckModule from "#tests/runtime/support/code-check/pass.ts";
import type { readFileOwners as ReadFileOwnersFn } from "#runtime/code-check/operations/file-owners.ts";
import { terraformRunners } from "#runtime/code-check/evidence/operations/terraform-runners.ts";
import { partCodesOf, type ReadPart } from "#runtime/code-check/operations/part-code.ts";
import { readRefCodes } from "#runtime/code-check/operations/ref-code.ts";
import { createCodeFacts } from "#runtime/code-facts/services/reader.ts";
import { defaultSemanticPolicy } from "@archboard/model/policy";
import { document, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = mkdtempSync(join(tmpdir(), "archboard-tf-nested-check-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
const canonicalVault = join(scratch, "canonical-vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";

let check: typeof CheckModule;
let readFileOwners: typeof ReadFileOwnersFn;

const GATEWAY_MAIN = [
	'resource "azurerm_application_gateway" "ingress" {',
	"  http_listener {",
	'    name = "device-https"',
	"    port = 443",
	"  }",
	"  http_listener {",
	'    name = "example.com"',
	"    port = 80",
	"  }",
	"  http_listener {",
	'    name = "a \\"b\\"/c d"',
	"    port = 8443",
	"  }",
	"  http_listener {",
	'    name = "dup"',
	"  }",
	"  http_listener {",
	'    name = "dup"',
	"  }",
	"}",
	"",
	'module "gw" {',
	'  source = "./modules/gw"',
	"}",
	"",
].join("\n");

const MODULE_GW = [
	'resource "azurerm_application_gateway" "ingress" {',
	"  http_listener {",
	'    name = "device-https"',
	"    port = 443",
	"  }",
	"  http_listener {",
	'    name = "example.com"',
	"    port = 80",
	"  }",
	"}",
	"",
].join("\n");

/**
 * Render an invariance fixture with depth-1 `env`, `container`, and joining
 * declaration nested blocks that either carry or omit literal `name` values.
 * @param named Whether nested blocks carry literal `name` attributes.
 * @returns Files map for `invariance/`.
 */
function invarianceFiles(named: boolean): Record<string, string> {
	const containerName = named ? '    name = "api-container"' : "    cpu  = 1";
	const filterName = named ? '    name = "jobs-filter"' : '    pattern = "{}"';
	return {
		"invariance/main.tf": [
			'resource "azurerm_postgresql_flexible_server" "db" {',
			'  name = "shop-db"',
			"}",
			'resource "azurerm_container_group" "api" {',
			"  container {",
			containerName,
			"    environment_variables = {",
			"      DB_HOST = azurerm_postgresql_flexible_server.db.fqdn",
			"    }",
			"  }",
			"  env {",
			...(named ? ['    name  = "EXTRA_HOST"'] : []),
			"    value = azurerm_postgresql_flexible_server.db.fqdn",
			"  }",
			"}",
			'resource "aws_sqs_queue" "jobs" {',
			'  name = "jobs"',
			"}",
			'resource "aws_lambda_function" "worker" {',
			'  function_name = "worker"',
			"  environment {",
			"    variables = {",
			"      JOBS_URL = aws_sqs_queue.jobs.url",
			"    }",
			"  }",
			"  vpc_config {",
			...(named ? ['    name = "worker-vpc"'] : []),
			"    subnet_ids = []",
			"  }",
			"}",
			'resource "aws_lambda_event_source_mapping" "trigger" {',
			"  event_source_arn = aws_sqs_queue.jobs.arn",
			"  function_name    = aws_lambda_function.worker.arn",
			"  filter_criteria {",
			filterName,
			"  }",
			"}",
			"",
		].join("\n"),
		"invariance/app/api.ts": 'export const db = process.env["DB_HOST"];\n',
	};
}

/**
 * Build a module node for a legacy board fixture.
 * @param id Node id.
 * @param symbol Bound Terraform symbol.
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

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, shop, "init", "-q", "-b", "main");
	git(scratch, shop, "remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		"infra/main.tf": GATEWAY_MAIN,
		"infra/modules/gw/main.tf": MODULE_GW,
		...invarianceFiles(true),
	});
	git(scratch, shop, "add", "-A");
	git(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", "fixtures");
	register(scratch, { [SHOP]: shop });

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
	const writeModule = (
		id: string,
		binding: { path: string; symbol?: string },
		outgoing: readonly object[] = [],
	) => {
		writeFileSync(
			join(canonicalVault, `${id}.module.json`),
			JSON.stringify({
				schemaVersion: 2,
				id: `Gateway#${id}`,
				name: id,
				kind: "module",
				order: 0,
				binding: { repo: SHOP, ...binding },
				outgoing,
			}),
		);
	};
	writeModule(
		"DevLst",
		{
			path: "infra/main.tf",
			symbol: 'azurerm_application_gateway.ingress["blue"].http_listener["device-https"]',
		},
		[
			{
				id: "Gateway/DevLst#Edge",
				order: 1,
				kind: "http",
				effect: "query",
				emphasis: "normal",
				to: "Gateway#HostLst",
				anchor: {
					repo: SHOP,
					path: "infra/main.tf",
					symbol: 'azurerm_application_gateway.ingress.http_listener["a \\"b\\"/c d"]',
				},
			},
		],
	);
	writeModule("HostLst", {
		path: "infra",
		symbol: 'azurerm_application_gateway.ingress.http_listener["example.com"]',
	});
	writeModule("ModHost", {
		path: "infra",
		symbol: 'module.gw[0].azurerm_application_gateway.ingress.http_listener["example.com"]',
	});

	check = await import("#tests/runtime/support/code-check/pass.ts");
	({ readFileOwners } = await import("#runtime/code-check/operations/file-owners.ts"));
});

afterAll(() => {
	if (caller.ARCHBOARD_REPOS === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = caller.ARCHBOARD_REPOS;
	rmSync(scratch, { recursive: true, force: true });
});

test("code-check binds valid depth-1 nested blocks, rejects invalid selectors, and lets a module-bound container hold nested-block anchors", async () => {
	document(vault, "GatewayCheck", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part(
						"pRoot",
						'azurerm_application_gateway.ingress["blue"].http_listener["device-https"]',
					),
					part("pDot", 'azurerm_application_gateway.ingress.http_listener["example.com"]'),
					part("pEsc", 'azurerm_application_gateway.ingress.http_listener["a \\"b\\"/c d"]'),
					part(
						"pModBlk",
						'module.gw[0].azurerm_application_gateway.ingress["x"].http_listener["device-https"]',
					),
					part("pModCal", "module.gw"),
					part("pBadIdx", "azurerm_application_gateway.ingress.http_listener[0]"),
					part("pBadDup", 'azurerm_application_gateway.ingress.http_listener["dup"]'),
				],
				edges: [
					{
						id: "eModAnc",
						order: 10,
						from: "pModCal",
						to: "pDot",
						kind: "http",
						anchor: {
							repo: SHOP,
							path: "infra/modules/gw/main.tf",
							symbol: 'azurerm_application_gateway.ingress.http_listener["example.com"]',
						},
					},
					{
						id: "eEscAnc",
						order: 20,
						from: "pEsc",
						to: "pRoot",
						kind: "http",
						anchor: {
							repo: SHOP,
							path: "infra/main.tf",
							symbol: 'azurerm_application_gateway.ingress[0].http_listener["a \\"b\\"/c d"]',
						},
					},
				],
			},
		},
	]);
	const read = check.readStatesToCheck(vault, undefined);
	if (!read.ok) throw new Error("no documents");
	const outcome = await check.checkCode(vault, read.states, new AbortController().signal);
	const codes = outcome.findings
		.map((each) => `${each.code} ${each.subject?.id} ${each.severity}`)
		.toSorted();
	expect(codes).toEqual([
		"BINDING_SYMBOL_MISSING pBadDup warning",
		"BINDING_SYMBOL_MISSING pBadIdx warning",
	]);
});

test("invariance: named nested blocks with no nested-block bindings produce identical findings, evidence, and runners", async () => {
	const withoutDir = join(scratch, "shop-without");
	const withVault = join(scratch, "vault-with");
	const withoutVault = join(scratch, "vault-without");
	mkdirSync(withoutDir, { recursive: true });
	git(scratch, withoutDir, "init", "-q", "-b", "main");
	git(scratch, withoutDir, "remote", "add", "origin", "https://github.com/test/inv-without.git");
	write(withoutDir, invarianceFiles(false));
	git(scratch, withoutDir, "add", "-A");
	git(scratch, withoutDir, "commit", "-q", "--no-gpg-sign", "-m", "without block names");

	const makeVariant = (repoName: string) => [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current" as const,
			content: {
				nodes: [
					{
						id: "pDb",
						name: "DB",
						kind: "module",
						order: 10,
						binding: {
							repo: repoName,
							path: "invariance",
							symbol: "azurerm_postgresql_flexible_server.db",
						},
					},
					{
						id: "pApi",
						name: "API",
						kind: "module",
						order: 20,
						binding: {
							repo: repoName,
							path: "invariance",
							symbol: "azurerm_container_group.api",
						},
					},
					{
						id: "pApiCode",
						name: "API Code",
						kind: "module",
						order: 25,
						parent: "pApi",
						binding: { repo: repoName, path: "invariance/app/api.ts" },
					},
					{
						id: "pJobs",
						name: "Jobs",
						kind: "module",
						order: 30,
						binding: { repo: repoName, path: "invariance", symbol: "aws_sqs_queue.jobs" },
					},
					{
						id: "pWorker",
						name: "Worker",
						kind: "module",
						order: 40,
						binding: { repo: repoName, path: "invariance", symbol: "aws_lambda_function.worker" },
					},
				],
				edges: [
					{ id: "e1", order: 10, from: "pApiCode", to: "pDb", kind: "storage" },
					{
						id: "e2",
						order: 20,
						from: "pJobs",
						to: "pWorker",
						kind: "queue",
						anchor: {
							repo: repoName,
							path: "invariance/main.tf",
							symbol: "aws_lambda_event_source_mapping.trigger",
						},
					},
				],
			},
		},
	];
	register(scratch, { [SHOP]: shop, "github.com/test/inv-without": withoutDir });
	document(withVault, "Inv", makeVariant(SHOP));
	document(withoutVault, "Inv", makeVariant("github.com/test/inv-without"));
	const readWith = check.readStatesToCheck(withVault, undefined);
	const readWithout = check.readStatesToCheck(withoutVault, undefined);
	if (!readWith.ok || !readWithout.ok) throw new Error("failed to read invariance vaults");
	const outcomeWith = await check.checkCode(
		withVault,
		readWith.states,
		new AbortController().signal,
	);
	const outcomeWithout = await check.checkCode(
		withoutVault,
		readWithout.states,
		new AbortController().signal,
	);
	const normalize = (items: typeof outcomeWith.findings) =>
		items.map(({ code, severity, subject, evidence }) => ({
			code,
			severity,
			subject,
			evidence: evidence?.map(({ kind, resolution, from, to, path, symbol }) => ({
				kind,
				resolution,
				from,
				to,
				path,
				symbol,
			})),
		}));
	expect(normalize(outcomeWith.findings)).toEqual(normalize(outcomeWithout.findings));

	// Verify runners directly on the with-names checkout: only top-level resources become runners.
	const pass = createCodeFacts().pass(new AbortController().signal);
	const files = new Set(["invariance/main.tf", "invariance/app/api.ts"]);
	const readCheckout = { status: "read" as const, repo: SHOP, root: shop, files };
	const state = readWith.states[0];
	if (state === undefined) throw new Error("missing state");
	const { snapshotCheckoutAccess } = await import("@archboard/code-binding/resolution");
	const bindings = state.variant.content.nodes.flatMap((n) => n.binding ?? []);
	const snapshot = await snapshotCheckoutAccess({
		vault: withVault,
		signal: new AbortController().signal,
		bindings,
		timeoutMs: null,
	});
	const checkouts = new Map([[SHOP, readCheckout]]);
	const refs = await readRefCodes([], checkouts, new AbortController().signal);
	const codes = await partCodesOf(state.variant.content.nodes, {
		snapshot,
		checkouts,
		refs,
		searchOf: (co) => ({ facts: pass, checkout: co, readAsText: () => undefined }),
	});
	const runners = await terraformRunners(codes, pass);
	expect(
		runners.map((r) => ({
			parts: r.parts.map((p: ReadPart) => p.node.id),
			settings: r.settings.map((s) => s.name),
		})),
	).toEqual([
		{ parts: ["pApi"], settings: ["DB_HOST", "EXTRA_HOST"] },
		{ parts: ["pWorker"], settings: ["JOBS_URL"] },
	]);
	register(scratch, { [SHOP]: shop });
});

test("readFileOwners resolves bound nested blocks and anchors to exact lines", async () => {
	const rootOwners = await readFileOwners({
		vault: canonicalVault,
		repo: SHOP,
		path: "infra/main.tf",
		model: "Gateway",
		text: GATEWAY_MAIN,
		signal: new AbortController().signal,
	});
	if (!rootOwners.success) throw new Error(JSON.stringify(rootOwners));
	expect(rootOwners.owners.symbols).toEqual([
		expect.objectContaining({
			subject: "Gateway#DevLst",
			definition: expect.objectContaining({
				symbol: 'azurerm_application_gateway.ingress.http_listener["device-https"]',
				start: 2,
				end: 5,
			}),
		}),
		expect.objectContaining({
			subject: "Gateway#HostLst",
			definition: expect.objectContaining({
				symbol: 'azurerm_application_gateway.ingress.http_listener["example.com"]',
				start: 6,
				end: 9,
			}),
		}),
	]);
	expect(rootOwners.owners.anchors).toEqual([
		{
			subject: "Gateway/DevLst#Edge",
			symbol: 'azurerm_application_gateway.ingress.http_listener["a \\"b\\"/c d"]',
			line: 10,
		},
	]);
	expect(rootOwners.definitions.map((each) => each.symbol)).toContain(
		'azurerm_application_gateway.ingress.http_listener["device-https"]',
	);

	const modOwners = await readFileOwners({
		vault: canonicalVault,
		repo: SHOP,
		path: "infra/modules/gw/main.tf",
		model: "Gateway",
		signal: new AbortController().signal,
	});
	if (!modOwners.success) throw new Error(JSON.stringify(modOwners));
	expect(modOwners.owners.symbols).toEqual([
		expect.objectContaining({
			subject: "Gateway#ModHost",
			definition: expect.objectContaining({
				symbol: 'azurerm_application_gateway.ingress.http_listener["example.com"]',
				start: 6,
				end: 9,
			}),
		}),
	]);
});
