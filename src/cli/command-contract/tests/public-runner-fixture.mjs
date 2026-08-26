#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { z } from "zod";

const fixturePath = process.argv[2];
if (!fixturePath) throw new Error("public runner fixture needs a record path");
const record = JSON.parse(readFileSync(fixturePath, "utf8"));

const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/health") {
			return Response.json({
				service: "mcp-excalidraw-canvas",
				status: "ok",
				websocket_clients: 1,
			});
		}
		if (url.pathname === "/api/boards/info") {
			return Response.json({ success: true, held: record.held });
		}
		return Response.json({ success: false, error: `unexpected ${url.pathname}` }, { status: 404 });
	},
});

try {
	process.env.EXPRESS_SERVER_URL = `http://127.0.0.1:${server.port}`;
	process.env.EXCALIDRAW_NO_AUTOSTART = "1";
	const [{ getBoardInfo }, { cliContractRegistry }, { defineCommand }, { runCommand }] =
		await Promise.all([
			import("../../../runtime/engine/canvas-client.js"),
			import("../../commands/run.js"),
			import("../contract.js"),
			import("../runner.js"),
		]);
	await getBoardInfo();
	const source = cliContractRegistry().find((entry) => entry.name === record.path)?.contract;
	if (!source) throw new Error(`missing contract ${record.path}`);
	const outputCase = source.output.cases.find((candidate) => candidate.id === record.outputCase);
	if (!outputCase) throw new Error(`missing output case ${record.path}:${record.outputCase}`);
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
	server.stop(true);
}
