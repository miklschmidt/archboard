import { applyElementInput } from "../../../../src/runtime/engine/apply-element-input.ts";
import { boundTextsByContainer, planLabelRepair } from "../../../../src/runtime/engine/labels.ts";
import type { ServerElement } from "../../../../src/runtime/engine/types.ts";
import type { LegacyElementIngress } from "../../../../src/shared/board-elements/index.ts";
import { expandElements } from "../../../../src/runtime/engine/expand-elements.ts";
import { validatePersistedBoardElement } from "../../../../src/runtime/engine/native-element.ts";
import { diffAgainstBaseline, fingerprint } from "../../../../src/ui/canvas/changes.ts";
import type { Baseline } from "../../../../src/ui/canvas/changes.ts";

export type LabelElement = ServerElement &
	Record<string, unknown> & {
		label?: { text?: string };
		text?: string;
	};

export type LabelScene = LabelElement[];
export class LabelStore extends Map<string, LabelElement> {
	override get(id: string): LabelElement {
		const element = super.get(id);
		if (!element) throw new Error(`Missing label-cycle element ${id}.`);
		return element;
	}
}

export interface PaneCycleOptions {
	contain: boolean;
	types?: Readonly<Record<string, string>>;
	empties?: Readonly<Record<string, boolean>>;
}

export interface WriteOptions {
	keepSeed?: boolean;
}

export interface LabelCycleResult {
	scene: LabelScene;
	upserts: Record<string, unknown>[];
	deletes: string[];
}

interface LabelStatement extends Record<string, unknown> {
	id: string;
	type?: string;
	text?: string;
	label?: { text?: string };
}
type LabelInput = LabelStatement | LegacyElementIngress;

const copyElement = (element: LabelElement): LabelElement => ({ ...element });
const isServerElement = (value: Record<string, unknown>): value is LabelElement =>
	(() => {
		try {
			const { label: _label, start: _start, end: _end, ...native } = value;
			if (native.type !== "text") delete native.text;
			validatePersistedBoardElement(native, "label-cycle element");
			return true;
		} catch {
			return false;
		}
	})();

export const shape = (elements: readonly ServerElement[]): string =>
	JSON.stringify(
		elements.map((element) =>
			Object.fromEntries(
				Object.entries(element).filter(
					([key]) => !["seed", "versionNonce", "updated"].includes(key),
				),
			),
		),
	);

const NANOID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const freshId = () =>
	Array.from(
		{ length: 8 },
		() => NANOID_ALPHABET[Math.floor(Math.random() * NANOID_ALPHABET.length)],
	).join("");

/**
 * Excalidraw's convertToExcalidrawElements, in the one respect that matters:
 * a `label` on a shape or arrow becomes a *new* text element every call, with
 * an id it invents, and the container gains a reference to it. It does not
 * look at whether the container already has one — that is the whole bug.
 */
export function expand(elements: readonly LabelElement[]): LabelScene {
	const out: LabelScene = [];
	for (const element of elements) {
		const seed = element.type === "text" ? undefined : (element.label?.text ?? element.text);
		// `if (element.label?.text)` is the real converter's own guard: a label
		// that is absent, null or empty is not expanded into anything.
		if (typeof seed !== "string" || seed === "") {
			out.push(copyElement(element));
			continue;
		}
		const id = freshId();
		out.push({
			...element,
			boundElements: [...(element.boundElements ?? []), { id, type: "text" }],
		});
		const text = expandElements(
			[{ id, type: "text", x: 0, y: 0, text: seed, containerId: element.id }],
			{ forStore: true },
		)[0]!;
		out.push({ ...text, seed: Math.floor(Math.random() * 1e6), width: seed.length * 10 });
	}
	return out;
}

/**
 * What the pane used to do after converting: once a container had its text
 * element, the seed that produced it was dropped from the scene. Kept here
 * because the unfixed model needs it — a seed the pane held on to would be
 * reported straight back and the loop would be a different loop than the one
 * TASK-024 was.
 */
