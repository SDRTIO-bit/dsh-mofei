# Writing Workspace Reference Audit

Date: 2026-08-16

This audit compares the Mofei DSH workspace with the user's reference project at
`F:\game\SillyTavern-1.13.2\OpenFic-main\OpenFic-main`. The reference is a
product and layout guide, not a runtime to copy into DSH.

## Layout

OpenFic's writing page uses a stable three-column editor:

| Area | OpenFic default | Mofei DSH implementation |
| --- | ---: | --- |
| Application rail | 64px | DSH's 55px collapsed rail |
| Chapter and note sidebar | 300px, min 250px, max 400px | 280px project and chapter sidebar |
| Editor | Remaining width | Remaining workbench width |
| Writing assistant | 500px, min 300px, max 600px | Native DSH assistant rail, clamped to 460px-520px |

Both designs now use full-height panes divided by thin borders rather than a page
made from floating cards. Mofei retains the approved transformation behaviour:
the DSH rail stays available, the workbench slides in from the left, and the
official DSH composer remains the assistant surface.

## What Mofei Already Covers

Mofei already has the writing-domain capabilities that matter most:

- Projects, volumes, chapters, characters, notes, and world entries with revision protection.
- Chapter and range summaries, stale detection, retrieval, world-book search and batch actions.
- Project styles, import/export, writing dashboard, prompt chains, entity histories, and mention bridges.
- A `mofei-writer` preset with writing-only persona and Mofei tools.

The reference has a richer bespoke assistant sidebar, but DSH already owns
conversation streaming, tool execution, approvals, subagents, and model settings.
Mofei should bridge those capabilities into the writing workspace instead of
building a second agent runtime.

## Gaps That Affect Writers

1. Writing sessions need a first-class switcher that never mixes coding sessions.
   Implemented in the v0.14.2 workspace: the session status control lists only
   sessions using the `mofei-writer` preset and can create a new writing session.
2. The transformed shell must never reveal the expanded DSH sidebar beneath the
   utility rail. Implemented in v0.14.2 by collapsing and clipping it before the
   workbench slide begins.
3. Prompt-chain revision and diff, writing-duration tracking, project-page
   pagination, and further legacy client extraction remain the highest-value
   product gaps.
4. The editor can still be refined with more focused reading ergonomics, but it
   should remain a lightweight Markdown editor rather than importing OpenFic's
   separate TipTap runtime.

## Deliberate Boundaries

Do not duplicate OpenFic's Python backend, desktop shell, model-provider
configuration, task runner, cost ledger, PWA, or approval UI. Those concerns are
provided by DSH and duplicating them would reintroduce the state and isolation
problems this project is eliminating.

## Next Delivery Order

1. Keep the writing-session switcher and sidebar transition covered by browser regression.
2. Add prompt-chain version history and diff before expanding more editor chrome.
3. Record focused writing duration in the existing dashboard data.
4. Split the remaining `legacy.js` workspace responsibilities into focused client modules.
