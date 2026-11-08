// The runs of neighbours that share a section, such as the flows of one collection. Both side
// columns group a list this way, so a collection reads alike in the left column and the panel.

/** Neighbours that stand in one section, and its name. */
interface SectionRun<Entry> {
	/** What tells the run from every other: its section, and how many runs of it come first. */
	readonly key: string;
	readonly label: string;
	readonly entries: readonly Entry[];
}

/**
 * Neighbours that stand in one section.
 * @param entries The entries, in their order.
 * @param sectionOf The section of an entry.
 * @returns Each run of neighbours with its section.
 */
function sectionRuns<Entry>(
	entries: readonly Entry[],
	sectionOf: (entry: Entry) => string,
): readonly SectionRun<Entry>[] {
	const before = new Map<string, number>();
	return entries.reduce<{ key: string; label: string; entries: Entry[] }[]>((runs, entry) => {
		const label = sectionOf(entry);
		const last = runs.at(-1);
		if (last?.label === label) last.entries.push(entry);
		else {
			const count = before.get(label) ?? 0;
			before.set(label, count + 1);
			runs.push({ key: `${count}:${label}`, label, entries: [entry] });
		}
		return runs;
	}, []);
}

export { sectionRuns, type SectionRun };
