import { afterAll, beforeAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { z } from "zod";
import { Window } from "happy-dom";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import { projectModel } from "@archboard/board/content";
import {
	claimArchitectureSubjects,
	editArchitectureModule,
	releaseArchitectureClaim,
} from "@archboard/board/store-write";
import {
	ArchitectureRenderResultSchema,
	type ArchitectureRenderRequestSchema,
	type ArchitectureModuleEdit,
} from "@archboard/board/model";
import { readRenderRecipe } from "@archboard/renderer/recipe";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const home = mkdtempSync(join(tmpdir(), "archboard-render-context-"));
const vault = vaultIn(home);
let server: OwnedServer | undefined;
const dom = new Window();

beforeAll(async () => {
	cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	const gateway = JSON.parse(readFileSync(join(vault, "gateway.module.json"), "utf8"));
	gateway.outgoing.push({
		id: "Shop#Second",
		to: "Shop#Worker",
		kind: "call",
		order: 20,
		label: "Second route",
	});
	writeFileSync(join(vault, "gateway.module.json"), JSON.stringify(gateway));
	const worker = JSON.parse(readFileSync(join(vault, "worker.module.json"), "utf8"));
	worker.outgoing = [{ id: "Shop#Enter", to: "Shop#Handler", kind: "call", order: 10 }];
	writeFileSync(join(vault, "worker.module.json"), JSON.stringify(worker));
	for (const [id, order, parent] of [
		["Job", 40, "Shop#Gateway"],
		["Core", 50, "Shop#Gateway"],
		["Obsolete", 60, undefined],
	] as const) {
		writeFileSync(
			join(vault, `${id}.module.json`),
			JSON.stringify({
				schemaVersion: 1,
				id: `Shop#${id}`,
				name: id,
				kind: "module",
				order,
				parent,
				outgoing:
					id === "Job" ? [{ id: "Shop#Tick", to: "Shop#Core", kind: "call", order: 10 }] : [],
			}),
		);
	}
	writeFileSync(
		join(vault, "behavior.flows.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Behavior",
			name: "Behavior",
			flows: [
				{
					id: "Shop#Request",
					name: "Request",
					participants: ["Shop#Gateway", "Shop#Worker"],
					steps: [
						{
							id: "Shop#Send",
							from: "Shop#Gateway",
							to: "Shop#Worker",
							kind: "sync",
							label: "Dispatch",
						},
					],
				},
			],
		}),
	);
	for (const args of [
		["init", "--quiet"],
		["config", "user.name", "Render Author"],
		["config", "user.email", "render@example.test"],
		["config", "commit.gpgsign", "false"],
		["remote", "add", "origin", "https://github.com/acme/shop.git"],
		["add", "."],
		["commit", "--quiet", "-m", "test: seed render context"],
	]) {
		const result = Bun.spawnSync(["git", "-C", home, ...args]);
		if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	}
	server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
});
afterAll(async () => {
	await server?.dispose();
	await dom.happyDOM.close();
	rmSync(home, { recursive: true, force: true });
});

async function edit(
	state: string,
	changes: Extract<ArchitectureModuleEdit, { changes: unknown }>["changes"],
	proposal?: Extract<ArchitectureModuleEdit, { proposal: unknown }>["proposal"],
) {
	const current = await readArchitectureModel(vault, undefined, undefined, {
		state,
		compare: false,
	});
	if (!current.success) throw new Error(JSON.stringify(current));
	const target = { model: current.manifest.id, state };
	const claim = await claimArchitectureSubjects(vault, {
		target,
		writer: "render-agent",
		reason: "repairing render context",
		subjects: [
			current.manifest.id,
			state,
			...current.modules.map((module) => module.id),
			...current.relationships.map((edge) => edge.id),
			...current.collections.flatMap((collection) =>
				collection.flows.flatMap((flow) => [flow.id, ...flow.steps.map((step) => step.id)]),
			),
			...current.proposals.map((draft) => draft.id),
		],
	});
	if (!claim.success) throw new Error(JSON.stringify(claim));
	try {
		const result = await editArchitectureModule(vault, {
			target,
			writer: "render-agent",
			doing: "repairing render context",
			claim: claim.claim.id,
			expectedRevision: current.revision,
			operationId: crypto.randomUUID(),
			changes,
			...(proposal === undefined ? {} : { proposal }),
		});
		if (!result.success) throw new Error(JSON.stringify(result));
		return result;
	} finally {
		await releaseArchitectureClaim(vault, { claim: claim.claim.id, writer: "render-agent" });
	}
}

