import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
	initializeArchitectureModel,
	claimArchitectureSubjects,
	editArchitectureModule,
	releaseArchitectureClaim,
} from "@archboard/board/store-write";
import { readArchitectureModel } from "@archboard/board/store-read";
const named = process.argv[2];
if (named === undefined)
	throw new Error("Name the destination vault: bun scripts/build-pipeline-example.ts <vault>.");
const vault = resolve(named);
mkdirSync(vault, { recursive: true });
const initialized = await initializeArchitectureModel(vault, {
	name: "Pipeline example",
	operationId: "pipeline-example-init",
	writer: "example",
	doing: "Initialize the canonical example",
});
if (!initialized.success) throw new Error(JSON.stringify(initialized));
const model = readArchitectureModel(vault);
if (!model.success) throw new Error(JSON.stringify(model));
if (model.proposals.some((proposal) => proposal.name === "Initial pipeline")) {
	console.log(JSON.stringify(model));
} else {
	const target = { model: model.manifest.id, state: model.manifest.current?.id ?? null };
	const claimed = await claimArchitectureSubjects(vault, {
		target,
		writer: "example",
		reason: "Build the canonical pipeline example",
		subjects: [model.manifest.id],
	});
	if (!claimed.success) throw new Error(JSON.stringify(claimed));
	try {
		const result = await editArchitectureModule(vault, {
			target,
			writer: "example",
			claim: claimed.claim.id,
			operationId: "pipeline-example-proposal",
			doing: "Describe the canonical pipeline",
			expectedRevision: model.revision,
			proposal: { type: "create", name: "Initial pipeline" },
			changes: [
				{
					type: "add-module",
					module: {
						name: "CLI",
						kind: "service",
						order: 0,
						responsibility: "Adapts explicit architecture requests",
					},
				},
				{
					type: "add-module",
					module: {
						name: "Architecture runtime",
						kind: "module",
						order: 1,
						responsibility: "Validates one canonical intent and installs it durably",
					},
				},
				{
					type: "add-module",
					module: {
						name: "Archive",
						kind: "datastore",
						order: 2,
						responsibility: "Retains exact checkpoints and operation results",
					},
				},
				{
					type: "add-relationship",
					source: "CLI",
					relationship: {
						to: "Architecture runtime",
						kind: "call",
						order: 0,
						label: "Submit one intent",
					},
				},
				{
					type: "add-relationship",
					source: "Architecture runtime",
					relationship: { to: "Archive", kind: "data", order: 1, label: "Retain exact history" },
				},
			],
		});
		if (!result.success) throw new Error(JSON.stringify(result));
		console.log(JSON.stringify(result));
	} finally {
		await releaseArchitectureClaim(vault, { claim: claimed.claim.id, writer: "example" });
	}
}
