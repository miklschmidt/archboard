import fs from "node:fs";

import { z } from "zod";

import { CliUsageError, defineCommand } from "../command-contract/contract.js";
import { PendingArtifactSchema } from "../command-contract/schemas.js";
import {
	boardRequiredRefusal,
	browserRefusal,
	serverRefusal,
} from "../command-contract/refusals.js";
import {
	InspectionOptionsInputSchema,
	inspectionOptionParameters,
	inspectionPolicyOf,
} from "../inspection-policy/index.js";
import { currentRequestedBoard, exportFindings } from "../../runtime/engine/canvas-client.js";
import {
	assembleFindingArtifacts,
	FindingRenderManifestSchema,
} from "../finding-rendering/index.js";

export const RenderFindingsInputSchema = InspectionOptionsInputSchema.extend({
	out: z.string().min(1, "render-findings requires --out <existing-empty-directory>"),
	tail: z.array(z.string()).default([]),
});

function requireEmptyDirectory(directory: string): void {
	let stat: fs.Stats;
	try {
		stat = fs.statSync(directory);
	} catch {
		throw new CliUsageError(`--out must name an existing empty directory: ${directory}`);
	}
	if (!stat.isDirectory() || fs.readdirSync(directory).length > 0)
		throw new CliUsageError(`--out must name an existing empty directory: ${directory}`);
}

export const renderFindingsContract = defineCommand({
	path: ["render-findings"],
	summary: "Render deterministic PNG close-ups for persisted board findings",
	usage: [
		"render-findings --board <key> --out <existing-empty-directory>",
		"                [--font-family <family>] [--dimension-tolerance <px>]",
		"                [--intersection-tolerance <px>] [--overlap-tolerance <px>]",
	].join("\n"),
	description:
		"Inspects one named note snapshot, renders its existing finding focus boxes in a browser, and commits validated PNGs plus manifest.json.",
	examples: ["archboard render-findings --board payments --out ./finding-renders"],
	parameters: [
		{
			kind: "option",
			key: "out",
			spellings: ["--out"],
			value: "required",
			description: "Existing empty output directory",
		},
		...inspectionOptionParameters,
		{
			kind: "positional",
			key: "tail",
			name: "extra",
			repeatable: true,
			description: "Unexpected positional arguments",
		},
	],
	input: { ingress: RenderFindingsInputSchema },
	result: FindingRenderManifestSchema,
	output: {
		cases: [
			{
				id: "manifest",
				when: {},
				mode: "file-receipt",
				held: "none",
				description: "Validated manifest after every artifact commits",
				presentation: ["result"],
				artifact: PendingArtifactSchema,
			},
		],
		select: () => "manifest",
	},
	prerequisites: ["server", "browser", "board"],
	effects: ["read", "browser", "local-read", "local-write"],
	refusals: [boardRequiredRefusal, serverRefusal, browserRefusal],
	relationships: [
		{
			method: "POST",
			path: "/api/export/findings",
			cardinality: "one",
			description: "One correlated persisted-snapshot finding export",
		},
	],
	async handler(input, context) {
		if (input.tail.length > 0)
			throw new CliUsageError("render-findings takes no positional arguments");
		const board = currentRequestedBoard();
		if (!board) throw new CliUsageError("render-findings requires --board <key>");
		const out = context.resolvePath(input.out);
		requireEmptyDirectory(out);
		const policy = inspectionPolicyOf(input);
		await context.require("server", "Rendering board findings");
		await context.require("browser", "Rendering board findings");
		const rendered = await exportFindings(policy);
		const { manifest, artifact } = assembleFindingArtifacts(rendered, out);
		return { result: manifest, pendingArtifact: artifact };
	},
});
