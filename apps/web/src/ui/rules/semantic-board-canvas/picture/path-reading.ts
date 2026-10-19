// Reading a drawn line: a `d` attribute into one chain of cubic Béziers.
//
// The renderer writes a route as straight legs and rounded corners — moves,
// lines, horizontals, verticals, cubics and quadratics, closed or not — and
// every one of those is a cubic or can be written as one exactly. Reading them
// all into the one shape is what lets two routes be compared and interpolated
// segment by segment in `path-morph`. A path with several subpaths or an arc
// is not a route and is refused rather than approximated.
//
// Nothing here touches a DOM.

/** A point in the picture's own units. */
interface Point {
	readonly x: number;
	readonly y: number;
}

/** One cubic Bézier segment, absolute, from one anchor to the next. */
interface Cubic {
	readonly c1: Point;
	readonly c2: Point;
	readonly to: Point;
}

/** A path as one chain of cubics, and whether the source closed it. */
interface Outline {
	readonly start: Point;
	readonly segments: readonly Cubic[];
	readonly closed: boolean;
}

/** How many numbers each command takes per repetition. Arcs are not among them. */
const ARITY: Readonly<Record<string, number>> = {
	M: 2,
	L: 2,
	H: 1,
	V: 1,
	C: 6,
	S: 4,
	Q: 4,
	T: 2,
	Z: 0,
};

/**
 * Cut a `d` into its commands and numbers.
 * @param d The attribute.
 * @returns The tokens in order, or null when something in it is not a token.
 */
function tokenise(d: string): readonly string[] | null {
	const tokens = d.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) ?? [];
	const consumed = tokens.join("").length;
	const meaningful = d.replace(/[\s,]/g, "").length;
	return consumed === meaningful ? tokens : null;
}

/**
 * A point some way between two others.
 * @param a Where t is 0.
 * @param b Where t is 1.
 * @param t How far from a to b.
 * @returns The point.
 */
