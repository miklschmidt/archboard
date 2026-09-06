import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { CodeTargetOpenFailureSchema } from "../../../src/shared/code-target/index.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";

const repoRoot = resolve(import.meta.dir, "../../..");

test("the public activation reaches its exemption before its handler", async () => {
	await using resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-opener-boundary-"));
	resources.defer(() => rmSync(root, { recursive: true }));
	const vault = join(root, "vault");
	mkdirSync(vault);
	const canvas = await startOwnedCanvas({
		serverPath: join(repoRoot, "src/server.ts"),
		vault,
		env: { ARCHBOARD_OPENER_CONFIG: join(root, "opener.json") },
	});
	resources.defer(() => canvas.dispose());
	const response = await fetch(`${canvas.base}/api/code-targets/open?expectVersion=bad`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Origin: canvas.base,
			"Sec-Fetch-Site": "same-origin",
		},
		body: JSON.stringify({ board: "scratch", element: "missing" }),
	});
	const reply = CodeTargetOpenFailureSchema.parse(await response.json());

	expect(response.status).toBe(400);
	expect(reply).toMatchObject({
		code: "REQUEST_INVALID",
		error: "Activation query parameters are not accepted.",
	});
});
