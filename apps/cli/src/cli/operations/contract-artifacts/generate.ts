#!/usr/bin/env bun

import fs from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { SOURCE_CHECKOUT } from "@archboard/workspace/source-checkout";
import {
	CLI_CONTRACT_ARTIFACT_NAMES,
	renderCliContractArtifacts,
} from "#cli/operations/contract-artifacts/render.ts";

const root = SOURCE_CHECKOUT;
const outputFlag = process.argv.indexOf("--output-dir");
if (outputFlag >= 0 && !process.argv[outputFlag + 1]) {
	console.error("generate-cli-contract: --output-dir requires a directory.");
	process.exit(2);
}
const requestedOutput = outputFlag >= 0 ? process.argv[outputFlag + 1] : null;
const outputDirectory = requestedOutput
	? isAbsolute(requestedOutput)
		? requestedOutput
		: resolve(process.cwd(), requestedOutput)
	: join(root, "docs", "design", "generated");
const { artifacts } = await renderCliContractArtifacts(root);

fs.mkdirSync(outputDirectory, { recursive: true });
for (const name of CLI_CONTRACT_ARTIFACT_NAMES) {
	const content = artifacts.get(name);
	if (content === undefined) {
		throw new Error(`Missing rendered CLI contract artifact: ${name}`);
	}
	fs.writeFileSync(join(outputDirectory, name), content);
	console.log(`generated ${join(outputDirectory, name)}`);
}
