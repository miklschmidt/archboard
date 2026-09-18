---
id: TASK-264
title: Eval fixtures model the shapes the rubric fails runs for
status: Done
assignee:
  - '@claude'
created_date: '2026-09-18 10:52'
updated_date: '2026-09-18 11:50'
labels: []
dependencies: []
references:
  - evals/fixtures
  - evals/evals.json
  - .skill-evals/2026-09-18T01-50-12-580Z/report.md
priority: medium
type: bug
ordinal: 471000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Nine grader concerns across the 2026-09-18 batch fault the inherited fixtures for exactly the shapes S00 and S14 fail authors over. The edge 'Run command -> Flask app' (labelled 'loads the app and serves it with werkzeug run_simple') lands on a container that has children and merges two distinct calls; in src/flask/cli.py:293-313 the app is loaded through ScriptInfo and then handed to werkzeug's run_simple, which the board does not hold. That is the same defect the S00 and S14 'edge.actual-receiver' feature fails runs for, and four S00 runs failed on it. The 'Dispatch' node collapses full_dispatch_request through finalize_request into one part, so S09's group-boundary question cannot show finalize_request's own calls (for example process_response -> save_session) and S03's binding is accurate but coarser than its source. The historical variant's 'App context stack' and 'Request context stack' are typed module with no binding. An author reading a fixture learns the shape the fixture uses; these teach the opposite of the rubric.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No fixture relationship lands on a part that has children, unless the source addresses the whole module
- [x] #2 The Dispatch node is split so a group boundary can show finalize_request's own outgoing calls, and each resulting part binds to the file implementing it
- [x] #3 Fixture nodes typed module carry a binding or a stated reason they cannot
- [x] #4 S03, S06, S09 and S12 still test what they were written to test after the fixtures change, with their expected features unchanged or the change explained
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify the source claims against the pinned Flask 3.0.0 in .skill-evals/cache/flask.git (cli.py run_command/ScriptInfo.load_app/run_simple, app.py wsgi_app->full_dispatch_request->finalize_request->process_response->save_session, ctx.py RequestContext.push opening the session).
2. S03/S09 fixtures (the 'Flask application' board): split 'Dispatch' into 'Dispatch' (full_dispatch_request), 'Finalize request' and 'Process response'; add 'App loader' (ScriptInfo.load_app) under CLI and 'Development server' (werkzeug run_simple, external); replace 'Run command -> Flask app' with 'Run command -> App loader', 'Run command -> Development server' and 'Development server -> WSGI entry', so no relationship lands on a container that has children.
3. S09: bind every new Flask-internal part to the file implementing it, put 'Finalize request' and 'Process response' in request-lifecycle so the group boundary shows process_response -> save_session, and widen the 'Overview' selection so 'Request context push' stays the one request-lifecycle member the view does not draw.
4. S02/S06: the werkzeug LocalStack nodes become 'external' (outside the checkout) rather than unbound 'module' nodes; state in each fixture comment why an unbound node is unbound (S03's checkout is deliberately unregistered).
5. S12: say in the fixture that open_session happens inside RequestContext.push, so the board does not split a call chain silently.
6. evals.json: update S03's prompt containment sentence only; confirm S03/S06/S09/S12 expected features and outcome checks still hold, and record any change with its reason.
7. Verify: bun run eval:skill check (inputs only, no model), lay the S03 and S09 boards through the CLI into a scratch vault, inspect the request-lifecycle group, render the board and the Overview view, and run archboard check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Split the collapsed Dispatch part and fixed the relationship that landed on a container.

S03 and S09 (the 'Flask application' board) now hold the request path as src/flask/app.py has it: 'Dispatch' is Flask.full_dispatch_request alone, with 'Finalize request' and 'Process response' beside it (app.py:854 calls 870 finalize_request, which calls 891 process_response, which calls session_interface.save_session at 1270). 'Run command -> Flask app' is gone; in its place are 'Run command -> App loader' (info.load_app(), src/flask/cli.py:293 and 898), 'Run command -> Development server' (run_simple(host, port, app), cli.py:924, imported from werkzeug at cli.py:17) and 'Development server -> WSGI entry', the shape S05/S10/S12 already use for a WSGI server calling wsgi_app. No relationship in any fixture now lands on a part that has children.

S09 binds every new part to the file implementing it, puts 'Finalize request' and 'Process response' in request-lifecycle so the group's outgoing boundary carries process_response -> save_session, and widens the 'Overview' selection to the app's four request parts and the CLI, so 'Request context push' stays the one member the view does not draw.

S02 and S06: the two werkzeug LocalStacks are 'external' rather than unbound 'module' nodes, with the reason stated in each fixture comment; S03's comment states that its parts are unbound because the checkout is deliberately unregistered, which is what that scenario asks the author to fix.

S12: the open_session relationship now carries a description saying RequestContext.push opens the session (ctx.py:358-385), so the board does not split that call chain silently.

evals.json: only S03's prompt changed, to name the board's new containment. No expected feature and no outcome check of S03, S06, S09 or S12 changed.

Review follow-up: restored S03's prompt to 'Record those memberships' (three nodes carry four memberships, and 'three' could be read as satisfied without Dispatch's second one, which both the groups.multi-membership feature and the node-groups check require). Widened the CLI part's responsibility to 'The flask command group and the script info that loads the app', since ScriptInfo is not part of FlaskGroup and only shares the file. Said in S09's comment that it records the whole response path's memberships, not only the three S03 asks for. Recorded in pins.json, and pointed at from the README's baseline section, which scenarios this fixture revision moved, so nobody compares S02, S03, S06, S09 or S12 across it.

