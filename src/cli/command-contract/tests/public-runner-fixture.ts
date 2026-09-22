#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { z } from "zod";

const recordSchema = z.object({
	path: z.string(),
	outputCase: z.string(),
	result: z.unknown(),
	artifact: z.unknown().optional(),
});

const fixturePath = process.argv[2];
if (!fixturePath) {
	throw new Error("public runner fixture needs a record path");
}
const record = recordSchema.parse(JSON.parse(readFileSync(fixturePath, "utf8")));

const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/health") {
			return Response.json({
				service: "archboard-canvas",
				status: "ok",
				websocket_clients: 1,
			});
		}
		if (url.pathname === "/api/sync/status") {
			return Response.json({ success: true });
		}
		return Response.json({ success: false, error: `unexpected ${url.pathname}` }, { status: 404 });
	},
});

try {
	process.env["EXPRESS_SERVER_URL"] = `http://127.0.0.1:${server.port}`;
	process.env["ARCHBOARD_NO_AUTOSTART"] = "1";
	const [{ getSyncStatus }, { cliContractRegistry }, { defineCommand }, { runCommand }] =
		await Promise.all([
			import("../../../runtime/engine/canvas-client.js"),
			import("../../commands/run.js"),
			import("../contract.js"),
			import("../runner.js"),
		]);
	await getSyncStatus();
	const source = cliContractRegistry().find((entry) => entry.name === record.path)?.contract;
	if (!source) {
		throw new Error(`missing contract ${record.path}`);
	}
	const outputCase = source.output.cases.find((candidate) => candidate.id === record.outputCase);
	if (!outputCase) {
		throw new Error(`missing output case ${record.path}:${record.outputCase}`);
	}
	await runCommand(
		defineCommand({
			...source,
			path: ["held-proof"],
			parameters: [],
			input: { ingress: z.object({}) },
			output: { cases: [outputCase], select: () => outputCase.id },
			async handler() {
				return {
					result: record.result,
					...(record.artifact === undefined ? {} : { pendingArtifact: record.artifact }),
				};
			},
		}),
		[],
	);
} finally {
	await server.stop(true);
}
