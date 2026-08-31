# Codex workbench authored contracts

**Reviewed input:** 2026-08-30

**Protocol:** Codex app-server 0.151.0 with experimental APIs

**Owner:** TASK-143.01.17

This document freezes the authored inputs that an implementation worker must
not invent. Source modules load, hash, validate, and dispatch these contracts.
Changing prose, order, schemas, limits, or result tags is a product/agent-policy
change and requires a new review.

## Byte rules

- UTF-8, no BOM, LF line endings, and one terminal LF.
- The bytes inside each `text` fence, excluding the opening and closing fence
  lines, are canonical.
- Every `json` fence contains one strict JSON value. Namespace manifest bytes,
  excluding the fence lines and including the terminal LF, are canonical.
  Other JSON fences preserve their reviewed field order after placeholder
  substitution.
- The coordinator developer document is the workhorse bytes, then the literal
  separator `\n--- ARCHBOARD COORDINATOR ROLE ---\n`, then the coordinator
  extension bytes. The workhorse bytes end in LF, and the separator begins with
  LF. Those two LF bytes create exactly one blank line before the coordinator
  marker. The separator ends in LF, the extension begins immediately after it,
  and the extension ends in LF. No other whitespace is inserted.
- Hashes are lowercase SHA-256 over those exact bytes. The implementation
  computes and freezes them; callers cannot supply a hash or authored suffix.

## Initialize and auxiliary request policy

The initialize capabilities object is literal:

```json
{
	"experimentalApi": true,
	"requestAttestation": false,
	"mcpServerOpenaiFormElicitation": true,
	"optOutNotificationMethods": [],
	"extensions": {}
}
```

Archboard supports the legacy `openai/form` elicitation shape through the
explicit boolean and advertises no MCP Apps UI extension. It opts out of no
notifications because the decoder/router is exhaustive. `attestation/generate`
must not be sent after `requestAttestation: false`; if received, the router
returns JSON-RPC error `-32601`, `"Attestation is not supported by this
client"`. `account/chatgptAuthTokens/refresh` is unsupported because Archboard
does not accept the client-managed token login variant; if received, it returns
`-32601`, `"Client-managed ChatGPT token refresh is not supported"`.

`currentTime/read` is always supported. After validating its `threadId` against
the current child, it returns exactly the following shape. The literal `0`
stands for the numeric floor of current Unix milliseconds divided by 1,000:

<!-- prettier-ignore -->
```json
{"currentTimeAt":0}
```

The six generated login variants have one closed policy:

| Variant                   | Policy                                                                   |
| ------------------------- | ------------------------------------------------------------------------ |
| `apiKey`                  | Supported; secret enters one login RPC and is never snapshotted.         |
| `chatgpt`                 | Supported hosted browser login with cancel and completion correlation.   |
| `chatgptDeviceCode`       | Refused as unsupported by this UI.                                       |
| `chatgptAuthTokens`       | Refused; Archboard does not own token refresh.                           |
| `amazonBedrock`           | Supported with explicit API key and region.                              |
| `amazonBedrockAccessKeys` | Supported with explicit access keys, optional session token, and region. |

Bedrock profile/environment setup that depends on ambient AWS variables is
refused before an RPC because `BedrockSetupParams` contains only `profile` and
`environment` variants and the child strips ambient credentials. Bedrock is
available only through the two explicit `LoginAccountParams` credential forms
above. Unsupported variants are rejected with a visual recovery path; they do
not make the whole session incapable of a supported login.

## Dedicated child environment

The child environment is built from an empty object. If present and a valid
NUL-free string, only these ambient keys are copied, in this order:

```text
HOME, USER, LOGNAME, SHELL, PATH, LANG, LC_ALL, LC_CTYPE, TZ, TERM, COLORTERM,
TMPDIR, TMP, TEMP, XDG_CACHE_HOME, XDG_CONFIG_HOME, XDG_RUNTIME_DIR,
HTTP_PROXY, HTTPS_PROXY, ALL_PROXY, NO_PROXY, http_proxy, https_proxy,
all_proxy, no_proxy, SSL_CERT_FILE, SSL_CERT_DIR, NIX_SSL_CERT_FILE,
GIT_SSL_CAINFO, NODE_EXTRA_CA_CERTS, SSH_AUTH_SOCK
```

The host then writes canonical absolute `CODEX_HOME` and `CODEX_SQLITE_HOME`
values over that object. Those two values are never copied from ambient input.
Every other variable is absent, including all other `CODEX_*`, `OPENAI_*`,
`AWS_*`, credential/token, listener/auth, daemon, Desktop, Electron, MCP, and
app-tools variables. Spawn also supplies the canonical checkout through the
process `cwd`; it does not add `PWD`.

Fixtures begin from a poisoned environment containing every retained key,
conflicting Codex roots, representative stripped prefixes, and an unrelated
sentinel. They assert the output key set exactly, copied values byte-for-byte,
dedicated-root overwrite precedence, absent optional keys rather than empty
strings, NUL rejection, and no ambient-key fallthrough.

## Literal thread profiles

The workhorse `thread/start` contains exactly these fields after placeholders
are substituted. Angle-bracket strings denote scalar authored values, except
the `dynamicTools` entries: each of those stands for the complete namespace
object frozen later in this document and is never serialized as a string.

```json
{
	"cwd": "<canonical-checkout-root>",
	"runtimeWorkspaceRoots": ["<same-canonical-checkout-root>"],
	"serviceName": "archboard",
	"developerInstructions": "<canonical-workhorse-bytes>",
	"ephemeral": false,
	"historyMode": "paginated",
	"sessionStartSource": "startup",
	"threadSource": "archboard",
	"dynamicTools": ["<canonical-archboard_app-namespace>"],
	"experimentalRawEvents": false
}
```

The coordinator uses exactly one of these two otherwise-identical profiles:

```json
{
	"model": "gpt-5.6-luna",
	"allowProviderModelFallback": false,
	"serviceTier": "priority",
	"cwd": "<canonical-checkout-root>",
	"runtimeWorkspaceRoots": ["<same-canonical-checkout-root>"],
	"config": { "features": { "realtime_conversation": true } },
	"serviceName": "archboard",
	"developerInstructions": "<canonical-composed-coordinator-bytes>",
	"ephemeral": false,
	"historyMode": "paginated",
	"sessionStartSource": "startup",
	"threadSource": "archboard",
	"dynamicTools": [
		"<canonical-archboard_workhorse-namespace>",
		"<canonical-archboard_voice-namespace>"
	],
	"experimentalRawEvents": false
}
```

When `model/list` does not advertise priority for `gpt-5.6-luna`, the fallback
profile omits `serviceTier`; it does not send `null` or another tier. Both
profiles intentionally omit `modelProvider`, `approvalPolicy`,
`approvalsReviewer`, `sandbox`, `permissions`, `baseInstructions`,
`personality`, `multiAgentMode`, `projectId`, `environments`,
`selectedCapabilityRoots`, and `mockExperimentalField`. Omission preserves the
dedicated child's reviewed config/default environment and therefore normal
shell, web, repository, and approval capabilities. Workhorse `model`,
`allowProviderModelFallback`, `serviceTier`, and `config` are also omitted so
the configured workhorse defaults remain authoritative and are recorded from
the returned thread.

After coordinator start, Archboard sends exactly one of:

<!-- prettier-ignore -->
```json
{"threadId":"<coordinator-thread-id>","model":"gpt-5.6-luna","serviceTier":"priority","effort":"medium"}
```

<!-- prettier-ignore -->
```json
{"threadId":"<coordinator-thread-id>","model":"gpt-5.6-luna","effort":"medium"}
```

The empty response is not confirmation. Reuse requires a matching
`thread/settings/updated` notification whose model, effort, and effective tier
match the selected profile. It must also preserve the start response's
`approvalPolicy`, `approvalsReviewer`, `sandbox` as notification
`sandboxPolicy`, and `activePermissionProfile`. Those four generated names are
not interchangeable and the last one is never called `permissions` in a
notification.

The only accepted top-level `Thread.source` values are `"cli"`, `"vscode"`,
`"exec"`, and `"appServer"`. `{custom:...}`, `{subAgent:...}`, and `"unknown"`
remain inspect-only. This source set is used by classification and by the
literal `thread/list` query below.

## Literal turn, steer, fork, and injection bodies

Every Archboard-started ordinary turn uses this complete `TurnStartParams`
shape after placeholder substitution:

