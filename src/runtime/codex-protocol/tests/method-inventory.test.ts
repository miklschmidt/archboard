import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
	CLIENT_NOTIFICATION_METHODS,
	CLIENT_NOTIFICATION_SCHEMAS,
	CODEX_PROTOCOL_BINARY_VERSION,
	CODEX_PROTOCOL_GENERATED_CLIENT_REQUEST_EXCLUDED_METHODS,
	CodexProtocolConformanceError,
	digestGeneratedTree,
	RESPONSE_METHODS,
	RESPONSE_SCHEMAS,
	SERVER_NOTIFICATION_METHODS,
	SERVER_NOTIFICATION_SCHEMAS,
	SERVER_REQUEST_METHODS,
	SERVER_REQUEST_SCHEMAS,
} from "../index.js";
import { runCodexProtocolConformanceForTest } from "../conformance.js";

const responseAlias = "currentTime/read";

interface TestMethodInventories {
	response: string[];
	clientNotification: string[];
	serverRequest: string[];
	serverNotification: string[];
}

interface ProductionTestExpectations {
	binaryVersion: string;
	generatedFileCount: number;
	generatedTreeSha256: string;
	notificationUnionPaths: readonly { method: string; path: string }[];
	methodInventories: TestMethodInventories;
	decoderMethodInventories: TestMethodInventories;
	clientRequestResponseAlias: string;
	clientRequestExcludedMethods: string[];
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function fakeCodexExecutable(root: string, action: string): string {
	const executablePath = join(root, "fake-codex");
	const script = [
		"#!/bin/sh",
		"set -eu",
		'if [ "${1-}" = "--version" ]; then',
		`printf '%s\\n' '${CODEX_PROTOCOL_BINARY_VERSION}'`,
		"exit 0",
		"fi",
		'if [ "${1-}" = "app-server" ]; then',
		action,
		"fi",
		"exit 64",
	].join("\n");
	writeFileSync(executablePath, script);
	chmodSync(executablePath, 0o755);
	return executablePath;
}

function copyGeneratedFixtureAction(fixtureRoot: string): string {
	return [
		'out=""',
		'while [ "$#" -gt 0 ]; do',
		'if [ "$1" = "--out" ]; then out="$2"; fi',
		"shift",
		"done",
		'mkdir -p "$out"',
		`cp -R ${shellQuote(fixtureRoot)}/. "$out"/`,
		"exit 0",
	].join("\n");
}

function writeMethodInventoryFixture(
	fixtureRoot: string,
	typeName: string,
	methods: readonly string[],
	withParams: boolean,
): void {
	const params = withParams ? ', "params": {}' : "";
	const definitions = methods.map((method) => `{ "method": "${method}"${params} }`);
	writeFileSync(
		join(fixtureRoot, `${typeName}.ts`),
		`export type ${typeName} = ${definitions.join(" | ")};\n`,
	);
}

function writeProductionMethodFixture(fixtureRoot: string): void {
	const clientRequestMethods = [
		...RESPONSE_METHODS.filter((method) => method !== responseAlias),
		...CODEX_PROTOCOL_GENERATED_CLIENT_REQUEST_EXCLUDED_METHODS,
	].toSorted();
	writeMethodInventoryFixture(fixtureRoot, "ClientRequest", clientRequestMethods, true);
	writeMethodInventoryFixture(
		fixtureRoot,
		"ClientNotification",
		CLIENT_NOTIFICATION_METHODS,
		false,
	);
	writeMethodInventoryFixture(fixtureRoot, "ServerRequest", SERVER_REQUEST_METHODS, true);
	writeMethodInventoryFixture(fixtureRoot, "ServerNotification", SERVER_NOTIFICATION_METHODS, true);
}

function productionMethodInventories(): TestMethodInventories {
	return {
		response: [...RESPONSE_METHODS],
		clientNotification: [...CLIENT_NOTIFICATION_METHODS],
		serverRequest: [...SERVER_REQUEST_METHODS],
		serverNotification: [...SERVER_NOTIFICATION_METHODS],
	};
}

function productionDecoderMethodInventories(): TestMethodInventories {
	return {
		response: Object.keys(RESPONSE_SCHEMAS).toSorted(),
		clientNotification: Object.keys(CLIENT_NOTIFICATION_SCHEMAS).toSorted(),
		serverRequest: Object.keys(SERVER_REQUEST_SCHEMAS).toSorted(),
		serverNotification: Object.keys(SERVER_NOTIFICATION_SCHEMAS).toSorted(),
	};
}

function productionTestExpectations(fixtureRoot: string): ProductionTestExpectations {
	const digest = digestGeneratedTree(fixtureRoot);
	return {
		binaryVersion: CODEX_PROTOCOL_BINARY_VERSION,
		generatedFileCount: digest.fileCount,
		generatedTreeSha256: digest.sha256,
		notificationUnionPaths: [],
		methodInventories: productionMethodInventories(),
		decoderMethodInventories: productionDecoderMethodInventories(),
		clientRequestResponseAlias: responseAlias,
		clientRequestExcludedMethods: [...CODEX_PROTOCOL_GENERATED_CLIENT_REQUEST_EXCLUDED_METHODS],
	};
}

function expectProductionInventoryFailure(
	name: string,
	mutate: (expectations: ProductionTestExpectations) => void,
	message: string,
): void {
	test(name, () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-production-inventory-"));
		const fixtureRoot = join(root, "fixture");
		mkdirSync(fixtureRoot);
		writeProductionMethodFixture(fixtureRoot);
		const expectations = productionTestExpectations(fixtureRoot);
		mutate(expectations);
		const executablePath = fakeCodexExecutable(root, copyGeneratedFixtureAction(fixtureRoot));
		try {
			let thrown: unknown;
			try {
				runCodexProtocolConformanceForTest(executablePath, expectations);
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(CodexProtocolConformanceError);
			expect(thrown).toMatchObject({ phase: "inventory", executablePath });
			expect((thrown as Error).message).toContain(message);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
}

describe("ClientRequest method coverage conformance", () => {
	test("keeps the reviewed 0.151.0 ClientRequest accounting explicit", () => {
		expect(RESPONSE_METHODS.filter((method) => method !== responseAlias)).toHaveLength(32);
		expect([...CODEX_PROTOCOL_GENERATED_CLIENT_REQUEST_EXCLUDED_METHODS]).toHaveLength(125);
		expect(CODEX_PROTOCOL_GENERATED_CLIENT_REQUEST_EXCLUDED_METHODS as readonly string[]).toEqual(
			[...CODEX_PROTOCOL_GENERATED_CLIENT_REQUEST_EXCLUDED_METHODS].toSorted() as string[],
		);
	});

	expectProductionInventoryFailure(
		"rejects deleting thread/start from both response inventories",
		(expectations) => {
			expectations.methodInventories.response = expectations.methodInventories.response.filter(
				(method) => method !== "thread/start",
			);
			expectations.decoderMethodInventories.response =
				expectations.decoderMethodInventories.response.filter(
					(method) => method !== "thread/start",
				);
		},
		"unexpected thread/start",
	);

	expectProductionInventoryFailure(
		"rejects deleting currentTime/read from both response inventories",
		(expectations) => {
			expectations.methodInventories.response = expectations.methodInventories.response.filter(
				(method) => method !== responseAlias,
			);
			expectations.decoderMethodInventories.response =
				expectations.decoderMethodInventories.response.filter((method) => method !== responseAlias);
		},
		`required alias ${responseAlias}`,
	);

	expectProductionInventoryFailure(
		"rejects adding an ungenerated ClientRequest exclusion",
		(expectations) => {
			expectations.clientRequestExcludedMethods.push("future/unsupported");
		},
		"missing future/unsupported",
	);

	expectProductionInventoryFailure(
		"rejects removing a reviewed ClientRequest exclusion",
		(expectations) => {
			expectations.clientRequestExcludedMethods.shift();
		},
		"unexpected account/bedrock/discover",
	);

	expectProductionInventoryFailure(
		"rejects drifting a reviewed ClientRequest exclusion",
		(expectations) => {
			expectations.clientRequestExcludedMethods[0] = "account/bedrock/changed";
		},
		"missing account/bedrock/changed",
	);

	expectProductionInventoryFailure(
		"rejects overlap between supported and excluded ClientRequest methods",
		(expectations) => {
			expectations.clientRequestExcludedMethods.push("thread/start");
		},
		"supported/excluded overlap: thread/start",
	);

	expectProductionInventoryFailure(
		"rejects duplicate ClientRequest exclusions",
		(expectations) => {
			expectations.clientRequestExcludedMethods.push(expectations.clientRequestExcludedMethods[0]!);
		},
		"duplicate exclusions",
	);

	expectProductionInventoryFailure(
		"rejects unstable ClientRequest exclusion ordering",
		(expectations) => {
			const first = expectations.clientRequestExcludedMethods[0]!;
			expectations.clientRequestExcludedMethods[0] = expectations.clientRequestExcludedMethods[1]!;
			expectations.clientRequestExcludedMethods[1] = first;
		},
		"stable sorted order",
	);
});
