// The macros the Objective-C grammar cannot read, blanked before the parse
// (ADR 0046, TASK-367.10). One macro it does not know after a declaration,
// such as AFNetworking's `AF_API_AVAILABLE(...)`, put 92% of
// `AFURLSessionManager.m` inside error nodes, and so do `NS_ENUM` and
// `NS_ASSUME_NONNULL_BEGIN`, which nearly every header of Apple's platforms
// writes. The blanks are spaces of the same length, and every line break
// stays, so every line and column keeps its place.
//
// What is blanked:
// - An attribute macro of Apple's SDK, with its arguments: an availability,
//   a Swift name, a nullability region, an initializer or ownership note. The
//   list is the adapter's own, because the check reads no SDK header, which
//   lies outside every checkout. Each one expands to an attribute or to
//   nothing, so blanking it removes no name the code declares or uses.
// - A macro the same file defines as one of those, or as nothing, which is
//   what blanking it gives.
// - A macro a header of the checkout defines as one of those, as Realm's
//   `RLM_HEADER_AUDIT_BEGIN` stands for `NS_HEADER_AUDIT_BEGIN` in 48
//   headers (`attributeWrappers`, which objc-adapter.ts reads for the
//   checkout).
// - A macro whose name ends with one of those after `_`, as a project wraps
//   the SDK's macro under its own prefix: `AF_API_AVAILABLE`. That also holds
//   where the header that defines it is not in the checkout.
// - A typed enum macro, `NS_ENUM(NSInteger, Kind)`, is written as the enum it
//   expands to, `enum Kind`, with the name in its place; a `typedef` before
//   it goes, because the enum then names itself.
// A macro the file writes as other code with `#define`, as a log macro that
// is empty only in a release build, is blanked only where it is on the SDK's
// list. A macro defined as the name of one that takes arguments, as
// `#define RLM_HEADER_AUDIT_BEGIN NS_HEADER_AUDIT_BEGIN`, takes them too.
// Comments, strings and preprocessor lines are left as they are.

/**
 * The attribute macros of Apple's SDK that take arguments, each of which
 * expands to an attribute or to nothing.
 */
const FUNCTION_MACROS: readonly string[] = [
	// Availability.
	"API_AVAILABLE",
	"API_UNAVAILABLE",
	"API_DEPRECATED",
	"API_DEPRECATED_WITH_REPLACEMENT",
	"API_AVAILABLE_BEGIN",
	"API_UNAVAILABLE_BEGIN",
	"API_DEPRECATED_BEGIN",
	"SPI_AVAILABLE",
	"SPI_DEPRECATED",
	"SPI_DEPRECATED_WITH_REPLACEMENT",
	"NS_AVAILABLE",
	"NS_AVAILABLE_MAC",
	"NS_AVAILABLE_IOS",
	"NS_DEPRECATED",
	"NS_DEPRECATED_MAC",
	"NS_DEPRECATED_IOS",
	"NS_CLASS_AVAILABLE",
	"NS_CLASS_AVAILABLE_MAC",
	"NS_CLASS_AVAILABLE_IOS",
	"NS_CLASS_DEPRECATED",
	"NS_CLASS_DEPRECATED_MAC",
	"NS_CLASS_DEPRECATED_IOS",
	"NS_ENUM_AVAILABLE",
	"NS_ENUM_AVAILABLE_MAC",
	"NS_ENUM_AVAILABLE_IOS",
	"NS_ENUM_DEPRECATED",
	"NS_ENUM_DEPRECATED_MAC",
	"NS_ENUM_DEPRECATED_IOS",
	"NS_EXTENSION_UNAVAILABLE",
	"NS_EXTENSION_UNAVAILABLE_MAC",
	"NS_EXTENSION_UNAVAILABLE_IOS",
	"DEPRECATED_MSG_ATTRIBUTE",
	"__API_AVAILABLE",
	"__API_UNAVAILABLE",
	"__API_DEPRECATED",
	"__API_DEPRECATED_WITH_REPLACEMENT",
	"__IOS_AVAILABLE",
	"__IOS_DEPRECATED",
	"__OSX_AVAILABLE",
	"__OSX_DEPRECATED",
	"__OSX_AVAILABLE_STARTING",
	"__OSX_AVAILABLE_BUT_DEPRECATED",
	"__TVOS_AVAILABLE",
	"__WATCHOS_AVAILABLE",
	// Regions of a header.
	"NS_HEADER_AUDIT_BEGIN",
	"NS_HEADER_AUDIT_END",
	// Swift.
	"NS_SWIFT_NAME",
	"NS_SWIFT_UNAVAILABLE",
	"NS_SWIFT_ASYNC",
	"NS_SWIFT_ASYNC_NAME",
	"NS_SWIFT_ASYNC_THROWS_ON_FALSE",
	"NS_REFINED_FOR_SWIFT_ASYNC",
	"CF_SWIFT_NAME",
	// Format strings, and outlets.
	"NS_FORMAT_FUNCTION",
	"NS_FORMAT_ARGUMENT",
	"CF_FORMAT_FUNCTION",
	"CF_FORMAT_ARGUMENT",
	"IBOutletCollection",
];

