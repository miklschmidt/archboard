// The joins choice laid out side by side. Lines that join on the way to one
// card stay one line into it: each such join is kept whole by its labels
// before the join, or by its lines keeping ports of their own, and the joins
// whose labels would move to one block take one way together. Each such
// block takes the way that reads better in the drawing as a whole, as the
// caller weighs it (the renderer core's `drawsBetter`). Every layout the
// choice reads, as far as the layouts answered so far decide, is asked for
// at once, and weighed as each comes, in the order laying them out one by one
// weighs them, so the drawing is the one that order gives.

/**
 * A set with one member taken out, or put in when it was not there.
 * @param set The set.
 * @param member The member.
 * @returns The new set.
 */
function toggled(set: ReadonlySet<string>, member: string): Set<string> {
	const next = new Set(set);
	if (!next.delete(member)) next.add(member);
	return next;
}

/** Lay a drawing out with some blocks' joins apart, by block id, unless called off first. */
type Lay<Placed> = (apart: ReadonlySet<string>, signal: AbortSignal) => Promise<Placed>;

/** A drawing as a solve answers it: whether facing every block's walls would change it. */
interface Facing {
	readonly faces?: boolean | undefined;
}

/** One layout asked for: its answer once it came, how to call it off, and whether a turn to come weighs it. */
interface Asked<Placed> {
	readonly calling: AbortController;
	promise: Promise<Placed>;
	needed: boolean;
	answer?: Placed;
	failed?: boolean;
}

/**
 * The same key for a set of blocks apart, whatever their order.
 * @param apart The blocks whose joins stay apart.
 * @returns The key.
 */
function apartKey(apart: ReadonlySet<string>): string {
	return JSON.stringify([...apart].toSorted());
}

/** A way to lay a drawing out with each set of blocks apart once: ask for one, keep only some, and read one's answer once it came. */
interface Laying<Placed> {
	readonly ask: (apart: ReadonlySet<string>) => Promise<Placed>;
	readonly keep: (needed: readonly ReadonlySet<string>[]) => void;
	readonly answered: (apart: ReadonlySet<string>) => Placed | undefined;
	readonly waiting: (apart: ReadonlySet<string>) => boolean;
}

/**
 * A way to lay a drawing out that lays it with each set of blocks apart
 * once, however often it is asked, a way to call off the layouts no turn to
 * come weighs, and a way to read a layout's answer once it came. A layout
 * asked for ahead and never awaited is dropped, a failure included: laid out
 * one by one, it would never have been asked for. A layout called off while
 * a worker holds it is answered all the same, and kept for a later ask. One
 * called off while it waits is forgotten, and laid out afresh when a turn
 * asks for it again.
 * @param lay Lay the drawing out with some blocks' joins apart, by block id.
 * @returns The way to ask for a layout, to keep only the ones still needed, and to read one's answer.
 */