export function dropSpentSeeds(scene: readonly LabelElement[]): LabelScene {
	const labelled = boundTextsByContainer(scene);
	return scene.map((element) => {
		if (!labelled.has(element.id) || !("label" in element)) return copyElement(element);
		const { label: _label, ...rest } = element;
		return rest;
	});
}

/**
 * Somebody clears a label. Excalidraw does not leave an empty text element
 * behind: a bound text submitted blank is marked `isDeleted` and unbound from
 * its container (App.handleTextWysiwyg -> fixBindingsAfterDeletion). So the
 * scene keeps the deleted element — with its `containerId` — while the live
 * board has neither the text nor the binding.
 */
export function blank(
	scene: readonly LabelElement[],
	empties: Readonly<Record<string, boolean>> = {},
): LabelScene {
	const doomed = new Set();
	for (const element of scene) {
		if (
			element.type === "text" &&
			typeof element.containerId === "string" &&
			empties[element.containerId]
		)
			doomed.add(element.id);
	}
	if (doomed.size === 0) return scene.map(copyElement);
	return scene.map((element) => {
		if (doomed.has(element.id)) return { ...element, text: "", isDeleted: true };
		if (!Array.isArray(element.boundElements)) return copyElement(element);
		if (!element.boundElements.some((ref) => doomed.has(ref.id))) return copyElement(element);
		return {
			...element,
			boundElements: element.boundElements.filter((ref) => !doomed.has(ref.id)),
		};
	});
}

/** POST /api/elements/changes: upserts are *merged*, so stored fields survive. */
export function applyUpserts(store: LabelStore, upserts: readonly Record<string, unknown>[]): void {
	for (const upsert of upserts) {
		if (typeof upsert.id !== "string") continue;
		const previous = store.has(upsert.id) ? store.get(upsert.id) : undefined;
		if (!previous) {
			try {
				applyElementInput(store, { upserts: [upsert], origin: "human" });
			} catch {
				// The hostile model ignores a browser element the real boundary rejects.
			}
			continue;
		}
		const merged = { ...previous, ...upsert };
		if (isServerElement(merged)) store.set(upsert.id, merged);
	}
}

/**
 * One full round trip: the server broadcasts, the pane renders what it got, a
 * human may type into it, and it reports back anything it had not seen.
 *
 * `contain` is the arrangement under test. True is ADR 0015: the board already
 * holds the text elements, so the server update passes them through as they
 * stand and there is nothing to convert. False is what this replaced — a
 * second converter, run on every server update, minting a text element for
 * every seed it sees.
 */
export function cycle(
	store: LabelStore,
	baseline: Baseline,
	{ contain, types = {}, empties = {} }: PaneCycleOptions,
): LabelCycleResult {
	const broadcast = [...store.values()].map(copyElement);
	const scene = contain ? broadcast : dropSpentSeeds(expand(broadcast));

	// Somebody at the board retypes a label. It lands in the text element and
	// nowhere else — Excalidraw has no `label`, and the container has nothing new
	// to say — which is exactly why the seed on the server goes stale.
	const typed = types
		? scene.map((element): LabelElement => {
				const wanted =
					element.type === "text" && typeof element.containerId === "string"
						? types[element.containerId]
						: undefined;
				return wanted === undefined ? element : { ...element, text: wanted };
			})
		: scene;

	// Or clears one, which is a deletion rather than an edit.
	const edited = empties ? blank(typed, empties) : typed;

	const { upserts, deletes } = diffAgainstBaseline(edited, baseline);
	baseline.clear();
	// A pane agrees only what is on the board; a deleted element is news it has
	// already delivered, so the next diff must not keep claiming it.
	for (const element of edited) {
		if (!element.isDeleted) baseline.set(element.id, fingerprint(element));
	}
	applyUpserts(store, upserts);
	for (const id of deletes) store.delete(id);
	return { scene: edited, upserts, deletes };
}