```json
{
	"threadId": "<target-thread-id>",
	"clientUserMessageId": "<host-minted-id>",
	"input": [{ "type": "text", "text": "<bounded-prompt>", "text_elements": [] }],
	"turnTrigger": "archboard",
	"additionalContext": {
		"archboard": { "kind": "application", "value": "<canonical-context-json>" }
	}
}
```

It omits `toolOutput`, `responsesapiClientMetadata`, `environments`, `cwd`,
`runtimeWorkspaceRoots`, `approvalPolicy`, `approvalsReviewer`,
`sandboxPolicy`, `permissions`, `model`, `serviceTier`, `serviceTierForTurn`,
`effort`, `summary`, `personality`, `outputSchema`, `collaborationMode`,
`multiAgentMode`, and `cyberAccessProgram`. Text is a `UserInput`; it is not a
developer-role Responses API item.

Every steer uses this complete `TurnSteerParams` shape:

```json
{
	"threadId": "<target-thread-id>",
	"clientUserMessageId": "<host-minted-id>",
	"input": [{ "type": "text", "text": "<bounded-prompt>", "text_elements": [] }],
	"additionalContext": {
		"archboard": { "kind": "application", "value": "<canonical-context-json>" }
	},
	"expectedTurnId": "<host-proven-active-turn-id>"
}
```

It omits only `responsesapiClientMetadata`. The caller never supplies
`expectedTurnId`.

A general-tool fork uses this complete `ThreadForkParams` profile:

```json
{
	"threadId": "<target-thread-id>",
	"cwd": "<canonical-checkout-root>",
	"runtimeWorkspaceRoots": ["<same-canonical-checkout-root>"],
	"developerInstructions": "<canonical-workhorse-bytes>",
	"ephemeral": false,
	"threadSource": "archboard",
	"excludeTurns": true
}
```

For a non-self fork, optional `beforeTurnId` is included only when supplied by
the validated tool input. For a self-fork, caller `beforeTurnId` is ignored and
the host sets `ThreadForkParams.beforeTurnId` to the executing
`DynamicToolCallParams.turnId`.
`lastTurnId`, `path`, `model`, `modelProvider`, `serviceTier`, `approvalPolicy`,
`approvalsReviewer`, `sandbox`, `permissions`, `config`, `baseInstructions`,
and `deferGoalContinuation` are always omitted.

Semantic bystander delivery alone uses `thread/inject_items` and this complete
body:

```json
{
	"threadId": "<exact-workhorse-thread-id>",
	"items": [
		{
			"type": "message",
			"role": "developer",
			"content": [{ "type": "input_text", "text": "<canonical-semantic-context>" }]
		}
	]
}
```

No ordinary `turn/start` or `turn/steer` body uses that developer-role shape.

## Literal session port

The session exposes exactly these public methods; consumers do not call a
generic RPC method:

```text
initialize, configRead, accountRead, accountLogin, accountLoginCancel,
accountLogout, modelList, threadStart, threadFork, threadListPage,
threadLoadedListPage, threadRead, threadTurnsListPage, threadItemsListPage,
threadDelete, threadSettingsUpdate, turnStart, turnSteer, turnInterrupt,
queueAdd, queueListPage, queueUpdate, queueDelete, queueReorder, queueStart,
threadInjectItems, realtimeStart, realtimeAppendText, realtimeAppendSpeech,
realtimeStop, timelineListPage, respondCurrentTime,
respondUnsupportedTokenRefresh, respondUnsupportedAttestation
```

The page methods preserve one decoded page. Classification/authority callers
loop them with cursor-loop detection; browser/tool callers receive the bounded
page contract stated below.

## Literal timing policy

All values are milliseconds:

| Constant                         |   Value | Required relationship                                      |
| -------------------------------- | ------: | ---------------------------------------------------------- |
| `CODEX_PROCESS_RESTART_BASE_MS`  |   1,000 | first retry delay                                          |
| `CODEX_PROCESS_RESTART_MAX_MS`   |  30,000 | at least request settlement; exponential backoff caps here |
| `CODEX_REQUEST_SETTLEMENT_MS`    |  30,000 | lost non-idempotent response becomes `outcome_unknown`     |
| `CODEX_BROWSER_COMMAND_LEASE_MS` | 150,000 | longer than the 120,000 wait cap and approval expiry       |
| `CODEX_APPROVAL_EXPIRY_MS`       |  90,000 | shorter than browser lease                                 |
| `CODEX_SPOKEN_GATE_EXPIRY_MS`    |  60,000 | no longer than approval expiry                             |
| `CODEX_SEMANTIC_FRESHNESS_MS`    |  30,000 | shorter than realtime recovery                             |
| `CODEX_REALTIME_START_MS`        |  15,000 | bounds permission-independent SDP/start readiness          |
| `CODEX_REALTIME_STOP_MS`         |   3,000 | completes before TERM grace                                |
| `CODEX_REALTIME_RECOVERY_MS`     |  45,000 | longer than semantic freshness                             |
| `CODEX_TERM_GRACE_MS`            |   5,000 | TERM-to-KILL escalation after realtime stop                |
| `CODEX_COMPOSED_SHUTDOWN_MS`     |  10,000 | greater than realtime stop plus TERM grace                 |

Expiry never proves a remote mutation failed. Restart delay doubles from base
to max and resets only after one account-ready session. Shutdown stops
realtime first, settles local waiters, closes stdin, sends TERM, and sends KILL
at the grace bound while remaining inside the composed cap.

### Workhorse developer instructions

```text
You are the Codex workhorse linked to one Archboard pane and repository checkout. Treat the supplied Archboard thread link, child epoch, board, pane, and operation identities as authoritative; never infer a target from recency, focus, or another thread.

Use Archboard's normal repository instructions and the archboard CLI when work needs the canvas. Keep board claim and doing state honest. A person's board edits are design input. Agent-only board changes must not be narrated back as new human intent.

Carry sustained repository and implementation work to completion. Use the archboard_app coordination tools only when another Codex thread is genuinely needed. Do not invent a host, process, thread, turn, queue, approval, or realtime identity; the host validates and supplies identities that are not present in a tool schema.

Board context may arrive as developer-role semantic updates. Apply each update to later reasoning without starting duplicate work. If delivery is marked outcome_unknown, inspect authoritative thread or board state before acting; never retry a non-idempotent operation blindly.
```

### Coordinator role extension

```text
You are the persistent voice coordinator for one Archboard thread link. Stay capable: you may inspect the repository, search the web, run shell commands, use ordinary Codex tools, and make one explicit unambiguous board change directly. Default sustained coding or multi-step repository work to the linked workhorse.

Keep coordinator and workhorse histories distinct. Never wait synchronously for the workhorse. Use inspect_workhorse for current state, delegate_to_workhorse for new sustained work, manage_workhorse_queue only for the host-approved created-workhorse queue, and steer_workhorse only when the host exposes an exact active turn.

Realtime speech cannot settle a Codex approval. When the host asks for spoken approval classification, answer in a later ordinary coordinator turn by calling resolve_spoken_approval with only accept or decline. If the intent is ambiguous or the tool refuses, leave the request for the visual approval surface.

Semantic callbacks are context, not user commands. Operation callbacks report correlated progress. Do not repeat a delegation, queue mutation, steer, or approval after outcome_unknown; inspect authoritative state and explain the uncertainty.
```

## Canonical additional context

The only app-server `additionalContext` entry is named `archboard`:

```json
{ "archboard": { "kind": "application", "value": "<canonical-json>" } }
```

`<canonical-json>` is compact JSON with keys in this exact order. Optional
values are present as `null`; keys are never omitted or added.

```json
{
	"schema": 1,
	"paneId": "<opaque>",
	"board": { "note": "<vault-relative>", "version": 0, "cursor": "<opaque-or-null>" },
	"threadLink": {
		"state": "unbound|executable|inspect_only",
		"reason": "stale_child|prior_epoch|thread_start_outcome_unknown|unknown_provenance|thread_list_missing|thread_list_ambiguous|thread_loaded_list_ambiguous|thread_source_custom|thread_source_subagent|thread_source_unknown|thread_status_not_loaded|thread_status_system_error|thread_loaded_list_missing|direct_input_false|direct_input_unknown|null"
	},
	"child": { "id": "<opaque>", "epoch": "<opaque>" },
	"workhorse": { "threadId": "<opaque-or-null>", "turnId": "<opaque-or-null>" },
	"coordinator": { "threadId": "<opaque-or-null>", "realtimeSessionId": "<opaque-or-null>" },
	"semantic": {
		"brief": "<bounded-text>",
		"capturedAtMs": 0,
		"freshUntilMs": 0,
		"truncated": false
	},
	"focus": { "paneId": "<opaque-or-null>", "capturedAtMs": 0 },
	"selection": { "elementIds": [], "capturedAtMs": 0 },
	"claim": { "holder": "human|agent|none", "doing": "<text-or-null>" },
	"ambiguity": [],
	"operation": {
		"id": "<opaque-or-null>",
		"kind": "composer_message|create_thread_initial_turn|fork_thread_initial_turn|send_message_to_thread|delegate_to_workhorse|steer_workhorse|spoken_approval_classifier|null",
		"rpc": "turn/start|turn/steer|null",
		"outcome": "delivered|not_delivered|outcome_unknown|null"
	}
}
```