function layingOnce<Placed>(lay: Lay<Placed>): Laying<Placed> {
	const asked = new Map<string, Asked<Placed>>();
	/**
	 * Ask for a layout, once.
	 * @param apart The blocks whose joins stay apart.
	 * @returns Its layout.
	 */
	const ask = (apart: ReadonlySet<string>): Promise<Placed> => {
		const key = apartKey(apart);
		let entry = asked.get(key);
		if (entry === undefined) {
			const calling = new AbortController();
			const held: Asked<Placed> = { calling, promise: lay(apart, calling.signal), needed: true };
			// The host refuses only a solve still waiting with the signal's reason.
			// A turn may have asked for it again while that refusal travelled.
			held.promise = held.promise.catch((error: unknown) => {
				if (!calling.signal.aborted || error !== calling.signal.reason) throw error;
				if (asked.get(key) === held) asked.delete(key);
				if (held.needed) return ask(apart);
				throw error;
			});
			held.promise.then(
				(answer) => {
					held.answer = answer;
					return answer;
				},
				() => {
					held.failed = true;
				},
			);
			asked.set(key, held);
			entry = held;
		}
		entry.needed = true;
		return entry.promise;
	};
	/**
	 * Call off every layout asked for that no turn to come weighs.
	 * @param needed The layouts the turns to come weigh.
	 */
	const keep = (needed: readonly ReadonlySet<string>[]): void => {
		const keys = new Set(needed.map(apartKey));
		for (const [key, entry] of asked) {
			entry.needed = keys.has(key);
			if (!entry.needed) entry.calling.abort();
		}
	};
	/**
	 * A layout's answer, once it came.
	 * @param apart The blocks whose joins stay apart.
	 * @returns The layout, or nothing while none came.
	 */
	const answered = (apart: ReadonlySet<string>): Placed | undefined =>
		asked.get(apartKey(apart))?.answer;
	/**
	 * Whether a layout asked for is still being laid out: neither answered nor failed.
	 * @param apart The blocks whose joins stay apart.
	 * @returns True while it is.
	 */
	const waiting = (apart: ReadonlySet<string>): boolean => {
		const entry = asked.get(apartKey(apart));
		return entry !== undefined && entry.answer === undefined && entry.failed !== true;
	};
	return { ask, keep, answered, waiting };
}

/** A layout the joins choice waits for: which blocks apart, and whether it faces the blocks' walls. */
interface Awaited {
	readonly apart: ReadonlySet<string>;
	readonly facing: boolean;
}

/** What the joins choice reads next: the layouts it weighs, and what it waits for or the drawing it chose. */
interface Weighing<Placed> {
	/** Every layout it weighs, as far as the answers that came decide which. */
	readonly needed: readonly ReadonlySet<string>[];
	/** The layout facing the blocks' walls it weighs, if any. */
	readonly faced: readonly ReadonlySet<string>[];
	/** The first layout it waits for, or the drawing it chose once it waits for none. */
	readonly next: Awaited | { readonly placed: Placed };
}

/** The turns weighed so far: every layout they read, the drawing kept, and the first layout they wait for. */
interface Turned<Placed> {
	readonly needed: ReadonlySet<string>[];
	readonly best: Placed;
	readonly apart: ReadonlySet<string>;
	readonly waits: Awaited | undefined;
}

/** Each layout's answer once it came, and its layout facing the blocks' walls where the drawing can face them. */
interface Answered<Placed> {
	readonly laid: (apart: ReadonlySet<string>) => Placed | undefined;
	readonly faced: ((apart: ReadonlySet<string>) => Placed | undefined) | undefined;
}

/** Whether one drawing reads better than another. */
type Better<Placed> = (one: Placed, other: Placed) => boolean;

/**
 * Weigh each turn from the drawing kept, kept where it reads better. A turn
 * whose layout has not come is waited for and read as if it read worse,
 * which most turns do: the turns after it are then the ones it would weigh.
 * @param turns Each turn, from the blocks apart in the drawing kept.
 * @param laid Each layout's answer, once it came.
 * @param better Whether one drawing reads better than another.
 * @param first The drawing with every join before its labels.
 * @returns The turns weighed.
 */
function turned<Placed>(
	turns: readonly ((apart: ReadonlySet<string>) => Set<string>)[],
	laid: Answered<Placed>["laid"],
	better: Better<Placed>,
	first: Placed,
): Turned<Placed> {
	const needed: ReadonlySet<string>[] = [new Set()];
	let [best, apart]: [Placed, ReadonlySet<string>] = [first, new Set()];
	let waits: Awaited | undefined;
	for (const turn of turns) {
		const trial = turn(apart);
		needed.push(trial);
		const placed = laid(trial);
		if (placed === undefined) waits ??= { apart: trial, facing: false };
		else if (better(placed, best)) [best, apart] = [placed, trial];
	}
	return { needed, best, apart, waits };
}

/**
 * The weighing that waits, or the drawing chosen when it waits for nothing.
 * @param needed Every layout it weighs.
 * @param faced The layout facing the blocks' walls it weighs, if any.
 * @param waits The first layout it waits for.
 * @param chosen The drawing it chooses once it waits for nothing.
 * @returns The weighing.
 */