/** The attribute macros of Apple's SDK that take no arguments. */
const OBJECT_MACROS: readonly string[] = [
	"API_AVAILABLE_END",
	"API_UNAVAILABLE_END",
	"API_DEPRECATED_END",
	"NS_UNAVAILABLE",
	"UNAVAILABLE_ATTRIBUTE",
	"DEPRECATED_ATTRIBUTE",
	"__IOS_UNAVAILABLE",
	"__IOS_PROHIBITED",
	"__OSX_UNAVAILABLE",
	"__TVOS_UNAVAILABLE",
	"__TVOS_PROHIBITED",
	"__WATCHOS_UNAVAILABLE",
	"__WATCHOS_PROHIBITED",
	"NS_ASSUME_NONNULL_BEGIN",
	"NS_ASSUME_NONNULL_END",
	"CF_ASSUME_NONNULL_BEGIN",
	"CF_ASSUME_NONNULL_END",
	"CF_IMPLICIT_BRIDGING_ENABLED",
	"CF_IMPLICIT_BRIDGING_DISABLED",
	"NS_SWIFT_NOTHROW",
	"NS_SWIFT_UI_ACTOR",
	"NS_SWIFT_NONISOLATED",
	"NS_SWIFT_SENDABLE",
	"NS_SWIFT_NONSENDABLE",
	"NS_SWIFT_DISABLE_ASYNC",
	"NS_REFINED_FOR_SWIFT",
	"CF_REFINED_FOR_SWIFT",
	"NS_STRING_ENUM",
	"NS_EXTENSIBLE_STRING_ENUM",
	"NS_TYPED_ENUM",
	"NS_TYPED_EXTENSIBLE_ENUM",
	"NS_DESIGNATED_INITIALIZER",
	"NS_REQUIRES_SUPER",
	"NS_REQUIRES_NIL_TERMINATION",
	"NS_RETURNS_RETAINED",
	"NS_RETURNS_NOT_RETAINED",
	"NS_RETURNS_INNER_POINTER",
	"CF_RETURNS_RETAINED",
	"CF_RETURNS_NOT_RETAINED",
	"NS_RELEASES_ARGUMENT",
	"CF_RELEASES_ARGUMENT",
	"CF_CONSUMED",
	"NS_VALID_UNTIL_END_OF_SCOPE",
	"NS_NOESCAPE",
	"NS_ROOT_CLASS",
	"OBJC_ROOT_CLASS",
	"OBJC_SUBCLASSING_RESTRICTED",
	"NS_DIRECT",
	"NS_DIRECT_MEMBERS",
	"OBJC_DIRECT",
	"OBJC_DIRECT_MEMBERS",
	"NS_AUTOMATED_REFCOUNT_UNAVAILABLE",
	"NS_AUTOMATED_REFCOUNT_WEAK_UNAVAILABLE",
	"IB_DESIGNABLE",
	"IBInspectable",
	"IBOutlet",
	"UI_APPEARANCE_SELECTOR",
	// Nullability of Core Graphics, which the grammar writes as `_Nullable`.
	"cg_nullable",
	"cg_nonnull",
];