Pipe-separated strings in this template name the exact allowed values; encoders
emit one member, or JSON `null` where shown. They never emit the pipe-separated
documentation string.

### Additional-context policy manifest

This strict block is the one semantic source for schema 1 thread-link reasons,
operation producers, tuple states, lifecycle, and exclusions:

```json
{
	"schema": 1,
	"threadLink": {
		"classificationTarget": "target_thread_id",
		"exhaustBeforePrecedence": ["thread/list", "thread/loaded/list"],
		"classificationFailures": ["repeated_cursor", "transport_failure", "list_exhaustion_failure"],
		"reasonNullStates": ["unbound", "executable"],
		"reasonRequiredStates": ["inspect_only"],
		"nonExecutableStatuses": ["systemError"],
		"reasonPrecedence": [
			{
				"reason": "stale_child",
				"condition": "link_child_is_not_current_child"
			},
			{
				"reason": "prior_epoch",
				"condition": "link_or_provenance_epoch_is_prior"
			},
			{
				"reason": "thread_start_outcome_unknown",
				"condition": "thread_start_settlement_was_lost"
			},
			{
				"reason": "unknown_provenance",
				"condition": "current_epoch_ownership_is_unproven"
			},
			{
				"reason": "thread_list_missing",
				"condition": "persisted_target_row_is_missing"
			},
			{
				"reason": "thread_list_ambiguous",
				"condition": "persisted_target_rows_conflict"
			},
			{
				"reason": "thread_loaded_list_ambiguous",
				"condition": "loaded_target_membership_is_duplicate_or_conflicting"
			},
			{
				"reason": "thread_source_custom",
				"condition": "thread_source_is_custom"
			},
			{
				"reason": "thread_source_subagent",
				"condition": "thread_source_is_subagent"
			},
			{
				"reason": "thread_source_unknown",
				"condition": "thread_source_is_unknown"
			},
			{
				"reason": "thread_status_not_loaded",
				"condition": "thread_status_is_not_loaded"
			},
			{
				"reason": "thread_status_system_error",
				"condition": "thread_status_is_system_error"
			},
			{
				"reason": "thread_loaded_list_missing",
				"condition": "loaded_target_membership_is_missing"
			},
			{
				"reason": "direct_input_false",
				"condition": "direct_input_capability_is_false"
			},
			{
				"reason": "direct_input_unknown",
				"condition": "direct_input_capability_is_null"
			}
		],
		"inferThreadFromRecency": false
	},
	"operation": {
		"fieldOrder": ["id", "kind", "rpc", "outcome"],
		"producers": [
			{
				"kind": "composer_message",
				"rpcs": ["turn/start", "turn/steer"],
				"operationIdSource": "host_minted",
				"omitWhen": []
			},
			{
				"kind": "create_thread_initial_turn",
				"rpcs": ["turn/start"],
				"operationIdSource": "initialTurn.operationId",
				"omitWhen": []
			},
			{
				"kind": "fork_thread_initial_turn",
				"rpcs": ["turn/start"],
				"operationIdSource": "initialTurn.operationId",
				"omitWhen": ["prompt_absent"]
			},
			{
				"kind": "send_message_to_thread",
				"rpcs": ["turn/start"],
				"operationIdSource": "host_minted",
				"omitWhen": []
			},
			{
				"kind": "delegate_to_workhorse",
				"rpcs": ["turn/start"],
				"operationIdSource": "host_minted",
				"omitWhen": ["queued"]
			},
			{
				"kind": "steer_workhorse",
				"rpcs": ["turn/steer"],
				"operationIdSource": "host_minted",
				"omitWhen": []
			},
			{
				"kind": "spoken_approval_classifier",
				"rpcs": ["turn/start"],
				"operationIdSource": "host_minted",
				"omitWhen": []
			}
		],
		"tupleStates": [
			{
				"state": "idle",
				"id": "null",
				"kind": "null",
				"rpc": "null",
				"outcome": "null"
			},
			{
				"state": "in_flight",
				"id": "non_null",
				"kind": "non_null",
				"rpc": "non_null",
				"outcome": "null"
			},
			{
				"state": "delivered",
				"id": "non_null",
				"kind": "non_null",
				"rpc": "non_null",
				"outcome": "delivered"
			},
			{
				"state": "not_delivered",
				"id": "non_null",
				"kind": "non_null",
				"rpc": "non_null",
				"outcome": "not_delivered"
			},
			{
				"state": "outcome_unknown",
				"id": "non_null",
				"kind": "non_null",
				"rpc": "non_null",
				"outcome": "outcome_unknown"
			}
		],
		"outcomeTransitions": [
			{
				"from": "null",
				"event": "rpc_settled_successfully",
				"to": "delivered"
			},
			{
				"from": "null",
				"event": "pre_effect_request_rejected",
				"to": "not_delivered"
			},
			{
				"from": "null",
				"event": "settlement_lost",
				"to": "outcome_unknown"
			},
			{
				"from": "outcome_unknown",
				"event": "exact_positive_correlation",
				"to": "delivered"
			}
		],
		"turnEvidence": [
			{
				"event": "turn/started",
				"rpcs": ["turn/start"],
				"outcome": "delivered",
				"tupleAction": "retain"
			},
			{
				"event": "turn/steer_response",
				"rpcs": ["turn/steer"],
				"outcome": "delivered",
				"tupleAction": "retain_existing_turn_id"
			},
			{
				"event": "turn/completed",
				"status": "completed",
				"rpcs": ["turn/start", "turn/steer"],
				"outcome": "delivered",
				"tupleAction": "emit_terminal_then_clear"
			},
			{
				"event": "turn/completed",
				"status": "interrupted",
				"rpcs": ["turn/start", "turn/steer"],
				"outcome": "delivered",
				"tupleAction": "emit_terminal_then_clear"
			},
			{
				"event": "turn/completed",
				"status": "failed",
				"rpcs": ["turn/start", "turn/steer"],
				"outcome": "delivered",
				"tupleAction": "emit_terminal_then_clear"
			}
		],
		"terminal": {
			"emit": "once",
			"clear": "after_terminal_callback_or_event",
			"clearFields": ["id", "kind", "rpc", "outcome"]
		},
		"retryAfterOutcomeUnknown": false,
		"threadStartOutcomeUnknown": {
			"linkState": "inspect_only",
			"reason": "thread_start_outcome_unknown",
			"inferFromRecency": false
		},
		"excludedBoundaries": [
			"interrupt",
			"queue",
			"semantic_injection",
			"callback_injection",
			"realtime_transport"
		],
		"callbackEvents": [
			"accepted",
			"queued",
			"started",
			"progress",
			"attention",
			"completed",
			"failed",
			"outcome_unknown"
		],
		"forbiddenFields": ["phase", "status", "event", "source"]
	}
}
```

The classifier applies `reasonPrecedence` to the target thread only after both
listed result sets are exhausted. A classification failure aborts the attempt;
it never becomes a stable reason. Nullability and `systemError` execution follow
the manifest's state sets.

`operation.kind` names the Archboard action and `operation.rpc` names its wire
mutation. Producer rows own correlation and omission. Tuple rows and transition
rows are exhaustive. A `turn/started` notification is evidence only for
`turn/start`. `TurnSteerResponse` instead returns the existing `turnId`. The
matching `TurnCompletedNotification` carries the thread and terminal turn, not
the originating RPC, so completed, interrupted, and failed terminal evidence
applies to both RPCs. It exposes the retained tuple once and then clears all four
fields. Failure and interruption do not change delivery to `not_delivered`.
The exclusion and callback lists keep wire state, TUI state, product action, and
operation-event lifecycle separate without adding a phase field.

