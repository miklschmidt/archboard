import { CODEX_APP_SERVER_CAPACITY } from "@/shared/codex-app-server-capacity";

/** The transport-owned ceiling shared with logical reverse-request quarantine. */
export const CODEX_TRANSPORT_PENDING_REVERSE_REQUEST_CAP =
	CODEX_APP_SERVER_CAPACITY.outbound.pendingReverseRequests;
