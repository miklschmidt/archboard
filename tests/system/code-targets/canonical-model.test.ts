import { expect, test } from "bun:test";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
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
