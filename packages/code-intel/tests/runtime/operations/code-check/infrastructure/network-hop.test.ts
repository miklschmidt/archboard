// The code pass joins code and infrastructure across a network hop (ADR 0046,
// TASK-367.23): an environment value that code reads, which the compose
// service that runs that code sets to the address of another part, is
// configured-path evidence between the two parts. Where only one side has
// evidence, the unsupported finding names the side that has none.
//
// The checkout `hops` holds a TypeScript service, `web`, built from `web/`,
// and a Python service, `orders`, built from the root with
// `orders/Dockerfile`. Compose sets `ORDERS_URL` for web to the orders
// service, and the override adds `CACHE_HOST` (the cache), which the web code
// also reads. The orders code reads `DATABASE_URL`, which compose sets to the
// database; compose also sets `LEDGER_URL` for orders to the ledger service,
// which no orders code reads. The web code reads `FLAGS_URL`, which nothing sets, and names from
// its env file and an outside host, which are set. The worker service runs an
// image built elsewhere; the board draws the jobs code inside it, and compose
// sets the jobs code's `QUEUE_URL` to the queue. Terraform gives a Lambda
// function `EVENTS_URL`, the URL of a queue, and the board draws the notifier
// code that reads it inside the function. A Kubernetes Deployment gives the
// storefront code drawn inside it `CATALOG_URL`, the address of the Service
// that picks the catalog Deployment, and `SF_SEARCH_URL` from a ConfigMap.
// Two services, `reports` and `reports-worker`, build `reports/` to two
// targets, which holds two bound parts: the override gives web `REPORTS_URL`,
// the reports service, and the reports code reads `LEDGER_URL`, which only
// one of the two sets. Several values hold a credential that no answer may
// quote.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import { board, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-hops-"));
const hops = join(scratch, "hops");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const HOPS = "github.com/test/hops";
let outcome: CodeCheckOutcome;

/**
 * A part bound in the checkout.
 * @param id Its id.
 * @param name Its name.
 * @param path Its bound path.
 * @param extra Its symbol or its parent, if any.
 * @param extra.symbol The address it binds in a compose file.
 * @param extra.parent The part that holds it.
 * @returns The node.
 */
function part(
	id: string,
	name: string,
	path: string,
	extra: { symbol?: string; parent?: string } = {},
) {
	const { symbol, parent } = extra;
	return {
		id,
		name,
		kind: "service",
		order: id.charCodeAt(1) * 10,
		binding: { repo: HOPS, path, ...(symbol === undefined ? {} : { symbol }) },
		...(parent === undefined ? {} : { parent }),
	};
}

/**
 * A relationship with no anchor.
 * @param id Its id.
 * @param ends Its start and end.
 * @param kind Its kind.
 * @returns The relationship.
 */
function edge(id: string, ends: readonly [string, string], kind: string) {
	const [from, to] = ends;
	return { id, order: Number(id.slice(1)) * 10, from, to, kind };
}

/**
 * The finding about one subject.
 * @param id The subject's id.
 * @returns The finding, if any.
 */
function about(id: string) {
	return outcome.findings.find((each) => each.subject?.id === id);
}

