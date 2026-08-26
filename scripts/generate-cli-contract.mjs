#!/usr/bin/env bun

import fs from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	CLI_CONTRACT_ARTIFACT_NAMES,
	renderCliContractArtifacts,
} from "./lib/cli-contract-artifacts.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
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
	fs.writeFileSync(join(outputDirectory, name), artifacts.get(name));
	console.log(`generated ${join(outputDirectory, name)}`);
}