async function render(selectors: z.input<typeof ArchitectureRenderRequestSchema> = {}) {
	const parameters = new URLSearchParams({ vault });
	for (const [key, value] of Object.entries(selectors)) {
		if (value === undefined) continue;
		for (const entry of typeof value === "string" ? [value] : value) parameters.append(key, entry);
	}
	const response = await fetch(`${server!.base}/api/architecture/render?${parameters}`);
	const result = ArchitectureRenderResultSchema.parse(await response.json());
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(response.status).toBe(200);
	return result;
}

// The warning belongs to its semantic SVG group, independently of human-readable copy.
function group(svg: string, id: string): string {
	return [
		...new dom.DOMParser()
			.parseFromString(svg, "image/svg+xml")
			.querySelectorAll(`[data-semantic-id="${id}"]`),
	]
		.map((element) => element.outerHTML)
		.join("\n");
}

test("canonical aggregates draw compact counts while retaining authored relationships and exact visibility", async () => {
	const reading = await readArchitectureModel(vault, undefined, undefined, { compare: false });
	if (!reading.success) throw new Error(JSON.stringify(reading));
	const authored = reading.relationships.filter((edge) => edge.from === "Shop#Gateway");
	const root = projectModel(reading);
	const aggregate = root.connections.find(({ line }) => line.id === "Shop#Dispatch")!;
	expect(aggregate.line).toEqual({
		id: "Shop#Dispatch",
		from: "Shop#Gateway",
		to: "Shop#Worker",
		kind: "call",
		order: 10,
		label: expect.stringMatching(/\b2\b/),
		emphasis: "normal",
	});
	expect(aggregate.line.label).not.toContain("\n");
	expect([...aggregate.joins]).toEqual(authored);
	expect(aggregate.joins.map((edge) => edge.label)).toEqual(["Dispatch request", "Second route"]);
	const reverse = reading.relationships.find((edge) => edge.id === "Shop#Enter")!;
	expect(root.connections.find(({ line }) => line.id === reverse.id)).toEqual({
		line: { ...reverse, to: "Shop#Gateway" },
		joins: [reverse],
	});
	expect(projectModel(reading, "Shop#Worker").connections).toEqual(root.connections);
	expect(projectModel(reading, null, ["Shop#Gateway"]).connections).toEqual(root.connections);
	const focused = projectModel(reading, null, ["Shop#Dispatch"]);
	expect(focused.connections).toEqual([{ line: authored[0]!, joins: [authored[0]!] }]);
	const exact = projectModel(reading, null, null, {}, undefined, {
		modules: ["Shop#Gateway", "Shop#Worker"],
		relationships: ["Shop#Dispatch", "Shop#Second"],
		flows: [],
	});
	expect(exact.connections).toEqual(authored.map((edge) => ({ line: edge, joins: [edge] })));
	const picture = await render();
	const texts = new dom.DOMParser()
		.parseFromString(picture.svg, "image/svg+xml")
		.querySelectorAll('[data-semantic-id="Shop#Dispatch"] text');
	expect([...texts].map((element) => element.textContent).join(" ")).toBe(aggregate.line.label!);
});

