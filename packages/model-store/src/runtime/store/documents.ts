import {
	type DocumentKind,
	type DocumentOptions,
	type ModelDocument,
	type ModelRequest,
	parseDocument,
	parseModelRequest,
	type RequestOperation,
} from "@archboard/model-contract";

/**
 * Read a document the store holds as bytes it wrote itself, or refuse it as the schema does.
 * @param kind The kind of document.
 * @param raw The parsed value.
 * @param options How to treat keys the kind does not know.
 * @returns The document.
 * @throws {Error} The reading's error, as the schema's own parse threw it.
 */
function requireDocument<K extends DocumentKind>(
	kind: K,
	raw: unknown,
	options?: DocumentOptions,
): ModelDocument<K> {
	const result = parseDocument(kind, raw, options);
	if (!result.success) throw result.error;
	return result.data;
}

/**
 * Read an intent a caller hands the store again before it writes, or refuse it as the route did.
 * @param operation The operation asked for.
 * @param input The intent as the caller wrote it.
 * @returns The intent, defaults filled.
 * @throws {Error} The reading's error, as the schema's own parse threw it.
 */
function requireRequest<O extends RequestOperation>(operation: O, input: unknown): ModelRequest<O> {
	const result = parseModelRequest(operation, input);
	if (!result.success) throw result.error;
	return result.data;
}

export { requireDocument, requireRequest };