The semantic brief, selection IDs, ambiguity entries, and doing text use the
limits below. Encoding rejects overflow rather than truncating silently:

| Value                 | Limit                                          |
| --------------------- | ---------------------------------------------- |
| semantic brief        | 8,192 UTF-8 bytes                              |
| selection IDs         | 128 entries, 64 bytes each                     |
| ambiguity entries     | 16 entries, 256 UTF-8 bytes each               |
| doing                 | 512 UTF-8 bytes                                |
| tool prompt/input     | 16,384 UTF-8 bytes unless narrower below       |
| cursor                | 1,024 UTF-8 bytes                              |
| wait targets          | 8                                              |
| wait timeout          | 0 through 120,000 milliseconds                 |
| transcript delegation | input 4,096 bytes; transcriptDelta 4,096 bytes |

An Archboard semantic injection or callback is exactly one raw Responses API
developer message with one `input_text` part:

```json
{
	"type": "message",
	"role": "developer",
	"content": [{ "type": "input_text", "text": "<canonical-context-or-callback-text>" }]
}
```

### Coordinator callback bytes

Coordinator callback text is compact JSON with no prose prefix or suffix. Every
object key is serialized in lexical order, recursively. Arrays retain source
order. The top-level `schema` is `1`; `kind` is `operation` or `semantic`; and
`type` is one of the closed eleven-member set:

```text
operation: accepted, queued, started, progress, attention, completed, failed, outcome_unknown
semantic: change, focus, selection
```

Every operation member contains `correlation`, `detail`, `kind`, `operation`,
`outcome`, `queuedSubmissionIds`, `queueOperation`, `rpc`, `schema`, and `type`.
This retains the real `manage_workhorse_queue` operation, queue operation, RPC,
outcome, and submission tuple. Every semantic member contains `correlation`,
`kind`, `schema`, `semantic`, `threadLinkReason`, `threadLinkState`, and `type`.
The semantic object contains `brief`, `capturedAtMs`, `detail`, `feedId`,
`focused`, `origin`, `paneId`, `selection`, `sequence`, and `significance`.

The common correlation object contains `childId`, `clientUserMessageId`,
`coordinatorCall`, `coordinatorThreadId`, `coordinatorTurnId`, `epoch`,
`operationId`, `queuedSubmissionId`, `realtimeGeneration`, `realtimeSessionId`,
`turnId`, `workhorseLink`, and `workhorseThreadId`. `workhorseLink` retains the
captured pane and binding revision, accepted link fields, exact classifier
target, and complete durable provenance record plus manifest revision.
`realtimeGeneration`, when present, retains the child, epoch, coordinator
thread, wire session, browser session, and browser correlation identities.

`manage_workhorse_queue` accepts only these exact queue operation and RPC pairs:

| Queue operation | RPC                    |
| --------------- | ---------------------- |
| `add`           | `thread/queue/add`     |
| `update`        | `thread/queue/update`  |
| `delete`        | `thread/queue/delete`  |
| `reorder`       | `thread/queue/reorder` |
| `start`         | `thread/queue/start`   |

Every other operation requires a null `queueOperation`. Prefix matches and
other queue operation/RPC combinations are invalid.

The encoder rejects any callback above 32,768 UTF-8 bytes, any string above
8,192 UTF-8 bytes, or any array above 128 entries. Both the singular
`correlation.queuedSubmissionId` and each `queuedSubmissionIds` entry allow at
most 1,024 UTF-8 bytes. A selection ID allows at most 64 UTF-8 bytes. The
encoder does not truncate. The callback is the exact `text` in the one
developer message above.
Inactive operation callbacks send that message to `coordinatorThreadId` through
`thread/inject_items`. Active callbacks send the same text to that thread
through `thread/realtime/appendText` with role `developer`. The workhorse thread
is correlation only and is never the callback mutation target.

## Realtime V3 start policy

Every start uses a new host-minted `realtimeSessionId` and these choices:

```json
{
	"clientManagedHandoffs": false,
	"delegationAckFiller": true,
	"flushTranscriptTailOnSessionEnd": true,
	"codexResponsesAsItems": false,
	"codexResponseHandoffMode": "bemTags",
	"outputModality": "audio",
	"includeStartupContext": true,
	"initialItems": [{ "role": "developer", "text": "<fresh-canonical-semantic-brief>" }],
	"realtimeStartInstructions": "<canonical-composed-coordinator-bytes>",
	"realtimeEndInstructions": "Finish the current sentence, preserve unresolved approvals for the visual workbench, and leave no work waiting on voice.",
	"prompt": null,
	"realtimeSessionId": "<new-opaque-id>",
	"transport": { "type": "webrtc", "sdp": "<browser-offer>" },
	"version": "v3",
	"voice": "breeze"
}
```

`breeze` is the only first-release voice. The workbench has no voice list,
selector, persistence, per-session override, or fallback choice.

The start response is `{}`. The SDP answer comes only from a matching
`thread/realtime/sdp` notification. Readiness additionally requires matching
`thread/realtime/started` child, thread, realtime-session, and version identity.
WebSocket transport, `appendAudio`, and `outputAudio` are outside this product
contract.

## Dynamic-tool wire form

All three catalogues use `DynamicToolNamespaceSpec` with `type: "namespace"`.
Every listed function has `type: "function"` and `deferLoading: false`; the
catalogues are eager and ordered as written. Every object schema has
`additionalProperties: false`.

A valid call response contains exactly one text item. The text is canonical
compact JSON in one of these envelopes:

<!-- prettier-ignore -->
```json
{"tag":"ok","operationId":"<opaque>","value":{}}
```

<!-- prettier-ignore -->
```json
{"tag":"refused","reason":"invalid_call|not_ready|not_loaded|not_controllable|system_error|stale_child|prior_epoch|unknown_provenance|approval_declined|cycle|busy|expired|unsupported","message":"<bounded-actionable-text>"}
```

<!-- prettier-ignore -->
```json
{"tag":"approval_required","operationId":"<opaque>","summary":"<bounded-effect-summary>"}
```

<!-- prettier-ignore -->
```json
{"tag":"outcome_unknown","operationId":"<opaque>","message":"The request may have taken effect. Inspect authoritative state before another mutation."}
```

The app-server response is:

```json
{ "contentItems": [{ "type": "inputText", "text": "<one-envelope-above>" }], "success": true }
```

Unknown tool/schema/media/identity/manifest calls use `success: false` with one
`refused` envelope and perform no effect. A valid refusal or uncertainty is a
successful tool execution and therefore keeps `success: true`.

The `ok.value` object is closed per tool:

```json
{
	"create_thread": {
		"threadId": "<opaque>",
		"state": "executable|inspect_only",
		"initialTurn": {
			"delivery": "delivered|not_delivered|outcome_unknown",
			"turnId": "<opaque-or-null>",
			"operationId": "<opaque-or-null>",
			"reason": "<bounded-text-or-null>"
		}
	},
	"fork_thread": {
		"threadId": "<opaque>",
		"state": "executable|inspect_only",
		"initialTurn": {
			"delivery": "not_requested|delivered|not_delivered|outcome_unknown",
			"turnId": "<opaque-or-null>",
			"operationId": "<opaque-or-null>",
			"reason": "<bounded-text-or-null>"
		}
	},
	"list_threads": {
		"threads": [
			{
				"threadId": "<opaque>",
				"title": "<string-or-null>",
				"status": "notLoaded|idle|systemError|active",
				"source": "cli|vscode|exec|appServer",
				"epoch": "current|prior|unknown",
				"ownership": "created|attached|foreign",
				"loaded": false,
				"canAcceptDirectInput": null
			}
		],
		"nextCursor": "<opaque-or-null>"
	},
	"read_thread": {
		"threadId": "<opaque>",
		"turns": [
			{
				"turnId": "<opaque>",
				"status": "inProgress|completed|interrupted|failed",
				"summary": "<bounded-text>",
				"outputsIncluded": true,
				"outputsTruncated": false
			}
		],
		"nextCursor": "<opaque-or-null>"
	},
	"send_message_to_thread": {
		"threadId": "<opaque>",
		"delivery": "delivered|not_delivered|outcome_unknown"
	},
	"wait_threads": {
		"event": "completed|attention|timeout",
		"threadId": "<opaque-or-null>",
		"cursor": "<opaque-or-null>"
	},
	"inspect_workhorse": {
		"threadId": "<opaque>",
		"status": "notLoaded|idle|systemError|active",
		"activeTurnId": "<opaque-or-null>",
		"queuedSubmissionIds": []
	},
	"delegate_to_workhorse": {
		"mode": "started|queued",
		"clientUserMessageId": "<opaque>",
		"queuedSubmissionId": "<opaque-or-null>",
		"turnId": "<opaque-or-null>"
	},
	"manage_workhorse_queue": {
		"operation": "list|add|update|delete|reorder|start",
		"queuedSubmissionIds": []
	},
	"steer_workhorse": {
		"turnId": "<opaque>",
		"delivery": "delivered|not_delivered|outcome_unknown"
	},
	"resolve_spoken_approval": {
		"verdict": "accept|decline",
		"settlement": "delivered|not_delivered|outcome_unknown"
	}
}
```

