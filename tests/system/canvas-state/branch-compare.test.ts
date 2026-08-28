import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { createRequester } from "./support/http.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const executable = join(repoRoot, "bin/canvas");
const serverPath = join(repoRoot, "src/server.ts");

interface Element {
	id: string;
	type: string;
	customData?: { archboard?: { node?: string; variant?: string } };
}
interface ElementsBody {
	count: number;
	elements: Element[];
}
interface SaveBody {
	board?: string;
	file?: string;
}
interface CompareBody {
	summary: Record<string, number | boolean>;
	nodes: Record<string, Array<{ node?: string; changes?: unknown }>>;
	edges: Record<string, Array<{ from?: string; to?: string }>> & {
		unresolved?: { to?: unknown[] };
	};
	warnings: string[];
}
interface CliResult<T = unknown> {
	status: number | null;
	stdout: string;
	stderr: string;
	json: T;
}

const box = (id: string, label: string, x: number, y = 100) => ({
	id,
	type: "rectangle",
	x,
	y,
	width: 200,
	height: 100,
	label: { text: label },
});
const arrow = (id: string, start: string, end: string) => ({
	id,
	type: "arrow",
	x: 0,
	y: 0,
	width: 100,
	height: 0,
	start: { id: start },
	end: { id: end },
});

