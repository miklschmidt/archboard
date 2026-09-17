---
id: TASK-256.03
title: Stand the fixtures up on what the source says
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 17:39'
updated_date: '2026-09-17 19:01'
labels: []
dependencies: []
references:
  - evals/fixtures
  - .skill-evals/2026-09-17T16-31-08-093Z/report.md
parent_task_id: TASK-256
ordinal: 453000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Five scenarios state things Flask does not, and the grader flagged them in every run of both arms, listed under concerns as fixture:. An author is told not to silently repair a board it was asked to extend, so it carries the untruth into its answer and is marked down for it in both arms — the cost is invisible in the comparison and real in the scores.

Where each one actually lives matters, because two of them are not in a fixture at all. S03: the request-lifecycle membership of `Run command` comes from the PROMPT (the fixture gives it no groups), while the `Flask app -> Dispatch` edge — a container calling its own child, where wsgi_app makes that call — is in the fixture. S09: both are in the fixture. S05: `Request context` (ctx.py) and `View function` (application code) are parented under the Flask app container, and the inherited `full_dispatch_request -> View function` edge skips dispatch_request. S12: `Request context`, `Session interface` and `View function` are all parented under Flask app, and the PROMPT names that containment too. S04, which the first description missed although the grader flagged it in all six runs: the Blueprint registration draft has `Blueprint -> register_blueprint` where App.register_blueprint calls blueprint.register, so the direction is reversed, and the node is left unbound though its implementation is inspectable. No S04 check touches it, which makes it the cheapest of the five to repair.

The traps are in S03, S09 and S12, where a check or a feature depends on the untrue shape. S03 encodes the membership twice (node-groups and inspect-group with membersInclude), so making it truthful edits the prompt and two checks. S09 is worse: its expected feature is that the answer names `Run command` as a member the Overview view does not draw, and Run command is the only member living inside a container that view excludes — remove the membership and the scenario loses its point. Its boundary-edge feature asks for edges with direction, and `Flask app -> Dispatch` is the only incoming one. A truthful repair that keeps both: put a wsgi_app node inside Flask app and point the edge at Dispatch from there, and give Run command a group its behaviour supports while adding a genuinely per-request member inside a container Overview does not draw. S12's counting checks survive reparenting; its prompt does not.

Two facts about verifying this. bun run eval:skill check never lays a fixture into a vault — it validates shapes, fixture presence and the leak guard — so a dangling parent name or an unresolvable $node placeholder passes it and only explodes hours into a batch; suite.test.ts is where a round-trip belongs. And suite.test.ts already asserts that every capture's board, variant and view name appears in the prompt or fixture text, and that some scenario keeps a node in more than one group, so renaming or reparenting can break it.

One thing to do BEFORE this lands: the moment any fixture changes, assertBatchInputs (provenance.ts:108) refuses to re-report the 2026-09-17T16-31-08 batch, because the input digest covers every fixture body. Its report.json and report.md on disk become the last word on it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The fixtures, prompts and outcome checks of S03, S04, S05, S09 and S12 state only what the pinned Flask revision supports
- [x] #2 S09 still tests that the answer names a member the Overview view does not draw, and still has boundary edges in both directions
- [x] #3 Every edited fixture lays successfully into a vault, owned by a test rather than by the next batch
- [x] #4 bun run eval:skill check passes and suite.test.ts's capture-name and grouping assertions still hold
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. S04 (cheapest): reverse the draft edge to register_blueprint -> Blueprint with the label the source supports (App.register_blueprint calls blueprint.register(self, options)) and bind register_blueprint to src/flask/sansio/app.py. No S04 check reads either.
2. S05: take Request context (ctx.py) and View function (application code) out of the Flask app container, and add the dispatch_request node with full_dispatch_request -> dispatch_request -> View function so the inherited edge no longer skips it. No S05 check reads containment.
3. S12: take Request context, Session interface and View function out of the Flask app container, and reword the prompt's 'the Flask app container's dispatch parts' so it names the three parts without claiming the View function is inside the app. The counting checks are unaffected.
4. S03 and S09 share one board. Give Run command a group its behaviour supports (a new configured cli-startup group: flask run starts the development server), keep the across-containers point by adding a Contexts module (ctx.py) holding a genuinely per-request Request context push, and replace the container-to-child Flask app -> Dispatch edge with WSGI entry -> Dispatch from a part inside the app. Update S03's prompt, its node-groups checks, its inspect-group membership and its expected features; update S09's inspect-group membership and its hidden-member feature to name Request context push, which the unchanged Overview view does not draw because it draws neither Contexts nor the function inside it. Keep a boundary edge in each direction: WSGI entry -> Dispatch and WSGI entry -> Request context push come in, Request context push -> Session interface goes out.
5. Own the round trip in suite.test.ts: chain every fixture's steps through the semantic-board-store transitions in memory, resolving placeholders against the board as it stands, and require every step to apply. That catches a dangling parent name or an unresolvable $node, which eval:skill check cannot see. No canvas is started.
6. Run the module tests, bun run eval:skill check, lint and type-check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented. Every fixture concern the 2026-09-17 grader raised is repaired, and each new claim was read out of the pinned Flask 3.0.0 revision (735a4701) in .skill-evals/cache/flask.git before it was written.

