// @excalidraw/excalidraw 0.18.1 imports these from an undeclared package.
// Keep this pinned exception exact; docs/design/excalidraw-json-schema.md owns why.
declare module "@excalidraw/math" {
	export type LocalPoint = [x: number, y: number] & { _brand: "excalimath__localpoint" };
	export type Radians = number & { _brand: "excalimath__radian" };
}
