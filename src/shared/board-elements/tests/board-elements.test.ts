import { expect, test } from "bun:test";
import type {
	ArrowElement,
	DiamondElement,
	ElbowArrowElement,
	EllipseElement,
	FreeDrawElement,
	ImageElement,
	LineElement,
	NonElbowArrowElement,
	PersistedBoardElement,
	RectangleElement,
	TextElement,
} from "../index.js";

type Equal<A, B> = [A, B] extends [B, A] ? true : false;
type IsAny<T> = 0 extends 1 & T ? true : false;
type Assert<T extends true> = T;
type AssertFalse<T extends false> = T;

type _KindsAreNonNever = [
	AssertFalse<Equal<RectangleElement, never>>,
	AssertFalse<Equal<EllipseElement, never>>,
	AssertFalse<Equal<DiamondElement, never>>,
	AssertFalse<Equal<ArrowElement, never>>,
	AssertFalse<Equal<TextElement, never>>,
	AssertFalse<Equal<LineElement, never>>,
	AssertFalse<Equal<FreeDrawElement, never>>,
	AssertFalse<Equal<ImageElement, never>>,
];
type _ExactDiscriminators = [
	Assert<Equal<RectangleElement["type"], "rectangle">>,
	Assert<Equal<EllipseElement["type"], "ellipse">>,
	Assert<Equal<DiamondElement["type"], "diamond">>,
	Assert<Equal<ArrowElement["type"], "arrow">>,
	Assert<Equal<TextElement["type"], "text">>,
	Assert<Equal<LineElement["type"], "line">>,
	Assert<Equal<FreeDrawElement["type"], "freedraw">>,
	Assert<Equal<ImageElement["type"], "image">>,
];
type _ProjectedScalars = [
	AssertFalse<IsAny<LineElement["points"][number]>>,
	AssertFalse<IsAny<LineElement["points"][number][0]>>,
	Assert<Equal<LineElement["angle"], number>>,
	Assert<Equal<LineElement["points"][number], [number, number]>>,
	AssertFalse<"_brand" extends keyof LineElement["points"][number] ? true : false>,
	Assert<Equal<LineElement["elbowed"], undefined>>,
	AssertFalse<{ elbowed: false } extends LineElement ? true : false>,
	Assert<Equal<ArrowElement["elbowed"], boolean>>,
	AssertFalse<Omit<ArrowElement, "elbowed"> extends ArrowElement ? true : false>,
	Assert<Equal<NonElbowArrowElement["elbowed"], false>>,
	Assert<Equal<ElbowArrowElement["elbowed"], true>>,
	AssertFalse<
		"fixedPoint" extends keyof NonNullable<NonElbowArrowElement["startBinding"]> ? true : false
	>,
	Assert<"fixedPoint" extends keyof NonNullable<ElbowArrowElement["startBinding"]> ? true : false>,
	Assert<"fixedSegments" extends keyof ElbowArrowElement ? true : false>,
	AssertFalse<"fixedSegments" extends keyof NonElbowArrowElement ? true : false>,
];

type RawTextOutsideText<T> = T extends { type: "text" }
	? false
	: "rawText" extends keyof T
		? true
		: false;
type _RawTextOnlyText = AssertFalse<RawTextOutsideText<PersistedBoardElement>>;
type _NoRuntimeOrInputFields = [
	AssertFalse<"source" extends keyof PersistedBoardElement ? true : false>,
	AssertFalse<"createdAt" extends keyof PersistedBoardElement ? true : false>,
	AssertFalse<"label" extends keyof PersistedBoardElement ? true : false>,
	AssertFalse<"start" extends keyof PersistedBoardElement ? true : false>,
	AssertFalse<"end" extends keyof PersistedBoardElement ? true : false>,
];

const writablePoint: LineElement["points"][number] = [1, 2];
writablePoint[0] = 3;
writablePoint[1] = 4;

function exhaustive(element: PersistedBoardElement): string {
	switch (element.type) {
		case "rectangle":
		case "ellipse":
		case "diamond":
		case "arrow":
		case "text":
		case "line":
		case "freedraw":
		case "image":
			return element.type;
		default: {
			const neverElement: never = element;
			return neverElement;
		}
	}
}

test("the supported union has eight exhaustive writable JSON arms", () => {
	expect(writablePoint).toEqual([3, 4]);
	expect(exhaustive as (element: PersistedBoardElement) => string).toBeFunction();
});
