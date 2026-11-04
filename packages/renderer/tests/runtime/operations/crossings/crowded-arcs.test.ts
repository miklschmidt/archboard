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
