import { expect, test } from "bun:test";
import { crowdedArcs } from "#tests/runtime/support/drawn-crossings.ts";

// A full-radius hop from (43, 50) to (57, 50), with its crest at (50, 43).
const HOP = `<g data-semantic-kind="edge" data-semantic-id="over" data-arrowhead="none">
<path d="M0,50 L43,50 C43,46.134 46.134,43 50,43 C53.866,43 57,46.134 57,50 L100,50"/>
</g>`;

test.each([
	'<circle cx="50" cy="40" r="3" fill="#000" data-members="a b"/>',
	'<path d="M48,40 L52,40" fill="none" stroke="#000" stroke-width="6" stroke-linecap="round" data-members="a b c"/>',
])("the integrity assertion catches a hop touching either junction shape: %s", (mark) => {
	expect(crowdedArcs({ svg: `${HOP}<g class="ab-junctions">${mark}</g>` })).toHaveLength(1);
});

test("a junction behind the hop does not crowd its crest", () => {
	const mark = '<path d="M48,55 L52,55" stroke-width="6" data-members="a b c"/>';
	expect(crowdedArcs({ svg: `${HOP}<g class="ab-junctions">${mark}</g>` })).toEqual([]);
});

/** A vertical arc whose top foot is at the supplied height. */
function verticalHop(top: number): string {
	return `<g data-semantic-kind="edge" data-semantic-id="vertical" data-arrowhead="none">
<path d="M48,0 L48,${top} C51.866,${top} 55,${top + 3.134} 55,${top + 7} C55,${top + 10.866} 51.866,${top + 14} 48,${top + 14} L48,100"/>
</g>`;
}

test.each([
	[49, 1],
	[50, 0],
	[50 - 1e-9, 0],
])("crosswise arc crowding at a vertical foot of %s", (top, crowded) => {
	expect(crowdedArcs({ svg: HOP + verticalHop(top) })).toHaveLength(crowded);
});

test("a crosswise overlap with a shifted trunk copy counts once in either paint order", () => {
	const copy = HOP.replace('id="over"', 'id="copy"')
		.replaceAll(",50", ",51")
		.replaceAll(",46.134", ",47.134")
		.replaceAll(",43", ",44");
	for (const trunk of [HOP + copy, copy + HOP]) {
		expect(crowdedArcs({ svg: trunk + verticalHop(50.5) })).toHaveLength(1);
	}
	expect(crowdedArcs({ svg: HOP + copy + verticalHop(49) })).toHaveLength(1);
});

const crest = (from: number) =>
	`C${from},46.13 ${from + 3.13},43 ${from + 7},43 L${from + 23},43 C${from + 26.87},43 ${from + 30},46.13 ${from + 30},50`;

test("two crests on one line with a straight run between them read as two arcs", () => {
	// One line hops twice under flat crests at y 43; another joins it before the second and
	// shares that arc. The straight run between the crests is the line, not a third arc.
	const svg = `<g data-semantic-kind="edge" data-semantic-id="twice" data-arrowhead="none">
<path d="M0,50 L10,50 ${crest(10)} L160,50 ${crest(160)} L200,50"/>
</g>
<g data-semantic-kind="edge" data-semantic-id="joins" data-arrowhead="none">
<path d="M120,90 L120,58 C120,53.58 123.58,50 128,50 L160,50 ${crest(160)} L200,50"/>
</g>`;
	expect(crowdedArcs({ svg })).toEqual([]);
});
