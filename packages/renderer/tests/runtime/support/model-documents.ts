// Fixtures read through the contract's own operation, as a vault's files are:
// a fixture the contract refuses fails the test that builds it.

import {
	describeModelSchema,
	parseDocument,
	type DocumentKind,
	type ModelDocument,
} from "@archboard/model-contract";

/**
 * The document a fixture writes, read as the contract reads it.
 * @param kind The kind of document.
 * @param raw The fixture as written.
 * @returns The document.
 * @throws When the contract refuses the fixture, with the contract's reason.
 */
function fixtureDocument<K extends DocumentKind>(kind: K, raw: unknown): ModelDocument<K> {
	const parsed = parseDocument(kind, raw);
	if (parsed.success) return parsed.data;
	const { error } = parsed;
	throw typeof error === "string" ? new Error(error) : error;
}

/** Where the vault configuration's schema lists the colours a group may take. */
const GROUP_COLOURS = [
	"properties",
	"groups",
	"additionalProperties",
	"properties",
	"color",
	"enum",
];

/**
 * Every named colour, as the vault configuration's schema offers them to a group.
 * @returns The colours, each read as the contract reads a colour.
 * @throws When the schema offers none, so that a test over every colour cannot pass empty.
 */
function paletteColours(): ModelDocument<"paletteColor">[] {
	const offered = GROUP_COLOURS.reduce<unknown>(
		(node, key) => (typeof node === "object" && node !== null ? Reflect.get(node, key) : undefined),
		describeModelSchema("vault-config"),
	);
	if (!Array.isArray(offered) || offered.length === 0)
		throw new Error("The vault configuration's schema offers a group no colour.");
	return offered.map((color: unknown) => fixtureDocument("paletteColor", color));
}

export { fixtureDocument, paletteColours };
