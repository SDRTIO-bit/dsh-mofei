# OpenFic Product Matrix

Date: 2026-08-16

Product rule: Mofei keeps the OpenFic writing product as its source of truth for
information architecture and writer workflows. DSH supplies the host shell,
conversation runtime, tool execution, approvals, models, and subagents. It is
not the product definition for the writing workspace.

Status meanings:

- **Present**: available in Mofei as a writer-facing workflow.
- **Hidden**: implemented, but not discoverable in the transformed workspace.
- **Partial**: core exists but an important part of the OpenFic workflow is absent.
- **Missing**: needs a Mofei product implementation.
- **DSH**: intentionally supplied by DSH, so Mofei must integrate rather than clone it.

| OpenFic domain | OpenFic surface | Mofei current surface | Status | Mofei action |
| --- | --- | --- | --- | --- |
| App shell | 64px app rail, stable full-height panes | DSH shell plus transformed writing workspace | Present | Keep the transform; place the DSH narrow rail beside the assistant, not as a detached left rail. |
| Project library | Grid/list, search, sort, cover, description, recent projects | Compact project rows in the workspace; separate grid module exists | Partial | Make project browsing a first-class page with list/grid, search, description, cover, and recent context. |
| Volumes and chapters | Tree, volume counts, create/move/reorder | Volume/chapter tree, create, drag ordering | Present | Refine hierarchy and density; retain revision protection. |
| Notes in the writing workspace | Chapter/note switch, note tree, mixed tabs | Notes and category tree; mixed tabs and editor support | Present | Make notes discoverable beside chapters, rather than only through the bottom navigation. |
| Multiple documents | Tabs, close/pin, restored last state and scroll positions | Tabs, pinning, reorder, last chapter and scroll restoration | Present | Preserve this as a core editor behavior. |
| Editor | Rich plain-text editor, title in editor, word count, paste cleanup, search/replace | Markdown textarea, title, word count, Tab indentation, autosave, search/replace | Partial | Keep Markdown-first editor; improve focused reading and paste normalization without importing a second editor runtime. |
| Layout controls | Three resizable panes with persistent dimensions | Stored layout controls in standalone workspace; transformed web uses a fixed usable split | Partial | Add persistent writing-pane sizing where DSH shell permits it; do not make panes floating cards. |
| Characters | Search, character cards, profiles and relations | CRUD, favourites, entity history, agent tools | Present | Improve browse/detail presentation after writing intelligence is surfaced. |
| World book | Entry list, enable/disable, priorities, search | CRUD, search, bulk enable/disable/delete, ST import, agent context | Present | Keep this as project context, not a buried utilities screen. |
| Contextual notes | Locked/hidden notes, categories, agent context | Same data model and locking semantics | Present | Surface lock and agent-context status where writers edit the note. |
| Chapter summaries | Persistent chapter summaries and stale state | Persistent summaries, stale calculation, regeneration | Present | Promote status into the writing workflow. |
| Long-term summaries | Range summaries and maintenance | Range summaries, background jobs, maintenance panel | Present | Keep the existing implementation; improve entry point and progress visibility. |
| Retrieval | Full-text/context retrieval for writing and assistant | Cross-entity retrieval/RAG | Present | Expose it as a context action from writing and assistant workflows. |
| Prompt chains | User templates, variables, preview/run/history | Project prompt chains, 8 macros, run, compiled prompt preview, git diff | Present | Promote chains into the writing-intelligence surface; keep history/diff visible. |
| Writing styles | Reusable style documents | Global/project style CRUD and prompt injection | Present but secondary | Treat styles as one kind of reusable instruction, not the centre of the product. |
| Built-in writing skills | Browseable skill catalogue and skill assignment | 17 OpenFic-derived runtime skills registered to `mofei-writer` | Hidden | Add a first-class skills catalogue that explains what the writing agent can load and when. |
| Custom skills | Create, fork, edit, enable/disable, reference docs, agent mapping | No Mofei authoring or per-agent control surface | Missing | Add writer-scoped custom skill storage and lifecycle, then dynamically register only enabled skills to the writing preset. |
| Assistant context | Chapter/selection mentions and context inspection | Chapter/selection/Writer/Reviewer bridges, context tools | Partial | Make the current injected context and available actions visible beside the native DSH assistant. |
| Assistant conversation | Streaming, message history, tool output, approvals | Native DSH conversation, tools, approvals, and streaming | DSH | Retain DSH as the single conversation surface; do not duplicate a second chat implementation. |
| Agent roles | Writer/reviewer routing and controlled tools | Isolated `mofei-writer` preset, Writer/Reviewer bridge, subagent support | Present | Keep isolation tests mandatory; present roles in the writing workflow. |
| Model/provider controls | Provider, tokens, cost information | DSH model/runtime controls | DSH | Let the DSH assistant own these controls. |
| Tasks and subagents | Agent task state and background work | DSH subagents plus Mofei summary jobs | DSH + Present | Link writing tasks to their project context; do not clone DSH task execution. |
| Writing dashboard | Date filters, records, words and duration | Words, streak, calendar and dashboard | Partial | Add focused writing-duration tracking and a usable record view. |
| Import/export | TXT and chapter export | TXT preview/import/export | Present | Improve discoverability through the project menu. |
| History and rollback | Entity history, prompt history, project changes | Entity history, project file tree, git history and prompt-chain diff | Present | Bring histories into relevant detail views instead of one generic command. |
| Mobile workspace | Sheets/drawers for navigation and assistant | Simplified responsive layout | Partial | Build dedicated mobile drawers after the desktop information architecture is settled. |

## Delivery Order

1. Surface writing intelligence: skills, prompt chains, summaries, retrieval, context and Writer/Reviewer roles.
2. Add custom writing-skill authoring and enablement without leaking coding skills into the writing preset.
3. Rework the project browser and editing navigation around the OpenFic hierarchy.
4. Add duration tracking, then complete mobile drawers and remaining editor ergonomics.

