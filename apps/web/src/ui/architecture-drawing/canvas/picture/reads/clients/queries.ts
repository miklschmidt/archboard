// The query options for the resources the browser reads. As in
// the model-catalog behavior, the options live here rather than at the call
// sites, so each resource's freshness contract is written down once. Their keys
// are private to this module (`read-keys.ts`), and what makes them stale is
// `read-refresh.ts`'s to decide.

import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";

import { MODEL_CACHE_MS } from "@archboard/timing";
import {
	runCodeCheck,
	type CodeCheckReading,
	type SemanticRenderRequest,
} from "#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts";
import {
	sameModelAsked,
	readKeys,
} from "#ui/architecture-drawing/canvas/picture/reads/clients/read-keys.ts";
import { modelsListed } from "#ui/architecture-drawing/canvas/picture/reads/clients/read-refresh.ts";
import { retainedReads } from "#ui/architecture-drawing/canvas/picture/reads/clients/retained-reads.ts";
import { pictureSource } from "#ui/architecture-drawing/canvas/picture/supply/clients/picture-source.ts";

/**
 * One vault's legacy boards.
 *
 * Read again when the tab comes back: nothing announces that the vault gained
 * a model, and an agent may have created one while somebody was reading code.
 * @param vault The vault.
 * @returns The query options.
 */
function retainedListingQuery(vault: string) {
	return queryOptions({
		queryKey: readKeys.models(vault),
		/**
		 * Read the vault's legacy boards, read again what this tab holds of a
		 * model that has moved since, and tell the picture source which versions
		 * they are at, so it can forget pictures of older ones and draw the models
		 * ahead.
		 * @param context The query context, carrying this read's cancellation and the tab's cache.
		 * @returns The listing.
		 */
		queryFn: async (context) => {
			const listing = await retainedReads().listing(vault, context.signal);
			modelsListed(context.client, vault, listing.boards);
			pictureSource().listed?.(vault, listing.boards, context.client);
			return listing;
		},
		refetchOnWindowFocus: true,
	});
}

/**
 * One variant of one model, drawn in this page, or by the server when the page
 * runs no renderer (`picture-source.ts`).
 *
 * This picture is derived from a versioned model, so the thing that makes it
 * out of date is a version we have been told about — never the passage of
 * time. A model that has not changed renders to the same bytes an hour later,
 * and drawing it again would cost a full layout and text measurement for a
 * picture identical to the one already on screen. So there
 * is deliberately no timer here: the cached drawing stays fresh until the
 * model announces a new version over the pane socket, which is what
 * `useModelChanges` listens for. That is also why there is no duration
 * to put in `@archboard/timing` — the absence of one is the contract.
 *
 * A network reconnect is the one exception: while the tab was offline a change
 * could have been announced to nobody, so the picture is read again then.
 *
 * While another picture of the same model is being drawn — another variant,
 * or the same one through another view — the last picture stays as the
 * placeholder, so the pane can carry it into the next rather than dropping to
 * a skeleton between the two. Another model's picture is not kept here: there is
 * nothing of it to carry across, and a pane must not show one model under
 * another's name for even a request's length.
 *
 * A picture stays in the tab's cache for as long as the tab lives, whether or
 * not a pane shows it: one drawn ahead is there when somebody opens its model,
 * however long after, instead of being read back while the pane waits
 * (TASK-344). A key names a reading, not a version, so a model holds one
 * picture per reading however often it changes.
 * @param request The model, the variant and the view.
 * @returns The query options.
 */
function semanticRenderQuery(request: SemanticRenderRequest) {
	return queryOptions({
		queryKey: readKeys.render(request),
		/**
		 * Draw it, in this page or by the server, whichever the page chose.
		 * @param context The query context, carrying the cache and this read's cancellation.
		 * @returns The drawing, or the news that there is nothing to draw.
		 */
		queryFn: (context) => pictureSource().draw(request, context.client, context.signal),
		/**
		 * The last picture of this model, while this one is on its way.
		 *
		 * Decided by the model the last query asked for, spelled exactly as this
		 * one asks: a reply names the model canonically and an address does not,
		 * and the two must not be compared.
		 * @param previous What the last query held, if anything.
		 * @param previousQuery The query that held it.
		 * @returns That, when it was of this model.
		 */
		placeholderData: (previous, previousQuery) =>
			sameModelAsked(previousQuery?.queryKey, request) ? previous : undefined,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		refetchOnReconnect: "always" as const,
	});
}

/**
 * One legacy board's whole document, as it is on disk.
 *
 * Inspection reads this rather than the picture, because a picture is a
 * reading of a legacy board and not the legacy board: a node's description is deliberately
 * not drawn, a code binding is not drawn, and a view that narrows what is drawn
 * must not narrow what a drawn subject can be asked about.
 *
 * Its freshness contract is the drawing's, for the same reason: both are
 * derived from one versioned legacy board, so both stay fresh until that legacy board
 * announces a new version, and neither is re-read on a timer.
 * @param vault The vault the legacy board is in.
 * @param model The legacy board name.
 * @returns The query options.
 */