/** Each attribute macro of the SDK, and whether it takes arguments. */
const ATTRIBUTE_MACROS: ReadonlyMap<string, boolean> = new Map([
	...FUNCTION_MACROS.map((name) => [name, true] as const),
	...OBJECT_MACROS.map((name) => [name, false] as const),
]);

/** The macros of a typed enum, whose last argument is the enum's name: `NS_ENUM(NSInteger, Kind)`. */
const ENUM_MACROS: ReadonlySet<string> = new Set([
	"NS_ENUM",
	"NS_OPTIONS",
	"NS_CLOSED_ENUM",
	"NS_ERROR_ENUM",
	"CF_ENUM",
	"CF_OPTIONS",
	"CF_CLOSED_ENUM",
]);

/** A `#define` of the file: its name, its parameters if it takes any, and its value on the first line. */
const DEFINE = /^[ \t]*#[ \t]*define[ \t]+([A-Za-z_]\w*)(\([^)]*\))?(.*)$/gmu;
/**
 * One token of the text, the first that matches: a preprocessor line with its
 * continued lines, a comment, a string or a character literal, a name, a
 * number, or one other character.
 */
const TOKEN =
	/^[ \t]*#(?:[^\n\\]|\\[\s\S])*|\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|(?![\s\S]))|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|[A-Za-z_]\w*|\d\w*|[\s\S]/gmu;
/** A token that is a name. */
const NAME = /^[A-Za-z_]/u;
/** The spaces and line breaks before the next token. */
const SPACE = /\s*/uy;

/** The name of a typed enum: the last argument, after a comma, before spaces and comments. */
const ENUM_NAME = /,(\s*)(\w+)(?:\s|\/\*[\s\S]*?\*\/)*\)$/u;

/** What a file's macros add to the SDK's list, and what they rule out. */
interface Macros {
	/** The macros to blank beyond the SDK's list, and whether each takes arguments. */
	readonly joined: ReadonlyMap<string, boolean>;
	/** The macros a `#define` of the file writes as other code, which only the SDK's list blanks. */
	readonly code: ReadonlySet<string>;
}

/** What a `#define` writes: nothing, an SDK attribute macro, or other code. */
type Expansion = "nothing" | "attribute" | "code";

/** One `#define`: its name, whether its uses take arguments, and what it expands to. */
interface Define {
	readonly name: string;
	readonly takesArguments: boolean;
	readonly expands: Expansion;
}

/** One stretch of the text to replace, by its offsets, with text of the same length. */
interface Edit {
	readonly start: number;
	readonly end: number;
	readonly text: string;
}

/** The edits one name asks for, and the offset where the scan goes on. */
interface Found {
	readonly edits: readonly Edit[];
	readonly next: number;
}

/**
 * A stretch of text as blanks: a space for each UTF-16 unit but a line
 * break, so a character outside the Basic Multilingual Plane, as an emoji in
 * a deprecation message, keeps its two columns.
 * @param text The stretch.
 * @returns The blanks.
 */
function blanks(text: string): string {
	return text.replaceAll(/[^\n\r]/gu, (character) => " ".repeat(character.length));
}

/**
 * Whether a name is an SDK attribute macro under a project's prefix, as
 * `AF_API_AVAILABLE` ends with `_API_AVAILABLE`, and if so whether it takes
 * arguments.
 * @param name The name.
 * @returns Whether it takes arguments, or undefined when it wraps none.
 */
function wrapped(name: string): boolean | undefined {
	for (let at = name.indexOf("_", 1); at !== -1; at = name.indexOf("_", at + 1)) {
		const takes = ATTRIBUTE_MACROS.get(name.slice(at + 1));
		if (takes !== undefined) return takes;
	}
	return undefined;
}

/**
 * Whether an SDK attribute macro is named, and if so whether it takes arguments.
 * @param name The name.
 * @returns Whether it takes arguments, or undefined for another name.
 */
