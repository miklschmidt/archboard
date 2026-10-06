// The code facts of Kubernetes manifests (ADR 0046, TASK-367.19), read from
// the fixture checkout `fixtures/kubernetes-shop`: objects as definitions
// addressed as kind and name, what an object names by address as configured
// paths and calls resolved to the nearest manifest that declares it, what
// Services and NetworkPolicies join by labels, and Secrets read for the names
// of their keys alone.
//
// The checkout: `k8s/web.yaml` runs `web`, which names the cart, the ledger
// in the `payments` namespace, an outside host and an undeclared catalog in
// its environment, reads a Secret's key and passes a ConfigMap on through
// `envFrom`. `k8s/cart.yaml` runs `cart`. `k8s/routes.yaml` routes an Ingress
// to `web` and an HTTPRoute to `cart`. `k8s/policy.yaml` lets `web` reach
// `cart`. `k8s/config.yaml` holds the ConfigMap and a Secret with tempting
// values. `payments/ledger.yaml` is a `List`, whose ledger, ConfigMap and
// Secret hold credentials too. `envs/report.yaml` runs a CronJob that names
// the cache, which two environments beside it declare. A GitHub workflow and
// a compose file are YAML too. So is `k8s/old-secret.yaml`, whose first
// document is empty, and so are a Helm template and a manifest that does not
// parse, which the test writes because the formatter would rewrite them.

import { afterAll, expect, test } from "bun:test";
import {
	createCodeFacts,
	findSymbol,
	kubernetesLinks,
	type FileFacts,
	type SyntaxFacts,
} from "@/runtime/code-facts/index";
import { fixtureDirectory } from "@/runtime/code-facts/tests/checkout";

const checkout = fixtureDirectory("kubernetes-shop");
const facts = createCodeFacts();
/** Each manifest the check cannot read, and an address it may declare. */
const UNREADABLE = {
	// A Helm template that parses as YAML: Helm gives the name when it renders it.
	"charts/shop/templates/secret.yaml": [
		"Secret/shop-db",
		[
			"apiVersion: v1",
			"kind: Secret",
			"metadata:",
			'  name: {{ include "shop.db" . }}',
			"stringData:",
			"  DB_PASSWORD: hunter2-in-a-template",
		],
	],
	// One that quotes its actions, as YAML text.
	"charts/shop/templates/config.yaml": [
		"ConfigMap/shop-config",
		["apiVersion: v1", "kind: ConfigMap", "metadata:", '  name: "{{ .Release.Name }}-config"'],
	],
	"k8s/broken.yaml": [
		"Deployment/broken",
		["apiVersion: apps/v1", "kind: Deployment", "metadata:", "  name: broken", "  labels: [app"],
	],
	"k8s/old-secret.yaml": ["Secret/old-token", undefined],
} as const;
/** What the Secrets and the credentials hold, as written and as `data` encodes them. */
const SECRETS = ["hunter2", "aHVudGVy"];

for (const [file, [, lines]] of Object.entries(UNREADABLE)) {
	if (lines !== undefined) checkout.write(file, `${lines.join("\n")}\n`);
}

afterAll(() => {
	checkout.remove();
});

/**
 * Read one file's facts in a pass of their own.
 * @param relative The file.
 * @returns Its facts.
 */
async function read(relative: string): Promise<FileFacts | undefined> {
	return facts.pass(new AbortController().signal).read(checkout, relative);
}

/**
 * Read one file as a manifest.
 * @param relative The file.
 * @returns Its facts.
 */
async function manifest(relative: string): Promise<SyntaxFacts> {
	const found = await read(relative);
	if (found?.adapter !== "kubernetes") throw new Error(`${relative} was not read as a manifest`);
	return found;
}

/**
 * Each reference of a file that names an address: its line, kind, address,
 * and the file and declaration it resolves to, if any.
 * @param file The file's facts.
 * @returns One row per reference.
 */
function addressed(file: SyntaxFacts): string[] {
	return file.references
		.filter((each) => each.kind !== undefined)
		.map((each) => {
			const to = each.target === undefined ? "-" : `${each.target.path} ${each.target.symbol}`;
			return `${each.line} ${each.kind} ${each.symbol} -> ${to}`;
		});
}

