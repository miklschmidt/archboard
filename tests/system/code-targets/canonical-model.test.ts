import { expect, test } from "bun:test";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readArchitectureModel, readLegacyInventory } from "@archboard/board/store-read";
import {
	claimArchitectureSubjects,
	editArchitectureModule,
	migrateArchitectureModel,
	saveLegacyMappingPlan,
} from "@archboard/board/store-write";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import {
	createOpenerFixture,
	jsonBody,
	type OpenerFixtureOptions,
} from "./support/opener-fixture.ts";

test("canonical modules use the existing opener and refuse a mismatched model identity", async () => {
	await using resources = new AsyncDisposableStack();
	const options: OpenerFixtureOptions = { defaultDependencies: true };
	const fixture = await createOpenerFixture(options);
	resources.defer(() => fixture.dispose());
	const invocation = fixture.invocation("immediate");
	resources.defer(() => invocation.releaseAndWait());
	const vault = join(fixture.checkout, ".archboard/vault");
	options.vault = vault;
	cpSync(resolve("examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	const path = join(vault, "gateway.module.json");
	const gateway = JSON.parse(readFileSync(path, "utf8"));
	writeFileSync(
		path,
		JSON.stringify({ ...gateway, binding: { repo: fixture.repository, path: "src/index.ts" } }),
	);
	expect(
		(
			await fixture.request("/api/settings/opener", {
				method: "PUT",
				body: jsonBody(invocation.selection),
			})
		).status,
	).toBe(200);
	const opened = await fixture.request("/api/code-targets/open", {
		method: "POST",
		body: jsonBody({ model: "Shop", subject: "Shop#Gateway" }),
	});
	expect(opened.status).toBe(200);
	expect(await invocation.waitForCapture()).toMatchObject({
		target: join(fixture.checkout, "src/index.ts"),
	});
	const refused = await fixture.request("/api/code-targets/open", {
		method: "POST",
		body: jsonBody({ model: "Other", subject: "Shop#Gateway" }),
	});
	expect(refused.body).toMatchObject({ success: false, code: "MODEL_UNAVAILABLE" });
});

test("canonical code activation opens the selected draft binding instead of current code", async () => {
	await using resources = new AsyncDisposableStack();
	const options: OpenerFixtureOptions = { defaultDependencies: true };
	const fixture = await createOpenerFixture(options);
	resources.defer(() => fixture.dispose());
	const invocation = fixture.invocation("immediate");
	resources.defer(() => invocation.releaseAndWait());
	const vault = join(fixture.checkout, ".archboard/vault");
	options.vault = vault;
	cpSync(resolve("examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	for (const [key, value] of [
		["user.name", "Opener Author"],
		["user.email", "opener@example.test"],
		["commit.gpgsign", "false"],
	]) {
		const result = Bun.spawnSync(["git", "-C", fixture.checkout, "config", key!, value!]);
		if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	}
	writeFileSync(join(fixture.checkout, "src/planned.ts"), "export const planned = true;\n");
	const gatewayPath = join(vault, "gateway.module.json");
	const gateway = JSON.parse(readFileSync(gatewayPath, "utf8"));
	writeFileSync(
		gatewayPath,
		JSON.stringify({
			...gateway,
			binding: { repo: fixture.repository, path: "src/index.ts" },
		}),
	);
	const current = readArchitectureModel(vault);
	if (!current.success || current.manifest.current === null)
		throw new Error(JSON.stringify(current));
	const target = { model: "Shop", state: current.manifest.current.id };
	const claim = await claimArchitectureSubjects(vault, {
		target,
		writer: "fixture-agent",
		reason: "Planning another code location",
		subjects: ["Shop", "Shop#Gateway"],
	});
	if (!claim.success) throw new Error(JSON.stringify(claim));
	const created = await editArchitectureModule(vault, {
		target,
		expectedRevision: current.revision,
		claim: claim.claim.id,
		operationId: "draft-code-target",
		writer: "fixture-agent",
		doing: "Binding planned code",
		proposal: { type: "create", name: "Planned source" },
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { binding: { repo: fixture.repository, path: "src/planned.ts" } },
			},
		],
	});
	if (!created.success) throw new Error(JSON.stringify(created));
	await fixture.request("/api/settings/opener", {
		method: "PUT",
		body: jsonBody(invocation.selection),
	});
	const opened = await fixture.request("/api/code-targets/open", {
		method: "POST",
		body: jsonBody({ model: "Shop", subject: "Shop#Gateway", state: created.target.state }),
	});
	expect(opened.status).toBe(200);
	expect(await invocation.waitForCapture()).toMatchObject({
		target: join(fixture.checkout, "src/planned.ts"),
	});
	const refused = await fixture.request("/api/code-targets/open", {
		method: "POST",
		body: jsonBody({ model: "Shop", subject: "Shop#Gateway", state: "Missing" }),
	});
	expect(refused.body).toMatchObject({ success: false, code: "MODEL_UNAVAILABLE" });
	expect(readArchitectureModel(vault)).toMatchObject({
		modules: expect.arrayContaining([
			expect.objectContaining({
				id: "Shop#Gateway",
				binding: current.modules.find((module) => module.id === "Shop#Gateway")?.binding,
			}),
		]),
	});
});

