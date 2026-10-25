// The code pass reads parts bound to Kubernetes objects through the
// Kubernetes adapter (ADR 0046, TASK-367.19): bindings and anchors are held to
// the objects the manifests declare, and the relationships between bound
// objects to what the manifests join: an Ingress's route to a Service, a
// Service's selector, an environment value that names a Service no part binds
// and so reaches the workloads it picks, and a NetworkPolicy's permission.
//
// The checkout `shop`: `web` reads the cart and the ledger through its
// environment and a password from a Secret; the Ingress routes to the
// Service `web`; a NetworkPolicy lets `web` reach `cart`. A Helm chart's
// template names its worker only when Helm renders it.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import { board, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-kubernetes-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
const SECRET = "hunter2-tempting-secret";
let outcome: CodeCheckOutcome;

/**
 * A Deployment and its pod's labels.
 * @param name Its name.
 * @param env Its container's `env` items, as YAML lines.
 * @returns The document.
 */
function deployment(name: string, env: readonly string[] = []): string {
	return [
		"apiVersion: apps/v1",
		"kind: Deployment",
		"metadata:",
		`  name: ${name}`,
		"spec:",
		"  template:",
		"    metadata:",
		"      labels:",
		`        app: ${name}`,
		"    spec:",
		"      containers:",
		`      - name: ${name}`,
		...(env.length === 0 ? [] : ["        env:", ...env]),
	].join("\n");
}

/**
 * A Service that picks the pods of one app.
 * @param name Its name and the app's.
 * @returns The document.
 */
function service(name: string): string {
	return [
		"apiVersion: v1",
		"kind: Service",
		"metadata:",
		`  name: ${name}`,
		"spec:",
		"  selector:",
		`    app: ${name}`,
	].join("\n");
}

/**
 * A part bound to an object.
 * @param id Its id.
 * @param path Its manifest.
 * @param symbol The object's address.
 * @returns The node.
 */
function part(id: string, path: string, symbol: string) {
	return {
		id,
		name: symbol,
		kind: "service",
		order: id.charCodeAt(1) * 10,
		binding: { repo: SHOP, path, symbol },
	};
}

/**
 * A relationship.
 * @param id Its id.
 * @param ends Its start and end.
 * @param kind Its kind.
 * @param symbol The symbol its anchor cites in `k8s/web.yaml`, if any.
 * @returns The relationship.
 */
function edge(id: string, ends: readonly [string, string], kind: string, symbol?: string) {
	const [from, to] = ends;
	const anchor =
		symbol === undefined ? {} : { anchor: { repo: SHOP, path: "k8s/web.yaml", symbol } };
	return { id, order: Number(id.slice(1)) * 10, from, to, kind, ...anchor };
}

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, shop, "init", "-q", "-b", "main");
	git(scratch, shop, "remote", "add", "origin", `https://${SHOP}.git`);
	const env = [
		"        - name: CART_ADDR",
		'          value: "cart:7070"',
		"        - name: LEDGER_URL",
		"          value: http://ledger.payments.svc.cluster.local:9000",
		"        - name: DB_PASSWORD",
		"          valueFrom:",
		"            secretKeyRef: { name: db, key: password }",
	];
	write(shop, {
		"k8s/web.yaml": `${deployment("web", env)}\n---\n${service("web")}\n`,
		"k8s/cart.yaml": `${deployment("cart")}\n---\n${service("cart")}\n`,
		"k8s/routes.yaml": [
			"apiVersion: networking.k8s.io/v1",
			"kind: Ingress",
			"metadata: { name: shop }",
			"spec:",
			"  defaultBackend:",
			"    service: { name: web, port: { number: 80 } }",
			"",
		].join("\n"),
		"k8s/policy.yaml": [
			"apiVersion: networking.k8s.io/v1",
			"kind: NetworkPolicy",
			"metadata: { name: cart-from-web }",
			"spec:",
			"  podSelector: { matchLabels: { app: cart } }",
			"  ingress:",
			"  - from:",
			"    - podSelector: { matchLabels: { app: web } }",
			"",
		].join("\n"),
		"k8s/secret.yaml": `apiVersion: v1\nkind: Secret\nmetadata: { name: db }\nstringData:\n  password: ${SECRET}\n`,
		"payments/ledger.yaml": `${deployment("ledger")}\n---\n${service("ledger")}\n`,
		"chart/templates/worker.yaml": deployment("{{ .Release.Name }}"),
	});
	git(scratch, shop, "add", "-A");
	git(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", "the manifests");
	register(scratch, { [SHOP]: shop });
	board(vault, "Shop", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("pW", "k8s/web.yaml", "Deployment/web"),
					part("pC", "k8s/cart.yaml", "Deployment/cart"),
					part("pL", "payments/ledger.yaml", "Deployment/ledger"),
					part("pR", "k8s/web.yaml", "Service/web"),
					part("pI", "k8s/routes.yaml", "Ingress/shop"),
					part("pQ", "k8s/web.yaml", "Deployment/queue"),
					part("pH", "chart/templates/worker.yaml", "Deployment/shop-worker"),
				],
				edges: [
					// The anchor holds: web's environment names the Service that picks the cart.
					edge("e1", ["pW", "pC"], "http", "Service/cart"),
					edge("e2", ["pI", "pR"], "http"),
					// Drawn from the cart, while web's configuration and the policy run to it.
					edge("e3", ["pC", "pW"], "other"),
					edge("e4", ["pL", "pC"], "http", "Service/nope"),
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

test("anchors, binding symbols and the relationships between parts bound to Kubernetes objects are judged by the Kubernetes adapter", () => {
	const found = outcome.findings.map((each) => `${each.code} ${each.subject?.id} ${each.severity}`);
	expect(found.toSorted()).toEqual(
		[
			"ANCHOR_SYMBOL_MISSING e4 warning",
			"BINDING_SYMBOL_MISSING pQ warning",
			"RELATIONSHIP_BACKWARDS e3 information",
			"RELATIONSHIP_UNDRAWN pL warning",
			"RELATIONSHIP_UNDRAWN pW warning",
		].toSorted(),
	);
	expect(outcome.skipped.map((each) => each.reason)).not.toContain("text-only");
	const template = outcome.skipped.find((each) => each.subject?.id === "pH");
	expect(template?.reason).toBe("expression-not-followed");
});

const undrawn = (id: string) =>
	outcome.findings
		.find((each) => each.code === "RELATIONSHIP_UNDRAWN" && each.subject?.id === id)
		?.evidence?.map((piece) => [
			piece.from,
			piece.kind,
			piece.resolution,
			`${piece.path}:${piece.line}`,
		]);

test("a Service's selector joins it to its workload, and a Service no part binds passes the reference on to the workloads it picks", () => {
	expect(undrawn("pW")).toEqual([["pR", "configured-path", "resolved", "k8s/web.yaml:27"]]);
	expect(undrawn("pL")).toEqual([["pW", "configured-path", "resolved", "k8s/web.yaml:16"]]);
});

test("a NetworkPolicy is a permission from the workload that sends to the one that receives", () => {
	const turned = outcome.findings.find((each) => each.subject?.id === "e3");
	const pieces = turned?.evidence?.map((piece) => [piece.from, piece.to, piece.kind].join(" "));
	expect(pieces?.toSorted()).toEqual(["pW pC configured-path", "pW pC permission"]);
});

test("no finding quotes a value of a Secret", () => {
	expect(JSON.stringify(outcome)).not.toContain(SECRET);
});