The outer object above is documentation shorthand: a response contains only
the value under the invoked tool name, never the other tool keys. Thread and
turn summaries are bounded by the same text limits and cannot embed raw media,
credentials, process identity, or an unbounded app-server object. `loaded` and
`outputsIncluded` are booleans; `canAcceptDirectInput` is boolean or null.

## `archboard_app` manifest

```json
{
	"type": "namespace",
	"name": "archboard_app",
	"description": "Coordinate bounded work across Codex threads owned or inspected by this Archboard app-server session.",
	"tools": [
		{
			"type": "function",
			"name": "create_thread",
			"description": "Create one persistent Archboard Codex thread after host approval and return its confirmed identity or uncertainty.",
			"inputSchema": {
				"type": "object",
				"properties": {
					"prompt": { "type": "string", "minLength": 1, "maxLength": 16384 }
				},
				"required": ["prompt"],
				"additionalProperties": false
			},
			"deferLoading": false
		},
		{
			"type": "function",
			"name": "fork_thread",
			"description": "Fork one eligible loaded controllable thread at a reviewed turn boundary after host approval.",
			"inputSchema": {
				"type": "object",
				"properties": {
					"threadId": { "type": "string", "minLength": 1, "maxLength": 128 },
					"beforeTurnId": { "type": "string", "minLength": 1, "maxLength": 128 },
					"prompt": { "type": "string", "minLength": 1, "maxLength": 16384 }
				},
				"required": ["threadId"],
				"additionalProperties": false
			},
			"deferLoading": false
		},
		{
			"type": "function",
			"name": "list_threads",
			"description": "List inspectable threads from the owned app-server session without loading or mutating them.",
			"inputSchema": {
				"type": "object",
				"properties": {
					"cursor": { "type": "string", "minLength": 1, "maxLength": 1024 },
					"limit": { "type": "integer", "minimum": 1, "maximum": 100 }
				},
				"required": [],
				"additionalProperties": false
			},
			"deferLoading": false
		},
		{
			"type": "function",
			"name": "read_thread",
			"description": "Read bounded authoritative history for one inspectable thread without loading or mutating it.",
			"inputSchema": {
				"type": "object",
				"properties": {
					"threadId": { "type": "string", "minLength": 1, "maxLength": 128 },
					"cursor": { "type": "string", "minLength": 1, "maxLength": 1024 },
					"turnLimit": { "type": "integer", "minimum": 1, "maximum": 20 },
					"includeOutputs": { "type": "boolean" }
				},
				"required": ["threadId"],
				"additionalProperties": false
			},
			"deferLoading": false
		},
		{
			"type": "function",
			"name": "send_message_to_thread",
			"description": "Send one message to an eligible target after policy and approval checks; never retry an uncertain mutation.",
			"inputSchema": {
				"type": "object",
				"properties": {
					"threadId": { "type": "string", "minLength": 1, "maxLength": 128 },
					"prompt": { "type": "string", "minLength": 1, "maxLength": 16384 }
				},
				"required": ["threadId", "prompt"],
				"additionalProperties": false
			},
			"deferLoading": false
		},
		{
			"type": "function",
			"name": "wait_threads",
			"description": "Wait without creating a dependency cycle for the first bounded target to complete or need attention.",
			"inputSchema": {
				"type": "object",
				"properties": {
					"threadIds": {
						"type": "array",
						"minItems": 1,
						"maxItems": 8,
						"uniqueItems": true,
						"items": { "type": "string", "minLength": 1, "maxLength": 128 }
					},
					"timeoutMs": { "type": "integer", "minimum": 0, "maximum": 120000 },
					"cursor": { "type": "string", "minLength": 1, "maxLength": 1024 }
				},
				"required": ["threadIds"],
				"additionalProperties": false
			},
			"deferLoading": false
		}
	]
}
```

Approval mapping: `create_thread`, `fork_thread`, and arbitrary
`send_message_to_thread` require a fresh visual broker approval. A self-fork
sets `ThreadForkParams.beforeTurnId` to the executing
`DynamicToolCallParams.turnId` and ignores any caller override.
`list_threads` and `read_thread` are read-only. `wait_threads` is allowed only
when the wait graph proves no transitive cycle.

The caller itself must always be an Archboard-created, current-epoch, loaded,
controllable thread executing the matching dynamic call. The target matrix is
literal; `any` means that dimension is observational and does not grant a
mutation:

| Tool                     | Target epoch               | Target provenance             | Loaded    | `canAcceptDirectInput` | Status                             | Relation      | Result                                  |
| ------------------------ | -------------------------- | ----------------------------- | --------- | ---------------------- | ---------------------------------- | ------------- | --------------------------------------- |
| `create_thread`          | N/A                        | N/A                           | N/A       | N/A                    | N/A                                | N/A           | allowed after approval                  |
| `list_threads`           | N/A                        | N/A                           | N/A       | N/A                    | N/A                                | N/A           | allowed, bounded page                   |
| `read_thread`            | current, prior, or unknown | created, attached, or foreign | yes or no | any                    | any                                | self or other | inspect-only allowed                    |
| `fork_thread`            | current                    | created or attached           | yes       | `true`                 | `idle`                             | other         | allowed after approval                  |
| `fork_thread`            | current                    | created or attached           | yes       | `true`                 | `active`                           | self only     | allowed after approval at host boundary |
| `send_message_to_thread` | current                    | created or attached           | yes       | `true`                 | `idle`                             | other         | allowed after approval                  |
| `wait_threads`           | current                    | created or attached           | yes       | any                    | `active`, `idle`, or `systemError` | other         | allowed if acyclic                      |

Every unlisted combination is refused before effect. Prior epoch yields
`prior_epoch`; foreign/unknown mutation provenance yields
`unknown_provenance`; unloaded or `notLoaded` yields `not_loaded`; false or
null direct-input capability yields `not_controllable`; `systemError` mutation
yields `system_error`; active non-self fork/send yields `busy`; self send/wait
yields `cycle`; stale child/link yields `stale_child`.

Operation and pagination semantics are exact:

- `create_thread` sends `thread/start` with the literal workhorse profile, then
  the literal `turn/start` body. There is no title argument. A lost start uses
  the outer `outcome_unknown`. After confirmed start, the `ok` result always
  retains `threadId`; initial-turn rejection uses `not_delivered`, and a lost
  turn response uses `outcome_unknown`, `state: "inspect_only"`, and the
  initial-turn `operationId`. Neither boundary is retried.
- `fork_thread` sends the literal `thread/fork` body once. A lost fork uses the
  outer `outcome_unknown`. After a confirmed fork, absence of `prompt` yields
  `initialTurn.delivery: "not_requested"`; a prompt produces one literal
  `turn/start`. Its rejection/uncertainty remains inside the confirmed-fork
  result exactly as for create.
- `send_message_to_thread` sends one literal `turn/start` to the allowed idle
  target. This general tool never steers. A lost response is
  `outcome_unknown` and is not retried.
- `list_threads` sends one `thread/list` page with
  `{cursor,limit,sortKey:"recency_at",sortDirection:"desc",sourceKinds:["cli","vscode","exec","appServer"],archived:false,useStateDbOnly:false}`;
  omitted input cursor becomes `null` and omitted limit becomes `10`. It then
  exhausts `thread/loaded/list` from
  `{cursor:null,limit:100}` solely to annotate that persisted page. The output
  cursor wraps only the returned `thread/list.nextCursor`.
