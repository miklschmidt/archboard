// A measure of a drawing taken once per drawing. A settled drawing is weighed
// again against every challenger: a finishing pass that cures card by card
// counts the kept drawing's defects once for each card it tries, and choosing
// between settlements ranks each drawing on its defects twice. A drawing is
// never changed once made, so its measure never changes either. The answers
// are held only as long as the drawing itself (a WeakMap), so they cannot
// outgrow the drawings a render keeps.
import type { ArchitectureDrawing } from "@/transformers/semantic-renderer/lib/drawing";

/**
 * A measure that answers each drawing from its first answer.
 * @param measure The measure, a pure function of the drawing.
 * @returns The same measure, taken once for each drawing.
 */
export function measuredOnce<Value>(
	measure: (drawing: ArchitectureDrawing) => Value,
): (drawing: ArchitectureDrawing) => Value {
	const known = new WeakMap<ArchitectureDrawing, { readonly value: Value }>();
	return (drawing) => {
		const found = known.get(drawing);
		if (found !== undefined) return found.value;
		const value = measure(drawing);
		known.set(drawing, { value });
		return value;
	};
}

/**
 * A measure of a drawing in a context that answers each drawing and context
 * from its first answer.
 * @param measure The measure, a pure function of the drawing and the context.
 * @returns The same measure, taken once for each drawing and context.
 */
export function measuredOnceIn<Value, Context extends object>(
	measure: (drawing: ArchitectureDrawing, context: Context) => Value,
): (drawing: ArchitectureDrawing, context: Context) => Value {
	const byContext = new WeakMap<Context, (drawing: ArchitectureDrawing) => Value>();
	return (drawing, context) => {
		const measured = byContext.get(context) ?? measuredOnce((one) => measure(one, context));
		byContext.set(context, measured);
		return measured(drawing);
	};
}
