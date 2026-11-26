// How Terraform and OpenTofu spell an address (ADR 0046), shared by the
// adapter, which reads it from an expression, the configuration reader, and
// the plan reader, which reads it from the strings of a plan JSON.
//
// An address names a declaration of one module: `aws_sqs_queue.jobs`,
// `data.aws_iam_policy_document.read`, `ephemeral.random_password.db`,
// `module.checkout`, `var.region`, `local.tags`, and `module.checkout.url`
// for the output `url` of the module call `checkout`. A managed resource
// address may also select a single depth-1 named nested block:
// `azurerm_application_gateway.ingress.http_listener["device-https"]`.
// Optional instance keys (`[0]`, `["blue"]`) on leading `module.<ident>`
// segments and on the declaration itself are stripped, while a depth-1
// resource nested-block name is canonically unescaped and JSON-quoted.
// Numeric selectors on nested blocks, depth-2 blocks, and nested selectors on
// non-resource declarations are rejected.

/** The files of a Terraform or OpenTofu module. */
const TERRAFORM_FILE = /\.(?:tf|tofu)$/u;

/** Names that start no address: iteration, the module's path, the workspace, the object itself. */
const NOT_AN_ADDRESS = new Set(["count", "each", "path", "terraform", "self"]);

/**
 * How many names an address that starts with a name has, given how many the
 * reference has; two (`aws_sqs_queue.jobs`, `var.region`) for any other name.
 * A module call is `module.checkout`, or with the output it reads `module.checkout.url`.
 */
const LENGTH: ReadonlyMap<string, (written: number) => number> = new Map([
	["data", () => 3],
	["ephemeral", () => 3],
	["module", (written: number) => Math.max(2, Math.min(written, 3))],
]);

/** An HCL identifier at the start of a slice. */
const IDENT_PREFIX = /^[\p{L}_][\p{L}\p{N}_-]*/u;

/** A non-negative numeric bracket key after `[`. */
const NUMERIC_KEY = /^\d+\]/u;

/** Hexadecimal digits for `\u` and `\U` Unicode escapes. */
const HEX_DIGITS = /^[0-9a-fA-F]+$/u;

/** Single-character escapes accepted in HCL and JSON double-quoted strings. */
const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
	'"': '"',
	"\\": "\\",
	"/": "/",
	b: "\b",
	f: "\f",
	n: "\n",
	r: "\r",
	t: "\t",
};

/** Single-segment keyword declarations whose form is `<prefix>.<name>`. */
const NAMED_DECLARATIONS: Readonly<Record<string, "variable" | "local" | "output">> = {
	var: "variable",
	local: "local",
	output: "output",
};

/** A bracket selector on one address segment. */
type SegmentKey =
	| { readonly kind: "numeric" }
	| { readonly kind: "string"; readonly value: string };

/** One dot-separated segment of a Terraform address. */
interface AddressSegment {
	readonly name: string;
	readonly key?: SegmentKey;
}

/** A depth-1 nested block selector on a managed resource address. */
interface NestedBlockSelector {
	readonly blockType: string;
	readonly name: string;
}

/** A parsed, canonically normalized Terraform or OpenTofu address. */
interface ParsedTerraformAddress {
	/** The canonical address string, with instance keys stripped and any nested-block name JSON-quoted. */
	readonly address: string;
	/** Leading `module.<name>` names, outermost first. */
	readonly modules: readonly string[];
	/** The declaration kind. */
	readonly kind:
		| "resource"
		| "block"
		| "data"
		| "ephemeral"
		| "module"
		| "module-output"
		| "variable"
		| "local"
		| "output";
	/** The normalized declaration address without any trailing nested-block selector. */
	readonly declaration: string;
	/** The depth-1 nested block selector, present only when `kind === "block"`. */
	readonly nested?: NestedBlockSelector;
}

/**
 * Whether a file is Terraform or OpenTofu configuration.
 * @param file The file.
 * @returns True for a `.tf` or `.tofu` file.
 */
function isTerraformFile(file: string): boolean {
	return TERRAFORM_FILE.test(file);
}

/**
 * Decode a `\uXXXX` or `\UXXXXXXXX` escape sequence.
 * @param text The source string.
 * @param at The index of the first hex digit.
 * @param width Expected hex digit count (4 or 8).
 * @returns The decoded character and next index, or undefined when invalid.
 */
