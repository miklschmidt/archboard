// What the browser is allowed to say about a board.
//
// The server owns the board; a canvas owns only the news of what a human just
// did to it. So a pane never sends a scene — it sends a delta computed against
// a *baseline*: the fingerprint of every element this pane has actually seen,
// either because the server sent it or because the pane successfully reported
// it.
//
// That baseline is the whole safety property. A deletion can only be claimed
// for an id in the baseline, and an id can only enter the baseline by arriving
// from the server. An element this pane has never received therefore cannot
// appear in `deletes`, so a stale, half-loaded or mid-switch tab has no way to
// truncate a board — the failure mode POST /api/elements/sync existed to
// cause.

/** id -> fingerprint of the element as this pane last agreed it stood. */
type Baseline = Map<string, string>;

// Fields that move without the drawing changing: Excalidraw's per-mutation
// counters and the server's own bookkeeping. Excluding them makes a
// fingerprint a statement about the shape rather than about its history, so a
// round-trip through the server does not read back as a fresh edit.
const VOLATILE = new Set([
	"version",
	"versionNonce",
	"updated",
	"createdAt",
	"updatedAt",
	"syncedAt",
	"source",
	"syncTimestamp",
]);

/**
 * A stable identity for an element's drawn shape, independent of its history.
 * @param element Any scene element as a plain record.
 * @returns A string that changes only when a non-volatile field changes.
 */
function fingerprint(element: Record<string, unknown>): string {
	const keys = Object.keys(element)
		.filter((key) => !VOLATILE.has(key))
		.toSorted();
	return JSON.stringify(keys.map((key) => [key, element[key]]));
}

// Fields the server writes about an element rather than fields of the element.
// A browser that echoed these back would be overwriting the server's record of
// its own board with a copy that is, by definition, older.
const SERVER_BOOKKEEPING = [
	"createdAt",
	"updatedAt",
	"version",
	"syncedAt",
	"source",
	"syncTimestamp",
];

/**
 * The element as it goes on the wire: ours to describe, the server's to stamp.
 * @param element A scene element as a plain record.
 * @returns A copy without the server's bookkeeping fields.
 */
function toWire(element: Record<string, unknown>): Record<string, unknown> {
	const wire: Record<string, unknown> = { ...element };
	for (const key of SERVER_BOOKKEEPING) {
		delete wire[key];
	}
	return wire;
}

interface ChangeReport {
	upserts: Record<string, unknown>[];
	deletes: string[];
	/**
	 * The baseline this report would establish if the server accepts it. Held
	 * rather than applied so a failed request retries instead of forgetting.
	 */
	nextBaseline: Baseline;
}

/**
 * Whether a report carries nothing the server needs to hear.
 * @param report A computed change report.
 * @returns True when there are no upserts and no deletes.
 */
function isEmpty(report: ChangeReport): boolean {
	return report.upserts.length === 0 && report.deletes.length === 0;
}

const NOTHING_WITHHELD: ReadonlySet<string> = new Set();

/**
 * The id of an element that is part of the drawn scene.
 * @param element Any scene element as a plain record.
 * @returns Its id, or null when it has no string id or is deleted.
 */
function liveId(element: Record<string, unknown>): string | null {
	return typeof element["id"] === "string" && !element["isDeleted"] ? element["id"] : null;
}

/**
 * Keep a withheld element's agreed print so its pending edit is reported later.
 *
 * Withheld is not the same as agreed. An element already in the baseline
 * keeps the print it had, so the edit remains pending and goes out on the
 * first report after the editor closes; one the server has never seen stays
 * out of the baseline entirely and is reported as new then.
 * @param id The withheld element's id.
 * @param baseline What this pane last agreed with the server.
 * @param nextBaseline The baseline being built for this report.
 */
function carryAgreedPrint(id: string, baseline: Baseline, nextBaseline: Baseline): void {
	const agreed = baseline.get(id);
	if (agreed !== undefined) {
		nextBaseline.set(id, agreed);
	}
}

/**
 * Compute what a pane may tell the server about its scene.
 * @param scene Every element currently on the canvas.
 * @param baseline The fingerprints this pane last agreed with the server.
 * @param withheld Elements this pane is deliberately not telling the server
 * about yet, by id. One thing goes in here: the text element a person has an
 * editor open on (TASK-098). Reporting it is what gets it renamed, because its
 * id is the 21-character nanoid Excalidraw minted and a note can only hold
 * eight characters, and a rename appears in the scene as five typed characters
 * vanishing with no error (`src/shared/ids/ids.ts`).
 * @returns The upserts and deletes to send, and the baseline they would establish.
 */
function diffAgainstBaseline(
	scene: readonly Record<string, unknown>[],
	baseline: Baseline,
	withheld: ReadonlySet<string> = NOTHING_WITHHELD,
): ChangeReport {
	const upserts: Record<string, unknown>[] = [];
	const nextBaseline: Baseline = new Map();

	for (const element of scene) {
		const id = liveId(element);
		if (id === null) {
			continue;
		}
		if (withheld.has(id)) {
			carryAgreedPrint(id, baseline, nextBaseline);
			continue;
		}
		const print = fingerprint(element);
		nextBaseline.set(id, print);
		if (baseline.get(id) !== print) {
			upserts.push(toWire(element));
		}
	}

	// Only ids we had. Anything the server holds that never reached this pane is
	// absent from the baseline and so is never named here.
	const deletes: string[] = [];
	baseline.forEach((_print, id) => {
		if (!nextBaseline.has(id)) {
			deletes.push(id);
		}
	});

	// A label needs nothing said about it here. It is a text element, so a
	// person retyping one produces a text upsert like any other edit and
	// emptying one produces a delete, and the server has no second copy of the
	// words for either to correct.
	//
	// This is where two used to be reconciled. A reported bound text carried a
	// statement of what its container's `label` seed now read (TASK-028), and a
	// deleted one carried the striking out of that seed (TASK-029), because the
	// seed was stored and was what the next conversion expanded. The seed is no
	// longer stored (TASK-073), so there is nothing to keep in step.

	return { upserts, deletes, nextBaseline };
}

/**
 * Record elements that arrived from the server as already agreed, so the next
 * diff does not report them straight back.
 * @param scene The elements the server just sent.
 * @returns A baseline holding each live element's fingerprint.
 */
function baselineFrom(scene: readonly Record<string, unknown>[]): Baseline {
	const baseline: Baseline = new Map();
	for (const element of scene) {
		const id = liveId(element);
		if (id !== null) {
			baseline.set(id, fingerprint(element));
		}
	}
	return baseline;
}

export {
	type Baseline,
	fingerprint,
	toWire,
	type ChangeReport,
	isEmpty,
	diffAgainstBaseline,
	baselineFrom,
};
