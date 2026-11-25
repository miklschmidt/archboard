# Drive browser panes and temporary explanations

Use this reference when steering a live browser pane with `browser show`, `browser settings`, or `browser panes`, or when answering a pointed screen question through `model explain`.

## Navigate and filter a live pane

`browser show [model] --pane <pane>` updates the named pane. Omit `--pane` when one pane shows the addressed vault.
If no pane is connected, it opens the canvas in the default browser and waits for a pane. With no `--pane`, it uses the new pane.
If no browser can open or connect in time, it refuses with `BROWSER_REQUIRED`. Give the user the address in the refusal.
The optional positional `model` must match the vault's identity or exact name.

Module names and qualified IDs both resolve on `--module`, `--scope`, `--focus`, `--expand`, `--select`, `--to`, and `--from`.

- **Positive and directional filters:**
  - `--only-kind <kind>` (repeatable): show only these relationship kinds (switches to the `all` lens unless `--lens` is also given, and hides all other kinds). Refuses unknown kinds with `KIND_NOT_FOUND`.
  - `--only-effect <effect>` (repeatable): show only `mutation`, `query`, `compute`, or `declared` relationships.
  - `--hide-kind <kind>` and `--hide-effect <effect>` (repeatable): hide specific kinds or effects in addition to the lens.
  - `--to <module>` and `--from <module>` (repeatable): focus only the relationships entering `--to` (or its descendants) and/or leaving `--from` (or its descendants) that pass the active lens, kind, and effect filters. Refuses with `NO_MATCHING_RELATIONSHIPS` when nothing matches so the pane never shows a misleading picture.
- **Adjusting the current view:**
  - `--keep`: preserve the target pane's current scope, focus, expand, state, comparison, filters, ref, file, and page for any field not overridden by this call.
- **Selection, code view, branches, comparison, and pages:**
  - `--select <subject>` (repeatable): select subjects in the pane without changing its scope or focus.
  - `--group <id|name>`: select all modules belonging to a configured semantic group (refuses unknown groups with `GROUP_NOT_FOUND`).
  - `--state`, `--checkpoint`, `--ref <branch|commit>`, `--preview`, `--bookmark`, or `--legacy-address`: choose which version or branch reading is shown.
  - `--against <state|checkpoint>` or `--no-compare`: choose an explicit comparison base or turn comparison off.
  - `--file <path>` (with optional `--file-repo <repo>`): open the file in the pane's Code view and switch the navigator to Code mode.
  - `--page diagram|about`: show the diagram or the open module's About page.
  - `--grammar architecture|sequence|flowchart`, `--flow <id|name>`, `--walkthrough <id|name> --beat <index>`.
- **JSON input:**
  - `--input <file|->` replaces the reading flags with JSON while keeping `--pane`.

Examples:

```bash
# Show only HTTP traffic while keeping the current scope
archboard browser show --only-kind http --keep -C <dir>

# Show all mutating async calls into Billing
archboard browser show --only-kind async --only-effect mutation --to Billing -C <dir>

# Open a source file in Code mode beside the architecture
archboard browser show --keep --file src/auth/session.ts -C <dir>
```

## Change browser display settings in place

Use `browser settings` to change display preferences without resetting the pane's current scope, focus, filters, or camera. It needs no `-C` directory or vault:

```bash
archboard browser settings --layout lanes
archboard browser settings --theme dark --dim-on-hover off
```

Accepted options: `--layout blocks|lanes`, `--theme light|dark|system`, `--dim-on-hover on|off`, and optional `--pane <spec>`.
The same three flags also work on `browser show` (and when passed alone with no navigation selectors, the server still applies them in place via `pane_settings` without navigating).

## Show a temporary (unsaved) flowchart or sequence diagram

When the user asks to visualize a code exchange that is not saved as a model flow, trace the source code and render it in the pane with `--flow-input <file|->` (or `ephemeralFlow` in `--input` JSON):

```bash
archboard browser show --grammar flowchart --flow-input - -C <dir> <<'EOF'
{
  "name": "Returning user authentication",
  "summary": "How a returning browser session negotiates authentication with the server.",
  "participants": ["User", "Web Client", "Auth Server", "Session Store"],
  "steps": [
    { "kind": "sync", "from": "User", "to": "Web Client", "label": "Open app" },
    { "kind": "sync", "from": "Web Client", "to": "Auth Server", "label": "GET /session with cookie" },
    {
      "kind": "decision",
      "question": "Session cookie valid?",
      "alternatives": [
        {
          "label": "Valid",
          "steps": [
            { "kind": "sync", "from": "Auth Server", "to": "Session Store", "label": "Load user session" },
            { "kind": "return", "from": "Auth Server", "to": "Web Client", "label": "200 active session" }
          ]
        },
        {
          "label": "Expired",
          "steps": [
            { "kind": "return", "from": "Auth Server", "to": "Web Client", "label": "401 refresh required" }
          ]
        }
      ]
    }
  ]
}
EOF
```