- `read_thread` first classifies the target by exhausting `thread/list` from
  `{cursor:null,limit:100,sortKey:"recency_at",sortDirection:"desc",sourceKinds:["cli","vscode","exec","appServer"],archived:false,useStateDbOnly:false}`
  and `thread/loaded/list` from `{cursor:null,limit:100}`. It then
  sends one `thread/turns/list` page with
  `{threadId,cursor,limit,sortDirection:"desc",itemsView:"summary"}`; omitted
  cursor becomes `null` and omitted `turnLimit` becomes `10`. When
  `includeOutputs` is false or omitted, it sends no item request. When true, it
  sends exactly one `thread/items/list`
  `{threadId,turnId,cursor:null,limit:100,sortDirection:"asc"}` for each returned
  turn, in returned turn order. `outputsTruncated` is true when that item page
  has `nextCursor` or the bounded projection truncates text.
- A turn `summary` is not read from the generated `Turn`, which has no such
  field. It is the deterministic string
  `<status> · user: <first-user-text-or-none> · assistant: <last-assistant-text-or-none>`.
  Whitespace collapses to one ASCII space; non-text media becomes `[media]`;
  tool names/statuses may be included but command/file/tool output bodies are
  omitted unless `includeOutputs` is true. The complete summary is capped at
  512 UTF-8 bytes and ends with `…` when truncated. Secrets and raw media never
  enter it.
- `wait_threads` canonicalizes its target set by sorting unique ThreadIds. A
  cursor is optional; when supplied it must unwrap to the same child epoch,
  method, sorted target set, and prior delivered event sequence. It returns
  `attention` only for a target-owned pending broker request or `systemError`;
  `completed` requires a matching terminal turn/thread event; timeout is not
  attention. Its output cursor resumes after the last delivered event. The
  wait graph rejects cycles before registration.
- Every exposed cursor is an opaque host envelope bound to child epoch, method,
  pagination direction, and canonical query. Authority reads exhaust pages
  with repeated-cursor detection; tool reads preserve the exact bounded page
  behavior above.

## Dynamic coordination approval lifecycle

**Owner:** TASK-143.01.19

This policy applies only to `archboard_app.create_thread`, `fork_thread`, and
`send_message_to_thread`. Each valid dynamic call gets one fresh visual
decision. A prior decision, a session grant, or a decision for another call can
never authorize it. The seven app-server approval families remain in
`src/runtime/codex-approvals`; this policy and its requests never enter that
broker.

The request identity is the exact `LogicalToolCallCorrelation` in its existing
field order followed by one canonical host-issued `OperationId`. In those
fields, `threadId` is the caller, `turnId` is its executing turn, and `callId`
is the dynamic call. The request stores one immutable parsed effect. Optional
tool arguments are present as `null`; there is no raw argument object, protocol
object, or second context snapshot. Authority values are opaque tokens issued
by the named ports and can only be checked by those ports.

`effectHash` is computed once after all operation IDs and authority tokens have
been issued. The hash input is compact UTF-8 JSON containing exactly
`identity` then `effect`, in the field order below. The visual summary is part
of the effect and therefore part of the hash. A decision echoes the complete
identity and hash. It does not supply a target, arguments, boundary, context,
or grant. The host stamps `decidedAtMs` from its clock during the terminal
compare-and-set. The same `nowMs` observation chooses person acceptance when
it is before `expiresAtMs`, or expiry when it is equal to or later than that
deadline. The browser cannot supply either time.

The strict manifest is the semantic source for downstream runtime and browser
contracts:

