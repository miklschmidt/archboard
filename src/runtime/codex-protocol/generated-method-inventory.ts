import { readFileSync } from "node:fs";
import { join } from "node:path";

export type GeneratedProtocolMethodDirection =
	| "response"
	| "clientNotification"
	| "serverRequest"
	| "serverNotification";

export interface GeneratedProtocolMethodInventories {
	readonly response: readonly string[];
	readonly clientNotification: readonly string[];
	readonly serverRequest: readonly string[];
	readonly serverNotification: readonly string[];
}

const GENERATED_METHOD_FILES: Readonly<Record<GeneratedProtocolMethodDirection, string>> =
	Object.freeze({
		response: "ClientRequest.ts",
		clientNotification: "ClientNotification.ts",
		serverRequest: "ServerRequest.ts",
		serverNotification: "ServerNotification.ts",
	});

function generatedMethods(root: string, file: string): string[] {
	const source = readFileSync(join(root, file), "utf8");
	const methods = [...source.matchAll(/"method"\s*:\s*"([^"]+)"/g)].map((match) => match[1]!);
	if (!methods.length) throw new Error(`Generated ${file} contains no method literals`);
	const unique = new Set(methods);
	if (unique.size !== methods.length)
		throw new Error(`Generated ${file} contains duplicate method literals`);
	return methods.toSorted();
}

/** Derives all generated JSON-RPC method sets from one temporary tree. */
export function deriveGeneratedProtocolMethodInventories(
	root: string,
): GeneratedProtocolMethodInventories {
	return {
		response: generatedMethods(root, GENERATED_METHOD_FILES.response),
		clientNotification: generatedMethods(root, GENERATED_METHOD_FILES.clientNotification),
		serverRequest: generatedMethods(root, GENERATED_METHOD_FILES.serverRequest),
		serverNotification: generatedMethods(root, GENERATED_METHOD_FILES.serverNotification),
	};
}