function decodeUnicode(
	text: string,
	at: number,
	width: number,
): { readonly value: string; readonly next: number } | undefined {
	const hex = text.slice(at, at + width);
	if (hex.length !== width || !HEX_DIGITS.test(hex)) return undefined;
	const code = Number.parseInt(hex, 16);
	return code <= 0x10ffff ? { value: String.fromCodePoint(code), next: at + width } : undefined;
}

/**
 * Decode an HCL/JSON escape sequence starting right after `\`.
 * @param text The source string.
 * @param at The index immediately after `\`.
 * @returns The decoded character and next index, or undefined when invalid.
 */
function decodeEscape(
	text: string,
	at: number,
): { readonly value: string; readonly next: number } | undefined {
	const ch = text[at];
	if (ch === undefined) return undefined;
	const simple = SIMPLE_ESCAPES[ch];
	if (simple !== undefined) return { value: simple, next: at + 1 };
	if (ch === "u") return decodeUnicode(text, at + 1, 4);
	if (ch === "U") return decodeUnicode(text, at + 1, 8);
	return undefined;
}

/**
 * Read one character or escape sequence inside a double-quoted string.
 * @param text The source string.
 * @param at Current character index inside the quotes.
 * @returns The decoded text and next index, or undefined on malformed input.
 */
function stepQuoted(
	text: string,
	at: number,
): { readonly value: string; readonly next: number } | undefined {
	const ch = text[at];
	if (ch === undefined) return undefined;
	return ch === "\\" ? decodeEscape(text, at + 1) : { value: ch, next: at + 1 };
}

/**
 * Read a double-quoted HCL/JSON string starting at `start`.
 * @param text The source string.
 * @param start Index of the opening `"`.
 * @returns The unescaped value and index after the closing `"`, or undefined when invalid.
 */
function readQuotedString(
	text: string,
	start: number,
): { readonly value: string; readonly next: number } | undefined {
	if (text[start] !== '"') return undefined;
	let value = "";
	let at = start + 1;
	while (at < text.length) {
		if (text[at] === '"') return { value, next: at + 1 };
		const part = stepQuoted(text, at);
		if (part === undefined) return undefined;
		value += part.value;
		at = part.next;
	}
	return undefined;
}

/**
 * Unescape a complete double-quoted HCL string literal.
 * @param raw The raw quoted string token, including surrounding `"`.
 * @returns The unescaped string value, or undefined when not a valid double-quoted literal.
 */
function decodeHclString(raw: string): string | undefined {
	const parsed = readQuotedString(raw, 0);
	return parsed !== undefined && parsed.next === raw.length ? parsed.value : undefined;
}

/**
 * Read a bracket selector (`[0]` or `["..."]`) starting at `[`.
 * @param text The address string.
 * @param start Index of `[`.
 * @returns The parsed key and index after `]`, or undefined when invalid.
 */
function readKey(
	text: string,
	start: number,
): { readonly key: SegmentKey; readonly next: number } | undefined {
	if (text[start + 1] === '"') {
		const quoted = readQuotedString(text, start + 1);
		return quoted !== undefined && text[quoted.next] === "]"
			? { key: { kind: "string", value: quoted.value }, next: quoted.next + 1 }
			: undefined;
	}
	const match = NUMERIC_KEY.exec(text.slice(start + 1));
	return match === null
		? undefined
		: { key: { kind: "numeric" }, next: start + 1 + match[0].length };
}

/**
 * Read one identifier segment and its optional bracket key.
 * @param text The address string.
 * @param start Index where the segment begins.
 * @returns The segment and next index, or undefined when invalid.
 */
function readSegment(
	text: string,
	start: number,
): { readonly segment: AddressSegment; readonly next: number } | undefined {
	const match = IDENT_PREFIX.exec(text.slice(start));
	if (match === null) return undefined;
	const [name] = match;
	const afterName = start + name.length;
	if (text[afterName] !== "[") return { segment: { name }, next: afterName };
	const keyed = readKey(text, afterName);
	return keyed === undefined ? undefined : { segment: { name, key: keyed.key }, next: keyed.next };
}

/**
 * Tokenize a Terraform address into dot-separated segments with optional bracket keys.
 * @param symbol The address string.
 * @returns Its segments in order, or undefined when malformed.
 */
