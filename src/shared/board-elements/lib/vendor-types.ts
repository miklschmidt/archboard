import type {
	BoundElement as VendorBoundElement,
	ExcalidrawArrowElement as VendorArrowElement,
	ExcalidrawElbowArrowElement as VendorElbowArrowElement,
	ExcalidrawElement as VendorElement,
	ExcalidrawFreeDrawElement as VendorFreeDrawElement,
	ExcalidrawImageElement as VendorImageElement,
	ExcalidrawLinearElement as VendorLinearElement,
	ExcalidrawTextElement as VendorTextElement,
	PointBinding as VendorPointBinding,
} from "@excalidraw/excalidraw/element/types";

type IsAny<T> = 0 extends 1 & T ? true : false;

/** JSON values with vendor readonly and nominal brands removed. */
type JsonWritable<T> =
	IsAny<T> extends true
		? unknown
		: T extends readonly [infer A, infer B]
			? [JsonWritable<A>, JsonWritable<B>]
			: T extends readonly (infer Item)[]
				? JsonWritable<Item>[]
				: T extends { _brand: string }
					? T extends number
						? number
						: T extends string
							? string
							: never
					: T extends number | string | boolean | null | undefined
						? T
						: T extends object
							? {
									-readonly [Key in keyof T as Key extends "_brand" ? never : Key]: JsonWritable<
										T[Key]
									>;
								}
							: T;

type DirectArm<Kind extends VendorElement["type"]> = JsonWritable<
	Extract<VendorElement, { type: Kind }>
>;

type WritableVendorElement = JsonWritable<VendorElement>;

type RectangleElement = DirectArm<"rectangle">;
type EllipseElement = DirectArm<"ellipse">;
type DiamondElement = DirectArm<"diamond">;
type TextElement = JsonWritable<VendorTextElement>;
type FreeDrawElement = JsonWritable<VendorFreeDrawElement>;
type ImageElement = JsonWritable<VendorImageElement>;
type NonElbowArrowElement = JsonWritable<
	Omit<VendorArrowElement, "elbowed"> & { readonly elbowed: false }
>;
type ElbowArrowElement = JsonWritable<VendorElbowArrowElement>;
type ArrowElement = NonElbowArrowElement | ElbowArrowElement;

/** The vendor combines line and arrow in one arm, so only line is normalized. */
type LineElement = JsonWritable<
	Omit<VendorLinearElement, "type"> & {
		readonly type: "line";
		readonly elbowed?: never;
	}
>;

type NativeBoardElement =
	| RectangleElement
	| EllipseElement
	| DiamondElement
	| ArrowElement
	| TextElement
	| LineElement
	| FreeDrawElement
	| ImageElement;

type ElementBinding = JsonWritable<VendorPointBinding>;
type BoundElement = JsonWritable<VendorBoundElement>;

export {
	type JsonWritable,
	type WritableVendorElement,
	type RectangleElement,
	type EllipseElement,
	type DiamondElement,
	type TextElement,
	type FreeDrawElement,
	type ImageElement,
	type NonElbowArrowElement,
	type ElbowArrowElement,
	type ArrowElement,
	type LineElement,
	type NativeBoardElement,
	type ElementBinding,
	type BoundElement,
};