- Uses the same `NewFlowSchema` shape (`name`, optional `summary`, `participants`, `steps` with messages, decisions, and loops) as `model edit`.
- `participants` matching canonical modules inherit their real module IDs and cards; actors not in the model are drawn as transient participants for that session only.
- `--grammar` defaults to `flowchart` for temporary flows (`sequence` is also accepted; `architecture` is refused).
- Never mutates `.archboard/vault` or takes claims. The browser shows a `Temporary flowchart` / `Temporary sequence` bar with a `Back to architecture` button. Save it via a claimed `model edit` only if the user explicitly asks.

## Server route and pane reports

POST `/api/panes/show`, also `/api/browser/show`, accepts `{vault?,pane?,agent?,session?,reading}`.
Settings-only requests need no `vault` and send `{type:"pane_settings",layout?,theme?,hoverLight?}` to the pane.
Navigation requests resolve selectors on the server before moving the pane and send `{type:"pane_model",model,reading,revision,vault,repository}`.
The result carries `{success,paneId,pane,reading}` plus `{model,revision,repository,checkout}` on navigation and `{settings}` when display settings changed.

`browser panes` reports `panes[].architecture` (with `display.layout`, `display.theme`, `display.hoverLight`, `display.page`, `display.navigatorMode`, `display.file`, `display.ref`, `display.hideKinds`, `display.hideEffects`, and `display.ephemeralFlow`) plus `tabSessionId` for explanation and narrative guards.
An agent show can change the machine's chosen checkout for that repository. If the result includes `chose`, tell the user which checkout was chosen and which it replaced.
Navigation preserves the conversation shown in the tab.
For narratives, read [canonical walkthroughs](canonical-walkthroughs.md).

## Temporary explanations

An explanation capture fixes the reading that the agent answers.
It keeps subjects, complete revision, state or checkpoint, and reading intent together.
Reading intent includes scope, focus, expanded modules, lens, relationship kinds, grammar, and optional flow.
`reading.relationshipKinds` lists the kinds left after the pane's explicit kind filters. Keep the lens separately in `reading.lens`.
A compared capture also keeps its actual base and separate revision. Navigation cannot retarget it.

Before answering a screen question, run `browser panes`.
Read the selected pane's `architecture` report and `tabSessionId`.
If absent, ask the person to open the canonical reading before resolving a pointing request.
Use the reported `architecture.vault`, even after foreign navigation.
Keep `reading.referenceSubject` separate from temporary pointer selection.
Do not infer architecture from `paneKey`.

For a new action, copy `architecture.selection` to the top-level `selection` and copy the observed model ID, `reading`, subjects, and `expectedRevision` into `request`.
When the pane reports `expectedComparisonRevision` or `expectedSourceRevision`, copy them into `request` too. In a model read, these digests are `comparison.revision.digest` and `playback.sourceRevision.digest`.
A changed, missing, or newly appeared comparison, or a mismatch with a supplied narrative-source revision, returns `MODEL_CHANGED` before invocation.

Use `model explain` to request a new action from the local workhorse.
Pass `-C` for the directory that holds the reported vault.
Keep its complete `selection` and guards when reading further context.
If your queue names `captureFile`, read its complete JSON before answering.
The server removes that temporary file.
If it contains `explanation`, answer the accepted capture directly without another invocation.

```json
{
	"type": "invoke",
	"tabSessionId": "<reported-tab-session>",
	"selection": { "state": "current" },
	"request": {
		"actionId": "<new-action-identity>",
		"action": "explain-selection",
		"model": "Shop",
		"expectedRevision": "1111111111111111111111111111111111111111111111111111111111111111",
		"subjects": ["Shop#Gateway"],
		"reading": {
			"scope": "Shop#Gateway",
			"focus": [],
			"relationshipKinds": ["sync"],
			"grammar": "architecture"
		}
	}
}
```

Replace the example model, subjects, and digest with the actual pane capture.

```bash
archboard model explain --input explanation.json -C <directory>
```

Other actions are `explain-relationship`, `trace-flow`, and `explain-proposal`.
Without an explicit flow, `trace-flow` can investigate without authoring one.
An explicitly unavailable flow refuses.
A proposal explanation requires the selected draft and comparison.
State and checkpoint selectors are exclusive.
Read progress through the same command:

```json
{
	"type": "read",
	"tabSessionId": "<reported-tab-session>",
	"actionId": "<original-action-identity>"
}
```

The result reports `captured`, `queued`, `running`, `completed`, `failed`, `cancelled`, or `unavailable`.
Use `action.text` for the answer. `action.capture` preserves the original reading and revision across navigation.

Send `type:"latest"` with `tabSessionId` for the last invocation or retry.
Use returned `action.vault` for later reads, cancellation, and retry, even after navigation.
If the action queues on your own workhorse, end your turn so it can start.

If `action.retryable` is true, send `type:"retry"` with the original tab and action identity.
Retry preserves captured content despite navigation or source changes.
Uncertain delivery disables retry to prevent duplicate work.
Send `type:"cancel"` to remove its queue item or interrupt its exact turn.
Read until the provider reports the final outcome.

Explanations write no architecture and take no claims.
Answers last only within the local agent generation and tab lifetime.
If the user requests saving one, use a claimed edit with a fresh complete revision.
