// Where the keys and items of a YAML file stand, line by line (ADR 0046,
// TASK-367.20). `Bun.YAML.parse` gives what a compose file means, but no
// lines, and a definition needs its first and last line and a reference its
// line. This reads the block style compose files are written in: a key
// (`web:`), an item (`- db`), and the key of a mapping inside an item
// (`- source: data`). A flow collection (`[db, cache]`, `{A: 1}`) and a
// block scalar (`|`, `>`) belong to the line of their key. A value is never
// kept: only where each key and item stands, and the names of the keys.

/** A key or an item's place in its document: its keys and item indexes, from the top. */
type YamlPath = readonly (string | number)[];

/** The first and last line of a key or an item, 1-based. */
interface LineSpan {
	readonly start: number;
	readonly end: number;
}

/** A mapping's key, an item of a sequence, or the top of a document. */
interface Frame {
	readonly indent: number;
	readonly path: YamlPath;
	readonly kind: "top" | "key" | "item";
	/** How many items of a sequence stood under it so far. */
	items: number;
}

/** The state of one reading. */
interface Scan {
	readonly documents: Map<string, { start: number; end: number }>[];
	readonly names: Set<string>;
	stack: Frame[];
	/** The last line that held content. */
	last: number;
	/** Inside a block scalar: lines indented deeper than this column belong to it. */
	scalar: number | undefined;
	/** How many brackets of a flow collection are open, and the key that opened it. */
	flow: number;
	flowKey: YamlPath | undefined;
}