function retainedDocumentQuery(vault: string, model: string) {
	return queryOptions({
		queryKey: readKeys.document(vault, model),
		/**
		 * Read the model, from the server or wherever the page reads models from.
		 * @param context The query context, carrying this read's cancellation.
		 * @returns The document, as the server holds it.
		 */
		queryFn: (context) => retainedReads().document(vault, model, context.signal),
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		refetchOnReconnect: "always" as const,
	});
}

/**
 * The vault's policy and diagnostics, as the shared checker reports them.
 *
 * Owned here rather than beside the diagnostics bell because a picture is
 * drawn under this policy and a pane names groups out of it: the policy is one
 * resource with two readers, and one cache entry serves both. The architecture
 * feed marks it stale when the vault changes, and a return to the tab reads it
 * again, because a person can edit a file that no feed follows.
 * @param vault The vault.
 * @returns The query options.
 */
function vaultCheckQuery(vault: string) {
	return queryOptions({
		queryKey: readKeys.vaultCheck(vault),
		/**
		 * Read and validate the checker's answer.
		 * @param context The query context, carrying this read's cancellation.
		 * @returns The checked policy and diagnostics.
		 */
		queryFn: (context) => retainedReads().vaultCheck(vault, context.signal),
		staleTime: MODEL_CACHE_MS.vaultCheck,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
		retry: false,
	});
}

/**
 * What the last code pass found on each model it read (ADR 0046, TASK-367.24).
 *
 * One cache entry for the whole tab, whichever panes read it, re-read on the
 * vault check's timer: a pass runs when an agent asks for one or the code view
 * of Measures opens on a reading no pass read, and nothing announces that it
 * ran. The route answers from the server's memory and never starts a pass, so
 * the timer costs a read of memory and never a reading of code. An answer that did not change keeps its reference, so a pane draws its
 * marks again only when the findings move.
 *
 * A failed read leaves the marks as they were and is tried again on the next
 * tick: the findings are a hint beside the model, and a pane that cannot read
 * them still shows the model.
 * @param vault The vault.
 * @returns The query options.
 */
function codeFindingsQuery(vault: string) {
	return queryOptions({
		queryKey: readKeys.codeFindings(vault),
		/**
		 * Read the remembered findings.
		 * @param context The query context, carrying this read's cancellation.
		 * @returns The readings.
		 */
		queryFn: (context) => retainedReads().codeFindings(vault, context.signal),
		staleTime: MODEL_CACHE_MS.vaultCheck,
		refetchInterval: MODEL_CACHE_MS.vaultCheck,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
		retry: false,
	});
}

/**
 * One code pass over one version of a reading, which the code view of Measures starts when no
 * remembered pass read it (ADR 0046, amendment of 2026-11-08). It settles once the findings have
 * been read again, so the view goes from checking to the findings in one step. It never goes stale
 * and the cache keeps it, so a page starts one pass for a version of a reading however often the
 * view opens, and a pass that failed is tried again only when somebody asks.
 * @param vault The vault.
 * @param reading The reading and its version.
 * @returns The query options.
 */
function codeCheckQuery(vault: string, reading: CodeCheckReading) {
	return queryOptions({
		queryKey: readKeys.codeCheck(vault, reading),
		/**
		 * Run the pass, then read what it found.
		 * @param context The query context, whose client reads the findings again.
		 * @returns True once both are done.
		 */
		queryFn: async (context): Promise<true> => {
			await runCodeCheck(vault, reading);
			await context.client.invalidateQueries({ queryKey: readKeys.codeFindings(vault) });
			return true;
		},
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		retry: false,
	});
}

/** One icon's path data, as the Archboard server serves it. */
const IconSchema = z.object({ paths: z.array(z.string()) });

/**
 * One icon's path data, fetched once by name.
 * @param name The Remix Icon's export name.
 * @returns The query options.
 */
function iconQuery(name: string) {
	return queryOptions({
		queryKey: ["diagram-icon", name],
		/**
		 * Fetch the icon's paths.
		 * @param context The query context, carrying this read's cancellation.
		 * @returns The paths.
		 */
		queryFn: async (context): Promise<readonly string[]> => {
			const response = await fetch(`/assets/diagram-icons/${encodeURIComponent(name)}.json`, {
				signal: context.signal,
			});
			if (!response.ok) throw new Error(`No icon called ${name}`);
			return IconSchema.parse(await response.json()).paths;
		},
		staleTime: Infinity,
		retry: false,
	});
}

export {
	codeCheckQuery,
	codeFindingsQuery,
	iconQuery,
	retainedDocumentQuery,
	retainedListingQuery,
	semanticRenderQuery,
	vaultCheckQuery,
};