function sdkMacro(name: string): boolean | undefined {
	return ATTRIBUTE_MACROS.get(name) ?? wrapped(name);
}

/**
 * What a macro's value expands to, and whether it passes the arguments of
 * a use on, as `#define RLM_HEADER_AUDIT_BEGIN NS_HEADER_AUDIT_BEGIN` does.
 * @param value The value on its `#define` line.
 * @returns What it expands to, and whether it takes arguments it has no parameters for.
 */
function expansionOf(value: string): { expands: Expansion; passesOn: boolean } {
	const trimmed = value.trim();
	if (trimmed === "") return { expands: "nothing", passesOn: false };
	const first = /^\w*/u.exec(trimmed)?.[0] ?? "";
	const takes = sdkMacro(first);
	if (takes === undefined) return { expands: "code", passesOn: false };
	return { expands: "attribute", passesOn: takes && first === trimmed };
}

/**
 * The `#define`s of a file, each read from its first line.
 * @param text The file.
 * @returns The defines, in order.
 */
function definesOf(text: string): Define[] {
	return [...text.matchAll(DEFINE)].map(([, name = "", parameters, value = ""]) => {
		const { expands, passesOn } = expansionOf(value);
		return { name, takesArguments: parameters !== undefined || passesOn, expands };
	});
}

/**
 * What a file's macros add to the list: each it defines only as an SDK
 * attribute macro or as nothing, and each a header of its checkout wraps
 * so, but none it writes as other code.
 * @param text The file.
 * @param wrappers The macros the checkout's headers wrap.
 * @returns Its macros.
 */
function macrosOf(text: string, wrappers: ReadonlyMap<string, boolean>): Macros {
	const joined = new Map(wrappers);
	const code = new Set<string>();
	for (const define of definesOf(text)) {
		if (define.expands === "code") code.add(define.name);
		else joined.set(define.name, define.takesArguments);
	}
	for (const name of code) joined.delete(name);
	return { joined, code };
}

/**
 * The macros a checkout's headers define only as an SDK attribute macro,
 * each with whether it takes arguments: the list a file of the checkout
 * joins (ADR 0046). A macro one of them writes as other code stays out.
 * @param headers The text of each header.
 * @returns The macros.
 */
function attributeWrappers(headers: Iterable<string>): Map<string, boolean> {
	const wrappers = new Map<string, boolean>();
	const code = new Set<string>();
	for (const header of headers) {
		for (const define of definesOf(header)) {
			if (define.expands === "attribute") wrappers.set(define.name, define.takesArguments);
			else if (define.expands === "code") code.add(define.name);
		}
	}
	for (const name of code) wrappers.delete(name);
	return wrappers;
}

/**
 * Whether a name is a macro to blank, and if so whether it takes arguments.
 * @param name The name.
 * @param macros What the file's macros add and rule out.
 * @returns Whether it takes arguments, or undefined for a name to keep.
 */
function attributeMacro(name: string, macros: Macros): boolean | undefined {
	const listed = ATTRIBUTE_MACROS.get(name);
	if (listed !== undefined || macros.code.has(name)) return listed;
	return macros.joined.get(name) ?? wrapped(name);
}

/**
 * The offset after the arguments of a macro: after the parenthesis that
 * closes the one that follows its name, past comments and strings.
 * @param text The file.
 * @param after The offset after the macro's name.
 * @returns The offset after its `)`, or undefined when no `(` follows or none closes it.
 */
function argumentsEnd(text: string, after: number): number | undefined {
	SPACE.lastIndex = after;
	const open = after + (SPACE.exec(text)?.[0].length ?? 0);
	if (text[open] !== "(") return undefined;
	const tokens = new RegExp(TOKEN.source, TOKEN.flags);
	tokens.lastIndex = open;
	let depth = 0;
	for (let token = tokens.exec(text); token !== null; token = tokens.exec(text)) {
		depth += Number(token[0] === "(") - Number(token[0] === ")");
		if (depth === 0) return tokens.lastIndex;
	}
	return undefined;
}

