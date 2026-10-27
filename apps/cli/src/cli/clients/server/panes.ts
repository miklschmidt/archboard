// The panes on screen, as the CLI asks the server about them and moves them.

import { requestJson, statedInvocation } from "@archboard/server-lifecycle/server-client";


/**
 * The options for a POST carrying a JSON body.
 * @param payload The body.
 * @returns The fetch options.
 */
function posting(payload: unknown): RequestInit {
	return {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	};
}

/** What one pane is called where a person points at it. */
interface PaneRef {
	paneId: string;
	clientId: string;
	place: string;
	position: number;
}

/** What a layout change answers with. */
interface PaneLayoutResponse {
	success: true;
	pane?: PaneRef | null;
	closed?: PaneRef & { board: string };
	paneCount: number;
	onScreen: Array<{ paneId: string; place: string; board: string }>;
}

type ShowBoardResponse = {success:true;model:string;reading:import("zod").infer<typeof import("@archboard/board/pane-context").ArchitecturePaneReadingSchema>;revision:unknown;repository:string|null;checkout:string;chose?:{repository:string;checkout:string;replaced:string|null};paneId:string;};

/**
 * What every pane on screen is showing and reading.
 * @param caller The vault the caller's command finds, so each pane says whether it shows that
 * vault, or null when it finds none.
 * @returns The panes report.
 */
function getPanes(caller: string | null): Promise<Record<string, unknown>> {
	return requestJson(
		caller === null ? "/api/panes" : `/api/panes?vault=${encodeURIComponent(caller)}`,
	);
}

/**
 * Split the canvas: one more pane beside what is already there.
 * @returns Where the new pane landed.
 */
function openPane(): Promise<PaneLayoutResponse> {
	return requestJson<PaneLayoutResponse>("/api/panes/open", posting({}));
}

/**
 * Close one pane, named the way every other pane is named.
 * @param spec The pane spec.
 * @returns What was closed and what is left.
 */
function closePane(spec: string): Promise<PaneLayoutResponse> {
	return requestJson<PaneLayoutResponse>("/api/panes/close", posting({ pane: spec }));
}

/**
 * Point one pane at one board, as an agent: the shell's own shows come from the page, so a show
 * from here says it is an agent's, and which agent session it is when the invocation named one.
 * The voice and its coordinator are told an agent moved the pane, unless it was their own
 * session (TASK-293.06).
 * @param board The board key.
 * @param pane The pane spec, when the caller named one.
 * @returns What the pane is showing now.
 */
function showBoardInPane(reading:ShowBoardResponse["reading"],pane?:string):Promise<ShowBoardResponse>{
 const {session}=statedInvocation();
 return requestJson<ShowBoardResponse>("/api/panes/show",posting({reading,agent:true,...(pane===undefined?{}:{pane}),...(session===null?{}:{session})}));
}

export { type ShowBoardResponse, closePane, getPanes, openPane, showBoardInPane };