```json
{
	"schema": 1,
	"request": {
		"fieldOrder": ["identity", "effect", "effectHash", "createdAtMs", "expiresAtMs"],
		"identityFields": [
			"child",
			"epoch",
			"threadId",
			"turnId",
			"callId",
			"namespace",
			"tool",
			"manifestHash",
			"operationId"
		],
		"effectFields": [
			"tool",
			"arguments",
			"callerAuthority",
			"targetAuthority",
			"contextAuthority",
			"effectiveBoundary",
			"mutationOperationId",
			"initialTurnOperationId",
			"visualSummary"
		],
		"effectiveBoundaryFields": ["relation", "beforeTurnId"],
		"effects": [
			{
				"tool": "create_thread",
				"argumentFields": ["prompt"],
				"nullableArguments": [],
				"callerAuthority": "required",
				"targetAuthority": "null",
				"contextAuthority": "required",
				"effectiveBoundary": "null",
				"mutationOperationId": "identity.operationId",
				"initialTurnOperationId": "fresh_required",
				"visualSummaryLimitUtf8Bytes": 512
			},
			{
				"tool": "fork_thread",
				"argumentFields": ["threadId", "beforeTurnId", "prompt"],
				"nullableArguments": ["beforeTurnId", "prompt"],
				"callerAuthority": "required",
				"targetAuthority": "required",
				"contextAuthority": "required",
				"effectiveBoundary": "required",
				"mutationOperationId": "identity.operationId",
				"initialTurnOperationId": "fresh_when_prompt_else_null",
				"visualSummaryLimitUtf8Bytes": 512
			},
			{
				"tool": "send_message_to_thread",
				"argumentFields": ["threadId", "prompt"],
				"nullableArguments": [],
				"callerAuthority": "required",
				"targetAuthority": "required",
				"contextAuthority": "required",
				"effectiveBoundary": "null",
				"mutationOperationId": "identity.operationId",
				"initialTurnOperationId": "null",
				"visualSummaryLimitUtf8Bytes": 512
			}
		],
		"selfForkBoundary": {
			"relation": "self",
			"beforeTurnId": "identity.turnId",
			"callerBeforeTurnId": "ignored"
		},
		"otherForkBoundary": {
			"relation": "other",
			"beforeTurnId": "arguments.beforeTurnId"
		},
		"hash": {
			"algorithm": "sha256",
			"wireForm": "sha256:<64-lowercase-hex>",
			"inputFields": ["identity", "effect"],
			"canonicalization": "utf8_compact_json_in_manifest_field_order"
		},
		"expiry": {
			"durationMs": 90000,
			"source": "CODEX_APPROVAL_EXPIRY_MS",
			"expiresAtMs": "createdAtMs + durationMs",
			"expiredWhen": "nowMs >= expiresAtMs",
			"extendable": false
		},
		"freshness": {
			"oneRequestPerDynamicCall": true,
			"cachedGrant": false,
			"sessionGrant": false,
			"reusedDecision": false,
			"mutableSnapshot": false
		}
	},
	"decision": {
		"fieldOrder": ["outcome", "identity", "effectHash", "decidedAtMs", "cause"],
		"timestampAuthority": {
			"decidedAtMs": "host_nowMs_at_terminal_compare_and_set",
			"callerSupplied": false,
			"personDecisionAcceptedWhen": "same_host_nowMs < expiresAtMs",
			"expiryWinsWhen": "same_host_nowMs >= expiresAtMs"
		},
		"outcomes": ["approved", "declined", "expired", "cancelled", "disconnected"],
		"personDecisionOutcomes": ["approved", "declined"],
		"hostTerminalOutcomes": ["expired", "cancelled", "disconnected"],
		"personDecisionAcceptedWhen": [
			"request_is_pending",
			"identity_exactly_echoes_request",
			"effect_hash_exactly_echoes_request",
			"same_host_nowMs_stamped_as_decidedAtMs_is_before_expiresAtMs"
		],
		"causes": [
			{
				"outcome": "approved",
				"cause": "person_approved",
				"effect": "revalidate_then_continue",
				"toolResult": "after_dispatch"
			},
			{
				"outcome": "declined",
				"cause": "person_declined",
				"effect": "none",
				"toolResult": "refused:approval_declined"
			},
			{
				"outcome": "expired",
				"cause": "deadline_reached",
				"effect": "none",
				"toolResult": "refused:expired"
			},
			{
				"outcome": "cancelled",
				"cause": "call_cancelled",
				"effect": "none",
				"toolResult": "approval_required"
			},
			{
				"outcome": "cancelled",
				"cause": "caller_turn_interrupted",
				"effect": "none",
				"toolResult": "approval_required"
			},
			{
				"outcome": "cancelled",
				"cause": "host_shutdown",
				"effect": "none",
				"toolResult": "approval_required"
			},
			{
				"outcome": "disconnected",
				"cause": "browser_disconnected",
				"effect": "none",
				"toolResult": "approval_required"
			},
			{
				"outcome": "disconnected",
				"cause": "child_disconnected",
				"effect": "none",
				"toolResult": "transport_not_delivered"
			}
		],
		"terminal": {
			"settle": "compare_and_set_once",
			"removePendingAuthority": true,
			"removePendingCard": true,
			"approvedOperationIds": "reserved_for_same_in_flight_call_only",
			"nonApprovedOperationIds": "retire_without_effect",
			"lateDecision": "reject_without_effect_or_second_tool_response",
			"duplicateDecision": "reject_without_replacing_terminal_decision"
		},
		"approvalRequired": {
			"terminalToolResult": true,
			"resumable": false,
			"resumeCommand": null,
			"retainedExecutionAuthority": false,
			"retainedPendingCard": false,
			"nextAttempt": "new_dynamic_call_with_new_identity_operation_ids_effect_hash_and_decision"
		}
	},
	"revalidation": {
		"order": [
			"decision_identity_and_effect_hash",
			"current_child_epoch_and_logical_call",
			"caller_authority",
			"target_authority_and_classification",
			"immutable_effect_and_effective_boundary",
			"context_authority",
			"operation_ids_unconsumed",
			"approval_expiry"
		],
		"failures": [
			{
				"condition": "decision_identity_effect_or_manifest_changed",
				"reason": "invalid_call"
			},
			{
				"condition": "logical_call_no_longer_executing",
				"reason": "invalid_call"
			},
			{
				"condition": "child_replaced_or_disconnected",
				"reason": "stale_child"
			},
			{
				"condition": "epoch_became_prior",
				"reason": "prior_epoch"
			},
			{
				"condition": "caller_target_or_context_provenance_unproven",
				"reason": "unknown_provenance"
			},
			{
				"condition": "caller_or_target_not_loaded",
				"reason": "not_loaded"
			},
			{
				"condition": "caller_or_target_direct_input_not_true",
				"reason": "not_controllable"
			},
			{
				"condition": "caller_or_target_system_error",
				"reason": "system_error"
			},
			{
				"condition": "non_self_fork_or_send_target_became_active",
				"reason": "busy"
			},
			{
				"condition": "relation_became_invalid_or_cyclic",
				"reason": "cycle"
			},
			{
				"condition": "authority_token_effect_hash_or_operation_id_changed",
				"reason": "invalid_call"
			},
			{
				"condition": "approval_expired_before_effect",
				"reason": "expired"
			}
		],
		"freshContext": {
			"readAfterApprovalAndRevalidation": true,
			"source": "DynamicContextPort",
			"capturedContentMayAdvance": true,
			"paneLinkAuthorityMustMatch": true,
			"callerSuppliedContext": false,
			"fallbackContext": false
		},
		"staleApprovedDecision": {
			"approvalOutcomeRemains": "approved",
			"effect": "none",
			"operationIds": "retire_without_effect",
			"toolResult": "refused_with_exact_failure_reason"
		}
	},
	"operationIds": {
		"issuer": "DynamicOperationIdPort",
		"outerOperationId": "one_fresh_id_per_mutating_dynamic_call_before_effect_hash",
		"boundaries": [
			{
				"tool": "create_thread",
				"boundary": "thread/start",
				"operationId": "identity.operationId",
				"reuse": ["effect.mutationOperationId", "epoch.operationId", "outer_result.operationId"]
			},
			{
				"tool": "create_thread",
				"boundary": "initial_turn/turn/start",
				"operationId": "effect.initialTurnOperationId",
				"reuse": [
					"epoch.operationId",
					"ArchboardContext.operation.id",
					"TurnStartParams.clientUserMessageId",
					"ok.value.initialTurn.operationId"
				]
			},
			{
				"tool": "fork_thread",
				"boundary": "thread/fork",
				"operationId": "identity.operationId",
				"reuse": ["effect.mutationOperationId", "epoch.operationId", "outer_result.operationId"]
			},
			{
				"tool": "fork_thread",
				"boundary": "optional_initial_turn/turn/start",
				"operationId": "effect.initialTurnOperationId_or_null_without_prompt",
				"reuse": [
					"epoch.operationId",
					"ArchboardContext.operation.id",
					"TurnStartParams.clientUserMessageId",
					"ok.value.initialTurn.operationId"
				]
			},
			{
				"tool": "send_message_to_thread",
				"boundary": "turn/start",
				"operationId": "identity.operationId",
				"reuse": [
					"effect.mutationOperationId",
					"epoch.operationId",
					"ArchboardContext.operation.id",
					"TurnStartParams.clientUserMessageId",
					"outer_result.operationId"
				]
			}
		],
		"contextOperations": [
			{
				"boundary": "create_thread_initial_turn",
				"kind": "create_thread_initial_turn",
				"rpc": "turn/start"
			},
			{
				"boundary": "fork_thread_initial_turn",
				"kind": "fork_thread_initial_turn",
				"rpc": "turn/start"
			},
			{
				"boundary": "send_message_to_thread",
				"kind": "send_message_to_thread",
				"rpc": "turn/start"
			}
		],
		"unresolvedTerminalAuthority": {
			"transition": "host_confirmed_idempotent_atomic",
			"logicalOwner": "exact_child_epoch_and_logical_call_quarantine",
			"wireOwner": "one_original_transport_handle_per_admitted_json_rpc_request_id",
			"epochStateBeforeRelease": "poisoned",
			"sameRequestId": "deduplicate_without_second_response_write",
			"sameLogicalCall": "admit_distinct_wire_and_fan_canonical_outcome",
			"otherCallsInEpoch": "retain_distinct_wire_with_canonical_refusal_before_operation_id_approval_stage_or_effect",
			"wireCapacity": 128,
			"overflow": "synchronous_fail_closed_shutdown_without_unbounded_wire_admission",
			"poisonFailure": "synchronous_exact_epoch_shutdown_or_retained_fatal_lifecycle_fault",
			"normalResponseWhileAnyOwnedIdIsCurrent": false,
			"recovery": "lifecycle_triggered_bounded_terminalization_then_one_response_per_admitted_wire",
			"clearWithoutResponseOn": ["exact_child_exit", "exact_transport_teardown", "dispose"]
		},
		"clientUserMessageId": "serialize_the_same_boundary_operation_id",
		"retireOn": ["declined", "expired", "cancelled", "disconnected", "stale_revalidation"],
		"consumeOn": "durable_boundary_settlement",
		"reusable": false,
		"newIdForRetry": false,
		"callerSuppliedId": false,
		"castFromAnotherIdentity": false,
		"adHocMinting": false
	},
	"dispatcher": {
		"order": [
			"validate_call_arguments_and_manifest",
			"resolve_and_classify_caller_target_and_context_authority",
			"issue_all_required_operation_ids",
			"freeze_immutable_effect_and_hash",
			"await_one_fresh_visual_approval",
			"revalidate_decision_caller_target_effect_context_and_ids",
			"read_one_fresh_ArchboardContext",
			"stage_one_local_epoch_transaction",
			"attempt_one_remote_rpc",
			"settle_durable_provenance_once",
			"construct_one_canonical_tool_result",
			"attempt_one_transport_response"
		],
		"operationGroups": [
			{
				"tool": "create_thread",
				"boundaries": ["thread/start", "initial_turn/turn/start"]
			},
			{
				"tool": "fork_thread",
				"boundaries": ["thread/fork", "optional_initial_turn/turn/start"]
			},
			{
				"tool": "send_message_to_thread",
				"boundaries": ["turn/start"]
			}
		],
		"initialTurnCondition": "only_after_confirmed_create_or_fork_and_when_prompt_present",
		"mutationRetry": false,
		"provenanceSettlement": "once_per_declared_operation_boundary",
		"toolResultConstruction": "once_after_all_attempted_boundaries_settle",
		"transportResponseAttempt": "once_when_child_request_transport_is_owned",
		"childDisconnectResponse": "classify_not_delivered_and_never_retry"
	},
	"waitThreads": {
		"ownerFields": [
			"child",
			"epoch",
			"threadId",
			"turnId",
			"callId",
			"namespace",
			"tool",
			"manifestHash",
			"sortedTargetThreadIds"
		],
		"operationId": null,
		"registrationOrder": [
			"validate_call_and_cursor",
			"resolve_exact_caller_and_targets",
			"sort_unique_target_ids",
			"reject_direct_or_transitive_cycle",
			"register_exact_owner_once"
		],
		"release": [
			{
				"event": "completion",
				"action": "release_owner_once_before_completed_response"
			},
			{
				"event": "attention",
				"action": "release_owner_once_before_attention_response"
			},
			{
				"event": "timeout",
				"action": "release_owner_once_before_timeout_response"
			},
			{
				"event": "cancellation",
				"action": "release_owner_once_before_terminal_settlement"
			},
			{
				"event": "interruption",
				"action": "release_owner_once_for_caller_turn"
			},
			{
				"event": "disconnect",
				"action": "release_owner_once_for_disconnected_call"
			},
			{
				"event": "child_exit",
				"action": "release_every_owner_for_exact_child_once"
			}
		],
		"retainedOwnerAfterRelease": false,
		"reusedOwner": false,
		"releaseAfterResponse": false
	},
	"ports": [
		{
			"port": "DynamicToolApprovalPort",
			"provides": [
				"present_immutable_request",
				"await_one_exact_visual_decision",
				"settle_identity_and_effect_hash_once"
			],
			"forbids": ["seven_family_broker", "cached_or_session_grant", "resumable_approval_required"]
		},
		{
			"port": "DynamicThreadAuthorityPort",
			"provides": [
				"resolve_exact_logical_caller",
				"classify_exact_target",
				"issue_and_revalidate_opaque_authority_tokens"
			],
			"forbids": [
				"recency_or_focus_inference",
				"fabricated_provenance",
				"caller_selected_authority"
			]
		},
		{
			"port": "DynamicContextPort",
			"provides": [
				"issue_and_revalidate_pane_link_authority",
				"read_one_fresh_ArchboardContext_after_approval"
			],
			"forbids": ["caller_supplied_context", "duplicate_context_source", "fallback_context"]
		},
		{
			"port": "DynamicOperationIdPort",
			"provides": [
				"issue_canonical_OperationId",
				"validate_current_unconsumed_OperationId",
				"serialize_for_owned_wire_fields"
			],
			"forbids": ["cast_from_other_identity", "caller_supplied_id", "second_minting_site"]
		},
		{
			"port": "DynamicToolLifecyclePort",
			"provides": [
				"call_cancellation_and_turn_interruption",
				"browser_child_and_host_disconnect_settlement",
				"exact_wait_owner_registration_and_release"
			],
			"forbids": [
				"retained_authority_after_terminal_state",
				"duplicate_settlement",
				"orphaned_wait_owner"
			]
		}
	],
	"ownership": {
		"authoredPolicy": "TASK-143.01.19",
		"operationIdentity": "TASK-143.01.20",
		"browserContract": "TASK-143.01.21",
		"headlessPortsAndDispatcher": "TASK-143.05.04",
		"gateway": "TASK-143.01.10",
		"ui": "TASK-143.03.07",
		"composition": "TASK-143.01.14",
		"systemOwner": "TASK-143.01.15",
		"browserOwner": "TASK-143.03.13",
		"excludedBroker": "src/runtime/codex-approvals"
	}
}
```

