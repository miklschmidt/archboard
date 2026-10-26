import { expect, test } from "bun:test";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import { claimArchitectureSubjects, editArchitectureModule } from "@archboard/board/store-write";
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