S04: the draft edge is now register_blueprint -> Blueprint labelled register(self, options), because App.register_blueprint (sansio/app.py:596) ends in blueprint.register(self, options); the node is bound to src/flask/sansio/app.py. No S04 check reads either.

S05: Request context (ctx.py) and View function (application code) are no longer parented under Flask app, a dispatch_request node was added inside Flask app, and the inherited edge became full_dispatch_request -> dispatch_request -> View function, which is what app.py:867 and app.py:852 do. No S05 check reads containment.

S12: Request context, Session interface and View function left the Flask app container, and the prompt's 'the Flask app container's dispatch parts' became 'how a request reaches the view: full_dispatch_request, dispatch_request and the View function they call'. The view still names three parts and no relationship, so its counting checks are untouched.

S03 and S09 (one board): Run command moved to a new configured cli-startup group, since run_command loads the app and calls run_simple (cli.py:897-923) rather than handling a request. The across-containers point is kept by a Contexts module (ctx.py) holding Request context push, which is genuinely per-request: RequestContext.push opens the session and matches the URL (ctx.py:370-384). The container-to-child Flask app -> Dispatch edge became WSGI entry -> Dispatch from a part inside the app, which is what wsgi_app does (app.py:1450-1455), and WSGI entry -> Request context push carries the push. S03's prompt, its node-groups checks (Request context push, Run command, Contexts added), its inspect-group membership and its first two expected features were updated; S09's inspect-group membership and its inspect.hidden-members feature now name Request context push, and its Overview view selects Flask app, WSGI entry, Dispatch and CLI so it draws neither Contexts nor the function inside it. coverage.json's grouping expectedUse was updated with them.

Laying the S09 fixture through the store and reading the group back gives: members Dispatch and Request context push; WSGI entry -> Request context push and WSGI entry -> Dispatch incoming; Request context push -> Session interface outgoing; the one member Overview does not draw is Request context push. Both boundary directions and the hidden-member point survive.

New owner: suite.test.ts 'every fixture lays' chains each fixture's steps through the semantic-board-store transitions in memory, resolving placeholders against the board the previous steps left, and requires every step to apply and every board a step named to exist at the end. Temporarily misspelling a parent name in S03 fails it with 'S03 step 0 (new Flask application)', which is the failure eval:skill check cannot see. It uses the store's transitions rather than a filesystem vault because no canvas may be started in this session; the transitions are where a name becomes an id and where a dangling name is refused.

Verification: bun test src/runtime/skill-evaluation/tests/ -> 147 pass, 0 fail (suite.test.ts's capture-name and grouping assertions included). bun run eval:skill check -> suite ok: 15 scenarios, 15 fixtures, 14 coverage parts. bunx tsc --noEmit clean, bun run lint:policy clean, bun run fmt:check clean. bun run lint:baseline still fails only on src/runtime/semantic-board-store/tests/aggregate-writes.test.ts max-lines, another worker's in-flight file.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
S03, S04, S05, S09 and S12 now state only what Flask 3.0.0 at 735a4701 supports: the blueprint registration direction reversed and bound, contexts and view functions unparented, dispatch_request drawn between full_dispatch_request and the view, and Run command moved to a cli-startup group with a genuinely per-request member keeping S09's hidden-member point and its boundary edges in both directions. Every fixture is laid through the store transitions by a new owner. Verified in the wave gate: lint, fmt:check and type-check clean, the frontend build, 3572 module tests, the system lanes for semantic-boards/cli/canvas-state/process-contracts/code-targets, the repository lane, and the full serial browser lane at exit 0 with no failures.
<!-- SECTION:FINAL_SUMMARY:END -->
