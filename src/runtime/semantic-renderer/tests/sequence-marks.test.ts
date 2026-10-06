// What a sequence marks on a message or a participant: how it stands against
// the variant it is read against, and that a viewer selected it.

import { describe, expect, test } from "bun:test";

import type { VariantContent } from "@/shared/semantic-board/index";
import {
	renderDataFlow,
	type RenderedDiagram,
	type StatedStandings,
} from "@/runtime/semantic-renderer/index";
import {
	markShape,
	rowMarkOf,
	strokesOf,
	subjectGroups,
	withoutColour,
	withoutMark,
} from "@/runtime/semantic-renderer/tests/drawn-subjects";
import {
	SEQUENCE,
	SEQUENCE_STANDING,
	STANDINGS,
	drawnSequence,
	subject,
} from "@/runtime/semantic-renderer/tests/sequence-fixture";

/**
 * Where one line or box of a drawing lies, as one comparable string.
 * @param tag The element's start tag.
 * @returns Its geometry.
 */
function geometry(tag: string): string {
	return ["x1", "y1", "x2", "y2", "x", "y", "width", "height", "rx"]
		.map((name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1])
		.join();
}

/**
 * One part of a subject as a reader sees it with the colour spent, drawn with
 * the standings given.
 * @param standing How the sequence's subjects stand.
 * @param id The subject.
 * @param part Which of its drawn parts: its label, or its lifeline.
 * @returns The part's markup, without colour.
 */
function partSeen(standing: StatedStandings, id: string, part: "label" | "lifeline"): string {
	return withoutColour(
		subjectGroups(drawnSequence(standing).svg).find(
			(group) => group.id === id && group.markup.includes(`data-semantic-part="${part}"`),
		)!,
	);
}

/**
 * A flow's frame with its pin taken away.
 * @param rendered The drawn sequence.
 * @returns The frame's markup, without colour and without its pin.
 */
function frameWithoutPin(rendered: RenderedDiagram): string {
	return withoutMark(subject(rendered, "flow", "f1")).replaceAll("\n", "");
}

