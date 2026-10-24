import { meets, meetsAt, type LaneRun, type Station } from "#shared/rules/track/routes/chains.ts";

/** What the chains a line crosses in one channel count, between its stations above and below it. */
type Counted = (
	crossed: readonly ReadonlyMap<number, Station>[],
	upper: Station,
	lower: Station,
) => number;

/** Another chain's endpoints in one channel, as they stand during one search. */
interface Channel {
	readonly chain: ReadonlyMap<number, Station>;
	readonly top: number;
	readonly bottom: number;
}

/**
 * Read other chains' channel endpoints once for a search. Accepted routes move
 * stations, so each later search prepares them again.
 * @param own The stations whose channels the search passes.
 * @param bands The other chains' stations, by band.
 * @returns The endpoints, by the band above each channel.
 */
function channelsFor(
	own: readonly Station[],
	bands: readonly ReadonlyMap<number, Station>[],
): ReadonlyMap<number, readonly Channel[]> {
	const channels = new Map<number, Channel[]>();
	for (let index = 1; index < own.length; index += 1) {
		const upper = own[index - 1]!;
		const lower = own[index]!;
		const others: Channel[] = [];
		for (const chain of bands) {
			const other = channelOf(chain, upper, lower);
			if (other !== undefined) others.push(other);
		}
		channels.set(upper.band, others);
	}
	return channels;
}

/**
 * Read one chain's endpoints when it can cross this channel.
 * @param chain The other chain.
 * @param upper The own station above the channel.
 * @param lower The own station below the channel.
 * @returns Its endpoints, unless it meets the own chain there.
 */
function channelOf(
	chain: ReadonlyMap<number, Station>,
	upper: Station,
	lower: Station,
): Channel | undefined {
	const one = chain.get(upper.band);
	const two = chain.get(lower.band);
	if (one === undefined || two === undefined || meets(one, upper) || meets(two, lower))
		return undefined;
	return { chain, top: meetsAt(one, two.x), bottom: meetsAt(two, one.x) };
}

/**
 * Count crossings against endpoints prepared for one search.
 * @param own The chain's stations, or a reading of them on the same bands.
 * @param xs Where each station stands; a card's is ignored.
 * @param channels The other chains' endpoints, fixed during this search.
 * @param counted What each channel's crossed chains count, when not one each.
 * @returns The count.
 */
function crossingsIn(
	own: readonly Station[],
	xs: readonly number[],
	channels: ReturnType<typeof channelsFor>,
	counted?: Counted,
): number {
	return own.slice(1).reduce((count, lower, index) => {
		const upper = own[index]!;
		const [above, below] = [xs[index]!, xs[index + 1]!];
		const [top, bottom] = [meetsAt(upper, below, above), meetsAt(lower, above, below)];
		const channel = channels.get(upper.band)!;
		let crossed = 0;
		const chains: ReadonlyMap<number, Station>[] = [];
		for (const other of channel) {
			if (!((top - other.top) * (bottom - other.bottom) < 0)) continue;
			crossed += 1;
			if (counted !== undefined) chains.push(other.chain);
		}
		return count + (counted?.(chains, upper, lower) ?? crossed);
	}, 0);
}

/**
 * Count other chains whose order against a line swaps across a channel.
 * @param own The chain's stations, or a run with the stations either side.
 * @param xs Where each station stands; a card's is ignored.
 * @param bands Every chain's stations, by band.
 * @param counted What each channel's crossed chains count, when not one each.
 * @returns The count.
 */
function crossingsOf(
	own: readonly Station[],
	xs: readonly number[],
	bands: readonly ReadonlyMap<number, Station>[],
	counted?: Counted,
): number {
	return own.slice(1).reduce((count, lower, index) => {
		const upper = own[index]!;
		const [above, below] = [xs[index]!, xs[index + 1]!];
		const [top, bottom] = [meetsAt(upper, below, above), meetsAt(lower, above, below)];
		const crossed = bands.filter((other) => {
			const [one, two] = [other.get(upper.band), other.get(lower.band)];
			if (one === undefined || two === undefined || meets(one, upper) || meets(two, lower))
				return false;
			return (top - meetsAt(one, two.x)) * (bottom - meetsAt(two, one.x)) < 0;
		});
		return count + (counted?.(crossed, upper, lower) ?? crossed.length);
	}, 0);
}

/**
 * Prepare crossing endpoints for a search that weighs many columns.
 * @param own The line's stations, fixed during the search.
 * @param bands Every chain's stations, by band.
 * @returns The count for each candidate's station positions.
 */
function crossingsFor(
	own: readonly Station[],
	bands: readonly ReadonlyMap<number, Station>[],
): (xs: readonly number[]) => number {
	const channels = channelsFor(own, bands);
	return (xs) => crossingsIn(own, xs, channels);
}

/**
 * How many other chains a run on one column would cross between one band
 * and the next.
 * @param run The run.
 * @param x The column.
 * @param bands Every chain's stations, by band.
 * @returns The count.
 */
function inversions(
	run: LaneRun,
	x: number,
	bands: readonly ReadonlyMap<number, Station>[],
): number {
	const own = [run.before, ...run.lanes, run.after];
	return crossingsOf(own, [run.before.x, ...run.lanes.map(() => x), run.after.x], bands);
}

export { channelsFor, crossingsFor, crossingsIn, crossingsOf, inversions, type Counted };
