import type {
	BoundElement as VendorBoundElement,
	ExcalidrawArrowElement as VendorArrowElement,
	ExcalidrawElement as VendorElement,
	ExcalidrawFreeDrawElement as VendorFreeDrawElement,
	ExcalidrawImageElement as VendorImageElement,
	ExcalidrawLinearElement as VendorLinearElement,
	ExcalidrawTextElement as VendorTextElement,
	PointBinding as VendorPointBinding,
} from "@excalidraw/excalidraw/element/types";

type IsAny<T> = 0 extends 1 & T ? true : false;

/** JSON values with vendor readonly and nominal brands removed. */
export type JsonWritable<T> =
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

export type WritableVendorElement = JsonWritable<VendorElement>;

export type RectangleElement = DirectArm<"rectangle">;
export type EllipseElement = DirectArm<"ellipse">;
export type DiamondElement = DirectArm<"diamond">;
export type TextElement = JsonWritable<VendorTextElement>;
export type FreeDrawElement = JsonWritable<VendorFreeDrawElement>;
export type ImageElement = JsonWritable<VendorImageElement>;
export type ArrowElement = JsonWritable<VendorArrowElement>;

/** The vendor combines line and arrow in one arm, so only line is normalized. */
export type LineElement = JsonWritable<
	Omit<VendorLinearElement, "type"> & {
		readonly type: "line";
		readonly elbowed?: never;
	}
>;

export type NativeBoardElement =
	| RectangleElement
	| EllipseElement
	| DiamondElement
	| ArrowElement
	| TextElement
	| LineElement
	| FreeDrawElement
	| ImageElement;

export type ElementBinding = JsonWritable<VendorPointBinding>;
export type BoundElement = JsonWritable<VendorBoundElement>;