describe.serial("branch comparison", () => {
	test("preserves copied identity and exposes redraw, stencil, and swept-arrow costs", async () => {
		await using resources = new AsyncDisposableStack();
		const root = mkdtempSync(join(tmpdir(), "archboard-branch-compare-"));
		resources.defer(() => rmSync(root, { recursive: true, force: true }));
		const vault = join(root, "vault");
		const canvas = await startOwnedCanvas({
			serverPath,
			vault,
			env: { LOG_FILE_PATH: join(root, "canvas.log") },
		});
		resources.defer(() => canvas.dispose());
		const request = createRequester(canvas);
		const cli = <T = unknown>(args: string[], input = ""): CliResult<T> => {
			const result = spawnSync(executable, args, {
				cwd: repoRoot,
				encoding: "utf8",
				input,
				env: {
					...process.env,
					EXPRESS_SERVER_URL: canvas.base,
					EXCALIDRAW_NO_AUTOSTART: "1",
					ARCHBOARD_VAULT: vault,
					LOG_LEVEL: "error",
				},
			});
			let json = undefined as T;
			try {
				json = JSON.parse(result.stdout) as T;
			} catch {
				// Text commands deliberately do not emit JSON.
			}
			return { status: result.status, stdout: result.stdout, stderr: result.stderr, json };
		};
		const create = async (board: string) => {
			const made = await request(`/api/boards/new`, {
				method: "POST",
				body: { board, level: "service" },
			});
			expect(made.status).toBe(200);
		};
		const add = async (board: string, element: unknown) => {
			const made = await request<{ element: Element }>(`/api/elements?board=${board}`, {
				method: "POST",
				body: element,
			});
			expect(made.status).toBe(200);
			return made.body.element.id;
		};
		const elements = async (board: string) =>
			(await request<ElementsBody>(`/api/elements?board=${board}`)).body.elements;
		const promote = (board: string, ids: string[], kind: string, variant: string, name: string) => {
			const result = cli<{ nodes: Array<{ node: string }> }>([
				"promote",
				"--board",
				board,
				"--ids",
				ids.join(","),
				"--kind",
				kind,
				"--name",
				name,
				"--variant",
				variant,
				"--doing",
				"checking branch identity",
			]);
			expect(result.status, result.stderr).toBe(0);
			return result.json.nodes[0]?.node;
		};
		const draw = async (
			board: string,
			variant: string,
			nodes: Array<[string, string, string, number, number?]>,
			edges: Array<[string, string, string]>,
		) => {
			const ids = new Map<string, string>();
			for (const [id, label, kind, x, y] of nodes) {
				ids.set(label, await add(board, box(id, label, x, y)));
				expect(promote(board, [id], kind, variant, label)).toBe(
					label
						.toLowerCase()
						.replaceAll(/[^a-z0-9]+/g, "-")
						.replaceAll(/^-|-$/g, ""),
				);
			}
			for (const [id, from, to] of edges) {
				await add(board, arrow(id, ids.get(from)!, ids.get(to)!));
			}
		};

		await create("payments");
		await draw(
			"payments",
			"current",
			[
				["api-gw", "API Gateway", "gateway", 0],
				["orders", "Orders Service", "service", 300],
				["ordersdb", "Orders Postgres", "datastore", 600],
			],
			[
				["gw-ord", "API Gateway", "Orders Service"],
				["ord-db", "Orders Service", "Orders Postgres"],
			],
		);
		const sourceSave = await request<SaveBody>("/api/boards/save?board=payments", {
			method: "POST",
		});
		expect(sourceSave.status).toBe(200);
		const sourceFile = sourceSave.body.file!;
		const sourceBytes = readFileSync(sourceFile);
		expect(
			new Set(
				(await elements("payments")).flatMap((item) => item.customData?.archboard?.node ?? []),
			).size,
		).toBe(3);

		const branch = await request<SaveBody>("/api/boards/save?board=payments", {
			method: "POST",
			body: { name: "payments", variant: "option-a" },
		});
		expect(branch.body.board).toBe("payments@option-a");
		await add("payments@option-a", box("cache", "Orders Cache", 300, 320));
		await add("payments@option-a", arrow("ord-cache", "orders", "cache"));
		expect(promote("payments@option-a", ["cache"], "datastore", "option-a", "Orders Cache")).toBe(
			"orders-cache",
		);
		await request("/api/boards/save?board=payments@option-a", { method: "POST" });
		const branched = (
			await request<CompareBody>("/api/boards/compare?from=payments&to=payments@option-a")
		).body;
		expect(branched.summary).toMatchObject({
			comparable: true,
			sharedNodes: 3,
			nodesAdded: 1,
			nodesRemoved: 0,
			nodesChanged: 0,
			edgesAdded: 1,
			edgesRemoved: 0,
			edgesUnchanged: 2,
		});
		expect(branched.nodes.added!.map(({ node }) => node)).toEqual(["orders-cache"]);
		expect(branched.edges.added!.map(({ from, to }) => [from, to])).toEqual([
			["orders-service", "orders-cache"],
		]);
		expect(branched.edges.unchanged!.map(({ from, to }) => [from, to])).toEqual([
			["api-gateway", "orders-service"],
			["orders-service", "orders-postgres"],
		]);
		expect(branched.warnings.some((warning) => /different variant/.test(warning))).toBeFalse();

		await create("payments@redraw");
		await draw(
			"payments@redraw",
			"redraw",
			[
				["gateway", "Gateway", "gateway", 0],
				["orders", "Orders Service", "service", 300],
				["postgres", "Postgres", "datastore", 600],
				["cache", "Orders Cache", "datastore", 300, 320],
			],
			[
				["a", "Gateway", "Orders Service"],
				["b", "Orders Service", "Postgres"],
				["c", "Orders Service", "Orders Cache"],
			],
		);
		const redraw = (
			await request<CompareBody>("/api/boards/compare?from=payments&to=payments@redraw")
		).body;
		expect(redraw.summary).toMatchObject({
			sharedNodes: 1,
			nodesAdded: 3,
			nodesRemoved: 2,
			edgesUnchanged: 0,
		});

		await create("payments@fresh");
		await draw(
			"payments@fresh",
			"fresh",
			[
				["edge", "Edge Proxy", "gateway", 0],
				["handle", "Order Handling", "service", 300],
				["store", "Order Store", "datastore", 600],
				["freshc", "Order Cache", "datastore", 300, 320],
			],
			[
				["d", "Edge Proxy", "Order Handling"],
				["e", "Order Handling", "Order Store"],
				["f", "Order Handling", "Order Cache"],
			],
		);
		const fresh = (
			await request<CompareBody>("/api/boards/compare?from=payments&to=payments@fresh")
		).body;
		expect(fresh.summary).toMatchObject({ comparable: false, identical: false, sharedNodes: 0 });
		expect(fresh.warnings.join("\n")).toMatch(/share no node ids/);
		expect(fresh.warnings.join("\n")).toMatch(/copy of the current board/);

		await create("storage");
		await add("storage", box("ledger", "Ledger Service", 0));
		expect(promote("storage", ["ledger"], "service", "current", "Ledger Service")).toBe(
			"ledger-service",
		);
		const inserted = cli<{ count: number; elements: Element[] }>([
			"library",
			"insert",
			"PostgreSQL",
			"--source",
			"drwnio",
			"--x",
			"400",
			"--y",
			"100",
			"--board",
			"storage",
			"--doing",
			"placing the storage stencil",
		]);
		expect(inserted.status, inserted.stderr).toBe(0);
		expect(inserted.json.count).toBe(7);
		expect([...new Set(inserted.json.elements.map(({ type }) => type))]).toEqual(["line"]);
		expect(
			promote(
				"storage",
				inserted.json.elements.map(({ id }) => id),
				"datastore",
				"current",
				"Ledger DB",
			),
		).toBe("ledger-db");
		expect(
			(await elements("storage")).filter(
				({ customData }) => customData?.archboard?.node === "ledger-db",
			),
		).toHaveLength(7);
		const described = cli(["describe", "--board", "storage"]);
		expect(described.status, described.stderr).toBe(0);
		expect(described.stdout).toContain("Ledger DB");
		expect(described.stdout).toMatch(/\(2 nodes, 0 edges/);
		await request("/api/boards/save?board=storage", { method: "POST" });
		await request("/api/boards/save?board=storage", {
			method: "POST",
			body: { name: "storage", variant: "option-a" },
		});
		await add("storage@option-a", box("replica", "Ledger Replica", 400, 400));
		expect(
			promote("storage@option-a", ["replica"], "datastore", "option-a", "Ledger Replica"),
		).toBe("ledger-replica");
		const storage = (
			await request<CompareBody>("/api/boards/compare?from=storage&to=storage@option-a")
		).body;
		expect(storage.summary).toMatchObject({ sharedNodes: 2, nodesAdded: 1, nodesRemoved: 0 });
		expect(storage.nodes.unchanged!.map(({ node }) => node)).toContain("ledger-db");
		expect(storage.edges.unresolved?.to ?? []).toEqual([]);

		await create("wiring");
		await add("wiring", box("web", "Web", 0));
		await add("wiring", box("worker", "Worker", 400));
		expect(promote("wiring", ["web"], "service", "current", "Web")).toBe("web");
		expect(promote("wiring", ["worker"], "service", "current", "Worker")).toBe("worker");
		await add("wiring", arrow("wire", "web", "worker"));
		await request("/api/boards/save?board=wiring", { method: "POST" });
		await request("/api/boards/save?board=wiring", {
			method: "POST",
			body: { name: "wiring", variant: "option-a" },
		});
		expect(promote("wiring@option-a", ["worker", "wire"], "service", "option-a", "Worker")).toBe(
			"worker",
		);
		const wiringDescription = cli(["describe", "--board", "wiring@option-a"]);
		expect(wiringDescription.stdout).toMatch(/\(2 nodes, 0 edges/);
		const wiring = (
			await request<CompareBody>("/api/boards/compare?from=wiring&to=wiring@option-a")
		).body;
		expect(wiring.summary).toMatchObject({
			sharedNodes: 2,
			nodesRemoved: 0,
			edgesRemoved: 1,
			edgesAdded: 0,
		});
		expect(wiring.warnings.join("\n")).toMatch(/includes a connector/);
		expect(wiring.warnings.join("\n")).toMatch(/"Web".*"Worker"/);
		expect(readFileSync(sourceFile)).toEqual(sourceBytes);
	}, 45_000);
});