test("canonical exports retain default comparison and unresolved subject marks through exact recipes", async () => {
	const draft = await edit(
		"Current",
		[
			{ type: "edit-module", subject: "Shop#Gateway", set: { responsibility: "Draft gateway" } },
			{ type: "edit-relationship", subject: "Shop#Dispatch", set: { label: "Draft dispatch" } },
			{ type: "edit-relationship", subject: "Shop#Second", set: { label: "Draft route" } },
			{ type: "edit-step", subject: "Shop#Send", set: { label: "Draft message" } },
			{ type: "remove-module", subject: "Shop#Obsolete" },
		],
		{ type: "create", name: "Render proposal" },
	);
	const state = draft.target.state!;
	await edit("Current", [
		{ type: "edit-module", subject: "Shop#Gateway", set: { responsibility: "Current gateway" } },
		{ type: "edit-relationship", subject: "Shop#Second", set: { label: "Current route" } },
		{ type: "edit-step", subject: "Shop#Send", set: { label: "Current message" } },
	]);
	const retained = await edit(
		state,
		[
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "Retained draft context" },
			},
		],
		{ type: "edit" },
	);
	const selected = await readArchitectureModel(vault, undefined, undefined, { state });
	if (!selected.success) throw new Error(JSON.stringify(selected));
	expect(selected.comparison?.reason).toBe("current");
	const drawn = await render({ state });
	expect(drawn.state).toBe(state);
	expect(drawn.revision).toEqual(selected.revision);
	expect(group(drawn.svg, "Shop#Gateway")).toContain('d="M0,-5.2');
	expect(group(drawn.svg, "Shop#Dispatch")).toContain('d="M0,-5.2');
	expect(group(drawn.svg, "Shop#Gateway")).toContain('data-semantic-standing="changed"');
	expect(group(drawn.svg, "Shop#Obsolete")).toContain('data-semantic-standing="removed"');
	for (const grammar of ["sequence", "flowchart"] as const) {
		const picture = await render({
			state,
			grammar,
			flow: "Shop#Request",
			focus: ["Shop#Obsolete"],
			hideKinds: ["call"],
		});
		expect(picture.placed).toEqual(expect.arrayContaining(["Shop#Send"]));
		if (grammar === "sequence") expect(group(picture.svg, "Shop#Gateway")).toContain('d="M0,-5.2');
		expect(group(picture.svg, "Shop#Send")).toContain('d="M0,-5.2');
	}
	const pinned = await render({ checkpoint: retained.checkpoint.id });
	expect(pinned.checkpoint).toBe(retained.checkpoint.id);
	expect(pinned.state).toBe(state);
	expect(group(pinned.svg, "Shop#Gateway")).toContain('d="M0,-5.2');
	const recipe = readRenderRecipe(Buffer.from(pinned.svg));
	if (recipe.kind !== "recipe" || recipe.recipe.recipe !== 2)
		throw new Error(JSON.stringify(recipe));
	expect(recipe.recipe.reading).toMatchObject({ checkpoint: retained.checkpoint.id });
	await edit(
		state,
		[{ type: "edit-module", subject: "Shop#Gateway", set: { name: "Later gateway" } }],
		{ type: "edit" },
	);
	const replay = await render(recipe.recipe.reading);
	expect(replay.revision).toEqual(pinned.revision);
	expect(replay.svg).toBe(pinned.svg);
	const out = join(home, "pinned.svg");
	const cli = runServerCli({
		repoRoot,
		server: server!,
		input: undefined,
		args: ["model", "render", "--checkpoint", retained.checkpoint.id, "--out", out],
	});
	expect(cli.status, cli.stderr).toBe(0);
	expect(readFileSync(out, "utf8")).toBe(pinned.svg);
}, 30000);

test("scoped exports keep complete container entry points when filters hide incoming relationships", async () => {
	const picture = await render({ module: "Gateway", hideKinds: ["call"] });
	const entry = picture.atlas.nodes["Shop#Handler"]!;
	const hidden = picture.atlas.nodes["Shop#Job"]!;
	expect(hidden.y).toBeGreaterThanOrEqual(entry.y + entry.height);
	expect(picture.atlas.edges).toEqual({});
});
