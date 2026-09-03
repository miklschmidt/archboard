import type {
	CodexClientRequestParamsByMethod,
	CodexResponseByMethod,
} from "../../codex-app-server-contract/index.js";

import type { BrowserCommand } from "./browser.js";

export const BROWSER_ACTION_OWNERS = {
	accountLogin: "account",
	accountLoginCancel: "account",
	accountLogout: "account",
	threadLinkCreate: "threadLinks",
	threadLinkAttach: "threadLinks",
	threadLinkRelink: "threadLinks",
	start: "text",
	steer: "text",
	interrupt: "text",
	queueAdd: "queue",
	queueUpdate: "queue",
	queueDelete: "queue",
	queueReorder: "queue",
	queueStart: "queue",
	approvalRespond: "ordinaryApprovals",
	dynamicApprovalRespond: "dynamicApprovals",
	realtimeStart: "realtime",
	realtimeAppendText: "realtime",
	realtimeStop: "realtime",
} as const satisfies Record<BrowserCommand["command"], BrowserActionOwner>;

export type BrowserActionName = BrowserCommand["command"];
export type BrowserActionOwner =
	| "account"
	| "threadLinks"
	| "text"
	| "queue"
	| "ordinaryApprovals"
	| "dynamicApprovals"
	| "realtime";

/**
 * Generated request views used by host owners after a browser intent has been
 * authorized. They stay out of the browser DTO and retain Codex's field names.
 */
export interface BrowserOwnerRequestViews {
	readonly accountLogin: CodexClientRequestParamsByMethod["account/login/start"];
	readonly accountLoginCancel: CodexClientRequestParamsByMethod["account/login/cancel"];
	readonly accountLogout: CodexClientRequestParamsByMethod["account/logout"];
	readonly start: CodexClientRequestParamsByMethod["turn/start"];
	readonly steer: CodexClientRequestParamsByMethod["turn/steer"];
	readonly interrupt: CodexClientRequestParamsByMethod["turn/interrupt"];
	readonly queueAdd: CodexClientRequestParamsByMethod["thread/queue/add"];
	readonly queueUpdate: CodexClientRequestParamsByMethod["thread/queue/update"];
	readonly queueDelete: CodexClientRequestParamsByMethod["thread/queue/delete"];
	readonly queueReorder: CodexClientRequestParamsByMethod["thread/queue/reorder"];
	readonly queueStart: CodexClientRequestParamsByMethod["thread/queue/start"];
	readonly realtimeStart: CodexClientRequestParamsByMethod["thread/realtime/start"];
	readonly realtimeAppendText: CodexClientRequestParamsByMethod["thread/realtime/appendText"];
	readonly realtimeStop: CodexClientRequestParamsByMethod["thread/realtime/stop"];
}

/** Generated results remain owned by the session and never become browser DTOs. */
export interface BrowserOwnerResultViews {
	readonly accountLogin: CodexResponseByMethod["account/login/start"];
	readonly accountLoginCancel: CodexResponseByMethod["account/login/cancel"];
	readonly accountLogout: CodexResponseByMethod["account/logout"];
	readonly start: CodexResponseByMethod["turn/start"];
	readonly steer: CodexResponseByMethod["turn/steer"];
	readonly interrupt: CodexResponseByMethod["turn/interrupt"];
	readonly queueAdd: CodexResponseByMethod["thread/queue/add"];
	readonly queueUpdate: CodexResponseByMethod["thread/queue/update"];
	readonly queueDelete: CodexResponseByMethod["thread/queue/delete"];
	readonly queueReorder: CodexResponseByMethod["thread/queue/reorder"];
	readonly queueStart: CodexResponseByMethod["thread/queue/start"];
	readonly realtimeStart: CodexResponseByMethod["thread/realtime/start"];
	readonly realtimeAppendText: CodexResponseByMethod["thread/realtime/appendText"];
	readonly realtimeStop: CodexResponseByMethod["thread/realtime/stop"];
}

export type BrowserActionResolution =
	| {
			readonly tag: "owned";
			readonly action: BrowserActionName;
			readonly owner: BrowserActionOwner;
	  }
	| {
			readonly tag: "refused";
			readonly action: string;
			readonly reason: "unsupported_action";
			readonly message: "The browser action is not supported by this workbench.";
	  };

export function resolveBrowserAction(action: string): BrowserActionResolution {
	if (Object.hasOwn(BROWSER_ACTION_OWNERS, action)) {
		const supported = action as BrowserActionName;
		return Object.freeze({
			tag: "owned",
			action: supported,
			owner: BROWSER_ACTION_OWNERS[supported],
		});
	}
	return Object.freeze({
		tag: "refused",
		action,
		reason: "unsupported_action",
		message: "The browser action is not supported by this workbench.",
	});
}