/**
 * Where a typed enum macro's call names the enum.
 * @param call The call, `NS_ENUM(NSInteger, Kind)`.
 * @returns The offsets of the name and after it, both at the call's end for an enum with no name.
 */
function enumNameIn(call: string): [number, number] {
	const named = ENUM_NAME.exec(call);
	const [, space = "", name = ""] = named ?? [];
	const at = named === null ? call.length : named.index + 1 + space.length;
	return [at, at + name.length];
}

/**
 * A typed enum macro as the enum it expands to: `enum` where the macro
 * stands, then its name in its own place, and a `typedef` just before it as
 * blanks. An enum with no name, `CF_ENUM(uint32_t)`, is `enum` alone.
 * @param text The file.
 * @param start The macro's offset.
 * @param end The offset after its arguments.
 * @returns The edits.
 */
function enumEdits(text: string, start: number, end: number): Edit[] {
	const call = text.slice(start, end);
	const [nameAt, nameEnd] = enumNameIn(call);
	const enumText = `enum${blanks(call.slice(4, nameAt))}${call.slice(nameAt, nameEnd)}${blanks(call.slice(nameEnd))}`;
	const edits: Edit[] = [{ start, end, text: enumText }];
	const typedef = /(?<!\w)typedef\s*$/u.exec(text.slice(Math.max(0, start - 64), start));
	if (typedef !== null) {
		const at = start - typedef[0].length;
		edits.push({ start: at, end: at + 7, text: blanks("typedef") });
	}
	return edits;
}

/**
 * The edits a typed enum macro asks for.
 * @param text The file.
 * @param start The macro's offset.
 * @param end The offset after its name.
 * @returns The edits, none where no arguments follow.
 */
function enumAt(text: string, start: number, end: number): Found {
	const close = argumentsEnd(text, end);
	return close === undefined
		? { edits: [], next: end }
		: { edits: enumEdits(text, start, close), next: close };
}

/**
 * The edits one name of the code asks for: none, a blanked macro with its
 * arguments, or a typed enum.
 * @param text The file.
 * @param start The name's offset.
 * @param end The offset after it.
 * @param macros What the file's macros add to the list and rule out.
 * @returns The edits, and where the scan goes on.
 */
function editsAt(text: string, start: number, end: number, macros: Macros): Found {
	const name = text.slice(start, end);
	if (ENUM_MACROS.has(name)) return enumAt(text, start, end);
	const takesArguments = attributeMacro(name, macros);
	if (takesArguments === undefined) return { edits: [], next: end };
	const last = (takesArguments ? argumentsEnd(text, end) : undefined) ?? end;
	return { edits: [{ start, end: last, text: blanks(text.slice(start, last)) }], next: last };
}

/**
 * The edits the whole file asks for, in order.
 * @param text The file.
 * @param macros What the file's macros add to the list and rule out.
 * @returns The edits.
 */
function editsOf(text: string, macros: Macros): Edit[] {
	const edits: Edit[] = [];
	const tokens = new RegExp(TOKEN.source, TOKEN.flags);
	for (let token = tokens.exec(text); token !== null; token = tokens.exec(text)) {
		if (!NAME.test(token[0])) continue;
		const found = editsAt(text, token.index, tokens.lastIndex, macros);
		edits.push(...found.edits);
		tokens.lastIndex = found.next;
	}
	return edits.toSorted((left, right) => left.start - right.start);
}

/**
 * The text of an Objective-C file with the macros the grammar cannot read
 * blanked out, every line and column in its place.
 * @param text The file.
 * @param wrappers The macros the headers of its checkout wrap (`attributeWrappers`).
 * @returns The text to parse, of the same length.
 */
function blankedMacros(text: string, wrappers: ReadonlyMap<string, boolean>): string {
	let out = "";
	let at = 0;
	for (const edit of editsOf(text, macrosOf(text, wrappers))) {
		if (edit.start < at) continue;
		out += text.slice(at, edit.start) + edit.text;
		at = edit.end;
	}
	return out + text.slice(at);
}

export { attributeWrappers, blankedMacros };