function tokenizeAddress(symbol: string): AddressSegment[] | undefined {
	const segments: AddressSegment[] = [];
	let at = 0;
	while (at < symbol.length) {
		const read = readSegment(symbol, at);
		if (read === undefined) return undefined;
		segments.push(read.segment);
		if (read.next === symbol.length) return segments;
		if (symbol[read.next] !== ".") return undefined;
		at = read.next + 1;
	}
	return undefined;
}

/**
 * Split a Terraform address on `.` outside double-quoted strings.
 * @param address The address, which may contain quoted dots in a nested-block name or key.
 * @returns Its dot-separated segments, preserving quoted substrings intact.
 */
function splitAddressSegments(address: string): string[] {
	const segments: string[] = [];
	let start = 0;
	let at = 0;
	while (at < address.length) {
		const ch = address[at];
		if (ch === '"') {
			at = readQuotedString(address, at)?.next ?? address.length;
			continue;
		}
		if (ch === ".") {
			segments.push(address.slice(start, at));
			start = at + 1;
		}
		at += 1;
	}
	segments.push(address.slice(start));
	return segments.filter((segment) => segment !== "");
}

/**
 * Parse a trailing `module.<name>` or `module.<name>.<output>` address.
 * @param modules Enclosing module prefixes.
 * @param mod The module call name segment.
 * @param output Optional trailing output name segment.
 * @returns The parsed address, or undefined when the output carries a bracket key.
 */
function parseModuleTail(
	modules: readonly string[],
	mod: AddressSegment,
	output: AddressSegment | undefined,
): ParsedTerraformAddress | undefined {
	const prefix = modules.map((each) => `module.${each}.`).join("");
	const call = `${prefix}module.${mod.name}`;
	if (output === undefined) return { address: call, modules, kind: "module", declaration: call };
	if (output.key !== undefined) return undefined;
	const address = `${call}.${output.name}`;
	return { address, modules, kind: "module-output", declaration: address };
}

/**
 * The identifier of a segment that carries no bracket key.
 * @param segment The segment, if any.
 * @returns Its name, or undefined when absent or keyed.
 */
function unkeyedName(segment: AddressSegment | undefined): string | undefined {
	return segment !== undefined && segment.key === undefined ? segment.name : undefined;
}

/**
 * Parse a `data.<type>.<name>` or `ephemeral.<type>.<name>` declaration.
 * @param prefix The normalized module prefix.
 * @param modules Enclosing module names.
 * @param kind Whether this is `data` or `ephemeral`.
 * @param rest Remaining segments.
 * @returns The parsed address, or undefined when malformed or carrying nested selectors.
 */
function parseTypedDeclaration(
	prefix: string,
	modules: readonly string[],
	kind: "data" | "ephemeral",
	rest: readonly AddressSegment[],
): ParsedTerraformAddress | undefined {
	if (rest.length !== 3) return undefined;
	const head = unkeyedName(rest[0]);
	const type = unkeyedName(rest[1]);
	const name = rest[2];
	if (head === undefined || type === undefined || name === undefined) return undefined;
	const declaration = `${prefix}${kind}.${type}.${name.name}`;
	return { address: declaration, modules, kind, declaration };
}

/**
 * Parse a `var.<name>`, `local.<name>`, or `output.<name>` declaration.
 * @param prefix The normalized module prefix.
 * @param modules Enclosing module names.
 * @param kind The declaration kind.
 * @param rest Remaining segments.
 * @returns The parsed address, or undefined when malformed or carrying nested selectors.
 */
function parseNamedDeclaration(
	prefix: string,
	modules: readonly string[],
	kind: "variable" | "local" | "output",
	rest: readonly AddressSegment[],
): ParsedTerraformAddress | undefined {
	const [head, name] = rest;
	if (rest.length !== 2 || head === undefined || name === undefined || head.key !== undefined) {
		return undefined;
	}
	const declaration = `${prefix}${head.name}.${name.name}`;
	return { address: declaration, modules, kind, declaration };
}

/**
 * Parse a depth-1 named nested-block selector on a managed resource declaration.
 * @param declaration The normalized resource address.
 * @param modules Enclosing module names.
 * @param block The nested-block segment.
 * @returns The parsed nested-block address, or undefined unless keyed by a quoted string.
 */
function parseNestedBlock(
	declaration: string,
	modules: readonly string[],
	block: AddressSegment,
): ParsedTerraformAddress | undefined {
	if (block.key?.kind !== "string") return undefined;
	const nested: NestedBlockSelector = { blockType: block.name, name: block.key.value };
	const address = `${declaration}.${nested.blockType}[${JSON.stringify(nested.name)}]`;
	return { address, modules, kind: "block", declaration, nested };
}

