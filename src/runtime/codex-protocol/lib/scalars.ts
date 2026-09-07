import { z } from "zod";

export { CodexSafeI64Schema } from "@/shared/codex-app-server-contract";

/** Use only where Codex's generated 0.151.0 contract deliberately says JsonValue. */
export const JsonValueSchema = z.json();
/**
 * Text that is nonempty, NUL-free and bounded in UTF-8 bytes as well as characters, because
 * Codex enforces byte limits while JavaScript counts code units.
 * @param maximum - The largest accepted size in both characters and UTF-8 bytes.
 * @returns A string schema enforcing those bounds.
 */
export const boundedText = (maximum: number) =>
	z
		.string()
		.min(1)
		.max(maximum)
		.refine((value) => !value.includes("\0"), "NUL is not allowed")
		.refine(
			(value) => new TextEncoder().encode(value).byteLength <= maximum,
			`text exceeds ${maximum} UTF-8 bytes`,
		);
/**
 * Bounded text for generated fields that may be absent or explicitly null.
 * @param maximum - The largest accepted size in both characters and UTF-8 bytes.
 * @returns The bounded text schema widened to accept null and undefined.
 */
export const optionalNullableText = (maximum: number) => boundedText(maximum).nullable().optional();
export const StringRecordSchema = z.record(z.string(), z.string());
/** A JSON object whose keys and values are intentionally supplied by Codex. */
export const JsonObjectSchema = z.record(z.string(), JsonValueSchema);
/** A dynamic string-keyed JSON map allowed by the generated contract. */
export const JsonRecordSchema = z.record(z.string(), JsonValueSchema);
export const FiniteNumberSchema = z.number().finite();
export const IntegerSchema = FiniteNumberSchema.int();
export const NonNegativeIntegerSchema = IntegerSchema.nonnegative();
export const RequestIdSchema = z.union([z.string(), IntegerSchema]);

export const NullableStringSchema = z.string().nullable();
export const NullableNumberSchema = FiniteNumberSchema.nullable();
export const NullableIntegerSchema = IntegerSchema.nullable();

/**
 * Validate the generated fields while retaining forward-compatible object members.
 * @param shape - The generated fields to validate.
 * @returns An object schema that keeps unknown members instead of stripping them.
 */
export function looseObject<Shape extends z.ZodRawShape>(shape: Shape) {
	return z.looseObject(shape);
}
