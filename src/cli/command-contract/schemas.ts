import { z } from "zod";

const PaneRefSchema = z.looseObject({
	paneId: z.string(),
	clientId: z.string(),
	place: z.string(),
	position: z.number().int(),
});

const ServerStateSchema = z.looseObject({
	running: z.boolean(),
	url: z.string(),
});

const PendingArtifactSchema = z.discriminatedUnion("encoding", [
	z.object({
		path: z.string(),
		content: z.string(),
		encoding: z.literal("utf8"),
	}),
	z.object({
		path: z.string(),
		content: z.instanceof(Uint8Array),
		encoding: z.literal("binary"),
	}),
	z
		.object({
			path: z.string(),
			encoding: z.literal("files"),
			files: z.array(
				z.strictObject({
					name: z.string().regex(/^[^/\\]+$/u),
					content: z.instanceof(Uint8Array),
				}),
			),
			manifest: z.strictObject({ name: z.literal("manifest.json"), content: z.string() }),
		})
		.superRefine((artifact, context) => {
			const names = artifact.files.map(({ name }) => name);
			if (new Set(names).size !== names.length) {
				context.addIssue({
					code: "custom",
					path: ["files"],
					message: "Artifact file names must be unique.",
				});
			}
		}),
]);
export { PaneRefSchema, PendingArtifactSchema, ServerStateSchema };
