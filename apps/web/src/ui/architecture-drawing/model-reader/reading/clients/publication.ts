import type { z } from "zod";
import { queryOptions } from "@tanstack/react-query";
import { inVault, strictReply } from "@archboard/server-requests";
import { vaultQueryKey } from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";
import {
	readModelReply,
	type ModelReply,
	type ModelRequest,
	type ModelShape,
	type ReplyOperation,
} from "@archboard/model-contract";

type Publication = ModelReply<"readPublication">;
type Destination = z.infer<ModelShape<"publicationDestination">>;
type PublicationCommand =
	| { action: "configure"; input: Destination }
	| {
			action: "publish" | "fetch";
			input: ModelRequest<"publish">;
	  };

type PublicationOperation = Extract<
	ReplyOperation,
	"readPublication" | "configurePublication" | "publish" | "fetch"
>;

/**
 * Preserve publication states and recovery details on unsuccessful HTTP responses.
 * @param url The explicitly addressed local endpoint.
 * @param operation The publication operation whose answer it is.
 * @param request The request method, payload, and cancellation.
 * @returns The shared publication outcome.
 */
async function publicationReply(
	url: string,
	operation: PublicationOperation,
	request: Parameters<typeof strictReply>[1],
): Promise<Publication> {
	const result = await strictReply<Publication, Publication | Error>(
		url,
		request,
		{
			/**
			 * Read a body that came with a success status as the operation's answer.
			 * @param body The body as received.
			 * @returns The answer, or why the body is not one.
			 */
			safeParse: (body) => readModelReply(operation, body, "answered"),
		},
		{
			/**
			 * Read a body that came with an HTTP failure only as the operation's refusal.
			 * @param body The body as received.
			 * @returns The refusal, or why the body is not one.
			 */
			safeParse: (body) => readModelReply(operation, body, "failed"),
		},
		(error) =>
			error instanceof Error
				? error
				: new Error("The local server did not answer. Retry when it is available."),
	);
	if (result instanceof Error) throw result;
	return result;
}

/**
 * Read local publication evidence without contacting a remote.
 * @param vault The explicitly addressed vault.
 * @param checkpoint The exact reading identity.
 * @returns A separate cache owner for mutable sharing status.
 */
function architecturePublicationQuery(vault: string, checkpoint: string) {
	return queryOptions({
		queryKey: vaultQueryKey(vault, "publication", checkpoint),
		/**
		 * Read publication evidence through the local server.
		 * @param context The query cancellation signal.
		 * @returns The latest locally recorded publication state.
		 */
		queryFn: (context) =>
			publicationReply(
				inVault(
					`/api/architecture/publication?checkpoint=${encodeURIComponent(checkpoint)}`,
					vault,
				),
				"readPublication",
				{ signal: context.signal },
			),
		staleTime: 0,
		refetchOnMount: "always",
		refetchOnWindowFocus: "always",
		refetchOnReconnect: "always",
		retry: false,
	});
}

/**
 * Perform only the explicit action and destination captured by the reader.
 * @param vault The explicitly addressed vault.
 * @param command The configuration or exact checkpoint exchange.
 * @returns The shared durable outcome, including pending network failures.
 */
function changeArchitecturePublication(
	vault: string,
	command: PublicationCommand,
): Promise<Publication> {
	return publicationReply(
		inVault(`/api/architecture/publication/${command.action}`, vault),
		command.action === "configure" ? "configurePublication" : command.action,
		{ method: "POST", payload: { vault, ...command.input } },
	);
}

export {
	architecturePublicationQuery,
	changeArchitecturePublication,
	type Publication,
	type Destination,
	type PublicationCommand,
};