test("code activation preserves exact original coverage and refuses conflicting ordinary selectors", async () => {
	await using resources = new AsyncDisposableStack();
	const options: OpenerFixtureOptions = { defaultDependencies: true };
	const fixture = await createOpenerFixture(options);
	resources.defer(() => fixture.dispose());
	const invocation = fixture.invocation("immediate");
	resources.defer(() => invocation.releaseAndWait());
	const git = (...args: string[]) => {
		const result = Bun.spawnSync(["git", "-C", fixture.checkout, ...args]);
		if (result.exitCode !== 0) throw new Error(result.stderr.toString());
		return result.stdout.toString().trim();
	};
	git("config", "user.name", "Opener Author");
	git("config", "user.email", "opener@example.test");
	git("config", "commit.gpgsign", "false");
	git("add", "src/index.ts");
	git("commit", "--quiet", "-m", "test: retain original source");
	const commit = git("rev-parse", "HEAD");
	const vault = join(fixture.checkout, ".archboard/vault");
	options.vault = vault;
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	writeFileSync(join(vault, ".archboard/config.yaml"), Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY));
	const original = JSON.parse(
		readFileSync(resolve("examples/legacy-migration/originals/System.semantic.json"), "utf8"),
	);
	original.id = "System";
	original.variants[0].content.nodes[0].binding = {
		repo: fixture.repository,
		path: "src/index.ts",
		commit,
	};
	writeFileSync(join(vault, "System.semantic.json"), JSON.stringify(original));
	const inventory = readLegacyInventory(vault, "Shop");
	if (!inventory.success) throw new Error(JSON.stringify(inventory));
	const saved = await saveLegacyMappingPlan(vault, {
		plan: inventory.plan,
		expectedPlan: inventory.planRevision,
		doing: "Save original coverage",
	});
	if (!saved.success) throw new Error(JSON.stringify(saved));
	const preview = await readArchitectureModel(vault, undefined, undefined, { preview: "Shop" });
	if (!preview.success) throw new Error(JSON.stringify(preview));
	const installed = await migrateArchitectureModel(vault, {
		origin: "Shop",
		expectedSource: preview.migrationPreview!.source,
		expectedPlan: preview.migrationPreview!.planRevision!,
		previewRevision: preview.revision,
		...preview.migrationPreview!.installation!,
		authorization: "owner",
		operationId: "opener-original",
		writer: "owner",
		doing: "Install original coverage",
	});
	if (!installed.success) throw new Error(JSON.stringify(installed));
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const address = {
		model: "Shop",
		subject: "Shop/System#API",
		preview: "Shop",
		state: "Shop/System#Now",
		checkpoint: current.migration!.checkpoint,
	};
	await fixture.request("/api/settings/opener", {
		method: "PUT",
		body: jsonBody(invocation.selection),
	});
	const opened = await fixture.request("/api/code-targets/open", {
		method: "POST",
		body: jsonBody(address),
	});
	expect(opened.status).toBe(200);
	expect(await invocation.waitForCapture()).toMatchObject({
		target: join(fixture.checkout, "src/index.ts"),
	});
	const { preview: _preview, ...ordinary } = address;
	const refused = await fixture.request("/api/code-targets/open", {
		method: "POST",
		body: jsonBody(ordinary),
	});
	expect(refused.status).toBe(400);
	expect(refused.body).toMatchObject({ success: false, code: "REQUEST_INVALID" });
});
