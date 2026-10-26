import { z } from "zod";
import { VAULT_ORIGINS } from "@archboard/workspace/vault";

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
/** What a command registered when it found a checkout or an untracked vault the registry did not know. */
const RegisteredVaultSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("checkout"),
		/** The repository identity. */
		repository: z.string(),
		root: z.string(),
		/** Whether it became the chosen checkout of its identity. */
		chosen: z.boolean(),
		/** The worktrees that the checkout lists and that were registered with it. */
		worktrees: z.array(z.string()),
		/** The untracked vault that took a new registry name, because the identity is its old one. */
		renamed: z.object({ root: z.string(), from: z.string(), to: z.string() }).optional(),
	}),
	z.object({
		kind: z.literal("untracked"),
		/** The registry name the browser shows. */
		name: z.string(),
		root: z.string(),
	}),
]);

/**
 * The vault a command addressed and how it was found (ADR 0049). Every JSON
 * answer of a command that reads `-C` and found a vault carries it as `vault`;
 * a command that runs without a vault (`runsWithoutVault`) and runs in a Git
 * checkout that holds none names no vault.
 */
const AnsweredVaultSchema = z.object({
	/** The vault directory, as its real path. */
	path: z.string(),
	origin: z.enum(VAULT_ORIGINS),
	/** Present only on the answer of the command that registered it. */
	registered: RegisteredVaultSchema.optional(),
});

type AnsweredVault = z.infer<typeof AnsweredVaultSchema>;
type RegisteredVault = z.infer<typeof RegisteredVaultSchema>;

export {
	AnsweredVaultSchema,
	PaneRefSchema,
	PendingArtifactSchema,
	ServerStateSchema,
	type AnsweredVault,
	type RegisteredVault,
};