function waitingOr<Placed>(
	needed: readonly ReadonlySet<string>[],
	faced: readonly ReadonlySet<string>[],
	waits: Awaited | undefined,
	chosen: Placed,
): Weighing<Placed> {
	return { needed, faced, next: waits ?? { placed: chosen } };
}

/**
 * The turns weighed, and last the drawing kept laid out facing its blocks'
 * walls where that would change it, kept where it reads better as a turn
 * does.
 * @param turns The turns weighed.
 * @param faced Each layout facing the blocks' walls, once it came; none where the drawing never faces them.
 * @param better Whether one drawing reads better than another.
 * @returns What the choice reads next.
 */
function facedChoice<Placed extends Facing>(
	turns: Turned<Placed>,
	faced: Answered<Placed>["faced"],
	better: Better<Placed>,
): Weighing<Placed> {
	const { needed, best, apart, waits } = turns;
	if (faced === undefined || best.faces !== true) return waitingOr(needed, [], waits, best);
	const placed = faced(apart);
	if (placed === undefined)
		return waitingOr(needed, [apart], waits ?? { apart, facing: true }, best);
	return waitingOr(needed, [apart], waits, better(placed, best) ? placed : best);
}

/**
 * Weigh the joins as far as the layouts answered so far decide: every join
 * before its labels; then each turn from the drawing kept ({@link turned});
 * last, the drawing kept facing its blocks' walls ({@link facedChoice}).
 * Until the first layout comes, the choice waits for it and reads the turns
 * from it. A turn answered after all is weighed again with the rest, so the
 * drawing is the one laying them out one by one gives.
 * @param turns Each turn, from the blocks apart in the drawing kept.
 * @param answered Each layout's answer, once it came.
 * @param better Whether one drawing reads better than another.
 * @returns What the choice reads next.
 */
function weighed<Placed extends Facing>(
	turns: readonly ((apart: ReadonlySet<string>) => Set<string>)[],
	answered: Answered<Placed>,
	better: Better<Placed>,
): Weighing<Placed> {
	const none = new Set<string>();
	const first = answered.laid(none);
	if (first === undefined)
		return {
			needed: [none, ...turns.map((turn) => turn(none))],
			faced: answered.faced === undefined ? [] : [none],
			next: { apart: none, facing: false },
		};
	return facedChoice(turned(turns, answered.laid, better, first), answered.faced, better);
}

/**
 * Whether one drawing reads better than another, each pair weighed once
 * however often the choice weighs it again.
 * @param better Whether one drawing reads better than another.
 * @returns The weighing.
 */
function weighingOnce<Placed extends object>(better: Better<Placed>): Better<Placed> {
	const known = new WeakMap<Placed, WeakMap<Placed, boolean>>();
	return (one, other) => {
		const row = known.get(one) ?? new WeakMap<Placed, boolean>();
		known.set(one, row);
		const found = row.get(other);
		if (found !== undefined) return found;
		const answer = better(one, other);
		row.set(other, answer);
		return answer;
	};
}

/**
 * The turns of the joins choice: every join apart, where more than one block
 * joins, and then each block's joins turned the other way in turn.
 * @param joining The blocks joins move labels to, by id.
 * @returns Each turn, from the blocks apart in the drawing kept.
 */
function turnsOf(joining: readonly string[]): ((apart: ReadonlySet<string>) => Set<string>)[] {
	const blocks = [...joining];
	return [
		...(blocks.length > 1 ? [(): Set<string> => new Set(blocks)] : []),
		...blocks.map(
			(block) =>
				(apart: ReadonlySet<string>): Set<string> =>
					toggled(apart, block),
		),
	];
}

/**
 * Ask for the layouts a weighing reads, and call off the ones asked for before that it no longer reads.
 * @param laying The way to lay the drawing out.
 * @param needed The layouts it reads.
 */