test("each object of every document and list is a definition addressed as kind and name", async () => {
	const web = await manifest("k8s/web.yaml");
	const routes = await manifest("k8s/routes.yaml");
	const config = await manifest("k8s/config.yaml");
	const ledger = await manifest("payments/ledger.yaml");
	const policy = await manifest("k8s/policy.yaml");
	const rows = [web, routes, config, ledger, policy].flatMap((file) =>
		file.definitions.map((each) => [each.symbol, each.start, each.end, each.exposed]),
	);
	expect(rows).toEqual([
		["Deployment/web", 2, 35, false],
		["Service/web", 37, 47, true],
		["Ingress/shop", 1, 16, true],
		["HTTPRoute/cart-api", 18, 32, true],
		["ConfigMap/web-config", 1, 9, false],
		["Secret/web-secrets", 11, 19, false],
		["Service/ledger", 4, 11, false],
		["Deployment/ledger", 12, 31, false],
		["ConfigMap/ledger-config", 32, 37, false],
		["Secret/ledger-db", 38, 43, false],
		["NetworkPolicy/cart-from-web", 1, 17, false],
	]);
});

test("a route to a Service is a call, and what a workload's environment, envFrom and keys name are configured paths to the nearest declaration, and to none where two at the nearest step declare it", async () => {
	expect(addressed(await manifest("k8s/web.yaml"))).toEqual([
		"19 configured-path Service/cart -> k8s/cart.yaml Service/cart",
		"21 configured-path Service/ledger -> payments/ledger.yaml Service/ledger",
		"25 configured-path Service/catalog -> -",
		"27 configured-path Secret/web-secrets -> k8s/config.yaml Secret/web-secrets",
		"33 configured-path ConfigMap/web-config -> k8s/config.yaml ConfigMap/web-config",
	]);
	expect(addressed(await manifest("k8s/routes.yaml"))).toEqual([
		"12 call Service/web -> k8s/web.yaml Service/web",
		"31 call Service/cart -> k8s/cart.yaml Service/cart",
	]);
	expect(addressed(await manifest("envs/report.yaml"))).toEqual([
		"15 configured-path Service/cache -> -",
	]);
});

test("a workload's environment names, and the keys envFrom passes on under its prefix, are names without values", async () => {
	const web = await manifest("k8s/web.yaml");
	const names = web.references
		.filter((each) => each.via === "environment")
		.map((each) => each.symbol);
	expect(names).toEqual(["CART_ADDR", "LEDGER_URL", "DOCS_URL", "CATALOG_HOST", "DB_PASSWORD"]);
	const passed = web.imports.find((each) => each.reexport);
	expect(passed?.names.map((each) => [each.local, each.imported])).toEqual([
		["WEB_SEARCH_URL", "SEARCH_URL"],
		["WEB_LOG_LEVEL", "LOG_LEVEL"],
	]);
});

test("a Service joins the workloads its selector picks, and a NetworkPolicy lets the sender reach the receiver", async () => {
	const pass = facts.pass(new AbortController().signal);
	const links = kubernetesLinks(pass, checkout, ["k8s/web.yaml", "payments/ledger.yaml"]);
	expect(
		links.map((each) => [
			each.kind,
			`${each.path}:${each.line}`,
			each.from.definition.symbol,
			each.to.definition.symbol,
		]),
	).toEqual([
		["configured-path", "k8s/cart.yaml:23", "Service/cart", "Deployment/cart"],
		["permission", "k8s/policy.yaml:13", "Deployment/web", "Deployment/cart"],
		["configured-path", "k8s/web.yaml:43", "Service/web", "Deployment/web"],
		["configured-path", "payments/ledger.yaml:10", "Service/ledger", "Deployment/ledger"],
	]);
});

test("a Secret's values, in data or stringData, in a List or in a Helm template, and the credentials in an address are in no fact", async () => {
	const pass = facts.pass(new AbortController().signal);
	const files = [...checkout.files];
	const everyFile = await Promise.all(files.map((file) => pass.read(checkout, file)));
	const config = await manifest("k8s/config.yaml");
	expect(config.references.map((each) => each.symbol)).toContain("API_TOKEN");
	const written = JSON.stringify([
		everyFile.filter((each) => each?.adapter !== "text"),
		kubernetesLinks(pass, checkout, files),
	]);
	for (const secret of SECRETS) expect(written).not.toContain(secret);
});

test("YAML that holds no Kubernetes object is read as text, a compose file as compose, and a manifest whose objects the check cannot read as one part where every address is unknown", async () => {
	expect((await read(".github/workflows/ci.yml"))?.adapter).toBe("text");
	expect((await read("compose.yaml"))?.adapter).toBe("compose");
	for (const [file, [address]] of Object.entries(UNREADABLE)) {
		const unreadable = await manifest(file);
		expect(unreadable.definitions).toEqual([]);
		expect(findSymbol(unreadable, address, "definition").status).toBe("unparsed");
	}
});