/**
 * Parse a managed `<type>.<name>` resource declaration with an optional depth-1 nested block.
 * @param prefix The normalized module prefix.
 * @param modules Enclosing module names.
 * @param rest Remaining segments.
 * @returns The parsed address, or undefined when malformed.
 */
function parseResourceDeclaration(
	prefix: string,
	modules: readonly string[],
	rest: readonly AddressSegment[],
): ParsedTerraformAddress | undefined {
	const type = unkeyedName(rest[0]);
	const name = rest[1];
	if (type === undefined || name === undefined || rest.length > 3) return undefined;
	const declaration = `${prefix}${type}.${name.name}`;
	const block = rest[2];
	return block === undefined
		? { address: declaration, modules, kind: "resource", declaration }
		: parseNestedBlock(declaration, modules, block);
}

/**
 * Parse the declaration segments following any leading `module.<name>` prefixes.
 * @param modules Enclosing module names.
 * @param rest Remaining segments.
 * @returns The parsed address, or undefined when invalid.
 */
function parseTail(
	modules: readonly string[],
	rest: readonly AddressSegment[],
): ParsedTerraformAddress | undefined {
	const head = rest[0];
	if (head === undefined || head.name === "module") return undefined;
	const prefix = modules.map((each) => `module.${each}.`).join("");
	if (head.name === "data" || head.name === "ephemeral") {
		return parseTypedDeclaration(prefix, modules, head.name, rest);
	}
	const namedKind = NAMED_DECLARATIONS[head.name];
	if (namedKind !== undefined) return parseNamedDeclaration(prefix, modules, namedKind, rest);
	return parseResourceDeclaration(prefix, modules, rest);
}

/**
 * Parse and canonically normalize a Terraform or OpenTofu declaration address.
 * @param symbol The address as a binding or anchor spells it.
 * @returns The structured normalized address, or undefined when rejected by the address grammar.
 */
function parseTerraformAddress(symbol: string): ParsedTerraformAddress | undefined {
	const segments = tokenizeAddress(symbol);
	if (segments === undefined) return undefined;
	const modules: string[] = [];
	let index = 0;
	while (unkeyedName(segments[index]) === "module") {
		const mod = segments[index + 1];
		if (mod === undefined) return undefined;
		if (segments.length - (index + 2) < 2) {
			return parseModuleTail(modules, mod, segments[index + 2]);
		}
		modules.push(mod.name);
		index += 2;
	}
	return parseTail(modules, segments.slice(index));
}

/**
 * The address the first names of a reference name.
 * @param names The names of the reference in order, without its index keys:
 * `["aws_sqs_queue", "jobs", "arn"]`.
 * @returns The address, or undefined when the names start no address or stop
 * before one is complete.
 */
function addressOf(names: readonly string[]): string | undefined {
	const [root = ""] = names;
	if (NOT_AN_ADDRESS.has(root)) return undefined;
	const length = LENGTH.get(root)?.(names.length) ?? 2;
	return names.length >= length ? names.slice(0, length).join(".") : undefined;
}

/**
 * A reference as a plan JSON or HCL writes it, without its index keys.
 * @param written The reference, such as `module.app[0].url` or `aws_instance.web["a.b"]`.
 * @returns Its names.
 */
function namesOf(written: string): string[] {
	return written
		.replaceAll(/\[(?:"(?:[^"\\]|\\.)*"|[^\]])*\]/gu, "")
		.split(".")
		.filter((name) => name !== "");
}

/**
 * A declaration's address as a binding or an anchor spells it, with optional
 * module and declaration instance keys stripped and any valid depth-1 resource
 * nested-block selector canonically quoted. Invalid addresses are returned
 * unchanged so they never falsely match a declaration.
 * @param symbol The symbol.
 * @returns The normalized address, or `symbol` unchanged when invalid.
 */
function declarationAddress(symbol: string): string {
	return parseTerraformAddress(symbol)?.address ?? symbol;
}

export {
	type NestedBlockSelector,
	type ParsedTerraformAddress,
	addressOf,
	declarationAddress,
	decodeHclString,
	isTerraformFile,
	namesOf,
	parseTerraformAddress,
	splitAddressSegments,
};