function askingOnly<Placed>(laying: Laying<Placed>, needed: readonly ReadonlySet<string>[]): void {
	laying.keep(needed);
	for (const one of needed) void laying.ask(one);
}

/**
 * The layouts a weighing reads that have not come yet, each settling when it
 * comes: a later turn that comes first changes what the weighing reads next.
 * One that fails is weighed as one not come; only the layout the weighing
 * waits for fails it.
 * @param laying The way to lay the drawing out.
 * @param needed The layouts the weighing reads.
 * @returns A promise for each that has not come.
 */
function unanswered<Placed>(
	laying: Laying<Placed>,
	needed: readonly ReadonlySet<string>[],
): Promise<unknown>[] {
	return needed
		.filter((apart) => laying.waiting(apart))
		.map((apart) => laying.ask(apart).catch(() => undefined));
}

/**
 * The way to lay out a drawing that never faces its blocks' walls: the
 * choice never reads such a layout, so it asks for none.
 * @returns The way.
 */
function neverLaid<Placed>(): Laying<Placed> {
	return {
		/**
		 * A layout never asked for.
		 * @returns A promise that never settles.
		 */
		ask: () => new Promise<Placed>(() => undefined),
		/**
		 * Call off nothing, since nothing was asked for.
		 * @returns Nothing.
		 */
		keep: () => undefined,
		/**
		 * No answer.
		 * @returns Nothing.
		 */
		answered: () => undefined,
		/**
		 * Nothing is being laid out.
		 * @returns False.
		 */
		waiting: () => false,
	};
}

/**
 * Lay a drawing out with every join kept whole the way that reads better
 * ({@link weighed}). Every layout the weighing reads, as far as the layouts
 * answered decide, is asked for at once, so they are laid out side by side:
 * the turns from the drawing kept, and, while a turn is still being laid
 * out, the turns that would follow the later turns kept that came already,
 * and the drawing they keep laid out facing its blocks' walls. Each answer
 * that comes is weighed, and the layouts asked for before that the weighing
 * no longer reads are called off. When the drawing is chosen, or a layout it
 * waits for fails, every layout still asked for is called off.
 * A block that holds the label of a line it crosses keeps that line on its
 * face, and Graphviz meets its items in the board's order. Kept on its face,
 * the line from Local platform operator ran down its region, along its foot
 * and up its far wall to Device Identity beside it (Device Trust Control
 * Plane, native hosts, Blocks). Faced to its walls in every way of keeping
 * the joins, Two doors to a turn (Blocks) drew less line than the way that
 * crossed 14 lines fewer, and this choice could no longer take that way.
 * @param joining The blocks joins move labels to, by id.
 * @param better Whether one drawing reads better than another.
 * @param lay Lay the drawing out with some blocks' joins apart, by block id.
 * @param face Lay it out so with every block facing its walls; none where
 * the drawing never faces them.
 * @returns The drawing laid out best.
 */
async function layJoined<Placed extends Facing & object>(
	joining: readonly string[],
	better: Better<Placed>,
	lay: Lay<Placed>,
	face?: Lay<Placed>,
): Promise<Placed> {
	const laying = layingOnce(lay);
	const faced = face === undefined ? neverLaid<Placed>() : layingOnce(face);
	const answered = { laid: laying.answered, faced: face && faced.answered };
	const [turns, once] = [turnsOf(joining), weighingOnce(better)];
	try {
		for (;;) {
			const { needed, faced: facing, next } = weighed(turns, answered, once);
			askingOnly(laying, needed);
			askingOnly(faced, facing);
			if ("placed" in next) return next.placed;
			const waited = (next.facing ? faced : laying).ask(next.apart);
			// oxlint-disable-next-line no-await-in-loop -- each answer decides what the choice reads next
			await Promise.race([waited, ...unanswered(laying, needed), ...unanswered(faced, facing)]);
		}
	} finally {
		laying.keep([]);
		faced.keep([]);
	}
}

export { layJoined };
