import { expect, test } from "bun:test";
import type {
	RealtimeCorrelationId,
	RealtimeItemId,
	RealtimeSessionId as BrowserRealtimeSessionId,
} from "../index.js";
import type { RealtimeSessionId as WireRealtimeSessionId } from "../../codex-workbench-identity/index.js";

declare const browserSession: BrowserRealtimeSessionId;
declare const browserCorrelation: RealtimeCorrelationId;
declare const browserItem: RealtimeItemId;
declare const wireSession: WireRealtimeSessionId;

function assertIdentitySeparation(): void {
	// @ts-expect-error Browser session and correlation identities are nominally distinct.
	const correlationFromSession: RealtimeCorrelationId = browserSession;
	// @ts-expect-error Browser correlation and session identities are nominally distinct.
	const sessionFromCorrelation: BrowserRealtimeSessionId = browserCorrelation;
	// @ts-expect-error Browser correlation and item identities are nominally distinct.
	const itemFromCorrelation: RealtimeItemId = browserCorrelation;
	// @ts-expect-error Browser item and correlation identities are nominally distinct.
	const correlationFromItem: RealtimeCorrelationId = browserItem;
	// @ts-expect-error Browser item and session identities are nominally distinct.
	const sessionFromItem: BrowserRealtimeSessionId = browserItem;
	// @ts-expect-error Browser session and item identities are nominally distinct.
	const itemFromSession: RealtimeItemId = browserSession;
	// @ts-expect-error Browser and wire session identities cannot cross the protocol boundary.
	const wireFromBrowser: WireRealtimeSessionId = browserSession;
	// @ts-expect-error Wire and browser session identities cannot cross the protocol boundary.
	const browserFromWire: BrowserRealtimeSessionId = wireSession;
	void [
		correlationFromSession,
		sessionFromCorrelation,
		itemFromCorrelation,
		correlationFromItem,
		sessionFromItem,
		itemFromSession,
		wireFromBrowser,
		browserFromWire,
	];
}
void assertIdentitySeparation;

test("keeps browser and wire realtime identities nominal", () => {
	expect(true).toBe(true);
});