function mix(a: Point, b: Point, t: number): Point {
	return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Lift a straight leg to a cubic, with the control points a third of the way
 * along, which is the cubic that draws exactly that line.
 * @param from Where the leg starts.
 * @param to Where it ends.
 * @returns The segment.
 */
function lineTo(from: Point, to: Point): Cubic {
	return { c1: mix(from, to, 1 / 3), c2: mix(from, to, 2 / 3), to };
}

/**
 * Lift a quadratic to the cubic that draws the same curve.
 * @param from Where it starts.
 * @param control Its one control point.
 * @param to Where it ends.
 * @returns The segment.
 */
function quadraticTo(from: Point, control: Point, to: Point): Cubic {
	return { c1: mix(from, control, 2 / 3), c2: mix(to, control, 2 / 3), to };
}

/**
 * The reflection of the last control point through the pen, which is what
 * the smooth shorthands `S` and `T` start from.
 * @param pen Where the pen is.
 * @param control The previous control point.
 * @returns The reflected point.
 */
function reflect(pen: Point, control: Point): Point {
	return { x: 2 * pen.x - control.x, y: 2 * pen.y - control.y };
}

/** The reader's position while a path is being read. */
interface Cursor {
	/** Where the pen is. */
	at: Point;
	/** The previous cubic's last control point, for `S`. */
	control: Point;
	/** The previous quadratic's control point, for `T`. */
	quadratic: Point;
}

/** One command's numbers, resolved against the pen when the source was relative. */
interface Arguments {
	/** The n-th point among the numbers. */
	readonly point: (index: number) => Point;
	/** The n-th number, offset by the pen's x when relative. */
	readonly x: (index: number) => number;
	/** The n-th number, offset by the pen's y when relative. */
	readonly y: (index: number) => number;
}

/** What one command draws, and where it leaves the cursor. */
interface Drawn {
	readonly segments: readonly Cubic[];
	readonly at: Point;
	readonly control?: Point;
	readonly quadratic?: Point;
}

/**
 * A straight leg to a point.
 * @param cursor Where the pen is.
 * @param to Where the leg ends.
 * @returns What it draws.
 */
function legTo(cursor: Cursor, to: Point): Drawn {
	return { segments: [lineTo(cursor.at, to)], at: to };
}

/**
 * `L`: a straight leg.
 * @param cursor Where the pen is.
 * @param args The command's numbers.
 * @returns What it draws.
 */
function readLine(cursor: Cursor, args: Arguments): Drawn {
	return legTo(cursor, args.point(0));
}

/**
 * `H`: a horizontal leg.
 * @param cursor Where the pen is.
 * @param args The command's numbers.
 * @returns What it draws.
 */
function readHorizontal(cursor: Cursor, args: Arguments): Drawn {
	return legTo(cursor, { x: args.x(0), y: cursor.at.y });
}

/**
 * `V`: a vertical leg.
 * @param cursor Where the pen is.
 * @param args The command's numbers.
 * @returns What it draws.
 */
function readVertical(cursor: Cursor, args: Arguments): Drawn {
	return legTo(cursor, { x: cursor.at.x, y: args.y(0) });
}

/**
 * `C`: a cubic.
 * @param _cursor Where the pen is.
 * @param args The command's numbers.
 * @returns What it draws.
 */
function readCubic(_cursor: Cursor, args: Arguments): Drawn {
	return {
		segments: [{ c1: args.point(0), c2: args.point(2), to: args.point(4) }],
		at: args.point(4),
		control: args.point(2),
	};
}

/**
 * `S`: a cubic whose first control point reflects the last.
 * @param cursor Where the pen is.
 * @param args The command's numbers.
 * @returns What it draws.
 */
function readSmoothCubic(cursor: Cursor, args: Arguments): Drawn {
	return {
		segments: [{ c1: reflect(cursor.at, cursor.control), c2: args.point(0), to: args.point(2) }],
		at: args.point(2),
		control: args.point(0),
	};
}

/**
 * `Q`: a quadratic.
 * @param cursor Where the pen is.
 * @param args The command's numbers.
 * @returns What it draws.
 */
function readQuadratic(cursor: Cursor, args: Arguments): Drawn {
	return {
		segments: [quadraticTo(cursor.at, args.point(0), args.point(2))],
		at: args.point(2),
		quadratic: args.point(0),
	};
}

/**
 * `T`: a quadratic whose control point reflects the last.
 * @param cursor Where the pen is.
 * @param args The command's numbers.
 * @returns What it draws.
 */
function readSmoothQuadratic(cursor: Cursor, args: Arguments): Drawn {
	const quadratic = reflect(cursor.at, cursor.quadratic);
	return {
		segments: [quadraticTo(cursor.at, quadratic, args.point(0))],
		at: args.point(0),
		quadratic,
	};
}

/** How each drawing command draws, given the pen and its numbers. */
const READERS: Readonly<Record<string, (cursor: Cursor, args: Arguments) => Drawn>> = {
	L: readLine,
	H: readHorizontal,
	V: readVertical,
	C: readCubic,
	S: readSmoothCubic,
	Q: readQuadratic,
	T: readSmoothQuadratic,
};

/**
 * Resolve one command's numbers against the pen.
 * @param numbers The numbers, as written.
 * @param relative Whether the source wrote the command in lower case.
 * @param pen Where the pen is.
 * @returns The numbers as absolute coordinates.
 */
function resolve(numbers: readonly number[], relative: boolean, pen: Point): Arguments {
	const base = relative ? pen : { x: 0, y: 0 };
	/**
	 * The n-th number as an x.
	 * @param index Which number.
	 * @returns The coordinate.
	 */
	function x(index: number): number {
		return base.x + numbers[index]!;
	}
	/**
	 * The n-th number as a y.
	 * @param index Which number.
	 * @returns The coordinate.
	 */
	function y(index: number): number {
		return base.y + numbers[index]!;
	}
	/**
	 * The n-th number and the one after it as a point.
	 * @param index Which number.
	 * @returns The point.
	 */
	function point(index: number): Point {
		return { x: x(index), y: y(index + 1) };
	}
	return { x, y, point };
}

/** The reader, part way through a `d`. */
interface Reading {
	readonly tokens: readonly string[];
	index: number;
	command: string;
	relative: boolean;
	start: Point | null;
	closed: boolean;
	readonly cursor: Cursor;
	readonly segments: Cubic[];
}

/**
 * Take a command letter, saying whether the reading may go on.
 *
 * A second `M` is a second subpath and a command after `Z` is too; a route is
 * one line, and either is refused.
 * @param reading The reading.
 * @param token The letter.
 * @returns False when the path is not one the morph can carry.
 */
function takeCommand(reading: Reading, token: string): boolean {
	const command = token.toUpperCase();
	reading.index += 1;
	if (!(command in ARITY) || reading.closed || (command === "M" && reading.start !== null)) {
		return false;
	}
	reading.command = command;
	reading.relative = token !== command;
	if (command === "Z") {
		reading.closed = true;
		closeBack(reading);
	}
	return true;
}

/**
 * Close a path back to where it started, drawing the leg when there is one.
 * @param reading The reading.
 */
function closeBack(reading: Reading): void {
	const { start, cursor } = reading;
	if (start !== null && (cursor.at.x !== start.x || cursor.at.y !== start.y)) {
		reading.segments.push(lineTo(cursor.at, start));
		cursor.at = start;
	}
}

/**
 * Draw one repetition of the current command and move the pen on.
 * @param reading The reading.
 * @param numbers The command's numbers.
 */
function advance(reading: Reading, numbers: readonly number[]): void {
	const reader = READERS[reading.command]!;
	const drawn = reader(reading.cursor, resolve(numbers, reading.relative, reading.cursor.at));
	reading.segments.push(...drawn.segments);
	reading.cursor.at = drawn.at;
	reading.cursor.control = drawn.control ?? drawn.at;
	reading.cursor.quadratic = drawn.quadratic ?? drawn.at;
}

/**
 * Take one repetition of the current command's numbers and draw it.
 * @param reading The reading.
 * @returns False when the numbers are not there, or draw before any move.
 */
function takeNumbers(reading: Reading): boolean {
	const arity = ARITY[reading.command] ?? 0;
	if (arity === 0 || reading.index + arity > reading.tokens.length) {
		return false;
	}
	const numbers = reading.tokens.slice(reading.index, reading.index + arity).map(Number);
	reading.index += arity;
	if (reading.start === null) {
		return beginAt(reading, numbers);
	}
	advance(reading, numbers);
	return true;
}

/**
 * Put the pen down: the first command must be a move, and the pairs that
 * follow it without a letter are lines.
 * @param reading The reading.
 * @param numbers The move's numbers.
 * @returns False when the path did not begin with a move.
 */
function beginAt(reading: Reading, numbers: readonly number[]): boolean {
	if (reading.command !== "M") {
		return false;
	}
	const at = { x: numbers[0]!, y: numbers[1]! };
	reading.start = at;
	reading.cursor.at = at;
	reading.cursor.control = at;
	reading.cursor.quadratic = at;
	reading.command = "L";
	return true;
}

/**
 * Read a `d` into one chain of cubics.
 *
 * One subpath only. A route is one line from one card to another; a `d` with
 * several subpaths, or an arc, is something this morph has no shape for, and
 * says so with null rather than drawing a guess.
 * @param d The attribute.
 * @returns The outline, or null when it is not one the morph can carry.
 */
function parsePath(d: string): Outline | null {
	const tokens = tokenise(d);
	if (tokens === null) {
		return null;
	}
	const origin = { x: 0, y: 0 };
	const reading: Reading = {
		tokens,
		index: 0,
		command: "",
		relative: false,
		start: null,
		closed: false,
		cursor: { at: origin, control: origin, quadratic: origin },
		segments: [],
	};
	while (reading.index < tokens.length) {
		const token = tokens[reading.index]!;
		const taken = /[A-Za-z]/.test(token) ? takeCommand(reading, token) : takeNumbers(reading);
		if (!taken) {
			return null;
		}
	}
	const { start, segments, closed } = reading;
	return start === null ? null : { start, segments, closed };
}
export { lineTo, mix, parsePath, type Cubic, type Outline, type Point };