/** A mapping's key, quoted or plain, and what follows its colon. */
const KEY =
	/^(?:"(?<double>(?:[^"\\]|\\.)*)"|'(?<single>(?:[^']|'')*)'|(?<plain>[^\s#'"[\]{},&*!|>%@`][^#]*?))\s*:(?:\s+(?<value>.*))?$/u;
/** An item of a block sequence. */
const ITEM = /^-(?:\s|$)/u;
/** The start of a document. */
const DOCUMENT = /^---(?:\s|$)/u;
/** A block scalar's indicator, with its chomping and indentation. */
const BLOCK_SCALAR = /^[|>][0-9+-]*$/u;
/** Anchors and tags before a value: `&common`, `!reset`. */
const PROPERTIES = /^(?:[&!]\S*\s*)+/u;
/** A comment after a value. */
const COMMENT = /(?:^|\s)#.*$/u;
/** A quoted string, whose brackets are not the collection's. */
const QUOTED = /"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'/gu;

/**
 * A path as one key.
 * @param path The path.
 * @returns Its key.
 */
function keyOf(path: YamlPath): string {
	return JSON.stringify(path);
}

/**
 * The frame lines are read under.
 * @param scan The reading.
 * @returns The innermost open frame.
 */
function top(scan: Scan): Frame {
	return scan.stack.at(-1) ?? { indent: -1, path: [], kind: "top", items: 0 };
}

/**
 * Note where a key or an item starts.
 * @param scan The reading.
 * @param path Its path.
 * @param line Its line.
 */
function record(scan: Scan, path: YamlPath, line: number): void {
	scan.documents.at(-1)?.set(keyOf(path), { start: line, end: line });
}

/**
 * Extend a key or an item to a line.
 * @param scan The reading.
 * @param path Its path.
 * @param line The line it reaches.
 */
function extend(scan: Scan, path: YamlPath, line: number): void {
	const span = scan.documents.at(-1)?.get(keyOf(path));
	if (span !== undefined) span.end = Math.max(span.end, line);
}

/**
 * Close the frames a line at an indentation leaves. A sequence may stand at
 * the indentation of its key (`depends_on:` then `- db` under it).
 * @param scan The reading.
 * @param indent The line's indentation.
 * @param item Whether the line is an item.
 */
function closeFrames(scan: Scan, indent: number, item: boolean): void {
	while (scan.stack.length > 1) {
		const frame = top(scan);
		if (frame.indent < indent || (frame.indent === indent && item && frame.kind === "key")) return;
		scan.stack.pop();
		extend(scan, frame.path, scan.last);
	}
}

/**
 * How many brackets a line opens, less those it closes.
 * @param text The line.
 * @returns The difference.
 */
function bracketDepth(text: string): number {
	const unquoted = text.replace(QUOTED, "").replace(COMMENT, "");
	return (unquoted.match(/[[{]/gu)?.length ?? 0) - (unquoted.match(/[\]}]/gu)?.length ?? 0);
}

/**
 * Read a value that follows a key or an item: a block scalar or a flow
 * collection that continues on later lines belongs to it. Only a value that
 * starts with a bracket is a flow collection: a bracket inside a plain
 * scalar (`command: echo [`) is text.
 * @param scan The reading.
 * @param value The value, without anchors, tags or a comment.
 * @param column The column of the key or the item.
 * @param path The key or the item.
 */
function valueOf(scan: Scan, value: string, column: number, path: YamlPath): void {
	if (BLOCK_SCALAR.test(value)) {
		scan.scalar = column;
		return;
	}
	if (!/^[[{]/u.test(value)) return;
	const depth = bracketDepth(value);
	if (depth > 0) {
		scan.flow = depth;
		scan.flowKey = path;
	}
}

/**
 * A value without its comment, anchors and tags.
 * @param text The value as written.
 * @returns What it holds.
 */
function bare(text: string): string {
	return text.replace(COMMENT, "").replace(PROPERTIES, "").trim();
}

/**
 * The name of a key, quoted or plain.
 * @param key The key's groups.
 * @returns Its name.
 */
function nameOf(key: Readonly<Record<string, string | undefined>>): string {
	return key["double"] ?? key["single"]?.replaceAll("''", "'") ?? key["plain"] ?? "";
}

/**
 * Read a mapping's key, or a value, at a column of a line.
 * @param scan The reading.
 * @param text The line from the column on.
 * @param column The column.
 * @param line The line.
 */
function keyLine(scan: Scan, text: string, column: number, line: number): void {
	const key = KEY.exec(text)?.groups;
	if (key === undefined) {
		valueOf(scan, bare(text), column, top(scan).path);
		return;
	}
	const name = nameOf(key);
	const path = [...top(scan).path, name];
	record(scan, path, line);
	scan.names.add(name);
	const value = bare(key["value"] ?? "");
	if (value === "") scan.stack.push({ indent: column, path, kind: "key", items: 0 });
	else valueOf(scan, value, column, path);
}

/**
 * Read an item of a sequence, and the key or value that follows its dash.
 * @param scan The reading.
 * @param trimmed The line without its indentation.
 * @param indent The line's indentation.
 * @param line The line.
 */
function itemLine(scan: Scan, trimmed: string, indent: number, line: number): void {
	const parent = top(scan);
	const path = [...parent.path, parent.items];
	parent.items += 1;
	record(scan, path, line);
	scan.stack.push({ indent, path, kind: "item", items: 0 });
	const rest = trimmed.slice(1).trimStart();
	if (rest !== "" && !rest.startsWith("#")) {
		keyLine(scan, rest, indent + trimmed.length - rest.length, line);
	}
}

/**
 * Start a new document at `---`, once a document has content.
 * @param scan The reading.
 */
function startDocument(scan: Scan): void {
	closeFrames(scan, -1, false);
	scan.stack = [{ indent: -1, path: [], kind: "top", items: 0 }];
	if (scan.last > 0) scan.documents.push(new Map());
}

/**
 * Whether a line belongs to the block scalar an earlier line opened, which
 * ends at the first line indented no deeper than its key.
 * @param scan The reading.
 * @param indent The line's indentation.
 * @returns True when it does.
 */
function insideScalar(scan: Scan, indent: number): boolean {
	if (scan.scalar === undefined) return false;
	if (indent > scan.scalar) return true;
	scan.scalar = undefined;
	return false;
}

/**
 * Read a line inside a flow collection that an earlier line opened.
 * @param scan The reading.
 * @param raw The line.
 * @param line Its number.
 */
function flowLine(scan: Scan, raw: string, line: number): void {
	scan.flow += bracketDepth(raw);
	scan.last = line;
	if (scan.flow > 0) return;
	scan.flow = 0;
	if (scan.flowKey !== undefined) extend(scan, scan.flowKey, line);
	scan.flowKey = undefined;
}

/**
 * Read one line.
 * @param scan The reading.
 * @param raw The line.
 * @param line Its number.
 */
function scanLine(scan: Scan, raw: string, line: number): void {
	const trimmed = raw.trim();
	const indent = raw.length - raw.trimStart().length;
	if (trimmed === "") return;
	if (insideScalar(scan, indent)) {
		scan.last = line;
		return;
	}
	if (trimmed.startsWith("#")) return;
	if (DOCUMENT.test(raw)) {
		startDocument(scan);
		return;
	}
	const item = ITEM.test(trimmed);
	closeFrames(scan, indent, item);
	if (item) itemLine(scan, trimmed, indent, line);
	else keyLine(scan, trimmed, indent, line);
	scan.last = line;
}

/** Where the keys and items of each document of a file stand. */
interface YamlLines {
	/**
	 * The span of a key or an item, or of the nearest key or item that holds it
	 * when the file writes it inside a flow collection, a block scalar or a merge.
	 * @param document The document's index.
	 * @param path The path.
	 * @returns The span, and whether it is the path's own.
	 */
	spanOf(document: number, path: YamlPath): (LineSpan & { readonly own: boolean }) | undefined;
	/** How many documents the file holds. */
	readonly documents: number;
	/** The name of every key the file writes. */
	readonly names: readonly string[];
}

/**
 * Where the keys and items of a YAML file stand.
 * @param text The file's text.
 * @returns Its lines.
 */
function yamlLines(text: string): YamlLines {
	const scan: Scan = {
		documents: [new Map()],
		names: new Set(),
		stack: [{ indent: -1, path: [], kind: "top", items: 0 }],
		last: 0,
		scalar: undefined,
		flow: 0,
		flowKey: undefined,
	};
	text.split(/\r?\n/u).forEach((raw, index) => {
		if (scan.flow > 0) flowLine(scan, raw, index + 1);
		else scanLine(scan, raw, index + 1);
	});
	closeFrames(scan, -1, false);
	return {
		documents: scan.documents.length,
		names: [...scan.names],
		/**
		 * The span of a key or an item, or of the nearest one that holds it.
		 * @param document The document's index.
		 * @param path The path.
		 * @returns The span, or undefined when no key of the path stands on a line.
		 */
		spanOf(document, path) {
			const spans = scan.documents[document];
			for (let length = path.length; length > 0; length -= 1) {
				const span = spans?.get(keyOf(path.slice(0, length)));
				if (span !== undefined) return { ...span, own: length === path.length };
			}
			return undefined;
		},
	};
}

export { type LineSpan, type YamlLines, type YamlPath, yamlLines };