/**
 * An agent's write, through the code that performs one.
 *
 * `applyElementInput` is the write conversion entry the server application calls.
 * The HTTP read, persistence and broadcast stay outside it, so a Map is all
 * this check needs to exercise the real stage order. The text elements are on
 * the board before any pane has seen it, which is the change everything below
 * turns on — a headless board used to carry labels that existed only as seeds
 * and only became elements when a browser happened to render one.
 *
 * `keepSeed` is the revert. Until stage 6 the converted element went to the
 * board still carrying the `label` an agent wrote, so one label was two facts
 * and the second one went stale the moment somebody at the board retyped the
 * first. Turning it on here is how the two runs below reproduce TASK-028 and
 * TASK-029; with it off, which is the code as it stands, neither has anything
 * to revert to.
 */
export function write(
	store: LabelStore,
	statements: readonly LabelInput[],
	{ keepSeed = false }: WriteOptions = {},
): LabelStore {
	const priorSeeds = new Map(
		statements.map((statement) => [
			statement.id,
			store.has(statement.id) ? seedOf(store.get(statement.id)) : undefined,
		]),
	);
	applyElementInput(store, {
		upserts: statements.map((statement) => ({ ...statement })),
		origin: "agent",
	});
	if (keepSeed) {
		for (const statement of statements) {
			const seed = seedOf(statement) ?? priorSeeds.get(statement.id);
			if (seed !== undefined && store.has(statement.id)) {
				applyElementInput(store, {
					upserts: [{ id: statement.id, label: { text: seed } }],
					origin: "agent",
				});
				store.set(statement.id, { ...store.get(statement.id), label: { text: seed } });
			}
		}
	}
	return store;
}

export function boardOf(elements: readonly LabelInput[], options?: WriteOptions): LabelStore {
	return write(new LabelStore(), elements, options);
}

/** What an element's `label`/`text` claims its label reads, if anything. */
export function seedOf(
	element: LabelStatement | LabelElement | LegacyElementIngress,
): string | undefined {
	if (element.type === "text") return undefined;
	if (typeof element.label?.text === "string") return element.label.text;
	if (typeof element.text === "string") return element.text;
	return undefined;
}

/** Every element on a board still carrying a seed, which must be none. */
export function seeded(store: LabelStore): string[] {
	return [...store.values()]
		.filter((element) => seedOf(element) !== undefined)
		.map((element) => element.id);
}

export function worstLabelCount(elements: readonly LabelElement[]): number {
	const counts = [...boundTextsByContainer(elements).values()].map((ids) => ids.length);
	return counts.length === 0 ? 0 : Math.max(...counts);
}

export const drawn = (): LegacyElementIngress[] => [
	{
		id: "svc",
		type: "rectangle",
		x: 0,
		y: 0,
		width: 200,
		height: 80,
		label: { text: "AuthService" },
	},
	{
		id: "gw",
		type: "rectangle",
		x: 400,
		y: 0,
		width: 200,
		height: 80,
		label: { text: "Gateway" },
	},
	{
		id: "wire",
		type: "arrow",
		x: 200,
		y: 40,
		width: 200,
		height: 0,
		points: [
			[0, 0],
			[200, 0],
		],
		start: { id: "svc" },
		end: { id: "gw" },
		label: { text: "HTTP" },
	},
];

export const CYCLES = 25;

export function reopenedRepairedBoard(): LabelStore {
	const polluted = boardOf(drawn(), { keepSeed: true });
	const pollutedBaseline = new Map<string, string>();
	for (let index = 0; index < CYCLES; index += 1)
		cycle(polluted, pollutedBaseline, { contain: false });
	const plan = planLabelRepair([...polluted.values()]);
	const doomed = new Set(plan.removeIds);
	const rebind = new Map(plan.rebind.map((update) => [update.id, update.boundElements]));
	const reopened = new LabelStore();
	for (const element of polluted.values()) {
		if (doomed.has(element.id)) continue;
		const { label: _label, ...native } = element;
		reopened.set(
			element.id,
			(rebind.has(element.id)
				? { ...native, boundElements: rebind.get(element.id) }
				: native) as LabelElement,
		);
	}
	const baseline = new Map<string, string>();
	for (let index = 0; index < CYCLES; index += 1) cycle(reopened, baseline, { contain: true });
	return reopened;
}
