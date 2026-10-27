import { expect, test } from "bun:test";
import { compactnessOf } from "#tests/runtime/support/drawn-compactness.ts";

test("frame occupancy counts member cards independently of the header width", () => {
	const svg = `<svg><g data-semantic-kind="region" data-semantic-id="parent"><rect x="0" y="0" width="400" height="200" pointer-events="all"/><rect x="0" y="0" width="400" height="72" rx="8"/></g><g data-semantic-kind="node" data-semantic-id="a"><rect x="10" y="10" width="100" height="40" pointer-events="all"/></g><g data-semantic-kind="node" data-semantic-id="b"><rect x="250" y="100" width="100" height="40" pointer-events="all"/></g></svg>`;
	const measured = compactnessOf(svg, 400, 200);
	expect(measured.area).toBe(80000);
	expect(measured.aspect).toBe(2);
	expect(measured.frames[0]?.members).toBe(2);
	expect(measured.frames[0]?.emptyShare).toBeCloseTo(0.9);
	expect(measured.frames[0]?.outsideMemberEnvelope).toBeCloseTo(0.4475);
});

test("the longest route measure names the detour independently of canvas size", () => {
	const svg = `<svg><g data-semantic-kind="edge" data-semantic-id="direct"><path d="M0,0 L100,0" marker-end="url(#head)"/></g><g data-semantic-kind="edge" data-semantic-id="detour"><path d="M0,0 L0,200 L100,200 L100,0" marker-end="url(#head)"/></g></svg>`;
	expect(compactnessOf(svg, 400, 200).longestRoute).toEqual({
		id: "detour",
		length: 500,
		detour: 400,
	});
});

test("group frames without semantic node IDs contribute to occupancy", () => {
	const svg = `<svg><g data-semantic-kind="group-region" data-group="reads" data-members="b a"><rect x="0" y="0" width="200" height="100" rx="10" style="fill:none"/></g><g data-semantic-kind="node" data-semantic-id="a"><rect x="10" y="10" width="100" height="40" pointer-events="all"/></g></svg>`;
	const measured = compactnessOf(svg, 200, 100);
	expect(measured.frames).toHaveLength(1);
	expect(measured.frames[0]?.kind).toBe("group");
	expect(measured.frames[0]?.id).toBe("group:reads:a b");
	expect(measured.frameEmptyShare).toBeCloseTo(0.8);
});
