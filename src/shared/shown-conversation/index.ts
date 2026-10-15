// Which checkout's conversation the agent dock shows (ADR 0050), and the call
// that changes it.
//
// A tab session shows the conversation of one checkout in every pane. Only the
// person's own acts in the browser change it: focusing a pane, opening a board,
// drilling down, or picking a workhorse from the dock's list. Nothing an agent
// does to a pane changes it, so it never changes while somebody types. The
// browser names the pane the act happened in, and the server reads the checkout
// from the vault that pane is in; a pick from the list names the checkout
// itself.

import { z } from "zod";

/** The route the browser calls when the person activates a checkout. */
const SHOWN_CONVERSATION_ROUTE = "/api/panes/conversation";

/** What the browser says: the pane the act happened in, and for a pick from the list its checkout. */
const ShownConversationRequestSchema = z
	.object({
		/** The pane's identity to the server. */
		clientId: z.string().min(1),
		/** A checkout picked from the list; absent when the pane's own checkout is meant. */
		checkout: z.string().min(1).optional(),
	})
	.strict();

/** What the server answers: the checkout shown now, and whether the call changed it. */
const ShownConversationReplySchema = z
	.object({
		success: z.literal(true),
		shown: z.string(),
		changed: z.boolean(),
	})
	.strict();

/**
 * Why a call is refused: no registered pane by that identity, or none in a
 * tab session; the pane is not in the vault the call names; or a picked
 * checkout is neither a live workhorse's nor a pane's of the tab, because a
 * workhorse starts in the checkout it is shown for.
 */
const SHOWN_CONVERSATION_REFUSALS = [
	"PANE_UNKNOWN",
	"VAULT_MISMATCH",
	"CHECKOUT_NOT_SHOWABLE",
] as const;

type ShownConversationRequest = z.infer<typeof ShownConversationRequestSchema>;
type ShownConversationReply = z.infer<typeof ShownConversationReplySchema>;
type ShownConversationRefusal = (typeof SHOWN_CONVERSATION_REFUSALS)[number];

export {
	SHOWN_CONVERSATION_REFUSALS,
	SHOWN_CONVERSATION_ROUTE,
	ShownConversationReplySchema,
	ShownConversationRequestSchema,
	type ShownConversationRefusal,
	type ShownConversationReply,
	type ShownConversationRequest,
};
