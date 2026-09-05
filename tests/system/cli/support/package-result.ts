import { z } from "zod";
import { createPackageCliOwner, packageFailure } from "./package-cli.ts";
import type { PackageRunResult } from "./package-cli.ts";

interface DecodingSchema<T> {
	readonly safeParse: (
		value: unknown,
	) =>
		| { readonly success: true; readonly data: T }
		| { readonly success: false; readonly error: Error };
}

const rawExportSchema = z.object({
	type: z.literal("excalidraw"),
	version: z.number(),
	source: z.literal("archboard"),
	elements: z.array(z.unknown()),
});
const unavailableStatusSchema = z.looseObject({ running: z.literal(false) });

function decodePackage<T>(
	result: Readonly<PackageRunResult>,
	schema: Readonly<DecodingSchema<T>>,
): T {
	const diagnostic = packageFailure(result);
	let decoded: unknown;
	try {
		decoded = JSON.parse(result.stdout);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`${diagnostic}\nJSON decode: ${message}`, { cause: error });
	}
	const parsed = schema.safeParse(decoded);
	if (!parsed.success) {
		throw new Error(`${diagnostic}\nschema: ${parsed.error.message}`, { cause: parsed.error });
	}
	return parsed.data;
}

export {
	createPackageCliOwner,
	decodePackage,
	packageFailure,
	rawExportSchema,
	unavailableStatusSchema,
};
export type { PackageRunResult };