beforeAll(async () => {
	mkdirSync(hops, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, hops, "init", "-q", "-b", "main");
	git(scratch, hops, "remote", "add", "origin", `https://${HOPS}.git`);
	write(hops, {
		"compose.yaml": [
			"services:",
			"  web:",
			"    build: ./web",
			"    environment:",
			"      ORDERS_URL: http://orders:8000",
			"      METRICS_URL: https://metrics.example.com",
			"    env_file: ./web.env",
			"  orders:",
			"    build:",
			"      context: .",
			"      dockerfile: orders/Dockerfile",
			"    environment:",
			"      - DATABASE_URL=postgres://app:hunter2@db:5432/orders",
			"      - LEDGER_URL=http://ledger:9000",
			"  ledger:",
			"    build: ./ledger",
			"  worker:",
			"    image: registry.example.com/worker:1",
			"    environment:",
			"      QUEUE_URL: amqp://queue:5672",
			"  db:",
			"    image: postgres:16",
			"  cache:",
			"    image: redis:7",
			"  queue:",
			"    image: rabbitmq:3",
			"  reports:",
			"    build: { context: ./reports, target: api }",
			"    environment:",
			"      LEDGER_URL: http://ledger:9000",
			"  reports-worker:",
			"    build: { context: ./reports, target: worker }",
			"",
		].join("\n"),
		"compose.override.yml": [
			"services:",
			"  web:",
			"    environment:",
			"      CACHE_HOST: cache",
			"      REPORTS_URL: http://reports:8000",
			"",
		].join("\n"),
		"web.env": "SESSION_SECRET=not-read\n",
		"web/src/server.ts": [
			"const orders = process.env.ORDERS_URL;",
			'const cache = process.env["CACHE_HOST"];',
			"const session = process.env.SESSION_SECRET;",
			"const metrics = process.env.METRICS_URL;",
			"const flags = process.env.FLAGS_URL;",
			"export function listOrders() {",
			"\treturn fetch(`${orders}/orders`, { headers: { cache, session, metrics, flags } });",
			"}",
			"export const reports = process.env.REPORTS_URL;",
			"",
		].join("\n"),
		"orders/app/main.py": [
			"import os",
			"",
			'DATABASE_URL = os.environ["DATABASE_URL"]',
			"",
			"def connect():",
			"    return DATABASE_URL",
			"",
		].join("\n"),
		"jobs/worker.py": ["import os", "", 'QUEUE_URL = os.getenv("QUEUE_URL")', ""].join("\n"),
		"ledger/app.py": "def post():\n    return 1\n",
		"reports/api/views.py": 'import os\n\nLEDGER_URL = os.environ["LEDGER_URL"]\n',
		"reports/models/report.py": "class Report:\n    pass\n",
		"infra/main.tf": [
			'resource "aws_sqs_queue" "events" {',
			'  name = "events"',
			"}",
			'resource "aws_lambda_function" "notify" {',
			"  environment {",
			'    variables = { EVENTS_URL = aws_sqs_queue.events.url, TOKEN = "hunter2" }',
			"  }",
			"}",
			"",
		].join("\n"),
		"notifier/handler.ts": "export const handler = () => process.env.EVENTS_URL;\n",
		"k8s/shop.yaml": [
			"apiVersion: apps/v1",
			"kind: Deployment",
			"metadata:",
			"  name: storefront",
			"spec:",
			"  selector:",
			"    matchLabels: { app: storefront }",
			"  template:",
			"    metadata:",
			"      labels: { app: storefront }",
			"    spec:",
			"      containers:",
			"        - name: storefront",
			"          image: shop/storefront:1",
			"          env:",
			"            - name: CATALOG_URL",
			"              value: http://shop:hunter2@catalog:8080",
			"          envFrom:",
			"            - configMapRef: { name: storefront }",
			"              prefix: SF_",
			"---",
			"apiVersion: apps/v1",
			"kind: Deployment",
			"metadata:",
			"  name: catalog",
			"spec:",
			"  selector:",
			"    matchLabels: { app: catalog }",
			"  template:",
			"    metadata:",
			"      labels: { app: catalog }",
			"    spec:",
			"      containers:",
			"        - name: catalog",
			"          image: shop/catalog:1",
			"---",
			"apiVersion: v1",
			"kind: Service",
			"metadata:",
			"  name: catalog",
			"spec:",
			"  selector: { app: catalog }",
			"  ports: [{ port: 8080 }]",
			"---",
			"apiVersion: v1",
			"kind: ConfigMap",
			"metadata:",
			"  name: storefront",
			"data:",
			"  SEARCH_URL: http://search:9200",
			"---",
			"apiVersion: apps/v1",
			"kind: Deployment",
			"metadata:",
			"  name: search",
			"spec:",
			"  selector:",
			"    matchLabels: { app: search }",
			"  template:",
			"    metadata:",
			"      labels: { app: search }",
			"    spec:",
			"      containers: [{ name: search, image: shop/search:1 }]",
			"---",
			"apiVersion: v1",
			"kind: Service",
			"metadata:",
			"  name: search",
			"spec:",
			"  selector: { app: search }",
			"",
		].join("\n"),
		"storefront/main.ts": [
			"export const catalog = process.env.CATALOG_URL;",
			"export const search = process.env.SF_SEARCH_URL;",
			"",
		].join("\n"),
	});
	git(scratch, hops, "add", "-A");
	git(scratch, hops, "commit", "-q", "--no-gpg-sign", "-m", "the services");
	register(scratch, { [HOPS]: hops });
	board(vault, "Hops", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("pW", "Web", "web"),
					part("pO", "Orders", "orders"),
					part("pL", "Ledger", "ledger"),
					part("pK", "Worker service", "compose.yaml", { symbol: "services.worker" }),
					part("pJ", "Jobs", "jobs", { parent: "pK" }),
					part("pD", "Database", "compose.yaml", { symbol: "services.db" }),
					part("pC", "Cache", "compose.yaml", { symbol: "services.cache" }),
					part("pQ", "Queue", "compose.yaml", { symbol: "services.queue" }),
					part("pF", "Notify function", "infra", { symbol: "aws_lambda_function.notify" }),
					part("pN", "Notifier", "notifier", { parent: "pF" }),
					part("pE", "Events", "infra", { symbol: "aws_sqs_queue.events" }),
					part("pS", "Storefront workload", "k8s/shop.yaml", { symbol: "Deployment/storefront" }),
					part("pT", "Storefront", "storefront", { parent: "pS" }),
					part("pG", "Catalog", "k8s/shop.yaml", { symbol: "Deployment/catalog" }),
					part("pH", "Search", "k8s/shop.yaml", { symbol: "Deployment/search" }),
					part("pR", "Reports API", "reports/api"),
					part("pP", "Report models", "reports/models"),
				],
				edges: [
					edge("e1", ["pW", "pO"], "http"),
					edge("e2", ["pO", "pD"], "data"),
					edge("e3", ["pO", "pL"], "http"),
					edge("e4", ["pW", "pL"], "http"),
					edge("e5", ["pD", "pC"], "data"),
					edge("e6", ["pJ", "pQ"], "queue"),
					edge("e7", ["pK", "pQ"], "queue"),
					edge("e8", ["pN", "pE"], "queue"),
					edge("e9", ["pF", "pE"], "queue"),
					edge("e10", ["pT", "pG"], "http"),
					edge("e11", ["pS", "pG"], "http"),
					edge("e12", ["pT", "pH"], "http"),
					edge("e13", ["pW", "pR"], "http"),
				],
			},
		},
	]);
	const check = await import("#tests/runtime/support/code-check/pass.ts");
	const read = check.readBoardsToCheck(vault, undefined);
	if (!read.ok) throw new Error("no boards");
	outcome = await check.checkCode(vault, read.boards, new AbortController().signal);
});