describe("a stated standing on a sequence", () => {
	test("marks steps, participants and the flow that holds them", () => {
		const rendered = drawnSequence(SEQUENCE_STANDING);

		expect(subject(rendered, "step", "s2").standing).toBe("added");
		expect(subject(rendered, "step", "s4").standing).toBe("changed");
		expect(subject(rendered, "step", "s3").standing).toBe("removed");
		expect(subject(rendered, "node", "io").standing).toBe("added");
		expect(subject(rendered, "node", "legacy").standing).toBe("removed");
		expect(subject(rendered, "flow", "f1").standing).toBe("changed");
		expect(subject(rendered, "step", "s1").standing).toBe("unchanged");

		for (const group of subjectGroups(rendered.svg)) {
			expect(STANDINGS.some((one) => one === group.standing)).toBe(true);
		}
	});

	test("draws a removed step as absent from the exchange", () => {
		const rendered = drawnSequence(SEQUENCE_STANDING);
		const gone = subject(rendered, "step", "s3");
		const kept = subject(rendered, "step", "s1");

		expect(gone.opacity).toBeGreaterThan(0);
		expect(gone.opacity).toBeLessThan(1);
		expect(kept.opacity).toBeUndefined();
		expect(withoutColour(gone)).not.toBe(withoutColour(kept));

		// Its row says so, once, and its line carries no swipe of its own.
		expect(markShape(rowMarkOf(rendered.svg, "s3")!)).toBeDefined();
		expect(rowMarkOf(rendered.svg, "s1")).toBeUndefined();
		expect(strokesOf(gone).length).toBe(strokesOf(subject(drawnSequence(), "step", "s3")).length);
	});

	test("marks a message that moved once, on its own row, and never on its label", () => {
		const rendered = drawnSequence(SEQUENCE_STANDING);
		// The frame's own rect: its halo carries a class before its box.
		const frame = /<rect x="([\d.]+)"[^>]*\swidth="([\d.]+)"/.exec(
			subject(rendered, "flow", "f1").markup,
		)!;
		for (const id of ["s2", "s3", "s4"]) {
			const mark = rowMarkOf(rendered.svg, id)!;
			// A band across the whole frame, behind the row.
			expect(mark.markup).toContain(`x="${frame[1]}"`);
			expect(mark.markup).toContain(`width="${frame[2]}"`);
			// One pin, in the frame's left margin, under the flow's own.
			expect(mark.markup.match(/<circle/g)).toHaveLength(1);
			const pin = /translate\(([\d.]+),/.exec(mark.markup)![1];
			expect(pin).toBe(/translate\(([\d.]+),/.exec(subject(rendered, "flow", "f1").markup)![1]);
		}
		// The words of a moved message are drawn as an unchanged one's are.
		expect(partSeen({ s2: "added" }, "s2", "label")).toBe(
			partSeen({ s2: "unchanged" }, "s2", "label"),
		);
	});

	test("marks a flow on its corner, and a message of a flow added whole not at all", () => {
		const unchanged = drawnSequence({ f1: "unchanged" });
		const changed = drawnSequence({ f1: "changed" });
		// The frame's rule is its own whichever way the flow stands.
		expect(frameWithoutPin(changed)).toBe(frameWithoutPin(unchanged));
		expect(markShape(subject(changed, "flow", "f1"))).toBeDefined();

		const whole = Object.fromEntries(
			["f1", "s1", "s2", "s3", "s4"].map((id) => [id, "added" as const]),
		);
		const added = drawnSequence(whole);
		expect(markShape(subject(added, "flow", "f1"))).toBeDefined();
		for (const id of ["s1", "s2", "s3", "s4"]) {
			expect(rowMarkOf(added.svg, id)).toBeUndefined();
			expect(subject(added, "step", id).markup).toBe(
				subject(drawnSequence({ f1: "unchanged" }), "step", id).markup.replace(
					'data-semantic-standing="unchanged"',
					'data-semantic-standing="added"',
				),
			);
		}
	});

	test("draws a removed participant as absent down the whole column, not only at its card", () => {
		const rendered = drawnSequence(SEQUENCE_STANDING);
		// A participant is drawn twice: the card at the head of the column, and the
		// column of time under it. Both are the same subject, so both say so.
		const both = subjectGroups(rendered.svg).filter(
			(group) => group.kind === "node" && group.id === "legacy",
		);
		expect(both).toHaveLength(2);
		for (const group of both) {
			expect(group.standing).toBe("removed");
		}
		// The column of time is ghosted whole, and the card has lost its block:
		// what is left of it is a flat face inside a dashed footprint.
		const lifeline = 'data-semantic-part="lifeline"';
		const column = both.find((group) => group.markup.includes(lifeline))!;
		expect(column.opacity).toBeGreaterThan(0);
		expect(column.opacity).toBeLessThan(1);
		const card = both.find((group) => !group.markup.includes(lifeline))!;
		const kept = subjectGroups(drawnSequence({ legacy: "unchanged" }).svg).find(
			(group) => group.id === "legacy" && group.kind === "node" && !group.markup.includes(lifeline),
		)!;
		expect(card.markup).toContain("stroke-dasharray");
		expect(kept.markup).not.toContain("stroke-dasharray");
		expect(withoutColour(card)).not.toBe(withoutColour(kept));

		// And the column reads differently from a participant that stayed, with the
		// colour spent.
		expect(partSeen(SEQUENCE_STANDING, "legacy", "lifeline")).not.toBe(
			partSeen({ legacy: "unchanged" }, "legacy", "lifeline"),
		);
	});

	test("keeps a removed step's words on solid plates, so a lifeline behind them stays hidden", () => {
		// The removed message's label sits across a lifeline, and a note under it
		// does too. Its words are ghosted like the rest of it, but a plate drawn at
		// the same strength lets the lifeline cut through the words.
		const flow = SEQUENCE.flows[0]!;
		const [s1, s2, s3, s4] = flow.steps;
		const noted: VariantContent = {
			...SEQUENCE,
			flows: [{ ...flow, steps: [s1!, s2!, { ...s3!, note: "until the bridge is gone" }, s4!] }],
		};
		const words = subjectGroups(renderDataFlow({ content: noted, standing: SEQUENCE_STANDING }).svg)
			.filter((group) => group.kind === "step" && group.id === "s3")
			.find((group) => group.markup.includes("<text"))!;
		// Every element of the group, with the opacity it is finally drawn at.
		const drawnAt: { tag: string; opacity: number }[] = [];
		const strengths = [1];
		for (const [token] of words.markup.matchAll(/<g\b[^>]*>|<\/g>|<(?:rect|text)\b[^>]*>/g)) {
			const own = Number(/\sopacity="([\d.]+)"/.exec(token)?.[1] ?? 1);
			if (token === "</g>") {
				strengths.pop();
			} else if (token.startsWith("<g")) {
				strengths.push(strengths.at(-1)! * own);
			} else {
				drawnAt.push({ tag: token, opacity: strengths.at(-1)! * own });
			}
		}
		const ghosted = drawnAt.filter((one) => one.opacity < 1);
		// The words are ghosted, label and note alike.
		expect(ghosted.filter((one) => one.tag.startsWith("<text")).length).toBeGreaterThanOrEqual(2);
		// The plates, not the selection's rule on one or the row's tint over one.
		const plates = ghosted.filter(
			(one) => one.tag.startsWith("<rect") && !/ab-halo|fill-opacity/.test(one.tag),
		);
		expect(plates).toHaveLength(2);
		for (const plate of plates) {
			const under = drawnAt.slice(0, drawnAt.indexOf(plate));
			expect(
				under.some(
					(one) =>
						one.opacity === 1 &&
						one.tag.startsWith("<rect") &&
						geometry(one.tag) === geometry(plate.tag),
				),
			).toBe(true);
		}
	});

	test("tells its four standings apart without relying on colour", () => {
		// A message has no outline to take over and no corner to pin, so its row
		// carries its standing: a pin in the margin, in shape as well as hue.
		const steps = STANDINGS.map((one) => {
			const rendered = drawnSequence({ s3: one });
			const row = rowMarkOf(rendered.svg, "s3");
			return (
				withoutColour(subject(rendered, "step", "s3")) +
				(row === undefined ? "" : withoutColour(row))
			);
		});
		expect(new Set(steps).size).toBe(4);
	});
});

test("a selected participant or message is traced in the selection's ink over what it draws", () => {
	const rendered = drawnSequence();
	const groups = subjectGroups(rendered.svg);
	const selection = /\.is-selected \.ab-halo\{[^}]*stroke:([^;}]+)/.exec(rendered.svg)![1];
	// A participant's column: each halo retraces its lifeline or one of its
	// bars, and nothing rings the column as a whole. A bar is a slab, its box
	// the body its face and edge are drawn on, with a shadow round it.
	const column = groups.find(
		(group) => group.id === "gw" && group.markup.includes('data-semantic-part="lifeline"'),
	)!;
	const drawn = column.markup.match(/<(?:line|rect)\s(?![^>]*ab-halo)[^>]*>/g)!.map(geometry);
	const lit = column.markup.match(/<(?:line|rect) class="ab-halo"[^>]*>/g)!.map(geometry);
	expect(lit.length).toBeGreaterThan(1);
	for (const trace of lit) {
		expect(drawn).toContain(trace);
	}
	expect(new Set(lit).size).toBe(lit.length);
	expect(column.markup.match(/<line class="ab-halo"/g)).toHaveLength(1);

	// A message: a trace over its own line, ending in a head of the selection's
	// ink, and a rule round its plate.
	const run = groups.find((group) => group.id === "s2" && group.kind === "step")!;
	const line = /<path d="([^"]+)"[^>]*marker-end/.exec(run.markup)![1];
	const trace = /<path class="ab-halo" d="([^"]+)" marker-end="url\(#([^)]+)\)"/.exec(run.markup)!;
	expect(trace[1]).toBe(line);
	const head = new RegExp(`<marker id="${trace[2]}"[^>]*>(.*?)</marker>`).exec(rendered.svg)![1];
	expect(head).toContain(selection);
	const words = groups.find(
		(group) => group.id === "s2" && group.markup.includes('data-semantic-part="label"'),
	)!;
	const plate = /<rect x=[^>]*>/.exec(words.markup)![0];
	const rule = /<rect class="ab-halo"[^>]*>/.exec(words.markup)![0];
	expect(geometry(rule)).toBe(geometry(plate));
});