Re-verified after the change: eval:skill check ok; S03 and S09 laid through the store again — no relationship lands on a part with children, the request-lifecycle boundary still carries 'outgoing Process response -> Session interface', the Overview view still draws every request-lifecycle member but 'Request context push', both render, and the vault check reports no diagnostics.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The evaluation fixtures now model the shapes the rubric grades.

On the 'Flask application' board (S03 and S09) the 'Dispatch' part is Flask.full_dispatch_request alone, with 'Finalize request' and 'Process response' beside it, each bound in S09 to src/flask/app.py, which is what lets S09's group boundary carry finalize_request's own chain out to save_session. The relationship that landed on the 'Flask app' container is gone: 'flask run' now calls 'App loader' (ScriptInfo.load_app) and the 'Development server' (werkzeug run_simple), which calls 'WSGI entry' back, the shape S05, S10 and S12 already use. Every claim was read off the pinned Flask 3.0.0 (735a4701): cli.py:17, 293, 898, 924; app.py:854, 870, 889, 891, 1270; ctx.py:358-385, whose push is why S12's open_session relationship now says it happens inside the push.

Werkzeug's two LocalStacks in S02 and S06 are 'external' parts rather than unbound 'module' nodes, and S03's comment states that its parts are unbound because its checkout is deliberately unregistered — which is what that scenario asks its author to fix. pins.json records which scenarios this revision moved so no batch is compared across it.

Verified: 'bun run eval:skill check' passes (15 scenarios, 15 fixtures, 14 coverage parts), including the leakage check over both skill packages. Every fixture was laid through src/runtime/semantic-board-store into a scratch vault and all 15 resulting variants scanned: no relationship lands on a part that has children, and the only unbound module parts are S03's three. S09's inspection reports members Dispatch, Finalize request, Process response, Request context push with 'outgoing Process response -> Session interface' on the boundary; its Overview view draws every request-lifecycle member but 'Request context push', so its hidden-members feature still holds; both the board and the view render and rasterize, and the vault check reports no diagnostics. No expected feature and no outcome check of S03, S06, S09 or S12 changed; S03's prompt names the new containment and nothing else.
<!-- SECTION:FINAL_SUMMARY:END -->