`approved` is terminal for the approval request, but not a promise that the
effect will run. The dispatcher must pass every revalidation row before it
reads fresh context or stages a transaction. A stale approved decision keeps
its recorded outcome and produces the exact refusal from the table. It never
changes into decline and never runs a fallback effect.

If approval settles first and the call is cancelled or its caller turn is
interrupted before revalidation, `logical_call_no_longer_executing` returns
`invalid_call`, retires the operation IDs, and runs no effect. It does not
return `approval_required`, because the approval request is no longer pending.
An active self-fork remains allowed at its captured executing-turn boundary;
only a non-self fork or send target that became active returns `busy`.

`approval_required` is the final dynamic tool result for cancellation, caller
turn interruption, host shutdown, or browser disconnect while approval is
pending. Before returning it, the dispatcher settles and removes the request
and its visual authority. A new tool call starts over with new call identity,
operation IDs, effect snapshot, hash, and decision. A late browser command is
rejected at the browser boundary and cannot produce another tool response.

Child disconnect is the one state in which a wire response cannot be
delivered. The dispatcher still settles the request as disconnected, removes
all authority, classifies the single response attempt as not delivered, and
never retries it. Host shutdown settles pending approvals before closing the
owned transport when that transport is still writable.

Each stage, RPC, and settlement group runs once for its declared OperationId.
For confirmed create and fork results, the optional initial turn is a second
group with its own OperationId. A missing fork prompt omits that group and
keeps every initial-turn result identity `null`. No RPC or transport response
is retried after a lost settlement.

## Coordinator manifests

```json
{
	"type": "namespace",
	"name": "archboard_workhorse",
	"description": "Inspect and steer the one workhorse bound by the host to this coordinator; no caller selects a target.",
	"tools": [
		{
			"type": "function",
			"name": "inspect_workhorse",
			"description": "Read the linked workhorse identity, state, queue, and bounded recent progress without waiting.",
			"inputSchema": {
				"type": "object",
				"properties": {},
				"required": [],
				"additionalProperties": false
			},
			"deferLoading": false
		},
		{
			"type": "function",
			"name": "delegate_to_workhorse",
			"description": "Delegate one sustained request and bounded realtime transcript context to the linked workhorse.",
			"inputSchema": {
				"type": "object",
				"properties": {
					"input": { "type": "string", "minLength": 1, "maxLength": 4096 },
					"transcriptDelta": { "type": "string", "minLength": 0, "maxLength": 4096 }
				},
				"required": ["input", "transcriptDelta"],
				"additionalProperties": false
			},
			"deferLoading": false
		},
		{
			"type": "function",
			"name": "manage_workhorse_queue",
			"description": "Inspect or mutate the linked created-workhorse queue through the host's serialized queue policy.",
			"inputSchema": {
				"type": "object",
				"properties": {
					"operation": {
						"type": "string",
						"enum": ["list", "add", "update", "delete", "reorder", "start"]
					},
					"submissionId": { "type": "string", "minLength": 1, "maxLength": 128 },
					"prompt": { "type": "string", "minLength": 1, "maxLength": 16384 },
					"orderedSubmissionIds": {
						"type": "array",
						"minItems": 1,
						"maxItems": 100,
						"uniqueItems": true,
						"items": { "type": "string", "minLength": 1, "maxLength": 128 }
					}
				},
				"required": ["operation"],
				"additionalProperties": false
			},
			"deferLoading": false
		},
		{
			"type": "function",
			"name": "steer_workhorse",
			"description": "Append one bounded instruction to the host-proven active workhorse turn; the host supplies expectedTurnId.",
			"inputSchema": {
				"type": "object",
				"properties": { "input": { "type": "string", "minLength": 1, "maxLength": 4096 } },
				"required": ["input"],
				"additionalProperties": false
			},
			"deferLoading": false
		}
	]
}
```

`manage_workhorse_queue` has operation-dependent validation: `add` requires
`prompt`; `update` requires `submissionId` and `prompt`; `delete` and `start`
require `submissionId`; `reorder` requires `orderedSubmissionIds`; `list`
accepts no other property.

```json
{
	"type": "namespace",
	"name": "archboard_voice",
	"description": "Resolve the sole host-validated spoken binary approval from a later ordinary coordinator turn.",
	"tools": [
		{
			"type": "function",
			"name": "resolve_spoken_approval",
			"description": "Return accept or decline for the sole still-current spoken approval; the host supplies and validates every request identity.",
			"inputSchema": {
				"type": "object",
				"properties": { "verdict": { "type": "string", "enum": ["accept", "decline"] } },
				"required": ["verdict"],
				"additionalProperties": false
			},
			"deferLoading": false
		}
	]
}
```

`resolve_spoken_approval` is never called from realtime directly. After the
effect prompt, the host arms one immutable eligible request only from the next
matching final **user** item. It binds the realtime session, item id, and
monotonic item sequence. Assistant output, provisional user deltas, pre-prompt
items, duplicates, and stale sessions can never arm authority.

The later ordinary coordinator turn receives these exact UTF-8 template bytes
(LF endings, one terminal LF) after placeholder substitution:

```text
Classify one spoken binary approval for Archboard. The host has already bound the request identity; do not infer or mention another request.

<spoken_approval>
effect: <bounded-effect-summary>
user_final_item_id: <opaque-item-id>
user_final_sequence: <decimal-sequence>
user_final_text: <verbatim-bounded-final-user-text>
</spoken_approval>

If and only if the user clearly accepts or declines this effect, call archboard_voice.resolve_spoken_approval once with {"verdict":"accept"} or {"verdict":"decline"}. Otherwise do not call the tool; say the request must be resolved in the visual workbench.
```

The host accepts the resulting call only when child, epoch, coordinator thread,
classifier turn, call, namespace, tool, manifest hash, realtime session, final
user item/sequence, effect fingerprint, and expiry still match. It then supplies
the sole pending approval identity to the broker.