afterAll(() => {
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

test("a value the code reads, set for the service that runs it to another part's address, supports the relationship between the two parts", () => {
	// TypeScript to Python through the web build, Python to a service through
	// the Dockerfile's directory, code drawn inside a service with an image
	// built elsewhere, code drawn inside a Lambda function that Terraform
	// gives the queue's URL, and code drawn inside a Kubernetes workload that
	// reaches another through the Service that picks it, also through a key
	// that envFrom passes on from a ConfigMap.
	for (const supported of ["e1", "e2", "e6", "e8", "e10", "e12"]) {
		expect(about(supported)).toBeUndefined();
	}
});

test("a joined value no relationship draws is undrawn, with the read and the setting as its evidence", () => {
	const undrawn = about("pC");
	expect(undrawn?.code).toBe("RELATIONSHIP_UNDRAWN");
	expect(undrawn?.severity).toBe("warning");
	expect(undrawn?.evidence).toEqual([
		{
			kind: "configured-path",
			resolution: "resolved",
			from: "pW",
			to: "pC",
			repo: HOPS,
			path: "web/src/server.ts",
			line: 2,
			symbol: "CACHE_HOST",
		},
		{
			kind: "configured-path",
			resolution: "resolved",
			from: "pW",
			to: "pC",
			repo: HOPS,
			path: "compose.override.yml",
			line: 4,
			symbol: "CACHE_HOST",
		},
	]);
});

test("an unsupported relationship across a network hop names the side with no evidence", () => {
	const unread = about("e3");
	expect([unread?.code, unread?.missing]).toEqual(["RELATIONSHIP_UNSUPPORTED", "code"]);
	expect(unread?.evidence?.map((each) => [each.path, each.line, each.symbol])).toEqual([
		["compose.yaml", 14, "LEDGER_URL"],
	]);
	// An env file's names and an outside host are set; only FLAGS_URL is not.
	const unset = about("e4");
	expect([unset?.code, unset?.missing]).toEqual(["RELATIONSHIP_UNSUPPORTED", "infrastructure"]);
	expect(unset?.evidence?.map((each) => [each.path, each.line, each.symbol])).toEqual([
		["web/src/server.ts", 5, "FLAGS_URL"],
	]);
	const neither = about("e5");
	expect(neither?.code).toBe("RELATIONSHIP_UNSUPPORTED");
	expect(neither?.missing).toBeUndefined();
	expect(neither?.evidence).toBeUndefined();
});

test("a join is a candidate where the infrastructure leaves a choice, so the part it may not reach gets no warning", () => {
	// The reports service builds two bound parts, so its address reaches each
	// as a candidate: web -> Reports API stays supported, and Report models is
	// told as information. Two services build the reports code and only one
	// sets LEDGER_URL, so its read reaches the ledger as a candidate too.
	expect(about("e13")).toBeUndefined();
	for (const unsure of ["pP", "pL"]) {
		const undrawn = about(unsure);
		expect([undrawn?.code, undrawn?.severity]).toEqual(["RELATIONSHIP_UNDRAWN", "information"]);
		expect(undrawn?.evidence?.map((each) => each.resolution)).toEqual(["candidate", "candidate"]);
	}
});

test("no value an environment sets or an env file holds reaches the answer", () => {
	// The join reads the values that name an address, here with a password in
	// them, and quotes only the names (ADR 0046).
	const answer = JSON.stringify(outcome);
	for (const secret of ["hunter2", "not-read"]) expect(answer).not.toContain(secret);
});
