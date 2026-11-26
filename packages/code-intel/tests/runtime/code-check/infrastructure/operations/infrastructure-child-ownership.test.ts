// Deeper-part tie-breaking and runner env-var join preservation when a
// container and its direct child share an infrastructure binding across
// Terraform, Kubernetes, and Compose (ADR 0046, TASK-682.03).

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/code-check/operations/check.ts";
import { document, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = mkdtempSync(join(tmpdir(), "archboard-infra-child-owner-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";

let outcome: CodeCheckOutcome;

const RUNNER_TF = [
	'resource "aws_sqs_queue" "jobs" {',
	'  name = "jobs"',
	"}",
	'resource "aws_lambda_function" "api" {',
	'  function_name = "api"',
	"  environment {",
	"    variables = {",
	"      QUEUE_URL = aws_sqs_queue.jobs.url",
	"    }",
	"  }",
	"}",
	"",
].join("\n");

const K8S_YAML = [
	"apiVersion: apps/v1",
	"kind: Deployment",
	"metadata:",
	"  name: web",
	"spec:",
	"  template:",
	"    metadata:",
	"      labels: { app: web }",
	"    spec:",
	"      containers:",
	"        - name: web",
	"          image: shop/web:1",
	"          env:",
	"            - name: CART_URL",
	"              value: http://cart:8080",
	"---",
	"apiVersion: v1",
	"kind: Service",
	"metadata:",
	"  name: web",
	"spec:",
	"  selector: { app: web }",
	"---",
	"apiVersion: apps/v1",
	"kind: Deployment",
	"metadata:",
	"  name: cart",
	"spec:",
	"  template:",
	"    metadata:",
	"      labels: { app: cart }",
	"    spec:",
	"      containers: [{ name: cart, image: shop/cart:1 }]",
	"---",
	"apiVersion: v1",
	"kind: Service",
	"metadata:",
	"  name: cart",
	"spec:",
	"  selector: { app: cart }",
	"",
].join("\n");

const COMPOSE_YAML = [
	"services:",
	"  web:",
	"    image: shop/web",
	"    depends_on:",
	"      - db",
	"    environment:",
	"      CACHE_HOST: cache:6379",
	"  db:",
	"    image: postgres:16",
	"  cache:",
	"    image: redis:7",
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
 * Create an unanchored relationship.
 * @param id Edge id.
 * @param ends Start and end node ids.
 * @param kind Relationship kind.
 * @returns Edge entry.
 */
function edge(id: string, ends: [string, string], kind: string) {
	return {
		id,
		order: Number(id.slice(1)) * 10,
		from: ends[0],
		to: ends[1],
		kind,
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
		"runner/main.tf": RUNNER_TF,
		"runner/handler.ts": "export const q = process.env.QUEUE_URL;\n",
		"k8s/app.yaml": K8S_YAML,
		"k8s/handler.ts": "export const c = process.env.CART_URL;\n",
		"compose/compose.yaml": COMPOSE_YAML,
		"compose/handler.ts": "export const r = process.env.CACHE_HOST;\n",
	});
	git(scratch, shop, "add", "-A");
	git(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", "fixtures");
	register(scratch, { [SHOP]: shop });

	current(
		"Terraform runner with shared child",
		[
			part("ApiBox", "runner", "aws_lambda_function.api"),
			part("ApiCore", "runner", "aws_lambda_function.api", "ApiBox"),
			part("ApiHandler", "runner/handler.ts", undefined, "ApiBox"),
			part("Jobs", "runner", "aws_sqs_queue.jobs"),
		],
		[edge("e1", ["ApiHandler", "Jobs"], "queue"), edge("e2", ["ApiCore", "Jobs"], "queue")],
	);

	current(
		"K8s shared child",
		[
			part("WebBox", "k8s/app.yaml", "Deployment/web"),
			part("WebCore", "k8s/app.yaml", "Deployment/web", "WebBox"),
			part("WebCode", "k8s/handler.ts", undefined, "WebBox"),
			part("WebSvc", "k8s/app.yaml", "Service/web"),
			part("Cart", "k8s/app.yaml", "Deployment/cart"),
		],
		[
			edge("e1", ["WebSvc", "WebCore"], "http"),
			edge("e2", ["WebCode", "Cart"], "http"),
			edge("e3", ["WebCore", "Cart"], "http"),
		],
	);

	current(
		"Compose shared child",
		[
			part("WebBox", "compose/compose.yaml", "services.web"),
			part("WebCore", "compose/compose.yaml", "services.web", "WebBox"),
			part("WebCode", "compose/handler.ts", undefined, "WebBox"),
			part("Db", "compose/compose.yaml", "services.db"),
			part("Cache", "compose/compose.yaml", "services.cache"),
		],
		[
			edge("e1", ["WebCore", "Db"], "storage"),
			edge("e2", ["WebCode", "Cache"], "storage"),
			edge("e3", ["WebCore", "Cache"], "storage"),
		],
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

test("deeper-part tie-breaker drops container duplicates while preserving Terraform, Kubernetes, and Compose runner env-var joins for sibling parts inside the container", () => {
	expect(found("Terraform runner with shared child")).toEqual([]);
	expect(found("K8s shared child")).toEqual([]);
	expect(found("Compose shared child")).toEqual([]);
});
