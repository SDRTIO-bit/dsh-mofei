// plugin/src/client/project-grid.js
var reactBinding = null;
var reactResolved = false;
function resolveReact() {
  if (reactResolved) return reactBinding;
  reactResolved = true;
  let React = null;
  const g = typeof globalThis !== "undefined" ? globalThis : null;
  if (g && g.React && typeof g.React.createElement === "function" && typeof g.React.useState === "function") React = g.React;
  if (!React && typeof window !== "undefined" && window.React && typeof window.React.createElement === "function") React = window.React;
  if (!React) {
    try {
      const req = typeof require === "function" ? require : g && typeof g.__mfRequire === "function" ? g.__mfRequire : null;
      if (req) React = req("react");
    } catch (error) {
    }
  }
  if (!React && g && g.__mofeiReact && typeof g.__mofeiReact.createElement === "function") React = g.__mofeiReact;
  reactBinding = React ? { h: React.createElement, useState: React.useState } : null;
  return reactBinding;
}
function fuzzyMatch(haystack, query) {
  const target = String(haystack == null ? "" : haystack).toLowerCase();
  const q = String(query == null ? "" : query).toLowerCase().trim();
  if (!q) return true;
  if (target.includes(q)) return true;
  const needles = q.replace(/\s+/g, "");
  if (!needles) return true;
  let i = 0;
  for (let pos = 0; pos < target.length && i < needles.length; pos++) {
    if (target.charCodeAt(pos) === needles.charCodeAt(i)) i++;
  }
  return i === needles.length;
}
function compareTitle(a, b) {
  const ta = String(a && a.title != null ? a.title : "");
  const tb = String(b && b.title != null ? b.title : "");
  return ta.localeCompare(tb, "zh-Hans-CN");
}
function filterProjects(projects, query) {
  const list = Array.isArray(projects) ? projects.slice() : [];
  const q = String(query == null ? "" : query);
  if (!q.trim()) return list;
  return list.filter((p) => p && (fuzzyMatch(p.title, q) || fuzzyMatch(p.description, q)));
}
function sortProjects(projects, by) {
  const list = Array.isArray(projects) ? projects.slice() : [];
  const field = by === "updated" || by === "created" ? by : "title";
  if (field === "title") {
    list.sort(compareTitle);
    return list;
  }
  list.sort((a, b) => {
    const av = a && a[field];
    const bv = b && b[field];
    const aHas = av !== void 0 && av !== null && av !== "";
    const bHas = bv !== void 0 && bv !== null && bv !== "";
    if (!aHas || !bHas) return compareTitle(a, b);
    const an = typeof av === "number" && !Number.isNaN(av);
    const bn = typeof bv === "number" && !Number.isNaN(bv);
    let cmp;
    if (an && bn) cmp = bv - av;
    else if (an) cmp = 1;
    else if (bn) cmp = -1;
    else cmp = av < bv ? 1 : av > bv ? -1 : 0;
    return cmp !== 0 ? cmp : compareTitle(a, b);
  });
  return list;
}
function computeGoalProgress(chapters, goal) {
  const list = Array.isArray(chapters) ? chapters : [];
  const g = Number(goal);
  if (!Number.isFinite(g) || g <= 0) return null;
  let total = 0;
  let knownCount = 0;
  let knownOrderSum = 0;
  const missingOrders = [];
  for (const c of list) {
    const len = c && typeof c.content === "string" ? c.content.length : 0;
    const order = c && typeof c.order === "number" && Number.isFinite(c.order) && c.order > 0 ? c.order : null;
    if (len > 0) {
      total += len;
      knownCount++;
      if (order != null) knownOrderSum += order;
    } else if (len === 0) {
      missingOrders.push(order);
    }
  }
  if (knownCount === 0) return null;
  const rate = knownOrderSum > 0 ? total / knownOrderSum : total / knownCount;
  let estimated = total;
  for (const order of missingOrders) {
    estimated += (order != null ? order : 1) * rate;
  }
  return Math.min(100, Math.max(0, Math.round(estimated / g * 100)));
}
var PROJECT_GRID_CSS = [
  ".mf-grid-root{display:flex;flex-direction:column;gap:10px;min-width:0}",
  ".mf-grid-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
  ".mf-grid-toggle{display:inline-flex;align-items:center;gap:2px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-base);color:inherit;overflow:hidden}",
  ".mf-grid-toggle button{border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:5px 10px;cursor:pointer;font:600 12px/1.2 sans-serif}",
  ".mf-grid-toggle button.on{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
  ".mf-grid-search{flex:1;min-width:140px;box-sizing:border-box;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:12px}",
  ".mf-grid-select{font:inherit;font-size:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-base);color:inherit;padding:5px 6px}",
  ".mf-grid-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}",
  ".mf-grid-card{position:relative;display:flex;flex-direction:column;gap:8px;min-width:0;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-elevated,transparent);cursor:pointer;transition:border-color .12s ease,background .12s ease}",
  ".mf-grid-card:hover{background:var(--dsw-alias-interactive-bg-hover)}",
  ".mf-grid-card.active{border-color:var(--dsw-alias-state-business-primary)}",
  ".mf-grid-cover{display:grid;place-items:center;width:44px;height:44px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);font-size:20px;font-weight:700;flex-shrink:0}",
  ".mf-grid-card-head{display:flex;align-items:center;gap:10px;min-width:0}",
  ".mf-grid-card-title{flex:1;min-width:0;font-size:14px;font-weight:650;line-height:22px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".mf-grid-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary)}",
  ".mf-grid-progress{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary)}",
  ".mf-grid-progress-track{flex:1;min-width:40px;height:6px;border-radius:3px;background:var(--dsw-alias-interactive-bg-hover);overflow:hidden}",
  ".mf-grid-progress-fill{height:100%;border-radius:3px;background:var(--dsw-alias-state-business-primary);transition:width .2s ease}",
  ".mf-grid-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}",
  ".mf-grid-btn{border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);padding:4px 9px;cursor:pointer;font-size:11.5px;line-height:1;flex-shrink:0;transition:background .12s ease,color .12s ease}",
  ".mf-grid-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
  ".mf-grid-del{color:var(--dsw-alias-state-error-primary);border-color:rgba(224,117,110,.35)}",
  ".mf-grid-del:hover{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}",
  ".mf-grid-del.armed{background:rgba(224,117,110,.2);font-weight:650}",
  ".mf-grid-list{display:flex;flex-direction:column;gap:6px}",
  ".mf-grid-row{display:flex;align-items:center;gap:12px;min-width:0;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-elevated,transparent);cursor:pointer}",
  ".mf-grid-row:hover{background:var(--dsw-alias-interactive-bg-hover)}",
  ".mf-grid-row.active{border-color:var(--dsw-alias-state-business-primary)}",
  ".mf-grid-row .mf-grid-cover{width:32px;height:32px;border-radius:6px;font-size:15px}",
  ".mf-grid-row-title{flex:1;min-width:0;font-size:13px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".mf-grid-row-meta{display:flex;align-items:center;gap:14px;font-size:11px;color:var(--dsw-alias-label-secondary);flex-shrink:0}",
  ".mf-grid-row-actions{display:flex;gap:6px;flex-shrink:0}",
  ".mf-grid-empty{padding:18px 12px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}"
].join("\n");
function ensureGridStyles() {
  if (typeof document === "undefined") return;
  if (document.querySelector("style[data-mf-grid]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-mf-grid", "");
  style.textContent = PROJECT_GRID_CSS;
  document.head.appendChild(style);
}
function coverChar(title) {
  const t = String(title == null ? "" : title).trim();
  if (!t) return "\u58A8";
  const chars = Array.from(t);
  return chars[0] || "\u58A8";
}
function ActionButtons(props) {
  const { project, armed, onChangeArmed, onRename, onDelete, h } = props;
  function handleDelete(event) {
    event.stopPropagation();
    if (armed === project.id) {
      if (onChangeArmed) onChangeArmed(null);
      if (onDelete) onDelete(project);
      return;
    }
    if (onChangeArmed) onChangeArmed(project.id);
  }
  return h(
    "div",
    { className: "mf-grid-actions" },
    h("button", {
      className: "mf-grid-btn",
      type: "button",
      title: "\u91CD\u547D\u540D",
      onClick: (event) => {
        event.stopPropagation();
        if (onRename) onRename(project);
      }
    }, "\u91CD\u547D\u540D"),
    h("button", {
      className: "mf-grid-btn mf-grid-del" + (armed === project.id ? " armed" : ""),
      type: "button",
      title: armed === project.id ? "\u518D\u6B21\u70B9\u51FB\u786E\u8BA4\u5220\u9664" : "\u5220\u9664",
      onBlur: () => {
        if (armed === project.id && onChangeArmed) onChangeArmed(null);
      },
      onClick: handleDelete
    }, armed === project.id ? "\u786E\u8BA4\u5220\u9664" : "\u5220\u9664")
  );
}
function ProjectGrid(props) {
  ensureGridStyles();
  const resolved2 = resolveReact();
  if (!resolved2) throw new Error('\u58A8\u6249 ProjectGrid \u65E0\u6CD5\u89E3\u6790 React\uFF1A\u8BF7\u5728\u5BBF\u4E3B\u6CE8\u5165\u5168\u5C40 React \u6216\u786E\u4FDD require("react") \u53EF\u7528');
  const h = resolved2.h;
  const useSt = resolved2.useState;
  const projects = props && Array.isArray(props.projects) ? props.projects : [];
  const activeId = props && props.activeId;
  const onPick = props && props.onPick;
  const onRename = props && props.onRename;
  const onDelete = props && props.onDelete;
  const [view, setView] = useSt("grid");
  const [query, setQuery] = useSt("");
  const [sortBy, setSortBy] = useSt("updated");
  const [armed, setArmed] = useSt(null);
  const [armTimer, setArmTimer] = useSt(null);
  function changeArmed(id) {
    if (armTimer != null) {
      clearTimeout(armTimer);
      setArmTimer(null);
    }
    if (id == null) {
      setArmed(null);
      return;
    }
    setArmed(id);
    const timer = setTimeout(() => {
      setArmed((current) => current === id ? null : current);
      setArmTimer(null);
    }, 3e3);
    setArmTimer(timer);
  }
  const visible = sortProjects(filterProjects(projects, query), sortBy);
  function progressLabel(project) {
    const percent = computeGoalProgress(project && project.chapters, project && project.goal);
    return percent == null ? "\u2014" : percent + "%";
  }
  function chapterCount2(project) {
    const list = project && Array.isArray(project.chapters) ? project.chapters : [];
    return list.length;
  }
  function renderProgress(project) {
    const percent = computeGoalProgress(project && project.chapters, project && project.goal);
    const label = percent == null ? "\u2014" : percent + "%";
    return h(
      "div",
      { className: "mf-grid-progress", title: "\u76EE\u6807\u5B57\u6570\u8FDB\u5EA6" },
      h("span", null, "\u8FDB\u5EA6"),
      h(
        "div",
        { className: "mf-grid-progress-track" },
        h("div", { className: "mf-grid-progress-fill", style: { width: (percent == null ? 0 : percent) + "%" } })
      ),
      h("span", null, label)
    );
  }
  const toolbar = h(
    "div",
    { className: "mf-grid-toolbar" },
    h(
      "div",
      { className: "mf-grid-toggle" },
      h("button", { type: "button", className: view === "grid" ? "on" : "", onClick: () => setView("grid") }, "\u7F51\u683C"),
      h("button", { type: "button", className: view === "list" ? "on" : "", onClick: () => setView("list") }, "\u5217\u8868")
    ),
    h("input", {
      className: "mf-grid-search",
      type: "search",
      placeholder: "\u641C\u7D22\u9879\u76EE\uFF08\u6807\u9898 / \u7B80\u4ECB\uFF09",
      value: query,
      onChange: (event) => setQuery(event.target.value)
    }),
    h(
      "select",
      { className: "mf-grid-select", value: sortBy, onChange: (event) => setSortBy(event.target.value) },
      h("option", { value: "updated" }, "\u6700\u8FD1\u66F4\u65B0"),
      h("option", { value: "created" }, "\u521B\u5EFA\u65F6\u95F4"),
      h("option", { value: "title" }, "\u6309\u6807\u9898")
    )
  );
  let body = null;
  if (!visible.length) {
    body = h("div", { className: "mf-grid-empty" }, "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u9879\u76EE");
  } else if (view === "grid") {
    body = h("div", { className: "mf-grid-grid" }, visible.map((project) => {
      const title = String(project.title == null ? "" : project.title).trim() || "\u672A\u547D\u540D\u9879\u76EE";
      return h(
        "div",
        {
          key: project.id,
          className: "mf-grid-card" + (activeId === project.id ? " active" : ""),
          onClick: () => {
            if (onPick) onPick(project);
          }
        },
        h(
          "div",
          { className: "mf-grid-card-head" },
          h("div", { className: "mf-grid-cover" }, coverChar(project.title)),
          h("div", { className: "mf-grid-card-title", title }, title)
        ),
        h(
          "div",
          { className: "mf-grid-meta" },
          h("span", null, chapterCount2(project) + " \u7AE0")
        ),
        renderProgress(project),
        h(ActionButtons, { project, armed, onChangeArmed: changeArmed, onRename, onDelete, h })
      );
    }));
  } else {
    body = h("div", { className: "mf-grid-list" }, visible.map((project) => {
      const title = String(project.title == null ? "" : project.title).trim() || "\u672A\u547D\u540D\u9879\u76EE";
      return h(
        "div",
        {
          key: project.id,
          className: "mf-grid-row" + (activeId === project.id ? " active" : ""),
          onClick: () => {
            if (onPick) onPick(project);
          }
        },
        h("div", { className: "mf-grid-cover" }, coverChar(project.title)),
        h("div", { className: "mf-grid-row-title", title }, title),
        h(
          "div",
          { className: "mf-grid-row-meta" },
          h("span", null, chapterCount2(project) + " \u7AE0"),
          h("span", null, progressLabel(project))
        ),
        h(ActionButtons, { project, armed, onChangeArmed: changeArmed, onRename, onDelete, h })
      );
    }));
  }
  return h("div", { className: "mf-grid-root" }, toolbar, body);
}

// plugin/src/client/project-page.js
var MAX_DESCRIPTION_CHARS = 500;
function normalizeDescription(text) {
  const s = String(text == null ? "" : text).trim();
  const chars = Array.from(s);
  return chars.length > MAX_DESCRIPTION_CHARS ? chars.slice(0, MAX_DESCRIPTION_CHARS).join("") : s;
}
function isDescriptionDirty(project, draft) {
  const current = project && typeof project === "object" && "description" in project ? project.description : void 0;
  return normalizeDescription(draft) !== normalizeDescription(current);
}
var PROJECT_PAGE_CSS = [
  ".mf-pp{display:flex;flex-direction:column;min-width:0;min-height:0;height:100%}",
  ".mf-pp-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 12px;min-height:44px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
  ".mf-pp-head strong{font-size:14px;font-weight:650;color:var(--dsw-alias-label-primary)}",
  ".mf-pp-actions{display:flex;align-items:center;gap:6px}",
  ".mf-pp-body{flex:1;min-height:0;overflow:auto;padding:14px}",
  ".mf-pp-detail{display:grid;gap:10px;margin-top:14px;padding:14px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-elevated,transparent)}",
  ".mf-pp-detail-head{display:flex;align-items:center;gap:10px;min-width:0}",
  ".mf-pp-cover{display:grid;place-items:center;width:44px;height:44px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);font-size:20px;font-weight:700;flex-shrink:0;color:var(--dsw-alias-label-primary)}",
  ".mf-pp-title{flex:1;min-width:0;font-size:15px;font-weight:650;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".mf-pp-detail-head small{font-size:11px;color:var(--dsw-alias-label-secondary);flex-shrink:0}",
  ".mf-pp-desc-label{font-size:12px;font-weight:650;color:var(--dsw-alias-label-primary)}",
  ".mf-pp-desc{box-sizing:border-box;width:100%;min-height:84px;padding:9px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:13px/1.6 sans-serif;resize:vertical}",
  ".mf-pp-desc-foot{display:flex;align-items:center;justify-content:space-between;gap:10px}",
  ".mf-pp-hint{font-size:11px;color:var(--dsw-alias-label-secondary)}",
  ".mf-pp-empty{margin-top:14px;padding:18px 12px;border:1px dashed var(--dsw-alias-border-l1);border-radius:8px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}"
].join("\n");
function ensureProjectPageStyles() {
  if (typeof document === "undefined") return;
  if (document.querySelector("style[data-mf-project-page]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-mf-project-page", "");
  style.textContent = PROJECT_PAGE_CSS;
  document.head.appendChild(style);
}
var pageReact = null;
var pageReactResolved = false;
function resolvePageReact() {
  if (!pageReactResolved) {
    pageReactResolved = true;
    let React = null;
    const g = typeof globalThis !== "undefined" ? globalThis : null;
    if (g && g.React && typeof g.React.createElement === "function" && typeof g.React.useState === "function" && typeof g.React.useEffect === "function") React = g.React;
    if (!React && typeof window !== "undefined" && window.React && typeof window.React.createElement === "function") React = window.React;
    if (!React) {
      try {
        const req = typeof require === "function" ? require : g && typeof g.__mfRequire === "function" ? g.__mfRequire : null;
        if (req) React = req("react");
      } catch (error) {
      }
    }
    if (!React && g && g.__mofeiReact && typeof g.__mofeiReact.createElement === "function") React = g.__mofeiReact;
    pageReact = React && typeof React.createElement === "function" && typeof React.useState === "function" && typeof React.useEffect === "function" ? React : null;
  }
  return pageReact;
}
function coverChar2(title) {
  const t = String(title == null ? "" : title).trim();
  if (!t) return "\u58A8";
  const chars = Array.from(t);
  return chars[0] || "\u58A8";
}
function chapterCount(project) {
  const list = project && Array.isArray(project.chapters) ? project.chapters : [];
  return list.length;
}
function ProjectPage(props) {
  ensureGridStyles();
  ensureProjectPageStyles();
  const resolved2 = resolveReact();
  const react2 = resolvePageReact();
  if (!resolved2 || !react2) throw new Error('\u58A8\u6249 ProjectPage \u65E0\u6CD5\u89E3\u6790 React\uFF1A\u8BF7\u5728\u5BBF\u4E3B\u6CE8\u5165\u5168\u5C40 React \u6216\u786E\u4FDD require("react") \u53EF\u7528');
  const h = resolved2.h;
  const useSt = resolved2.useState;
  const useEf = react2.useEffect;
  const projects = props && Array.isArray(props.projects) ? props.projects : [];
  const activeId = props && props.activeId;
  const onPick = props && props.onPick;
  const onRename = props && props.onRename;
  const onDelete = props && props.onDelete;
  const onCreate = props && props.onCreate;
  const onClose = props && props.onClose;
  const onSaveDescription = props && props.onSaveDescription;
  const active = activeId == null ? null : projects.find((p) => p && p.id === activeId) || null;
  const [draft, setDraft] = useSt("");
  useEf(() => {
    setDraft(active ? normalizeDescription(active.description) : "");
  }, [activeId]);
  const dirty = isDescriptionDirty(active, draft);
  const descriptionValue = normalizeDescription(draft);
  function handleTextareaChange(event) {
    setDraft(String(event.target.value == null ? "" : event.target.value));
  }
  function handleSave() {
    if (!active || !dirty) return;
    if (onSaveDescription) onSaveDescription(active, descriptionValue);
  }
  const head = h(
    "div",
    { className: "mf-pp-head" },
    h("strong", null, "\u9879\u76EE"),
    h(
      "span",
      { className: "mf-pp-actions" },
      h("button", { className: "mf-btn", type: "button", onClick: () => {
        if (onCreate) onCreate();
      } }, "+ \u65B0\u5EFA"),
      h("button", { className: "mf-btn", type: "button", title: "\u8FD4\u56DE\u7F16\u8F91\u5668", onClick: () => {
        if (onClose) onClose();
      } }, "\u6536\u8D77")
    )
  );
  const grid = h(ProjectGrid, {
    projects,
    activeId,
    onPick,
    onRename,
    onDelete
  });
  let detail = null;
  if (active) {
    detail = h(
      "div",
      { className: "mf-pp-detail" },
      h(
        "div",
        { className: "mf-pp-detail-head" },
        h("div", { className: "mf-pp-cover" }, coverChar2(active.title)),
        h("div", { className: "mf-pp-title", title: String(active.title == null ? "" : active.title).trim() || "\u672A\u547D\u540D\u9879\u76EE" }, String(active.title == null ? "" : active.title).trim() || "\u672A\u547D\u540D\u9879\u76EE"),
        h("small", null, chapterCount(active) + " \u7AE0")
      ),
      h("div", { className: "mf-pp-desc-label" }, "\u7B80\u4ECB"),
      h("textarea", {
        className: "mf-pp-desc",
        placeholder: "\u4E00\u53E5\u8BDD\u4ECB\u7ECD\u8FD9\u672C\u4E66\uFF08\u7528\u4E8E\u641C\u7D22\u4E0E\u9879\u76EE\u9875\u5C55\u793A\uFF09",
        value: descriptionValue,
        onChange: handleTextareaChange
      }),
      h(
        "div",
        { className: "mf-pp-desc-foot" },
        h("small", { className: "mf-pp-hint" }, "\u7B80\u4ECB\u7528\u4E8E\u9879\u76EE\u7F51\u683C\u641C\u7D22"),
        h("button", { className: "mf-btn mf-primary", type: "button", disabled: !dirty, onClick: handleSave }, "\u4FDD\u5B58\u7B80\u4ECB")
      )
    );
  } else {
    detail = h("div", { className: "mf-pp-empty" }, "\u9009\u62E9\u9879\u76EE\u540E\u7F16\u8F91\u7B80\u4ECB\u4E0E\u76EE\u6807\u3002");
  }
  return h(
    "div",
    { className: "mf-pp" },
    head,
    h("div", { className: "mf-pp-body" }, grid, detail)
  );
}

// plugin/src/client/summary-panel.js
var reactBinding2 = null;
var reactResolved2 = false;
function resolveReact2() {
  if (reactResolved2) return reactBinding2;
  reactResolved2 = true;
  let React = null;
  const g = typeof globalThis !== "undefined" ? globalThis : null;
  if (g && g.React && typeof g.React.createElement === "function" && typeof g.React.useState === "function") React = g.React;
  if (!React && typeof window !== "undefined" && window.React && typeof window.React.createElement === "function") React = window.React;
  if (!React) {
    try {
      const req = typeof require === "function" ? require : g && typeof g.__mfRequire === "function" ? g.__mfRequire : null;
      if (req) React = req("react");
    } catch (error) {
    }
  }
  if (!React && g && g.__mofeiReact && typeof g.__mofeiReact.createElement === "function") React = g.__mofeiReact;
  reactBinding2 = React ? { h: React.createElement, useState: React.useState } : null;
  return reactBinding2;
}
function normMax(max, fallback) {
  const n = Number(max);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
function previewSummary(text, max = 120) {
  const limit = normMax(max, 120);
  const s = String(text == null ? "" : text).trim();
  const chars = Array.from(s);
  return chars.length > limit ? chars.slice(0, limit).join("") : s;
}
function hasSummaryText(entry) {
  const summary = entry && typeof entry === "object" ? entry.summary : null;
  return String(summary == null ? "" : summary).trim().length > 0;
}
function chapterSummaryStats(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let hasSummary = 0;
  let stale = 0;
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    if (hasSummaryText(row.entry)) hasSummary++;
    if (row.stale === true) stale++;
  }
  return { total: list.length, hasSummary, stale };
}
function rangeSummaryStats(ranges) {
  const list = Array.isArray(ranges) ? ranges : [];
  let hasSummary = 0;
  for (const range of list) {
    if (!range || typeof range !== "object") continue;
    const has = range.hasSummary === true || String(range.summary == null ? "" : range.summary).trim().length > 0;
    if (has) hasSummary++;
  }
  return { total: list.length, hasSummary };
}
function progressPercent(progress) {
  if (!progress || typeof progress !== "object") return null;
  const done = progress.done;
  const total = progress.total;
  if (typeof done !== "number" || typeof total !== "number") return null;
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0 || done < 0) return null;
  return Math.min(100, Math.max(0, Math.round(done / total * 100)));
}
var SUMMARY_PANEL_CSS = [
  ".mf-sum-overlay{position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4)}",
  ".mf-sum{display:grid;grid-template-rows:48px 40px minmax(0,1fr);width:min(920px,92vw);height:78vh;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 20px 60px rgba(0,0,0,.28)}",
  ".mf-sum-head{display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1);min-width:0}",
  ".mf-sum-title{font-size:14px;font-weight:650;color:var(--dsw-alias-label-primary);flex-shrink:0}",
  ".mf-sum-project{flex:1;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".mf-sum-head-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}",
  ".mf-sum-tabs{display:flex;gap:4px;padding:5px 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
  ".mf-sum-tab{flex:1;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);padding:5px 0;cursor:pointer;font:600 12px/1.2 sans-serif}",
  ".mf-sum-tab.on{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
  ".mf-sum-body{min-height:0;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:10px}",
  ".mf-sum-stats{font-size:11px;color:var(--dsw-alias-label-secondary);padding:0 2px}",
  ".mf-sum-list{display:flex;flex-direction:column;gap:6px;min-width:0}",
  ".mf-sum-row{display:flex;align-items:flex-start;gap:10px;min-width:0;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-elevated,transparent)}",
  ".mf-sum-order{flex-shrink:0;width:20px;font-size:11px;color:var(--dsw-alias-label-secondary);padding-top:2px;text-align:right}",
  ".mf-sum-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}",
  ".mf-sum-name{display:flex;align-items:center;gap:8px;min-width:0}",
  ".mf-sum-name strong{font-size:12px;font-weight:650;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".mf-sum-badge{flex-shrink:0;font-size:10px;padding:1px 6px;border-radius:8px}",
  ".mf-sum-badge.none{background:var(--dsw-alias-state-neutral, #6b7280);color:#fff}",
  ".mf-sum-badge.stale{background:var(--dsw-alias-state-warning, #f59e0b);color:#fff}",
  ".mf-sum-badge.ok{background:var(--dsw-alias-state-success, #16a34a);color:#fff}",
  ".mf-sum-preview{font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-all;max-height:64px;overflow:hidden}",
  ".mf-sum-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}",
  ".mf-sum-btn{border:1px solid var(--dsw-alias-border-l1);border-radius:4px;background:transparent;color:inherit;padding:4px 8px;cursor:pointer;font-size:11px;line-height:1;transition:background .12s ease,opacity .12s ease}",
  ".mf-sum-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}",
  ".mf-sum-btn:disabled{opacity:.45;cursor:default}",
  ".mf-sum-btn.primary{border-color:transparent;background:var(--dsw-alias-state-business-primary);color:#fff}",
  ".mf-sum-btn.primary:hover{opacity:.9}",
  ".mf-sum-loading{padding:18px 12px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}",
  ".mf-sum-error{padding:12px;border:1px solid rgba(220,38,38,.45);border-radius:6px;color:#dc2626;font-size:12px;background:rgba(220,38,38,.08)}",
  ".mf-sum-empty{padding:18px 12px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}",
  ".mf-sum-generate{display:grid;gap:14px}",
  ".mf-sum-generate-actions{display:flex;gap:8px;flex-wrap:wrap}",
  ".mf-sum-generate-actions .mf-sum-btn{padding:8px 14px;font-size:12px}",
  ".mf-sum-progress{display:grid;gap:6px}",
  ".mf-sum-progress-track{height:8px;border-radius:4px;background:var(--dsw-alias-interactive-bg-hover);overflow:hidden}",
  ".mf-sum-progress-fill{height:100%;border-radius:4px;background:var(--dsw-alias-state-business-primary);transition:width .2s ease}",
  ".mf-sum-progress-label{font-size:11px;color:var(--dsw-alias-label-secondary)}",
  ".mf-sum-busy{font-size:12px;color:var(--dsw-alias-label-secondary)}",
  ".mf-sum-result{padding:10px 12px;border:1px dashed var(--dsw-alias-border-l1);border-radius:6px;font-size:12px;color:var(--dsw-alias-label-primary)}"
].join("\n");
function ensureSummaryPanelStyles() {
  if (typeof document === "undefined") return;
  if (document.querySelector("style[data-mf-summary]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-mf-summary", "");
  style.textContent = SUMMARY_PANEL_CSS;
  document.head.appendChild(style);
}
function chapterBadge(row) {
  if (!hasSummaryText(row && row.entry)) return { cls: "none", text: "\u65E0" };
  if (row && row.stale === true) return { cls: "stale", text: "\u8FC7\u671F" };
  return { cls: "ok", text: "\u6709" };
}
function rangeBadge(range) {
  const has = range && (range.hasSummary === true || String(range.summary == null ? "" : range.summary).trim().length > 0);
  return has ? { cls: "ok", text: "\u6709" } : { cls: "none", text: "\u65E0" };
}
function SummaryPanel(props) {
  ensureSummaryPanelStyles();
  const resolved2 = resolveReact2();
  if (!resolved2) throw new Error('\u58A8\u6249 SummaryPanel \u65E0\u6CD5\u89E3\u6790 React\uFF1A\u8BF7\u5728\u5BBF\u4E3B\u6CE8\u5165\u5168\u5C40 React \u6216\u786E\u4FDD require("react") \u53EF\u7528');
  const h = resolved2.h;
  const useSt = resolved2.useState;
  const open = !!(props && props.open);
  const onClose = props && props.onClose;
  const projectTitle = props && props.projectTitle;
  const chapterRows = props && Array.isArray(props.chapterRows) ? props.chapterRows : [];
  const ranges = props && Array.isArray(props.ranges) ? props.ranges : [];
  const loading = !!(props && props.loading);
  const error = props && props.error ? String(props.error) : "";
  const busy = props && props.busy ? props.busy : null;
  const progress = props && props.progress ? props.progress : null;
  const result = props && props.result ? props.result : null;
  const onRegenerateChapter = props && props.onRegenerateChapter;
  const onRegenerateRange = props && props.onRegenerateRange;
  const onGenerateChapters = props && props.onGenerateChapters;
  const onGenerateRanges = props && props.onGenerateRanges;
  const onRefresh = props && props.onRefresh;
  const [tab, setTab] = useSt("chapters");
  if (!open) return null;
  function rowBusy(kind, id) {
    return !!(busy && busy.kind === kind && busy.id === id);
  }
  const chapterStats = chapterSummaryStats(chapterRows);
  const rangeStats2 = rangeSummaryStats(ranges);
  let chapterBody = null;
  if (loading) {
    chapterBody = h("div", { className: "mf-sum-loading" }, "\u52A0\u8F7D\u4E2D\u2026");
  } else if (error) {
    chapterBody = h("div", { className: "mf-sum-error" }, error);
  } else if (!chapterRows.length) {
    chapterBody = h("div", { className: "mf-sum-empty" }, "\u6682\u65E0\u7AE0\u8282");
  } else {
    chapterBody = h("div", { className: "mf-sum-list" }, chapterRows.map((row, index) => {
      const badge = chapterBadge(row);
      const orderNum = row && typeof row.order === "number" && Number.isFinite(row.order) ? row.order : index;
      const title = String(row && row.title == null ? "" : row.title).trim() || "\u672A\u547D\u540D\u7AE0\u8282";
      const preview = previewSummary(row && row.entry && row.entry.summary);
      const disabled = rowBusy("chapter", row && row.chapterId);
      return h(
        "div",
        { className: "mf-sum-row", key: row && row.chapterId != null ? row.chapterId : index },
        h("div", { className: "mf-sum-order" }, String(orderNum + 1)),
        h(
          "div",
          { className: "mf-sum-main" },
          h(
            "div",
            { className: "mf-sum-name" },
            h("strong", null, title),
            h("span", { className: "mf-sum-badge " + badge.cls }, badge.text)
          ),
          h("div", { className: "mf-sum-preview" }, preview || "\uFF08\u6682\u65E0\u6458\u8981\uFF09")
        ),
        h(
          "div",
          { className: "mf-sum-actions" },
          h("button", {
            className: "mf-sum-btn",
            type: "button",
            disabled,
            onClick: () => {
              if (onRegenerateChapter) onRegenerateChapter(row);
            }
          }, "\u91CD\u7B97")
        )
      );
    }));
  }
  let rangeBody = null;
  if (loading) {
    rangeBody = h("div", { className: "mf-sum-loading" }, "\u52A0\u8F7D\u4E2D\u2026");
  } else if (error) {
    rangeBody = h("div", { className: "mf-sum-error" }, error);
  } else if (!ranges.length) {
    rangeBody = h("div", { className: "mf-sum-empty" }, "\u6682\u65E0\u533A\u95F4");
  } else {
    rangeBody = h("div", { className: "mf-sum-list" }, ranges.map((range, index) => {
      const badge = rangeBadge(range);
      const title = String(range && range.title == null ? "" : range.title).trim() || String(range && range.id == null ? "" : range.id) || "\u533A\u95F4 " + (index + 1);
      const preview = previewSummary(range && range.summary);
      const disabled = rowBusy("range", range && range.id);
      return h(
        "div",
        { className: "mf-sum-row", key: range && range.id != null ? range.id : index },
        h("div", { className: "mf-sum-order" }, String(index + 1)),
        h(
          "div",
          { className: "mf-sum-main" },
          h(
            "div",
            { className: "mf-sum-name" },
            h("strong", null, title),
            h("span", { className: "mf-sum-badge " + badge.cls }, badge.text)
          ),
          h("div", { className: "mf-sum-preview" }, preview || "\uFF08\u6682\u65E0\u6458\u8981\uFF09")
        ),
        h(
          "div",
          { className: "mf-sum-actions" },
          h("button", {
            className: "mf-sum-btn",
            type: "button",
            disabled,
            onClick: () => {
              if (onRegenerateRange) onRegenerateRange(range);
            }
          }, "\u91CD\u7B97")
        )
      );
    }));
  }
  const chapterGenDisabled = !!(busy && (busy.kind === "chapter" || busy.kind === "chapters"));
  const rangeGenDisabled = !!(busy && (busy.kind === "range" || busy.kind === "ranges"));
  let progressArea = null;
  const percent = progressPercent(progress);
  if (progress) {
    const label = String(progress.label == null ? "" : progress.label);
    progressArea = h(
      "div",
      { className: "mf-sum-progress" },
      h(
        "div",
        { className: "mf-sum-progress-track" },
        h("div", { className: "mf-sum-progress-fill", style: { width: (percent == null ? 0 : percent) + "%" } })
      ),
      h(
        "div",
        { className: "mf-sum-progress-label" },
        label + "\uFF08" + String(progress.done == null ? 0 : progress.done) + "/" + String(progress.total == null ? 0 : progress.total) + "\uFF09"
      )
    );
  } else if (busy) {
    progressArea = h("div", { className: "mf-sum-busy" }, "\u751F\u6210\u4E2D\u2026");
  }
  let resultArea = null;
  if (result) {
    resultArea = h(
      "div",
      { className: "mf-sum-result" },
      "\u751F\u6210 " + String(result.count == null ? 0 : result.count) + " \u9879\uFF08\u8FC7\u671F " + String(result.staleCount == null ? 0 : result.staleCount) + " / \u65B0\u9C9C " + String(result.freshCount == null ? 0 : result.freshCount) + "\uFF09"
    );
  }
  const generateBody = h(
    "div",
    { className: "mf-sum-generate" },
    h(
      "div",
      { className: "mf-sum-generate-actions" },
      h("button", {
        className: "mf-sum-btn primary",
        type: "button",
        disabled: chapterGenDisabled,
        onClick: () => {
          if (onGenerateChapters) onGenerateChapters();
        }
      }, "\u751F\u6210\u5168\u90E8\u8FC7\u671F\u7AE0\u8282\u6458\u8981"),
      h("button", {
        className: "mf-sum-btn primary",
        type: "button",
        disabled: rangeGenDisabled,
        onClick: () => {
          if (onGenerateRanges) onGenerateRanges();
        }
      }, "\u751F\u6210\u5168\u90E8\u8FC7\u671F\u533A\u95F4\u6458\u8981")
    ),
    progressArea,
    resultArea
  );
  const tabs = h(
    "div",
    { className: "mf-sum-tabs" },
    h("button", { type: "button", className: "mf-sum-tab" + (tab === "chapters" ? " on" : ""), onClick: () => setTab("chapters") }, "\u7AE0\u8282"),
    h("button", { type: "button", className: "mf-sum-tab" + (tab === "ranges" ? " on" : ""), onClick: () => setTab("ranges") }, "\u533A\u95F4"),
    h("button", { type: "button", className: "mf-sum-tab" + (tab === "generate" ? " on" : ""), onClick: () => setTab("generate") }, "\u751F\u6210")
  );
  const head = h(
    "div",
    { className: "mf-sum-head" },
    h("span", { className: "mf-sum-title" }, "\u6458\u8981"),
    h(
      "span",
      { className: "mf-sum-project", title: String(projectTitle == null ? "" : projectTitle) },
      projectTitle == null ? "" : String(projectTitle)
    ),
    h(
      "span",
      { className: "mf-sum-head-actions" },
      h("button", { className: "mf-sum-btn", type: "button", onClick: () => {
        if (onRefresh) onRefresh();
      } }, "\u5237\u65B0"),
      h("button", { className: "mf-sum-btn", type: "button", onClick: () => {
        if (onClose) onClose();
      } }, "\u5173\u95ED")
    )
  );
  let body = null;
  if (tab === "chapters") {
    body = h(
      "div",
      { className: "mf-sum-body" },
      h(
        "div",
        { className: "mf-sum-stats" },
        "\u5171 " + chapterStats.total + " \u7AE0 \xB7 \u5DF2\u6709\u6458\u8981 " + chapterStats.hasSummary + " \xB7 \u8FC7\u671F " + chapterStats.stale
      ),
      chapterBody
    );
  } else if (tab === "ranges") {
    body = h(
      "div",
      { className: "mf-sum-body" },
      h(
        "div",
        { className: "mf-sum-stats" },
        "\u5171 " + rangeStats2.total + " \u7EC4 \xB7 \u5DF2\u6709\u6458\u8981 " + rangeStats2.hasSummary
      ),
      rangeBody
    );
  } else {
    body = h("div", { className: "mf-sum-body" }, generateBody);
  }
  return h(
    "div",
    { className: "mf-sum-overlay", onClick: () => {
      if (onClose) onClose();
    } },
    h(
      "div",
      { className: "mf-sum", onClick: (event) => {
        if (event && event.stopPropagation) event.stopPropagation();
      } },
      head,
      tabs,
      body
    )
  );
}

// plugin/src/client/prompt-chains.js
var reactBinding3 = null;
var reactResolved3 = false;
function resolveReact3() {
  if (reactResolved3) return reactBinding3;
  reactResolved3 = true;
  let React = null;
  const g = typeof globalThis !== "undefined" ? globalThis : null;
  if (g && g.React && typeof g.React.createElement === "function" && typeof g.React.useState === "function") React = g.React;
  if (!React && typeof window !== "undefined" && window.React && typeof window.React.createElement === "function") React = window.React;
  if (!React) {
    try {
      const req = typeof require === "function" ? require : g && typeof g.__mfRequire === "function" ? g.__mfRequire : null;
      if (req) React = req("react");
    } catch (error) {
    }
  }
  if (!React && g && g.__mofeiReact && typeof g.__mofeiReact.createElement === "function") React = g.__mofeiReact;
  reactBinding3 = React ? { h: React.createElement, useState: React.useState } : null;
  return reactBinding3;
}
function normalizeChainName(name) {
  const s = String(name == null ? "" : name).trim();
  const chars = Array.from(s);
  const clipped = chars.length > 40 ? chars.slice(0, 40).join("") : s;
  return clipped.length > 0 ? clipped : "\u672A\u547D\u540D\u94FE";
}
var PROMPT_CHAINS_CSS = [
  ".mf-ch-overlay{position:fixed;inset:0;z-index:132;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4)}",
  ".mf-ch{display:grid;grid-template-rows:48px minmax(0,1fr) auto;width:min(860px,92vw);height:76vh;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 20px 60px rgba(0,0,0,.28)}",
  ".mf-ch-head{display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
  ".mf-ch-title{font-size:14px;font-weight:650;color:var(--dsw-alias-label-primary);flex:1;min-width:0}",
  ".mf-ch-body{display:grid;grid-template-columns:240px minmax(0,1fr);min-height:0;flex:1;overflow:hidden}",
  ".mf-ch-list{display:flex;flex-direction:column;min-width:0;border-right:1px solid var(--dsw-alias-border-l1);overflow-y:auto}",
  ".mf-ch-list-empty{padding:18px 12px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}",
  ".mf-ch-item{display:flex;align-items:center;gap:8px;min-width:0;padding:9px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:transparent;border-left:0;border-right:0;border-top:0;cursor:pointer;text-align:left}",
  ".mf-ch-item:hover{background:var(--dsw-alias-interactive-bg-hover)}",
  ".mf-ch-item.on{background:var(--dsw-alias-interactive-bg-hover)}",
  ".mf-ch-item-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}",
  ".mf-ch-item-name{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".mf-ch-item-date{font-size:10px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".mf-ch-del{flex-shrink:0;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);padding:2px 6px;font-size:11px;cursor:pointer;line-height:1}",
  ".mf-ch-del:hover{background:rgba(220,38,38,.14);color:#dc2626}",
  ".mf-ch-editor{display:flex;flex-direction:column;min-width:0;min-height:0;padding:12px}",
  ".mf-ch-ed-name{display:flex;align-items:center;gap:8px;margin-bottom:8px}",
  ".mf-ch-ed-name label{font-size:11px;color:var(--dsw-alias-label-secondary);flex-shrink:0}",
  ".mf-ch-name{flex:1;min-width:0}",
  ".mf-ch-content{flex:1;min-height:0;width:100%;box-sizing:border-box;resize:none;font-family:Consolas,Menlo,Monaco,Courier New,monospace;font-size:12px;line-height:1.6;padding:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-elevated,transparent);color:var(--dsw-alias-label-primary)}",
  ".mf-ch-hint{margin:6px 0 0;font-size:10px;color:var(--dsw-alias-label-secondary);line-height:1.6}",
  ".mf-ch-actions{display:flex;align-items:center;gap:8px;margin-top:10px}",
  ".mf-ch-btn{border:1px solid var(--dsw-alias-border-l1);border-radius:4px;background:transparent;color:inherit;padding:5px 10px;cursor:pointer;font-size:12px;line-height:1;transition:background .12s ease,opacity .12s ease}",
  ".mf-ch-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}",
  ".mf-ch-btn:disabled{opacity:.45;cursor:default}",
  ".mf-ch-btn.primary{border-color:transparent;background:var(--dsw-alias-state-business-primary);color:#fff}",
  ".mf-ch-btn.primary:hover{opacity:.9}",
  ".mf-ch-foot{border-top:1px solid var(--dsw-alias-border-l1);padding:8px 12px;display:flex;flex-direction:column;gap:6px;min-width:0}",
  ".mf-ch-busy{font-size:12px;color:var(--dsw-alias-label-secondary)}",
  ".mf-ch-error{padding:8px 10px;border:1px solid rgba(220,38,38,.45);border-radius:6px;color:#dc2626;font-size:12px;background:rgba(220,38,38,.08);word-break:break-all}",
  ".mf-ch-result{white-space:pre-wrap;word-break:break-all;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-elevated,transparent);color:var(--dsw-alias-label-primary);padding:10px 12px;font-size:12px;max-height:220px;overflow:auto}",
  ".mf-ch-prompt-toggle{border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:0;font-size:11px;cursor:pointer;text-align:left}",
  ".mf-ch-prompt-toggle:hover{color:var(--dsw-alias-label-primary)}",
  ".mf-ch-prompt{margin-top:4px;padding:8px 10px;border:1px dashed var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-elevated,transparent);white-space:pre-wrap;word-break:break-all;font-size:11px;color:var(--dsw-alias-label-secondary);max-height:160px;overflow:auto}"
].join("\n");
function ensurePromptChainsStyles() {
  if (typeof document === "undefined") return;
  if (document.querySelector("style[data-mf-chains]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-mf-chains", "");
  style.textContent = PROMPT_CHAINS_CSS;
  document.head.appendChild(style);
}
function fmtUpdatedAt(chain) {
  const t = chain && chain.updatedAt;
  if (t == null || t === "" || !Number.isFinite(Number(t)) || Number(t) <= 0) return "";
  const d = new Date(Number(t));
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => n < 10 ? "0" + n : String(n);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
function PromptChainsPanel(props) {
  ensurePromptChainsStyles();
  const resolved2 = resolveReact3();
  if (!resolved2) throw new Error('\u58A8\u6249 PromptChainsPanel \u65E0\u6CD5\u89E3\u6790 React\uFF1A\u8BF7\u5728\u5BBF\u4E3B\u6CE8\u5165\u5168\u5C40 React \u6216\u786E\u4FDD require("react") \u53EF\u7528');
  const h = resolved2.h;
  const useSt = resolved2.useState;
  const open = !!(props && props.open);
  const onClose = props && props.onClose || null;
  const chains = props && Array.isArray(props.chains) ? props.chains : [];
  const activeChainId = props && props.activeChainId != null ? props.activeChainId : null;
  const onSelect = props && props.onSelect || null;
  const busy = !!(props && props.busy);
  const error = props && props.error ? String(props.error) : "";
  const result = props && props.result != null ? String(props.result) : "";
  const lastPrompt = props && props.lastPrompt != null ? String(props.lastPrompt) : "";
  const onSave = props && props.onSave || null;
  const onDelete = props && props.onDelete || null;
  const onRun = props && props.onRun || null;
  const onHistory = props && props.onHistory || null;
  const [draft, setDraft] = useSt({ name: "", content: "" });
  const [showPrompt, setShowPrompt] = useSt(false);
  if (!open) return null;
  const active = chains.find((c) => c && c.id === activeChainId) || (chains.length ? chains[0] : null);
  function pick(chain) {
    if (onSelect) onSelect(chain && chain.id);
    setDraft({
      name: chain && chain.name != null ? String(chain.name) : "",
      content: chain && chain.content != null ? String(chain.content) : ""
    });
  }
  function fireSave() {
    if (!onSave) return;
    onSave({
      chainId: active ? active.id : void 0,
      name: draft.name,
      content: draft.content
    });
  }
  function fireRun() {
    if (!onRun) return;
    if (active) {
      onRun(Object.assign({}, active, { name: draft.name, content: draft.content }));
    } else {
      onRun({ id: null, name: draft.name, content: draft.content });
    }
  }
  const listBody = chains.length ? chains.map((chain, index) => {
    const id = chain && chain.id != null ? chain.id : null;
    const key = id != null ? id : index;
    const name = normalizeChainName(chain && chain.name);
    const date = fmtUpdatedAt(chain);
    const isActive = active && id != null && active.id === id;
    return h(
      "div",
      { className: "mf-ch-item" + (isActive ? " on" : ""), key, onClick: () => pick(chain) },
      h(
        "div",
        { className: "mf-ch-item-main" },
        h("div", { className: "mf-ch-item-name" }, name),
        h("div", { className: "mf-ch-item-date" }, date || "\uFF08\u65E0\u65E5\u671F\uFF09")
      ),
      h("button", {
        className: "mf-ch-del",
        type: "button",
        title: "\u5220\u9664\u8BE5\u94FE",
        onClick: (event) => {
          if (event && event.stopPropagation) event.stopPropagation();
          if (onDelete) onDelete(chain);
        }
      }, "\u5220\u9664")
    );
  }) : h("div", { className: "mf-ch-list-empty" }, "\u6682\u65E0\u94FE");
  const hint = "\u652F\u6301\u5B8F\uFF1A" + ["{{project}}", "{{chapter}}", "{{chapterText}}", "{{selected}}", "{{characters}}", "{{world}}", "{{notes}}", "{{instruction}}"].join("\u3000");
  const editor = h(
    "div",
    { className: "mf-ch-editor" },
    h(
      "div",
      { className: "mf-ch-ed-name" },
      h("label", null, "\u540D\u79F0"),
      h("input", {
        className: "mf-ch-name",
        type: "text",
        value: draft.name,
        placeholder: "\u672A\u547D\u540D\u94FE",
        onChange: (event) => setDraft(Object.assign({}, draft, { name: event && event.target ? event.target.value : "" }))
      })
    ),
    h("textarea", {
      className: "mf-ch-content",
      value: draft.content,
      placeholder: "\u8F93\u5165\u6A21\u677F\u5185\u5BB9\uFF0C\u652F\u6301 {{project}} \u7B49\u5B8F\u2026",
      onChange: (event) => setDraft(Object.assign({}, draft, { content: event && event.target ? event.target.value : "" }))
    }),
    h("div", { className: "mf-ch-hint" }, hint),
    h(
      "div",
      { className: "mf-ch-actions" },
      h("button", { className: "mf-ch-btn primary", type: "button", disabled: busy, onClick: fireSave }, active ? "\u4FDD\u5B58" : "\u65B0\u5EFA"),
      h("button", { className: "mf-ch-btn", type: "button", disabled: busy, onClick: fireRun }, "\u8FD0\u884C"),
      h("button", { className: "mf-ch-btn", type: "button", disabled: !active, title: "git \u7248\u672C\u5386\u53F2 / diff\uFF08\u9700\u5DE5\u4F5C\u533A\u4E3A git \u4ED3\u5E93\uFF09", onClick: () => {
        if (onHistory && active) onHistory(active);
      } }, "\u5386\u53F2/\u5BF9\u6BD4"),
      h("button", { className: "mf-ch-btn", type: "button", onClick: () => {
        if (onClose) onClose();
      } }, "\u5173\u95ED")
    )
  );
  let foot = null;
  const footItems = [];
  if (busy) footItems.push(h("div", { className: "mf-ch-busy", key: "busy" }, "\u8FD0\u884C\u4E2D\u2026"));
  if (error) footItems.push(h("div", { className: "mf-ch-error", key: "error" }, error));
  if (result) footItems.push(h("div", { className: "mf-ch-result", key: "result" }, result));
  if (lastPrompt) {
    footItems.push(h("button", {
      className: "mf-ch-prompt-toggle",
      type: "button",
      key: "toggle",
      onClick: () => setShowPrompt(!showPrompt)
    }, showPrompt ? "\u6536\u8D77\u63D0\u793A\u8BCD" : "\u67E5\u770B\u672C\u6B21\u7F16\u8BD1\u63D0\u793A\u8BCD"));
    if (showPrompt) footItems.push(h("div", { className: "mf-ch-prompt", key: "prompt" }, lastPrompt));
  }
  if (footItems.length) foot = h("div", { className: "mf-ch-foot" }, footItems);
  const body = h(
    "div",
    { className: "mf-ch-body" },
    h("div", { className: "mf-ch-list" }, listBody),
    editor
  );
  return h(
    "div",
    { className: "mf-ch-overlay", onClick: () => {
      if (onClose) onClose();
    } },
    h(
      "div",
      { className: "mf-ch", onClick: (event) => {
        if (event && event.stopPropagation) event.stopPropagation();
      } },
      h(
        "div",
        { className: "mf-ch-head" },
        h("span", { className: "mf-ch-title" }, "Prompt Chains"),
        h("button", { className: "mf-ch-btn", type: "button", onClick: () => {
          if (onClose) onClose();
        } }, "\u5173\u95ED")
      ),
      body,
      foot
    )
  );
}

// plugin/src/client/roles-panel.js
var reactBinding4 = null;
var reactResolved4 = false;
function resolveReact4() {
  if (reactResolved4) return reactBinding4;
  reactResolved4 = true;
  let React = null;
  const g = typeof globalThis !== "undefined" ? globalThis : null;
  if (g && g.React && typeof g.React.createElement === "function" && typeof g.React.useState === "function") React = g.React;
  if (!React && typeof window !== "undefined" && window.React && typeof window.React.createElement === "function") React = window.React;
  if (!React) {
    try {
      const req = typeof require === "function" ? require : g && typeof g.__mfRequire === "function" ? g.__mfRequire : null;
      if (req) React = req("react");
    } catch (error) {
    }
  }
  if (!React && g && g.__mofeiReact && typeof g.__mofeiReact.createElement === "function") React = g.__mofeiReact;
  reactBinding4 = React ? { h: React.createElement, useState: React.useState } : null;
  return reactBinding4;
}
function normalizeRoleName(name) {
  const s = String(name == null ? "" : name).trim();
  const chars = Array.from(s);
  const clipped = chars.length > 40 ? chars.slice(0, 40).join("") : s;
  return clipped.length > 0 ? clipped : "\u672A\u547D\u540D\u63D0\u793A\u8BCD";
}
function normalizeEntryName(name) {
  const s = String(name == null ? "" : name).trim();
  const chars = Array.from(s);
  return chars.length > 30 ? chars.slice(0, 30).join("") : s;
}
var ROLES_PANEL_CSS = [
  ".mf-roles-overlay{position:fixed;inset:0;z-index:132;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4)}",
  ".mf-roles{display:grid;grid-template-rows:48px minmax(0,1fr);width:min(920px,94vw);height:80vh;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 20px 60px rgba(0,0,0,.28)}",
  ".mf-roles-head{display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
  ".mf-roles-title{font-size:14px;font-weight:650;color:var(--dsw-alias-label-primary);flex:1;min-width:0}",
  ".mf-roles-body{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:0;flex:1;overflow:hidden}",
  ".mf-roles-list{display:flex;flex-direction:column;min-width:0;border-right:1px solid var(--dsw-alias-border-l1);overflow-y:auto}",
  ".mf-roles-list-empty{padding:18px 12px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}",
  ".mf-roles-item{display:flex;align-items:center;gap:8px;min-width:0;padding:9px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:transparent;border-left:0;border-right:0;border-top:0;cursor:pointer;text-align:left}",
  ".mf-roles-item:hover{background:var(--dsw-alias-interactive-bg-hover)}",
  ".mf-roles-item.on{background:var(--dsw-alias-interactive-bg-hover)}",
  ".mf-roles-item-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}",
  ".mf-roles-item-name{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".mf-roles-item-meta{font-size:10px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".mf-roles-source{display:inline-flex;align-items:center;min-height:18px;padding:1px 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:4px;color:var(--dsw-alias-label-secondary);font-size:10px;white-space:nowrap}",
  ".mf-roles-source.custom{border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,transparent);color:var(--dsw-alias-state-business-primary)}",
  ".mf-roles-del{flex-shrink:0;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);padding:2px 6px;font-size:11px;cursor:pointer;line-height:1}",
  ".mf-roles-del:hover{background:rgba(220,38,38,.14);color:#dc2626}",
  ".mf-roles-editor{display:flex;flex-direction:column;min-width:0;min-height:0;padding:12px;overflow-x:hidden;overflow-y:auto}",
  ".mf-roles-ed-name{display:flex;align-items:center;gap:8px;margin-bottom:8px}",
  ".mf-roles-ed-name label{font-size:11px;color:var(--dsw-alias-label-secondary);flex-shrink:0}",
  ".mf-roles-name{flex:1;min-width:0}",
  // Keep the entries at their intrinsic height so the editor owns the scroll.
  // A shrinking flex child lets long textareas paint over the instruction block below.
  ".mf-roles-entries{display:flex;flex-direction:column;gap:10px;flex:0 0 auto;min-height:auto;overflow:visible}",
  ".mf-roles-entry{border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;gap:6px}",
  ".mf-roles-entry-head{display:flex;align-items:center;gap:8px}",
  ".mf-roles-entry-toggle{flex-shrink:0;width:36px;height:18px;border-radius:9px;border:0;background:var(--dsw-alias-interactive-bg-hover);cursor:pointer;position:relative;transition:background .15s ease}",
  ".mf-roles-entry-toggle.on{background:var(--dsw-alias-state-business-primary)}",
  '.mf-roles-entry-toggle::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:left .15s ease}',
  ".mf-roles-entry-toggle.on::after{left:20px}",
  ".mf-roles-entry-name{flex:1;min-width:0;font-size:11px}",
  ".mf-roles-entry-order{width:50px;font-size:11px}",
  ".mf-roles-entry-del{flex-shrink:0;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);padding:2px 6px;font-size:11px;cursor:pointer;line-height:1}",
  ".mf-roles-entry-del:hover{background:rgba(220,38,38,.14);color:#dc2626}",
  ".mf-roles-entry-content{width:100%;box-sizing:border-box;resize:vertical;min-height:80px;font-family:Consolas,Menlo,Monaco,Courier New,monospace;font-size:12px;line-height:1.6;padding:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:4px;background:var(--dsw-alias-bg-elevated,transparent);color:var(--dsw-alias-label-primary)}",
  ".mf-roles-entry.disabled .mf-roles-entry-content{opacity:.5}",
  ".mf-roles-add-entry{border:1px dashed var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);padding:8px;cursor:pointer;font-size:12px;text-align:center}",
  ".mf-roles-add-entry:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
  ".mf-roles-actions{display:flex;align-items:center;gap:8px;margin-top:10px}",
  ".mf-roles-btn{border:1px solid var(--dsw-alias-border-l1);border-radius:4px;background:transparent;color:inherit;padding:5px 10px;cursor:pointer;font-size:12px;line-height:1;transition:background .12s ease,opacity .12s ease}",
  ".mf-roles-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}",
  ".mf-roles-btn:disabled{opacity:.45;cursor:default}",
  ".mf-roles-btn.primary{border-color:transparent;background:var(--dsw-alias-state-business-primary);color:#fff}",
  ".mf-roles-btn.primary:hover{opacity:.9}",
  ".mf-roles-error{margin-top:8px;padding:8px 10px;border:1px solid rgba(220,38,38,.45);border-radius:6px;color:#dc2626;font-size:12px;background:rgba(220,38,38,.08);word-break:break-all}",
  ".mf-roles-instructions{display:flex;flex-direction:column;gap:6px;margin:12px 0 4px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1)}.mf-roles-section-title{font-size:11px;font-weight:650;color:var(--dsw-alias-label-primary)}.mf-roles-instruction{display:flex;align-items:flex-start;gap:7px;padding:5px 6px;border-radius:5px;background:transparent;cursor:pointer}.mf-roles-instruction:hover,.mf-roles-instruction.on{background:var(--dsw-alias-interactive-bg-hover)}.mf-roles-instruction input{margin-top:2px;accent-color:var(--dsw-alias-state-business-primary)}.mf-roles-instruction-main{display:flex;flex-direction:column;gap:2px;min-width:0}.mf-roles-instruction-main strong{font-size:11px}.mf-roles-instruction-main small{font-size:10px;color:var(--dsw-alias-label-secondary);line-height:1.35}.mf-roles-hint{margin:6px 0 0;font-size:10px;color:var(--dsw-alias-label-secondary);line-height:1.6}"
].join("\n");
function ensureRolesPanelStyles() {
  if (typeof document === "undefined") return;
  if (document.querySelector("style[data-mf-roles]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-mf-roles", "");
  style.textContent = ROLES_PANEL_CSS;
  document.head.appendChild(style);
}
function fmtUpdatedAt2(role) {
  const t = role && role.updatedAt;
  if (t == null || t === "" || !Number.isFinite(Number(t)) || Number(t) <= 0) return "";
  const d = new Date(Number(t));
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => n < 10 ? "0" + n : String(n);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
function RolesPanel(props) {
  ensureRolesPanelStyles();
  const resolved2 = resolveReact4();
  if (!resolved2) throw new Error('\u58A8\u6249 RolesPanel \u65E0\u6CD5\u89E3\u6790 React\uFF1A\u8BF7\u5728\u5BBF\u4E3B\u6CE8\u5165\u5168\u5C40 React \u6216\u786E\u4FDD require("react") \u53EF\u7528');
  const h = resolved2.h;
  const open = !!(props && props.open);
  const onClose = props && props.onClose || null;
  const roles = props && Array.isArray(props.roles) ? props.roles : [];
  const activeRoleId = props && props.activeRoleId != null ? props.activeRoleId : null;
  const onSelect = props && props.onSelect || null;
  const detail = props && props.detail || null;
  const busy = !!(props && props.busy);
  const error = props && props.error ? String(props.error) : "";
  const onSave = props && props.onSave || null;
  const onDelete = props && props.onDelete || null;
  const onAddEntry = props && props.onAddEntry || null;
  const onUpdateEntry = props && props.onUpdateEntry || null;
  const onDeleteEntry = props && props.onDeleteEntry || null;
  const onUpdateName = props && props.onUpdateName || null;
  const instructions = props && Array.isArray(props.instructions) ? props.instructions : [];
  const onToggleInstruction = props && props.onToggleInstruction || null;
  if (!open) return null;
  const active = roles.find((r) => r && r.id === activeRoleId) || (roles.length ? roles[0] : null);
  const entries = detail && Array.isArray(detail.entries) ? detail.entries : [];
  const detailName = detail && detail.name != null ? String(detail.name) : "";
  function pick(role) {
    if (onSelect) onSelect(role && role.id);
  }
  function fireSave() {
    if (!onSave) return;
    onSave({
      roleId: active ? active.id : void 0,
      name: detailName,
      entries,
      defaultInstructions: bindings
    });
  }
  const listBody = roles.length ? roles.map((role, index) => {
    const id = role && role.id != null ? role.id : null;
    const key = id != null ? id : index;
    const name = normalizeRoleName(role && role.name);
    const date = fmtUpdatedAt2(role);
    const isActive = active && id != null && active.id === id;
    const entryCount = role && role.entryCount || 0;
    const enabledCount = role && role.enabledCount || 0;
    const sourceLabel2 = role && role.isBuiltin ? role.isOverridden ? "\u9879\u76EE\u5B9A\u5236" : "\u5185\u7F6E\u9ED8\u8BA4" : "\u9879\u76EE\u81EA\u5EFA";
    const canRemove = !!(role && (role.canReset || !role.isBuiltin));
    return h(
      "div",
      { className: "mf-roles-item" + (isActive ? " on" : ""), key, onClick: () => pick(role) },
      h(
        "div",
        { className: "mf-roles-item-main" },
        h("div", { className: "mf-roles-item-name" }, name),
        h("div", { className: "mf-roles-item-meta" }, sourceLabel2 + " \xB7 " + String(enabledCount) + "/" + String(entryCount) + " \u6761" + (date ? " \xB7 " + date : ""))
      ),
      canRemove ? h("button", {
        className: "mf-roles-del",
        type: "button",
        title: role && role.canReset ? "\u6E05\u9664\u9879\u76EE\u5B9A\u5236\u5E76\u6062\u590D\u5185\u7F6E\u9ED8\u8BA4" : "\u5220\u9664\u8BE5\u63D0\u793A\u8BCD",
        onClick: (event) => {
          if (event && event.stopPropagation) event.stopPropagation();
          if (onDelete) onDelete(role);
        }
      }, role && role.canReset ? "\u6062\u590D" : "\u5220\u9664") : null
    );
  }) : h("div", { className: "mf-roles-list-empty" }, "\u6682\u65E0\u5B50\u4EE3\u7406\u63D0\u793A\u8BCD");
  const entriesBody = entries.length ? entries.map((entry, index) => {
    const isEnabled = entry && entry.isEnabled !== false;
    return h(
      "div",
      { className: "mf-roles-entry" + (isEnabled ? "" : " disabled"), key: index },
      h(
        "div",
        { className: "mf-roles-entry-head" },
        h("button", {
          className: "mf-roles-entry-toggle" + (isEnabled ? " on" : ""),
          type: "button",
          title: isEnabled ? "\u5DF2\u542F\u7528\uFF08\u70B9\u51FB\u7981\u7528\uFF09" : "\u5DF2\u7981\u7528\uFF08\u70B9\u51FB\u542F\u7528\uFF09",
          onClick: () => {
            if (onUpdateEntry) onUpdateEntry(index, { isEnabled: !isEnabled });
          }
        }),
        h("input", {
          className: "mf-roles-entry-name",
          type: "text",
          value: normalizeEntryName(entry && entry.name),
          placeholder: "\u6761\u76EE\u540D\u79F0",
          onChange: (event) => {
            if (onUpdateEntry) onUpdateEntry(index, { name: event && event.target ? event.target.value : "" });
          }
        }),
        h("input", {
          className: "mf-roles-entry-order",
          type: "number",
          value: String(entry && entry.order || 0),
          title: "\u6392\u5E8F",
          onChange: (event) => {
            if (onUpdateEntry) onUpdateEntry(index, { order: Number(event && event.target ? event.target.value : 0) });
          }
        }),
        h("button", {
          className: "mf-roles-entry-del",
          type: "button",
          title: "\u5220\u9664\u8BE5\u6761\u76EE",
          onClick: () => {
            if (onDeleteEntry) onDeleteEntry(index);
          }
        }, "\xD7")
      ),
      h("textarea", {
        className: "mf-roles-entry-content",
        value: entry && entry.content || "",
        placeholder: "\u8F93\u5165\u8BE5\u6761\u76EE\u7684\u4EBA\u683C/\u6307\u4EE4\u5185\u5BB9\u2026",
        onChange: (event) => {
          if (onUpdateEntry) onUpdateEntry(index, { content: event && event.target ? event.target.value : "" });
        }
      })
    );
  }) : h("div", { className: "mf-roles-list-empty" }, "\u6682\u65E0\u6761\u76EE\uFF0C\u70B9\u51FB\u4E0B\u65B9\u6DFB\u52A0");
  const bindings = detail && Array.isArray(detail.defaultInstructions) ? detail.defaultInstructions : [];
  const instructionBlock = h(
    "div",
    { className: "mf-roles-instructions" },
    h("div", { className: "mf-roles-section-title" }, "\u9ED8\u8BA4\u6CE8\u5165\u7684\u5199\u4F5C\u6307\u4EE4"),
    instructions.length ? instructions.map((item) => {
      const bindingIndex = bindings.findIndex((binding2) => binding2.instructionId === item.id);
      const enabled = bindingIndex >= 0 && bindings[bindingIndex].isEnabled !== false;
      return h(
        "label",
        { className: "mf-roles-instruction" + (enabled ? " on" : ""), key: item.id },
        h("input", { type: "checkbox", checked: enabled, onChange: () => {
          if (!onToggleInstruction) return;
          if (bindingIndex >= 0) onToggleInstruction(bindingIndex, { isEnabled: !enabled });
          else onToggleInstruction(bindings.length, { instructionId: item.id, order: (bindings.length + 1) * 10, isEnabled: true });
        } }),
        h("span", { className: "mf-roles-instruction-main" }, h("strong", null, item.name || item.id), h("small", null, item.description || "\u79C1\u6709\u5199\u4F5C\u6307\u4EE4"))
      );
    }) : h("div", { className: "mf-roles-list-empty" }, "\u6682\u65E0\u79C1\u6709\u5199\u4F5C\u6307\u4EE4"),
    h("div", { className: "mf-roles-hint" }, "\u52FE\u9009\u9879\u4F1A\u5728\u521B\u5EFA\u8BE5\u5B50\u4EE3\u7406\u65F6\u5F3A\u5236\u6CE8\u5165\uFF1B\u4E2D\u63A7\u53EA\u80FD\u4E3A\u5355\u6B21\u4EFB\u52A1\u8FFD\u52A0\uFF0C\u4E0D\u80FD\u79FB\u9664\u8FD9\u91CC\u7684\u9ED8\u8BA4\u6307\u4EE4\u3002")
  );
  const sourceLabel = active && active.isBuiltin ? active.isOverridden ? "\u9879\u76EE\u5B9A\u5236" : "\u5185\u7F6E\u9ED8\u8BA4" : "\u9879\u76EE\u81EA\u5EFA";
  const editor = h(
    "div",
    { className: "mf-roles-editor" },
    h(
      "div",
      { className: "mf-roles-ed-name" },
      h("label", null, "\u63D0\u793A\u8BCD\u540D"),
      h("input", {
        className: "mf-roles-name",
        type: "text",
        value: detailName,
        disabled: !!(active && active.isBuiltin),
        placeholder: "\u672A\u547D\u540D\u63D0\u793A\u8BCD",
        onChange: (event) => {
          if (onUpdateName) onUpdateName(event && event.target ? event.target.value : "");
        }
      }),
      active ? h("span", { className: "mf-roles-source" + (active.isOverridden || !active.isBuiltin ? " custom" : "") }, sourceLabel + (active.effort ? " \xB7 " + active.effort : "")) : null
    ),
    h(
      "div",
      { className: "mf-roles-entries" },
      entriesBody,
      h("button", {
        className: "mf-roles-add-entry",
        type: "button",
        onClick: () => {
          if (onAddEntry) onAddEntry();
        }
      }, "\uFF0B \u6DFB\u52A0\u6761\u76EE")
    ),
    h("div", { className: "mf-roles-hint" }, "\u6BCF\u4E2A\u63D0\u793A\u8BCD\u7531\u591A\u6761 entries \u7EC4\u6210\uFF0C\u4F7F\u7528\u65F6\u6309 order \u6392\u5E8F\u62FC\u63A5\u542F\u7528\u7684\u6761\u76EE\u6CE8\u5165\u5B50\u4EE3\u7406\u3002\u5F00\u5173 isEnabled \u53EF\u4E34\u65F6\u7981\u7528\u67D0\u6761\u800C\u4E0D\u5220\u9664\u3002"),
    instructionBlock,
    h(
      "div",
      { className: "mf-roles-actions" },
      h("button", { className: "mf-roles-btn primary", type: "button", disabled: busy || !detail, onClick: fireSave }, active && active.isBuiltin && !active.isOverridden ? "\u4FDD\u5B58\u4E3A\u9879\u76EE\u5B9A\u5236" : active ? "\u4FDD\u5B58" : "\u65B0\u5EFA"),
      active && active.canReset ? h("button", { className: "mf-roles-btn", type: "button", disabled: busy, onClick: () => {
        if (onDelete) onDelete(active);
      } }, "\u6062\u590D\u5185\u7F6E\u9ED8\u8BA4") : null,
      h("button", { className: "mf-roles-btn", type: "button", onClick: () => {
        if (onClose) onClose();
      } }, "\u5173\u95ED")
    ),
    error ? h("div", { className: "mf-roles-error" }, error) : null
  );
  const body = h(
    "div",
    { className: "mf-roles-body" },
    h("div", { className: "mf-roles-list" }, listBody),
    editor
  );
  return h(
    "div",
    { className: "mf-roles-overlay", onClick: () => {
      if (onClose) onClose();
    } },
    h(
      "div",
      { className: "mf-roles", onClick: (event) => {
        if (event && event.stopPropagation) event.stopPropagation();
      } },
      h(
        "div",
        { className: "mf-roles-head" },
        h("span", { className: "mf-roles-title" }, "\u5B50\u4EE3\u7406\u63D0\u793A\u8BCD"),
        h("button", { className: "mf-roles-btn", type: "button", onClick: () => {
          if (onClose) onClose();
        } }, "\u5173\u95ED")
      ),
      body
    )
  );
}

// plugin/src/client/writing-dashboard.js
var reactBinding5 = null;
var reactResolved5 = false;
function resolveReact5() {
  if (reactResolved5) return reactBinding5;
  reactResolved5 = true;
  let React = null;
  const g = typeof globalThis !== "undefined" ? globalThis : null;
  if (g && g.React && typeof g.React.createElement === "function" && typeof g.React.useState === "function") React = g.React;
  if (!React && typeof window !== "undefined" && window.React && typeof window.React.createElement === "function") React = window.React;
  if (!React) {
    try {
      const req = typeof require === "function" ? require : g && typeof g.__mfRequire === "function" ? g.__mfRequire : null;
      if (req) React = req("react");
    } catch (error) {
    }
  }
  if (!React && g && g.__mofeiReact && typeof g.__mofeiReact.createElement === "function") React = g.__mofeiReact;
  reactBinding5 = React ? { h: React.createElement, useState: React.useState } : null;
  return reactBinding5;
}
var WEEKDAY_LABELS = ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"];
var DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function weekdayName(dayIndex) {
  if (typeof dayIndex !== "number" || !Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return "";
  return WEEKDAY_LABELS[dayIndex];
}
function isValidDateKey(key) {
  if (typeof key !== "string") return false;
  const m = key.match(DATE_KEY_RE);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}
function weekdayOf(dateKey2) {
  if (typeof dateKey2 !== "string") return "";
  const m = dateKey2.match(DATE_KEY_RE);
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return "";
  return weekdayName(date.getDay());
}
function pad2(value) {
  return value < 10 ? "0" + String(value) : String(value);
}
function shiftDateKey(dateKey2, deltaDays) {
  const m = typeof dateKey2 === "string" ? dateKey2.match(DATE_KEY_RE) : null;
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d + deltaDays);
  return String(date.getFullYear()) + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
}
function normalizeDays(days) {
  return days && typeof days === "object" && !Array.isArray(days) ? days : {};
}
function dailyRows(days, start, end) {
  const src = normalizeDays(days);
  const startKey = typeof start === "string" ? start : "";
  const endKey = typeof end === "string" ? end : "";
  const rows = [];
  for (const key of Object.keys(src)) {
    if (startKey && key < startKey) continue;
    if (endKey && key > endKey) continue;
    const raw = src[key];
    let chars = 0;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      chars = raw > 0 ? raw : 0;
    } else if (raw && typeof raw === "object") {
      const c = raw.chars;
      if (typeof c === "number" && Number.isFinite(c)) chars = c > 0 ? c : 0;
    }
    rows.push({ date: key, chars, weekday: weekdayOf(key) });
  }
  rows.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return rows;
}
function defaultRange(days, daysBack = 30) {
  const src = normalizeDays(days);
  let end = "";
  for (const key of Object.keys(src)) {
    if (isValidDateKey(key) && key > end) end = key;
  }
  if (!end) return { start: "", end: "" };
  let back = Number(daysBack);
  if (!Number.isInteger(back) || back < 1) back = 30;
  const start = shiftDateKey(end, -(back - 1));
  return { start: start || "", end };
}
function rangeStats(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let days = 0;
  let totalChars = 0;
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    days += 1;
    const c = row.chars;
    if (typeof c === "number" && Number.isFinite(c) && c > 0) totalChars += c;
  }
  const average = days > 0 ? Math.round(totalChars / days) : 0;
  return { days, totalChars, average };
}
var WRITING_DASHBOARD_CSS = [
  ".mf-dash-overlay{position:fixed;inset:0;z-index:135;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4)}",
  ".mf-dash-card{display:flex;flex-direction:column;width:min(760px,92vw);max-height:80vh;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 20px 60px rgba(0,0,0,.28)}",
  ".mf-dash-head{display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);min-width:0}",
  ".mf-dash-title{font-size:14px;font-weight:650;color:var(--dsw-alias-label-primary);flex-shrink:0}",
  ".mf-dash-head-actions{display:flex;align-items:center;gap:6px;margin-left:auto;flex-shrink:0}",
  ".mf-dash-btn{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:transparent;color:inherit;padding:4px 10px;cursor:pointer;font-size:11px;line-height:1.2;transition:background .12s ease}",
  ".mf-dash-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}",
  ".mf-dash-btn.mf-dash-on{border-color:transparent;background:var(--dsw-alias-state-business-primary);color:#fff}",
  ".mf-dash-btn.mf-dash-close{font-size:14px;padding:2px 8px;border-radius:6px}",
  ".mf-dash-toolbar{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap}",
  ".mf-dash-label{font-size:11px;color:var(--dsw-alias-label-secondary);flex-shrink:0}",
  ".mf-dash-date{box-sizing:border-box;flex:1;min-width:130px;max-width:170px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-elevated,transparent);color:inherit;padding:5px 8px;font:12px/1.2 sans-serif}",
  ".mf-dash-sep{font-size:11px;color:var(--dsw-alias-label-secondary)}",
  ".mf-dash-stats{padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary)}",
  ".mf-dash-stats strong{color:var(--dsw-alias-label-primary);font-weight:650}",
  ".mf-dash-body{min-height:0;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:6px}",
  ".mf-dash-row{display:flex;align-items:center;gap:12px;min-width:0;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-elevated,transparent)}",
  ".mf-dash-row-date{font-size:12px;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;flex-shrink:0}",
  ".mf-dash-row-weekday{flex-shrink:0;font-size:11px;color:var(--dsw-alias-label-secondary);padding:1px 7px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover)}",
  ".mf-dash-row-chars{margin-left:auto;font-size:12px;color:var(--dsw-alias-label-primary);flex-shrink:0;font-variant-numeric:tabular-nums}",
  ".mf-dash-empty{padding:22px 12px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}"
].join("\n");
function ensureWritingDashboardStyles() {
  if (typeof document === "undefined") return;
  if (document.querySelector("style[data-mf-dashboard]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-mf-dashboard", "");
  style.textContent = WRITING_DASHBOARD_CSS;
  document.head.appendChild(style);
}
function WritingDashboard(props) {
  ensureWritingDashboardStyles();
  const resolved2 = resolveReact5();
  if (!resolved2) throw new Error('\u58A8\u6249 WritingDashboard \u65E0\u6CD5\u89E3\u6790 React\uFF1A\u8BF7\u5728\u5BBF\u4E3B\u6CE8\u5165\u5168\u5C40 React \u6216\u786E\u4FDD require("react") \u53EF\u7528');
  const h = resolved2.h;
  const useSt = resolved2.useState;
  const open = !!(props && props.open);
  const onClose = props && props.onClose;
  const onRangeChange = props && props.onRangeChange;
  const daysData = normalizeDays(props && props.days);
  const initial = defaultRange(daysData, 30);
  const [start, setStart] = useSt(initial.start);
  const [end, setEnd] = useSt(initial.end);
  if (!open) return null;
  function applyRange(next) {
    const nextStart = next && next.start != null ? String(next.start) : "";
    const nextEnd = next && next.end != null ? String(next.end) : "";
    setStart(nextStart);
    setEnd(nextEnd);
    if (onRangeChange) onRangeChange({ start: nextStart, end: nextEnd });
  }
  function changeStart(value) {
    setStart(value);
    if (onRangeChange) onRangeChange({ start: value, end });
  }
  function changeEnd(value) {
    setEnd(value);
    if (onRangeChange) onRangeChange({ start, end: value });
  }
  const rows = dailyRows(daysData, start, end);
  const stats = rangeStats(rows);
  const quickButtons = h(
    "div",
    { className: "mf-dash-head-actions" },
    h("button", {
      className: "mf-dash-btn" + (start === defaultRange(daysData, 7).start && end === defaultRange(daysData, 7).end ? " mf-dash-on" : ""),
      type: "button",
      onClick: () => applyRange(defaultRange(daysData, 7))
    }, "\u8FD17\u5929"),
    h("button", {
      className: "mf-dash-btn" + (start === initial.start && end === initial.end ? " mf-dash-on" : ""),
      type: "button",
      onClick: () => applyRange(defaultRange(daysData, 30))
    }, "\u8FD130\u5929"),
    h("button", {
      className: "mf-dash-btn" + (start === "" && end === "" ? " mf-dash-on" : ""),
      type: "button",
      onClick: () => applyRange({ start: "", end: "" })
    }, "\u5168\u90E8"),
    h("button", {
      className: "mf-dash-btn mf-dash-close",
      type: "button",
      title: "\u5173\u95ED",
      onClick: () => {
        if (onClose) onClose();
      }
    }, "\xD7")
  );
  const head = h(
    "div",
    { className: "mf-dash-head" },
    h("span", { className: "mf-dash-title" }, "\u5199\u4F5C\u8BB0\u5F55"),
    quickButtons
  );
  const toolbar = h(
    "div",
    { className: "mf-dash-toolbar" },
    h("span", { className: "mf-dash-label" }, "\u8D77\u59CB"),
    h("input", {
      className: "mf-dash-date",
      type: "date",
      value: start,
      onChange: (event) => changeStart(event.target.value)
    }),
    h("span", { className: "mf-dash-sep" }, "\u81F3"),
    h("input", {
      className: "mf-dash-date",
      type: "date",
      value: end,
      onChange: (event) => changeEnd(event.target.value)
    })
  );
  const statsBar = h(
    "div",
    { className: "mf-dash-stats" },
    h("strong", null, String(stats.days)),
    " \u5929 \xB7 \u5171 ",
    h("strong", null, String(stats.totalChars)),
    " \u5B57 \xB7 \u65E5\u5747 ",
    h("strong", null, String(stats.average)),
    " \u5B57"
  );
  let body = null;
  if (!rows.length) {
    body = h("div", { className: "mf-dash-empty" }, "\u8BE5\u8303\u56F4\u5185\u6682\u65E0\u5199\u4F5C\u8BB0\u5F55");
  } else {
    body = rows.map((row, index) => h(
      "div",
      {
        className: "mf-dash-row",
        key: row && row.date != null ? row.date : index
      },
      h("span", { className: "mf-dash-row-date" }, row.date),
      h("span", { className: "mf-dash-row-weekday" }, row.weekday ? "\u5468" + row.weekday : "\u2014"),
      h("span", { className: "mf-dash-row-chars" }, String(row.chars) + " \u5B57")
    ));
  }
  return h(
    "div",
    { className: "mf-dash-overlay", onClick: () => {
      if (onClose) onClose();
    } },
    h(
      "div",
      { className: "mf-dash-card", onClick: (event) => {
        if (event && event.stopPropagation) event.stopPropagation();
      } },
      head,
      toolbar,
      statsBar,
      h("div", { className: "mf-dash-body" }, body)
    )
  );
}

// plugin/src/client/skills-library.js
var reactBinding6 = null;
var reactResolved6 = false;
var WRITING_SKILL_LABELS = {
  "character-design": "\u89D2\u8272\u8BBE\u8BA1",
  "character-relationship": "\u89D2\u8272\u5173\u7CFB",
  "deslop-lexicon": "\u53BB\u5957\u8BDD\u8BCD\u5E93",
  "deslop-writing": "\u53BB\u6A21\u677F\u5316\u5199\u4F5C",
  "dialogue-design": "\u5BF9\u767D\u8BBE\u8BA1",
  "emotional-arc": "\u60C5\u611F\u5F27\u7EBF",
  "opening-design": "\u5F00\u7BC7\u8BBE\u8BA1",
  "prose-format": "\u884C\u6587\u683C\u5F0F",
  "reader-contract": "\u8BFB\u8005\u5951\u7EA6",
  "reversal-design": "\u53CD\u8F6C\u8BBE\u8BA1",
  "short-submission": "\u77ED\u7BC7\u6295\u7A3F",
  "story-deconstruction": "\u6545\u4E8B\u62C6\u89E3",
  "story-hooks": "\u6545\u4E8B\u94A9\u5B50",
  "story-quality": "\u6545\u4E8B\u8D28\u91CF",
  "story-state-tracking": "\u72B6\u6001\u8FFD\u8E2A",
  "villain-reveal": "\u53CD\u6D3E\u63ED\u793A",
  writing: "\u58A8\u6249\u5199\u4F5C"
};
function resolveReact6() {
  if (reactResolved6) return reactBinding6;
  reactResolved6 = true;
  const g = typeof globalThis !== "undefined" ? globalThis : null;
  let React = g && g.React;
  if (!React && typeof window !== "undefined") React = window.React;
  if (!React) {
    try {
      const req = typeof require === "function" ? require : g && g.__mfRequire;
      if (req) React = req("react");
    } catch (error) {
    }
  }
  if (!React && g && g.__mofeiReact) React = g.__mofeiReact;
  reactBinding6 = React && typeof React.createElement === "function" ? { h: React.createElement, useState: React.useState, useEffect: React.useEffect, useMemo: React.useMemo } : null;
  return reactBinding6;
}
function writingSkillLabel(name) {
  const normalized = String(name || "").replace(/^(mofei|openfic)-/, "");
  return WRITING_SKILL_LABELS[normalized] || normalized.replace(/-/g, " ");
}
function filterWritingSkills(skills, query) {
  const term = String(query || "").trim().toLowerCase();
  const list = Array.isArray(skills) ? skills : [];
  if (!term) return list;
  return list.filter((skill) => [skill && skill.name, skill && skill.description, skill && skill.whenToUse].join(" ").toLowerCase().includes(term));
}
var WRITING_SKILLS_CSS = [
  ".mf-sk-overlay{position:fixed;inset:0;z-index:132;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.46)}",
  ".mf-sk{width:min(980px,calc(100vw - 48px));height:min(760px,calc(100vh - 72px));display:grid;grid-template-rows:56px minmax(0,1fr);overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 22px 64px rgba(0,0,0,.4)}",
  ".mf-sk-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:0 18px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-sk-title{display:flex;align-items:baseline;gap:8px;min-width:0}.mf-sk-title strong{font-size:14px;font-weight:650}.mf-sk-title small{font-size:11px;color:var(--dsw-alias-label-secondary)}.mf-sk-head-actions{display:flex;align-items:center;gap:4px}.mf-sk-link{border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);padding:6px 8px;cursor:pointer;font:12px/1.2 sans-serif}.mf-sk-link:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.mf-sk-link.primary{color:var(--dsw-alias-state-business-primary)}.mf-sk-close{display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:18px/1 sans-serif}.mf-sk-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
  ".mf-sk-body{display:grid;grid-template-columns:300px minmax(0,1fr);min-height:0}.mf-sk-list{min-height:0;overflow:auto;border-right:1px solid var(--dsw-alias-border-l1);padding:10px}.mf-sk-search{box-sizing:border-box;width:100%;height:32px;margin:0 0 8px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-base);color:inherit;font:12px/1 sans-serif;outline:0}.mf-sk-search:focus{border-color:var(--dsw-alias-state-business-primary)}",
  ".mf-sk-item{display:block;width:100%;padding:8px 10px;border:0;border-radius:5px;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit}.mf-sk-item:hover{background:var(--dsw-alias-interactive-bg-hover)}.mf-sk-item.on{background:var(--dsw-alias-state-business-tertiary)}.mf-sk-item strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;text-transform:none}.mf-sk-item small{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:10.5px}.mf-sk-item-off{opacity:.45}",
  ".mf-sk-toggle{display:inline-flex;align-items:center;gap:5px;margin-top:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-tertiary);padding:2px 9px;cursor:pointer;font:11px/1.3 sans-serif}.mf-sk-toggle:hover{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary)}.mf-sk-toggle.on{color:var(--dsw-alias-state-success-primary);border-color:rgba(74,222,128,.35);background:var(--dsw-alias-state-success-tertiary)}.mf-sk-toggle.off{color:var(--dsw-alias-label-tertiary)}",
  ".mf-sk-section{margin:12px 2px 6px;color:var(--dsw-alias-label-tertiary);font-size:10.5px;font-weight:650;letter-spacing:.4px}",
  ".mf-sk-detail{min-width:0;min-height:0;overflow:auto;padding:26px 30px}.mf-sk-empty{display:grid;place-items:center;height:100%;color:var(--dsw-alias-label-secondary);font-size:12px}.mf-sk-kicker{font-size:11px;color:var(--dsw-alias-state-success-primary);font-weight:600}.mf-sk-kicker.off{color:var(--dsw-alias-label-tertiary)}.mf-sk-detail h2{margin:7px 0 8px;font-size:20px;line-height:1.3;font-weight:680;text-transform:none}.mf-sk-desc{max-width:660px;margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.7}.mf-sk-rule{height:1px;margin:22px 0;background:var(--dsw-alias-border-l1)}.mf-sk-section-label{margin:0 0 7px;color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:650}.mf-sk-when{margin:0;white-space:pre-wrap;font-size:13px;line-height:1.75}.mf-sk-content{margin:18px 0 0;padding:14px 16px;border-left:2px solid var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-elevated));white-space:pre-wrap;font:12px/1.72 ui-monospace,Consolas,monospace;max-height:280px;overflow:auto;color:var(--dsw-alias-label-secondary)}",
  ".mf-sk-form{position:fixed;inset:0;z-index:140;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.52)}.mf-sk-form-card{width:min(620px,calc(100vw - 40px));max-height:84vh;overflow:auto;display:grid;gap:10px;padding:20px 22px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 24px 70px rgba(0,0,0,.45)}.mf-sk-form-card h3{margin:0;font-size:14px}.mf-sk-form-card label{display:grid;gap:5px;font-size:11px;color:var(--dsw-alias-label-secondary)}.mf-sk-form-card input,.mf-sk-form-card textarea{box-sizing:border-box;width:100%;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:inherit;font:12px/1.6 sans-serif;outline:0}.mf-sk-form-card input:focus,.mf-sk-form-card textarea:focus{border-color:var(--dsw-alias-state-business-primary)}.mf-sk-form-card textarea{min-height:130px;resize:vertical;font:12px/1.7 ui-monospace,Consolas,monospace}.mf-sk-form-actions{display:flex;gap:8px;justify-content:flex-end}.mf-sk-form-msg{font-size:11px;color:var(--dsw-alias-state-warn-primary)}",
  "@media(max-width:760px){.mf-sk{width:100vw;height:100vh;border:0;border-radius:0}.mf-sk-body{grid-template-columns:1fr}.mf-sk-list{max-height:40vh;border-right:0;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-sk-detail{padding:20px}.mf-sk-content{max-height:180px}}"
].join("\n");
function ensureStyles() {
  if (typeof document === "undefined" || document.querySelector("style[data-mf-writing-skills]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-mf-writing-skills", "");
  style.textContent = WRITING_SKILLS_CSS;
  document.head.appendChild(style);
}
function WritingSkillsPanel(props) {
  ensureStyles();
  const resolved2 = resolveReact6();
  if (!resolved2) throw new Error("\u58A8\u6249 WritingSkillsPanel \u65E0\u6CD5\u89E3\u6790 React");
  const { h, useState, useEffect, useMemo } = resolved2;
  const open = !!(props && props.open);
  const skills = Array.isArray(props && props.skills) ? props.skills : [];
  const loading = !!(props && props.loading);
  const error = props && props.error ? String(props.error) : "";
  const onClose = props && props.onClose;
  const onOpenChains = props && props.onOpenChains;
  const onToggle = props && props.onToggle;
  const onCreateSkill = props && props.onCreateSkill;
  const onDeleteCustom = props && props.onDeleteCustom;
  const settings = props && props.settings || null;
  const disabled = new Set(settings && Array.isArray(settings.disabledSkills) ? settings.disabledSkills : []);
  const custom = Array.isArray(settings && settings.custom) ? settings.custom : [];
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formWhen, setFormWhen] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [formMsg, setFormMsg] = useState("");
  const filtered = useMemo(() => filterWritingSkills(skills, query), [skills, query]);
  const selected = filtered.find((skill) => skill && skill.name === selectedName) || filtered[0] || null;
  useEffect(() => {
    if (!open) return;
    if (!selectedName && skills[0]) setSelectedName(skills[0].name);
  }, [open, selectedName, skills]);
  if (!open) return null;
  const toggleFor = (name) => {
    if (typeof onToggle !== "function") return null;
    const enabled = !disabled.has(name);
    return h("button", { className: "mf-sk-toggle" + (enabled ? " on" : " off"), type: "button", title: enabled ? "\u70B9\u51FB\u7981\u7528\uFF08\u4E0B\u6B21\u65B0\u5EFA\u5199\u4F5C\u4F1A\u8BDD\u751F\u6548\uFF09" : "\u70B9\u51FB\u542F\u7528\uFF08\u4E0B\u6B21\u65B0\u5EFA\u5199\u4F5C\u4F1A\u8BDD\u751F\u6548\uFF09", onClick: (event) => {
      event.stopPropagation();
      onToggle(name, !enabled);
    } }, enabled ? "\u2713 \u5DF2\u542F\u7528" : "\u25CB \u5DF2\u7981\u7528");
  };
  const list = loading ? h("div", { className: "mf-sk-empty" }, "\u6B63\u5728\u8BFB\u53D6\u5199\u4F5C\u6307\u4EE4\u2026") : error ? h("div", { className: "mf-sk-empty" }, error) : filtered.length ? filtered.map((skill) => {
    const off = disabled.has(skill.name);
    return h(
      "button",
      { key: skill.name, className: "mf-sk-item" + (selected && selected.name === skill.name ? " on" : "") + (off ? " mf-sk-item-off" : ""), type: "button", onClick: () => setSelectedName(skill.name) },
      h("strong", null, writingSkillLabel(skill.name)),
      h("small", null, skill.description || "\u5199\u4F5C\u6307\u4EE4"),
      toggleFor(skill.name)
    );
  }) : h("div", { className: "mf-sk-empty" }, "\u6CA1\u6709\u5339\u914D\u7684\u5199\u4F5C\u6307\u4EE4");
  const detail = selected ? h(
    "article",
    { className: "mf-sk-detail" },
    h("div", { className: "mf-sk-kicker" + (disabled.has(selected.name) ? " off" : "") }, disabled.has(selected.name) ? "\u5DF2\u7981\u7528\uFF08\u65B0\u5EFA\u5199\u4F5C\u4F1A\u8BDD\u540E AI \u4E0D\u53EF\u89C1\uFF09" : "\u5DF2\u52A0\u8F7D\u81F3 mofei-writer \u5199\u4F5C\u52A9\u624B"),
    h("h2", null, writingSkillLabel(selected.name)),
    h("p", { className: "mf-sk-desc" }, selected.description || ""),
    h("div", { className: "mf-sk-rule" }),
    h("p", { className: "mf-sk-section-label" }, "\u9002\u7528\u573A\u666F"),
    h("p", { className: "mf-sk-when" }, selected.whenToUse || "\u5199\u4F5C\u52A9\u624B\u4F1A\u5728\u76F8\u5173\u4EFB\u52A1\u4E2D\u6309\u9700\u52A0\u8F7D\u3002"),
    selected.content ? h("pre", { className: "mf-sk-content" }, selected.content) : null,
    toggleFor(selected.name)
  ) : h("div", { className: "mf-sk-empty" }, loading ? "\u6B63\u5728\u8BFB\u53D6\u5199\u4F5C\u6307\u4EE4\u2026" : "\u9009\u62E9\u4E00\u9879\u6280\u80FD\u67E5\u770B\u8BE6\u60C5");
  const customBlock = custom.length ? h(
    "div",
    null,
    h("div", { className: "mf-sk-section" }, "\u81EA\u521B\u6280\u80FD\uFF08\u58A8\u6249\u79C1\u6709\u6307\u4EE4\u5E93\uFF09"),
    custom.map((item) => h(
      "div",
      { key: item.name, className: "mf-sk-item" + (selected && selected.name === item.name ? " on" : "") },
      h("strong", null, item.name),
      h("small", null, item.description || ""),
      h("span", { className: "mf-sk-toggle off", style: { pointerEvents: "none" } }, "\u81EA\u521B")
    ))
  ) : null;
  const submitForm = () => {
    if (!formName.trim() || !formDesc.trim()) {
      setFormMsg("\u540D\u79F0\u4E0E\u63CF\u8FF0\u5FC5\u586B");
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(formName.trim())) {
      setFormMsg("\u6307\u4EE4\u540D\u987B\u4E3A\u5C0F\u5199 kebab-case\uFF08\u5982 my-style-check\uFF09");
      return;
    }
    setFormBusy(true);
    setFormMsg("");
    const result = onCreateSkill({ name: formName.trim(), description: formDesc.trim(), whenToUse: formWhen.trim(), content: formContent });
    if (result && typeof result.then === "function") {
      result.then((value) => {
        setFormBusy(false);
        if (value && value.error) {
          setFormMsg(String(value.error));
        } else {
          setFormOpen(false);
          setFormName("");
          setFormDesc("");
          setFormWhen("");
          setFormContent("");
          if (props && props.onRefresh) props.onRefresh();
        }
      }).catch((failure) => {
        setFormBusy(false);
        setFormMsg("\u521B\u5EFA\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    } else {
      setFormBusy(false);
      setFormOpen(false);
      setFormName("");
      setFormDesc("");
      setFormWhen("");
      setFormContent("");
      if (props && props.onRefresh) props.onRefresh();
    }
  };
  const form = formOpen ? h(
    "div",
    { className: "mf-sk-form", role: "presentation", onClick: () => {
      if (!formBusy) setFormOpen(false);
    } },
    h(
      "div",
      { className: "mf-sk-form-card", role: "dialog", "aria-label": "\u65B0\u5EFA\u5199\u4F5C\u6307\u4EE4", onClick: (event) => event.stopPropagation() },
      h("h3", null, "\u65B0\u5EFA\u5199\u4F5C\u6307\u4EE4\uFF08\u5199\u5165 ~/.dsh/skills/\uFF0C\u4EC5\u4FDD\u5B58\u5728\u58A8\u6249\u9879\u76EE\u6570\u636E\u4E2D\uFF09"),
      h("label", null, "\u6307\u4EE4\u540D\uFF08\u5C0F\u5199 kebab-case\uFF0C\u5982 my-style-check\uFF09", h("input", { value: formName, placeholder: "my-style-check", onChange: (event) => setFormName(event.target.value) })),
      h("label", null, "\u63CF\u8FF0\uFF08\u5FC5\u586B\uFF09", h("input", { value: formDesc, placeholder: "\u4E00\u53E5\u8BDD\u8BF4\u660E\u8FD9\u4E2A\u6280\u80FD\u505A\u4EC0\u4E48", onChange: (event) => setFormDesc(event.target.value) })),
      h("label", null, "\u9002\u7528\u573A\u666F\uFF08whenToUse\uFF09", h("input", { value: formWhen, placeholder: "\u4F55\u65F6\u4F7F\u7528\uFF08\u5982\uFF1A\u5BA1\u7A3F\u65F6\u68C0\u67E5\u2026\uFF09", onChange: (event) => setFormWhen(event.target.value) })),
      h("label", null, "\u6307\u4EE4\u6B63\u6587\uFF08\u5B50\u4EE3\u7406\u88AB\u9009\u4E2D\u540E\u5F3A\u5236\u6CE8\u5165\u7684\u89C4\u5219\uFF09", h("textarea", { value: formContent, placeholder: "\u5199\u6280\u80FD\u89C4\u5219/\u7EA2\u7EBF/\u6B65\u9AA4\u2026", onChange: (event) => setFormContent(event.target.value) })),
      formMsg ? h("div", { className: "mf-sk-form-msg" }, formMsg) : null,
      h("div", { className: "mf-sk-form-actions" }, h("button", { className: "mf-sk-link", type: "button", onClick: () => setFormOpen(false) }, "\u53D6\u6D88"), h("button", { className: "mf-sk-link primary", type: "button", disabled: formBusy, onClick: submitForm }, formBusy ? "\u521B\u5EFA\u4E2D\u2026" : "\u521B\u5EFA\u6307\u4EE4"))
    )
  ) : null;
  return h(
    "div",
    { className: "mf-sk-overlay", role: "presentation", onClick: () => {
      if (onClose) onClose();
    } },
    h(
      "section",
      { className: "mf-sk", role: "dialog", "aria-label": "\u58A8\u6249\u5199\u4F5C\u6307\u4EE4", onClick: (event) => event.stopPropagation() },
      h("header", { className: "mf-sk-head" }, h("div", { className: "mf-sk-title" }, h("strong", null, "\u5199\u4F5C\u6307\u4EE4"), h("small", null, String(skills.length) + " \u9879\u5185\u7F6E\u80FD\u529B \xB7 " + String(custom.length) + " \u9879\u81EA\u521B")), h("div", { className: "mf-sk-head-actions" }, onOpenChains ? h("button", { className: "mf-sk-link", type: "button", onClick: onOpenChains }, "\u63D0\u793A\u8BCD\u94FE") : null, h("button", { className: "mf-sk-link primary", type: "button", onClick: () => {
        setFormOpen(true);
        setFormMsg("");
      } }, "\uFF0B \u65B0\u5EFA\u6280\u80FD"), h("button", { className: "mf-sk-close", type: "button", title: "\u5173\u95ED\u5199\u4F5C\u6307\u4EE4", onClick: () => {
        if (onClose) onClose();
      } }, "\xD7"))),
      h("div", { className: "mf-sk-body" }, h("aside", { className: "mf-sk-list" }, h("input", { className: "mf-sk-search", value: query, placeholder: "\u641C\u7D22\u6280\u80FD\u2026", onChange: (event) => setQuery(event.target.value) }), list, customBlock), detail),
      form
    )
  );
}

// plugin/src/client/settings-panel.js
var binding = null;
var resolved = false;
function react() {
  if (resolved) return binding;
  resolved = true;
  const g = typeof globalThis !== "undefined" ? globalThis : null;
  const R = g && g.React || typeof window !== "undefined" && window.React || g && g.__mofeiReact;
  binding = R && typeof R.createElement === "function" ? { h: R.createElement } : null;
  return binding;
}
var SETTINGS_PANEL_CSS = [
  ".mf-settings-overlay{position:fixed;inset:0;z-index:136;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.36);transform:none!important}",
  ".mf-settings{width:min(780px,calc(100vw - 40px));height:min(620px,calc(100vh - 64px));display:grid;grid-template-rows:52px minmax(0,1fr);overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 22px 64px rgba(0,0,0,.32)}",
  ".mf-settings-head{display:flex;align-items:center;gap:10px;padding:0 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-settings-head strong{font-size:14px}.mf-settings-head small{color:var(--dsw-alias-label-secondary);font-size:11px;flex:1}",
  ".mf-settings-body{display:grid;grid-template-columns:220px minmax(0,1fr);min-height:0}.mf-settings-nav{padding:10px;border-right:1px solid var(--dsw-alias-border-l1);overflow:auto}.mf-settings-nav button{display:flex;width:100%;align-items:flex-start;gap:9px;box-sizing:border-box;min-height:52px;padding:10px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;text-align:left;font:12px/1.35 sans-serif}.mf-settings-nav button:hover,.mf-settings-nav button.on{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.mf-settings-nav button>span{display:block;min-width:0;line-height:1.35}.mf-settings-nav button strong{display:block;color:inherit;font-size:12px;line-height:1.35;white-space:normal}.mf-settings-nav button small{display:block;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:1.35;margin-top:3px;white-space:normal}",
  ".mf-settings-content{padding:22px;overflow:auto}.mf-settings-content h3{margin:0 0 8px;font-size:16px}.mf-settings-content p{margin:0 0 18px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.7}.mf-settings-card{padding:14px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-elevated,var(--dsw-alias-bg-base));margin-bottom:10px}.mf-settings-card strong{display:block;font-size:13px}.mf-settings-card small{display:block;margin-top:5px;color:var(--dsw-alias-label-secondary);line-height:1.5}.mf-settings-action{margin-top:14px;padding:8px 12px;border:0;border-radius:6px;background:var(--dsw-alias-state-business-primary);color:#fff;cursor:pointer;font:12px/1.2 sans-serif}",
  ".mf-settings-action:disabled{opacity:.55;cursor:wait}.mf-settings-status{display:grid;gap:8px;margin-top:12px}.mf-settings-status-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base));font-size:11px;color:var(--dsw-alias-label-secondary)}.mf-settings-status-row strong{color:var(--dsw-alias-state-error-primary);font-weight:600;text-align:right;word-break:break-word}.mf-settings-status-row strong.ok{color:var(--dsw-alias-state-success-primary)}.mf-settings-error{display:block;color:var(--dsw-alias-state-error-primary);line-height:1.5;word-break:break-word}"
].join("");
function SettingsPanel(props) {
  const r = react();
  if (!r) return null;
  const h = r.h;
  const active = props && props.active ? props.active : "agents";
  const select = (id) => {
    if (props && props.onSelect) props.onSelect(id);
  };
  const close = () => {
    if (props && props.onClose) props.onClose();
  };
  const open = (name) => {
    if (props && props[name]) props[name]();
  };
  const items = [
    ["agents", "\u5B50\u4EE3\u7406", "\u6A21\u677F\u4E0E\u8C03\u5EA6\u5165\u53E3"],
    ["models", "\u5B50\u4EE3\u7406\u6A21\u578B", "\u4E13\u7528\u6A21\u578B\u4E0E\u901A\u7528\u6A21\u578B"],
    ["roles", "\u5B50\u4EE3\u7406\u63D0\u793A\u8BCD", "\u8EAB\u4EFD\u3001\u804C\u8D23\u4E0E\u8F93\u51FA\u5951\u7EA6"],
    ["instructions", "\u79C1\u6709\u5199\u4F5C\u6307\u4EE4", "\u9ED8\u8BA4\u6CE8\u5165\u4E0E\u4E13\u9879\u6307\u4EE4"],
    ["summary", "\u6458\u8981", "\u7AE0\u8282\u4E0E\u533A\u95F4\u6458\u8981"],
    ["chains", "\u63D0\u793A\u8BCD\u94FE", "\u53EF\u590D\u7528\u63D0\u793A\u8BCD\u6D41\u7A0B"],
    ["styles", "\u5199\u4F5C\u98CE\u683C", "\u9879\u76EE\u6587\u98CE\u4E0E\u6837\u5F0F"],
    ["retrieval", "\u68C0\u7D22\u6A21\u578B", "\u672C\u5730 Embedding \u4E0E Rerank"]
  ];
  let content;
  if (active === "retrieval") {
    const status = props && props.retrievalStatus;
    const line = (label, value, good) => h("div", { className: "mf-settings-status-row", key: label }, h("span", null, label), h("strong", { className: good ? "ok" : "" }, value));
    content = h("div", null, h("h3", null, "\u68C0\u7D22\u6A21\u578B"), h("p", null, "\u68C0\u7D22\u6A21\u578B\u72EC\u7ACB\u4E8E DSH \u804A\u5929\u6A21\u578B\u3002\u58A8\u6249\u5148\u7528\u672C\u5730 Embedding \u53EC\u56DE\uFF0C\u518D\u7528\u672C\u5730 Rerank \u91CD\u6392\uFF1B\u672A\u5C31\u7EEA\u65F6\u4F1A\u4FDD\u7559\u8BCD\u6CD5\u68C0\u7D22\u7ED3\u679C\u3002"), h("div", { className: "mf-settings-card mf-settings-status-card" }, h("strong", null, "\u672C\u5730\u8FD0\u884C\u72B6\u6001"), status ? h("div", { className: "mf-settings-status" }, line("Embedding", status.embeddingReady ? (status.embeddingModel || "\u672C\u5730\u6A21\u578B") + " \xB7 " + (status.embeddingDimensions || "?") + " \u7EF4" : "\u672A\u5C31\u7EEA", !!status.embeddingReady), line("Rerank", status.rerankReady ? status.rerankModel || "\u672C\u5730\u6A21\u578B" : status.rerankCachePresent === false ? "\u6A21\u578B\u7F13\u5B58\u672A\u627E\u5230" : "\u672A\u5C31\u7EEA", !!status.rerankReady), status.embeddingError ? h("small", { className: "mf-settings-error" }, "Embedding\uFF1A" + status.embeddingError) : null, status.rerankError ? h("small", { className: "mf-settings-error" }, "Rerank\uFF1A" + status.rerankError) : null) : h("small", null, props && props.retrievalBusy ? "\u68C0\u6D4B\u672C\u5730\u6A21\u578B\u4E2D\u2026" : "\u5C1A\u672A\u68C0\u6D4B"), h("button", { className: "mf-settings-action", type: "button", disabled: !!(props && props.retrievalBusy), onClick: () => props && props.onRefreshRetrieval && props.onRefreshRetrieval() }, props && props.retrievalBusy ? "\u68C0\u6D4B\u4E2D\u2026" : "\u5237\u65B0\u672C\u5730\u6A21\u578B\u72B6\u6001")));
  } else if (active === "models") content = h("div", null, h("h3", null, "\u5B50\u4EE3\u7406\u6A21\u578B"), h("p", null, "\u4E3A\u4E0D\u540C\u4E13\u4E1A\u5B50\u4EE3\u7406\u914D\u7F6E\u4E13\u7528\u6A21\u578B\uFF1B\u672A\u6307\u5B9A\u4E13\u7528\u6A21\u578B\u65F6\u4F7F\u7528\u901A\u7528\u6A21\u578B\u3002\u6A21\u578B\u914D\u7F6E\u7531\u58A8\u6249\u7EDF\u4E00\u7BA1\u7406\uFF0C\u4E0D\u7531\u4E2D\u63A7\u4E34\u65F6\u51B3\u5B9A\u3002"), h("div", { className: "mf-settings-card" }, h("strong", null, "\u6A21\u578B\u914D\u7F6E\u5165\u53E3"), h("small", null, "\u6A21\u578B\u7ED1\u5B9A\u5C06\u6309\u5B50\u4EE3\u7406\u6A21\u677F\u4FDD\u5B58\u3002\u5F53\u524D\u53EF\u4ECE\u5B50\u4EE3\u7406\u6A21\u677F\u8FDB\u5165\u914D\u7F6E\uFF1B\u8FD9\u91CC\u4F5C\u4E3A\u7EDF\u4E00\u8BBE\u7F6E\u5165\u53E3\u4FDD\u7559\u3002"), h("button", { className: "mf-settings-action", type: "button", onClick: () => open("onOpenModels") }, "\u6253\u5F00\u6A21\u578B\u914D\u7F6E")));
  else if (active === "agents") content = h("div", null, h("h3", null, "\u5B50\u4EE3\u7406"), h("p", null, "\u7BA1\u7406\u5B50\u4EE3\u7406\u6A21\u677F\u3001\u6A21\u578B\u3001\u9ED8\u8BA4\u5199\u4F5C\u6307\u4EE4\u548C\u672C\u6B21\u4EFB\u52A1\u7684\u8C03\u5EA6\u65B9\u5F0F\u3002"), h("div", { className: "mf-settings-card" }, h("strong", null, "\u5B50\u4EE3\u7406\u63D0\u793A\u8BCD"), h("small", null, "\u6A21\u677F\u51B3\u5B9A\u5B50\u4EE3\u7406\u8EAB\u4EFD\u4E0E\u804C\u8D23\uFF1B\u4E2D\u63A7\u53EA\u80FD\u4E3A\u5F53\u524D\u4EFB\u52A1\u8FFD\u52A0\u6307\u4EE4\uFF0C\u4E0D\u80FD\u79FB\u9664\u6A21\u677F\u9ED8\u8BA4\u6307\u4EE4\u3002"), h("button", { className: "mf-settings-action", type: "button", onClick: () => open("onOpenRoles") }, "\u7BA1\u7406\u5B50\u4EE3\u7406\u63D0\u793A\u8BCD")));
  else content = h("div", null, h("h3", null, items.find((item) => item[0] === active)?.[1] || "\u58A8\u6249\u8BBE\u7F6E"), h("p", null, items.find((item) => item[0] === active)?.[2] || "\u96C6\u4E2D\u7BA1\u7406\u58A8\u6249\u5199\u4F5C\u914D\u7F6E\u3002"), h("button", { className: "mf-settings-action", type: "button", onClick: () => open(active === "roles" ? "onOpenRoles" : active === "instructions" ? "onOpenInstructions" : active === "summary" ? "onOpenSummary" : active === "chains" ? "onOpenChains" : active === "styles" ? "onOpenStyles" : "onOpenRoles") }, "\u6253\u5F00\u6B64\u8BBE\u7F6E"));
  return h("div", { className: "mf-settings-overlay", onMouseDown: (event) => {
    if (event.target === event.currentTarget) close();
  } }, h("div", { className: "mf-settings", role: "dialog", "aria-label": "\u58A8\u6249\u8BBE\u7F6E" }, h("header", { className: "mf-settings-head" }, h("strong", null, "\u58A8\u6249\u8BBE\u7F6E"), h("small", null, "\u96C6\u4E2D\u7BA1\u7406\u5B50\u4EE3\u7406\u3001\u6307\u4EE4\u3001\u6458\u8981\u4E0E\u5199\u4F5C\u914D\u7F6E"), h("button", { className: "mf-action-icon", type: "button", title: "\u5173\u95ED", onClick: close }, "\xD7")), h("div", { className: "mf-settings-body" }, h("nav", { className: "mf-settings-nav" }, items.map((item) => h("button", { key: item[0], type: "button", className: active === item[0] ? "on" : "", onClick: () => select(item[0]) }, h("span", null, h("strong", null, item[1]), h("small", null, item[2]))))), h("main", { className: "mf-settings-content" }, content))));
}

// plugin/src/client/agent-models-panel.js
var AGENT_MODELS_PANEL_CSS = ".mf-models-overlay{position:fixed;inset:0;z-index:137;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.36)}.mf-models-panel{width:min(860px,calc(100vw - 40px));max-height:calc(100vh - 64px);display:grid;grid-template-rows:58px minmax(0,1fr) auto;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 22px 64px rgba(0,0,0,.32)}.mf-models-head{display:flex;align-items:center;gap:12px;padding:0 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-models-head>div{flex:1}.mf-models-head strong{display:block;font-size:14px}.mf-models-head small{display:block;margin-top:4px;color:var(--dsw-alias-label-secondary);font-size:11px}.mf-models-body{padding:18px;overflow:auto}.mf-model-card{padding:15px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;margin-bottom:12px}.mf-model-card h3{margin:0 0 6px;font-size:13px}.mf-model-card p{margin:0 0 14px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.6}.mf-model-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.mf-model-fields label,.mf-model-row input,.mf-model-row select{min-width:0;font-size:11px;color:var(--dsw-alias-label-secondary)}.mf-model-fields select,.mf-model-row select{display:block;max-width:100%;min-width:0;width:100%;box-sizing:border-box;margin-top:5px;padding:8px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);outline:0}.mf-model-row{display:grid;grid-template-columns:minmax(0,1.2fr) 70px minmax(0,1fr) minmax(0,1fr);gap:9px;align-items:end;min-width:0;padding:10px 0;border-top:1px solid var(--dsw-alias-border-l1)}.mf-model-role{min-width:0}.mf-model-role strong,.mf-model-role small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mf-model-role strong{font-size:12px}.mf-model-role small{margin-top:3px;color:var(--dsw-alias-label-tertiary);font-size:10px}.mf-model-check{display:flex;align-items:center;gap:5px;min-width:0;padding-bottom:8px;color:var(--dsw-alias-label-secondary);font-size:11px}.mf-model-row select:disabled{opacity:.45}.mf-model-actions{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l1)}@media(max-width:620px){.mf-models-panel{width:calc(100vw - 20px)}.mf-model-fields{grid-template-columns:1fr}.mf-model-row{grid-template-columns:1fr 70px}.mf-model-row select{grid-column:span 2}}";
var ReactRef = null;
function getReact() {
  if (ReactRef) return ReactRef;
  const g = typeof globalThis !== "undefined" ? globalThis : null;
  ReactRef = g && g.React || g && g.__mofeiReact || null;
  return ReactRef;
}
function providerEntries(catalog) {
  return catalog && Array.isArray(catalog.providers) ? catalog.providers : [];
}
function modelEntries(catalog, provider) {
  const item = providerEntries(catalog).find((entry) => entry.id === provider);
  return item && Array.isArray(item.models) ? item.models : [];
}
function option(h, value, label, key) {
  return h("option", { value, key: key || value }, label);
}
function ProviderSelect({ h, value, catalog, onChange, disabled }) {
  return h("select", { value: value || "", disabled, onChange: (event) => onChange(event.target.value) }, option(h, "", "\u9009\u62E9 Provider", "empty"), providerEntries(catalog).map((item) => option(h, item.id, item.name + " (" + item.id + ")", item.id)));
}
function ModelSelect({ h, value, provider, catalog, onChange, disabled }) {
  return h("select", { value: value || "", disabled: disabled || !provider, onChange: (event) => onChange(event.target.value) }, option(h, "", provider ? "\u9009\u62E9 Model" : "\u5148\u9009\u62E9 Provider", "empty"), modelEntries(catalog, provider).map((item) => option(h, item.id, item.name + (item.id === item.name ? "" : " (" + item.id + ")"), item.id)));
}
function AgentModelsPanel(props) {
  const React = getReact();
  if (!React) return null;
  const h = React.createElement;
  const roles = props && Array.isArray(props.roles) ? props.roles : [];
  const catalog = props && props.catalog ? props.catalog : { providers: [] };
  const initial = props && props.settings && typeof props.settings === "object" ? props.settings : { general: {}, byRole: {} };
  const [draft, setDraft] = React.useState(() => JSON.parse(JSON.stringify(initial)));
  React.useEffect(() => {
    setDraft(JSON.parse(JSON.stringify(initial)));
  }, [props && props.settings]);
  const general = draft.general || { provider: "", model: "" };
  const byRole = draft.byRole || {};
  const patchGeneral = (key, value) => setDraft((current) => ({ ...current, general: { ...current.general || {}, mode: "general", [key]: value } }));
  const patchRole = (id, key, value) => setDraft((current) => ({ ...current, byRole: { ...current.byRole || {}, [id]: { ...(current.byRole || {})[id] || {}, [key]: value } } }));
  const save = () => {
    if (props && props.onSave) props.onSave(draft);
  };
  const close = () => {
    if (props && props.onClose) props.onClose();
  };
  return h("div", { className: "mf-models-overlay", onMouseDown: (event) => {
    if (event.target === event.currentTarget) close();
  } }, h("div", { className: "mf-models-panel", role: "dialog", "aria-label": "\u5B50\u4EE3\u7406\u6A21\u578B\u8BBE\u7F6E" }, h("header", { className: "mf-models-head" }, h("div", null, h("strong", null, "\u5B50\u4EE3\u7406\u6A21\u578B"), h("small", null, "DSH \u5B9E\u65F6\u76EE\u5F55 \xB7 \u4E13\u7528\u6A21\u578B\u4F18\u5148\uFF0C\u672A\u914D\u7F6E\u65F6\u4F7F\u7528\u901A\u7528\u6A21\u578B")), h("button", { className: "mf-action-icon", type: "button", title: "\u5173\u95ED", onClick: close }, "\xD7")), h("main", { className: "mf-models-body" }, props && props.error ? h("div", { className: "mf-alert" }, props.error) : null, !providerEntries(catalog).length ? h("div", { className: "mf-alert" }, "\u5F53\u524D\u6CA1\u6709\u53EF\u7528\u7684 DSH \u6A21\u578B\u76EE\u5F55\uFF0C\u8BF7\u68C0\u67E5 Provider \u914D\u7F6E\u3002") : null, h("section", { className: "mf-model-card" }, h("h3", null, "\u901A\u7528\u6A21\u578B"), h("p", null, "\u6CA1\u6709\u4E13\u7528\u6A21\u578B\u7684\u5B50\u4EE3\u7406\uFF0C\u4EE5\u53CA\u666E\u901A\u5B50\u4EE3\u7406\uFF0C\u4F7F\u7528\u6B64\u6A21\u578B\u3002\u7559\u7A7A\u5219\u56DE\u9000\u5230 DSH \u9ED8\u8BA4\u6A21\u578B\u3002"), h("div", { className: "mf-model-fields" }, h("label", null, "Provider", h(ProviderSelect, { h, value: general.provider, catalog, onChange: (value) => {
    setDraft((current) => {
      const nextGeneral = { ...current.general || {}, mode: "general", provider: value };
      if (!modelEntries(catalog, value).some((item) => item.id === nextGeneral.model)) nextGeneral.model = "";
      return { ...current, general: nextGeneral };
    });
  } })), h("label", null, "Model", h(ModelSelect, { h, value: general.model, provider: general.provider, catalog, onChange: (value) => patchGeneral("model", value) })))), h("section", { className: "mf-model-card" }, h("h3", null, "\u4E13\u4E1A\u5B50\u4EE3\u7406"), h("p", null, "\u4ECE DSH \u5B9E\u65F6\u76EE\u5F55\u9009\u62E9 Provider \u548C Model\uFF1B\u542F\u7528\u4E13\u7528\u6A21\u578B\u540E\uFF0C\u5B83\u4F1A\u8986\u76D6\u901A\u7528\u6A21\u578B\u3002"), roles.length ? roles.map((role) => {
    const id = role.id;
    const item = byRole[id] || {};
    const dedicated = item.mode === "dedicated" || !!item.model;
    return h("div", { className: "mf-model-row", key: id }, h("div", { className: "mf-model-role" }, h("strong", null, role.name || id), h("small", null, id)), h("label", { className: "mf-model-check" }, h("input", { type: "checkbox", checked: dedicated, onChange: (event) => {
      if (event.target.checked) patchRole(id, "mode", "dedicated");
      else setDraft((current) => {
        const previous = (current.byRole || {})[id] || {};
        return { ...current, byRole: { ...current.byRole || {}, [id]: { ...previous, mode: "general", provider: "", model: "" } } };
      });
    } }), "\u4E13\u7528"), h(ProviderSelect, { h, value: item.provider, catalog, disabled: !dedicated, onChange: (value) => {
      patchRole(id, "provider", value);
      if (!modelEntries(catalog, value).some((entry) => entry.id === item.model)) patchRole(id, "model", "");
    } }), h(ModelSelect, { h, value: item.model, provider: item.provider, catalog, disabled: !dedicated, onChange: (value) => patchRole(id, "model", value) }));
  }) : h("div", { className: "mf-empty" }, "\u5F53\u524D\u9879\u76EE\u8FD8\u6CA1\u6709\u5B50\u4EE3\u7406\u6A21\u677F\uFF0C\u8BF7\u5148\u521B\u5EFA\u5B50\u4EE3\u7406\u63D0\u793A\u8BCD\u3002")), h("footer", { className: "mf-model-actions" }, h("button", { className: "mf-btn", type: "button", onClick: close }, "\u53D6\u6D88"), h("button", { className: "mf-btn mf-primary", type: "button", disabled: !!(props && props.busy), onClick: save }, props && props.busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u6A21\u578B\u914D\u7F6E")))));
}

// plugin/src/client/editor-limits.js
var MAX_EDITOR_CONTENT_LINES = 2e3;
var MAX_EDITOR_CONTENT_CHARACTERS = 1e5;
var LINE_SEPARATORS = /* @__PURE__ */ new Set([
  "\n",
  "\r",
  "\v",
  "\f",
  "",
  "",
  "",
  "\x85",
  "\u2028",
  "\u2029"
]);
function countEditorContentLines(content) {
  if (content === "") return 0;
  let separatorCount = 0;
  let endsWithSeparator = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index] ?? "";
    if (!LINE_SEPARATORS.has(character)) {
      endsWithSeparator = false;
      continue;
    }
    separatorCount += 1;
    if (character === "\r" && content[index + 1] === "\n") index += 1;
    endsWithSeparator = index === content.length - 1;
  }
  return endsWithSeparator ? separatorCount : separatorCount + 1;
}
function getEditorContentLimit(content) {
  const lineCount = countEditorContentLines(String(content ?? ""));
  const characterCount = Array.from(content ?? "").length;
  return {
    lineCount,
    characterCount,
    isWithinLimit: lineCount <= MAX_EDITOR_CONTENT_LINES && characterCount <= MAX_EDITOR_CONTENT_CHARACTERS
  };
}
function formatContentLimitError(limit) {
  const characterCount = Number(limit?.characterCount) || 0;
  const lineCount = Number(limit?.lineCount) || 0;
  return `\u6B63\u6587\u8D85\u51FA\u4E0A\u9650\uFF1A\u5F53\u524D ${characterCount} \u5B57 / ${MAX_EDITOR_CONTENT_CHARACTERS} \u5B57\uFF0C${lineCount} \u884C / ${MAX_EDITOR_CONTENT_LINES} \u884C\u3002\u8BF7\u62C6\u5206\u7AE0\u8282\u540E\u518D\u4FDD\u5B58\u3002`;
}

// plugin/src/client/agent-bridge.js
var MENTION_MAX_EXCERPT = 4e3;
function toText(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}
function truncateMention(text, max = MENTION_MAX_EXCERPT) {
  const s = toText(text).trim();
  const limit = typeof max === "number" && Number.isFinite(max) ? max : MENTION_MAX_EXCERPT;
  if (limit <= 0) return "";
  const points = Array.from(s);
  if (points.length <= limit) return s;
  return points.slice(0, limit).join("");
}
function hasValue(value) {
  return value !== void 0 && value !== null && value !== "";
}
function headerLine(projectTitle, chapterTitle) {
  const title = toText(projectTitle).trim() || "\u672A\u547D\u540D\u9879\u76EE";
  const chapter = toText(chapterTitle).trim() || "\u672A\u547D\u540D\u7AE0\u8282";
  return `\u3010\u58A8\u6249 \xB7 \u9879\u76EE\u300A${title}\u300B \xB7 \u7AE0\u8282\u300A${chapter}\u300B\u3011`;
}
function idLines(input, chapter) {
  const lines = [];
  if (hasValue(input.projectId)) lines.push(`projectId: ${input.projectId}`);
  if (hasValue(chapter.id)) lines.push(`chapterId: ${chapter.id}`);
  return lines;
}
var CHUNK_BOUNDARY = "---";
var FULL_FOOTER = "\u8BF7\u7528 mofei_read-chapter \u8BFB\u53D6\u8BE5\u7AE0\u8282\u5B8C\u6574\u5185\u5BB9\u540E\uFF0C\u7EE7\u7EED\u5199\u4F5C\u4EFB\u52A1\u3002";
var SELECTION_FOOTER = "\u8BF7\u9488\u5BF9\u4E0A\u9762\u9009\u4E2D\u6587\u672C\u5904\u7406\uFF08\u6DA6\u8272/\u6539\u5199/\u7EED\u5199\uFF0C\u7531\u4EFB\u52A1\u51B3\u5B9A\uFF09\uFF0C\u5E76\u7528 mofei_read-chapter \u6838\u5BF9\u5168\u6587\u4E00\u81F4\u6027\u3002";
function buildChapterMention(input) {
  const source = input == null ? {} : input;
  const chapter = source.chapter ?? {};
  const excerpt = hasValue(source.excerpt) ? source.excerpt : chapter.content;
  return [
    headerLine(source.projectTitle, chapter.title),
    ...idLines(source, chapter),
    "\u8303\u56F4: \u6574\u7AE0",
    CHUNK_BOUNDARY,
    truncateMention(excerpt),
    CHUNK_BOUNDARY,
    FULL_FOOTER
  ].join("\n");
}
function buildSelectionMention(input) {
  const source = input == null ? {} : input;
  const chapter = source.chapter ?? {};
  return [
    headerLine(source.projectTitle, chapter.title),
    ...idLines(source, chapter),
    "\u8303\u56F4: \u9009\u4E2D\u6587\u672C",
    CHUNK_BOUNDARY,
    truncateMention(source.selected),
    CHUNK_BOUNDARY,
    SELECTION_FOOTER
  ].join("\n");
}
var WRITER_HEADER = "\u3010\u58A8\u6249 Writer \u4EFB\u52A1\u3011\u8BF7\u4F5C\u4E3A Writer \u5904\u7406\u672C\u7AE0\uFF1A\u5148 mofei_read-chapter \u8BFB\u53D6\uFF08\u62FF revision\uFF09\uFF0C\u9075\u5B88 mofei-writing \u6280\u80FD\u7EA2\u7EBF\uFF08\u4E0D\u6362\u76AE\u3001\u4FE1\u606F\u5DEE\u3001\u4E00\u81F4\u6027\u3001\u51B2\u7A81\u4FDD\u62A4\uFF09\uFF0C\u5B8C\u6210\u540E\u7528 mofei_update-chapter \u63D0\u4EA4\u5E76\u4F20 expectedRevision\u3002";
var REVIEWER_HEADER = "\u3010\u58A8\u6249 Reviewer \u4EFB\u52A1\u3011\u8BF7\u4F5C\u4E3A Reviewer \u5BA1\u9605\u672C\u7AE0\uFF1A\u7528 mofei_read-chapter \u8BFB\u53D6\uFF0C\u7528 mofei_search-chapters \u6838\u5BF9\u8BBE\u5B9A\u4E00\u81F4\u6027\u3002\u8F93\u51FA\u95EE\u9898\u6E05\u5355\uFF08\u4E25\u91CD\u5EA6 + \u4F4D\u7F6E + \u5EFA\u8BAE\uFF09\uFF0C\u4E0D\u8981\u76F4\u63A5\u6539\u6B63\u6587\uFF1B\u82E5\u65E0\u95EE\u9898\u8F93\u51FA\u300CPASS\u300D\u3002";
function buildWriterMention(input) {
  const source = input == null ? {} : input;
  return [WRITER_HEADER, "", buildChapterMention(source)].join("\n");
}
function buildReviewerMention(input) {
  const source = input == null ? {} : input;
  return [REVIEWER_HEADER, "", buildChapterMention(source)].join("\n");
}

// plugin/src/client/worldbook-tools.js
function idOf(item) {
  if (typeof item === "string") return item;
  if (item && typeof item === "object" && !Array.isArray(item) && typeof item.id === "string") return item.id;
  return null;
}
function toIdList(input) {
  if (input instanceof Set) return Array.from(input).map(idOf).filter((id) => typeof id === "string" && id);
  if (!Array.isArray(input)) return [];
  const list = [];
  const seen = /* @__PURE__ */ new Set();
  input.forEach((item) => {
    const id = idOf(item);
    if (typeof id === "string" && id && !seen.has(id)) {
      seen.add(id);
      list.push(id);
    }
  });
  return list;
}
function indexEntries(entries) {
  const byId = /* @__PURE__ */ new Map();
  if (Array.isArray(entries)) {
    entries.forEach((entry) => {
      if (entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.id === "string" && entry.id) {
        byId.set(entry.id, entry);
      }
    });
  }
  return byId;
}
function filterWorldEntries(entries, query) {
  if (!Array.isArray(entries)) return [];
  const q = typeof query === "string" ? query.trim().toLowerCase() : "";
  return entries.filter((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    if (!q) return true;
    if (typeof entry.name === "string" && entry.name.toLowerCase().includes(q)) return true;
    if (Array.isArray(entry.keys)) {
      return entry.keys.some((key) => typeof key === "string" && key.toLowerCase().includes(q));
    }
    return false;
  });
}
function worldNameConflict(entries, name, excludeId) {
  if (!Array.isArray(entries)) return null;
  const target = typeof name === "string" ? name.trim().toLowerCase() : "";
  if (!target) return null;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    if (typeof excludeId === "string" && excludeId && entry.id === excludeId) continue;
    const candidate = typeof entry.name === "string" ? entry.name.trim().toLowerCase() : "";
    if (candidate && candidate === target) return entry;
  }
  return null;
}
function toggleAllSelection(entries, selected, visible) {
  const entryIds = Array.isArray(entries) ? entries.map(idOf).filter((id) => typeof id === "string" && id) : [];
  const selectedSet = new Set(toIdList(selected));
  const entryIdSet = new Set(entryIds);
  const visibleIds = toIdList(visible).filter((id) => entryIdSet.has(id));
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  if (allSelected) return [];
  const visibleSet = new Set(visibleIds);
  const union = [];
  const seen = /* @__PURE__ */ new Set();
  entryIds.forEach((id) => {
    if ((selectedSet.has(id) || visibleSet.has(id)) && !seen.has(id)) {
      seen.add(id);
      union.push(id);
    }
  });
  selectedSet.forEach((id) => {
    if (!seen.has(id)) {
      seen.add(id);
      union.push(id);
    }
  });
  return union;
}
function buildBulkTogglePlan(entries, selectedIds, isEnabled) {
  if (!Array.isArray(entries)) return { entryIds: [], changed: 0 };
  const byId = indexEntries(entries);
  const ids = toIdList(selectedIds).filter((id) => byId.has(id));
  const target = isEnabled === true;
  const entryIds = [];
  ids.forEach((id) => {
    const entry = byId.get(id);
    const current = entry.isEnabled !== false;
    if (current !== target) entryIds.push(id);
  });
  return { entryIds, changed: entryIds.length };
}
function buildBulkDeletePlan(entries, selectedIds) {
  if (!Array.isArray(entries)) return { entryIds: [], count: 0 };
  const byId = indexEntries(entries);
  const entryIds = toIdList(selectedIds).filter((id) => byId.has(id));
  return { entryIds, count: entryIds.length };
}

// plugin/src/client/layout.js
var LAYOUT_DEFAULTS = { left: 210, middle: 250 };
var LAYOUT_MIN = { left: 180, middle: 180 };
var LAYOUT_MAX = { left: 420, middle: 640 };
var EDITOR_MIN = 320;
var FALLBACK_CONTAINER_WIDTH = 1240;
var DEFAULT_STORAGE_KEY = "mofei.layout";
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function toFieldValue(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const num = Number(value);
    if (Number.isFinite(num) && num >= 0) return num;
  }
  return fallback;
}
function toContainerWidth(containerWidth) {
  if (typeof containerWidth === "number" && Number.isFinite(containerWidth) && containerWidth > 0) return containerWidth;
  if (typeof containerWidth === "string" && containerWidth.trim() !== "") {
    const num = Number(containerWidth);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return FALLBACK_CONTAINER_WIDTH;
}
function normalizeLayout(input, containerWidth) {
  const width = toContainerWidth(containerWidth);
  let left = LAYOUT_DEFAULTS.left;
  let middle = LAYOUT_DEFAULTS.middle;
  if (input !== null && input !== void 0 && typeof input === "object" && !Array.isArray(input)) {
    left = toFieldValue(input.left, left);
    middle = toFieldValue(input.middle, middle);
  }
  left = clamp(left, LAYOUT_MIN.left, LAYOUT_MAX.left);
  middle = clamp(middle, LAYOUT_MIN.middle, LAYOUT_MAX.middle);
  const available = width - EDITOR_MIN;
  if (left + middle > available) {
    const total = left + middle;
    if (total > 0 && available > 0) {
      const scale = available / total;
      left = clamp(Math.round(left * scale), LAYOUT_MIN.left, LAYOUT_MAX.left);
      middle = clamp(available - left, LAYOUT_MIN.middle, LAYOUT_MAX.middle);
    }
  }
  return { left, middle };
}
function nextLayout(current, axis, delta, containerWidth) {
  const base = normalizeLayout(current, containerWidth);
  const width = toContainerWidth(containerWidth);
  const d = typeof delta === "number" && Number.isFinite(delta) ? delta : 0;
  if (axis === "left") {
    let left = base.left + d;
    left = clamp(left, LAYOUT_MIN.left, LAYOUT_MAX.left);
    const cap = width - EDITOR_MIN - base.middle;
    if (cap >= LAYOUT_MIN.left) left = Math.min(left, cap);
    else left = LAYOUT_MIN.left;
    return { left, middle: base.middle };
  }
  if (axis === "middle") {
    let middle = base.middle + d;
    middle = clamp(middle, LAYOUT_MIN.middle, LAYOUT_MAX.middle);
    const cap = width - EDITOR_MIN - base.left;
    if (cap >= LAYOUT_MIN.middle) middle = Math.min(middle, cap);
    else middle = LAYOUT_MIN.middle;
    return { left: base.left, middle };
  }
  return base;
}
function loadLayout(storage, key) {
  const storageKey = key || DEFAULT_STORAGE_KEY;
  try {
    if (storage && typeof storage.getItem === "function") {
      const raw = storage.getItem(storageKey);
      if (raw !== null && raw !== void 0) return normalizeLayout(JSON.parse(raw));
    }
  } catch (error) {
  }
  return { left: LAYOUT_DEFAULTS.left, middle: LAYOUT_DEFAULTS.middle };
}
function saveLayout(storage, key, layout) {
  const storageKey = key || DEFAULT_STORAGE_KEY;
  try {
    if (storage && typeof storage.setItem === "function") {
      storage.setItem(storageKey, JSON.stringify(normalizeLayout(layout)));
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

// plugin/src/client/workspace-utils.js
function fmtTime(at) {
  try {
    return new Date(at).toLocaleString();
  } catch (error) {
    return String(at);
  }
}
function dateKey(date) {
  return String(date.getFullYear()) + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}
function countWords(text) {
  return String(text).replace(/\s+/g, "").length;
}

// plugin/src/client/chat-utils.js
function chatTextOf(blocks) {
  const out = [];
  (Array.isArray(blocks) ? blocks : []).forEach((block) => {
    if (block && block.type === "text" && typeof block.text === "string") out.push(block.text);
  });
  return out.join("\n");
}
function chatTextOfBlocks(blocks) {
  const out = [];
  (Array.isArray(blocks) ? blocks : []).forEach((block) => {
    if (block && block.kind === "text" && typeof block.text === "string") out.push(block.text);
  });
  return out.join("\n");
}
function chatToolsOf(blocks) {
  return (Array.isArray(blocks) ? blocks : []).filter((block) => block && block.kind === "tool-call").map((block) => ({ name: block.name, args: block.argsRaw }));
}
function normalizeChatItems(snap) {
  const items = [];
  if (!snap || typeof snap !== "object") return items;
  (Array.isArray(snap.nodes) ? snap.nodes : []).forEach((node) => {
    if (!node || typeof node !== "object") return;
    if (node.kind === "user" || node.kind === "steering") {
      items.push({ key: "n" + node.seq + node.kind, kind: "user", text: chatTextOf(node.content) || "\uFF08\u7A7A\u6D88\u606F\uFF09" });
    } else if (node.kind === "assistant") {
      items.push({ key: "n" + node.seq, kind: "assistant", text: chatTextOfBlocks(node.blocks), tools: chatToolsOf(node.blocks) });
    } else if (node.kind === "tool-result") {
      items.push({ key: "n" + node.seq, kind: "tool", name: node.call ? node.call.name : node.callId, ok: !node.isError, text: chatTextOf(node.content).slice(0, 200) });
    } else if (node.kind === "command") {
      items.push({ key: "n" + node.seq, kind: "meta", text: "\u547D\u4EE4 /" + (node.name || "?") + (node.outcome ? node.outcome.kind === "success" ? " \u5B8C\u6210" : " \u51FA\u9519" : " \u6267\u884C\u4E2D") });
    } else if (node.kind === "turn-error") {
      items.push({ key: "n" + node.seq, kind: "meta", text: "\u26A0 \u56DE\u5408\u51FA\u9519" });
    } else if (node.kind === "turn-max-tokens") {
      items.push({ key: "n" + node.seq, kind: "meta", text: "\u26A0 \u8FBE\u5230 token \u4E0A\u9650" });
    } else if (node.kind === "compaction") {
      items.push({ key: "n" + node.seq, kind: "meta", text: "\u2702 \u4E0A\u4E0B\u6587\u538B\u7F29" + (node.summary ? "\uFF1A" + String(node.summary).slice(0, 80) : "") });
    }
  });
  if (snap.partial && typeof snap.partial === "object") {
    items.push({ key: "partial", kind: "assistant", text: chatTextOfBlocks(snap.partial.blocks), streaming: true });
  }
  ;
  (Array.isArray(snap.runningCalls) ? snap.runningCalls : []).forEach((call) => {
    items.push({ key: "call" + call.callId, kind: "tool", name: call.name, ok: null, running: true, text: "" });
  });
  return items;
}

// plugin/src/client/legacy.js
function createClient(require2) {
  const module = { exports: {} };
  const exports = module.exports;
  const React = require2("react");
  const h = React.createElement;
  try {
    if (typeof globalThis !== "undefined") globalThis.__mofeiReact = React;
  } catch (bindError) {
  }
  function call(method, args) {
    return fetch("/api/mofei", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method, args: args || {} })
    }).then((r) => r.json()).then((j) => {
      if (!j || j.ok !== true) throw new Error(j && j.error || "\u58A8\u6249 rpc failed");
      return j.value;
    });
  }
  function timedCall(method, args, ms) {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          resolve(null);
        }
      }, ms);
      call(method, args).then((value) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(value);
        }
      }, () => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(null);
        }
      });
    });
  }
  function dshCall(method, payload) {
    const rpcId = "mofei-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    return fetch("/api/" + method, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId, method, payload: payload || {} })
    }).then(async (response) => {
      const body = await response.json();
      const result = body && body.result;
      if (!response.ok || !result || result.ok !== true) throw new Error(result && result.error || "DSH_RPC_FAILED:" + method);
      return result.value;
    });
  }
  const css = [
    "body.mf-standalone{--dsw-alias-bg-base:rgb(21,21,23);--dsw-alias-bg-layer-1:rgb(35,35,36);--dsw-alias-bg-layer-2:rgb(44,44,46);--dsw-alias-bg-elevated:rgb(44,44,46);--dsw-alias-bg-overlay:rgb(97,102,107);--dsw-alias-label-primary:rgb(249,250,251);--dsw-alias-label-secondary:rgb(207,211,214);--dsw-alias-label-tertiary:rgb(173,178,184);--dsw-alias-border-l1:rgba(255,255,255,.06);--dsw-alias-border-l2:rgba(255,255,255,.12);--dsw-alias-interactive-bg-hover:rgba(255,255,255,.08);--dsw-alias-state-business-primary:rgb(103,158,254);--dsw-alias-state-business-tertiary:rgb(52,65,91);--dsw-alias-state-success-primary:rgb(34,197,94);--dsw-alias-state-warn-primary:rgb(251,191,36);--dsw-alias-state-warning-primary:rgb(251,191,36);--dsw-alias-state-error-primary:rgb(242,90,90);--dsw-specific-bubble:rgb(44,44,46);--dsw-specific-input-major:rgb(44,44,46);background:rgb(21,21,23);color:rgb(249,250,251);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Hiragino Sans GB,Microsoft YaHei,Helvetica Neue,Helvetica,Arial,sans-serif;color-scheme:dark}",
    "body.mf-standalone button,body.mf-standalone input,body.mf-standalone textarea,body.mf-standalone select{font-family:inherit}",
    ".mf-open{pointer-events:auto;border:0;border-radius:6px;background:var(--dsw-alias-state-business-primary);color:#fff;padding:8px 12px;cursor:pointer;font:600 13px/1.2 sans-serif}",
    ".mf-card{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0}.mf-card span{font-size:12px;color:var(--dsw-alias-label-secondary)}",
    ".mf-float{position:fixed;right:16px;bottom:16px;z-index:80;pointer-events:auto;box-shadow:0 8px 28px rgba(0,0,0,.25)}",
    ".mf-side{display:flex;align-items:center;gap:8px;height:36px;padding:0 10px;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer;font:inherit}.mf-mark{display:grid;place-items:center;width:24px;height:24px;border:1px solid currentColor;border-radius:5px;font-size:10px;font-weight:700}",
    ".mf-overlay{position:fixed;inset:0;z-index:100;pointer-events:auto;display:flex;justify-content:flex-end;background:rgba(0,0,0,.32)}",
    ".mf-panel{width:100vw;height:100vh;margin:0;display:grid;grid-template-rows:52px minmax(0,1fr);overflow:hidden;border:0;border-radius:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:none}",
    ".mf-view-root{flex:1;min-height:0;display:flex;flex-direction:column}.mf-panel.mf-view{flex:1;min-height:0;height:auto;width:100%;border:0;border-radius:0;box-shadow:none}",
    ".mf-head,.mf-sh,.mf-eh,.mf-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-head strong{font-size:15px}.mf-head small{margin-left:10px;color:var(--dsw-alias-label-secondary)}",
    ".mf-close{border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer}",
    ".mf-body{display:grid;grid-template-columns:48px var(--mf-left,210px) 6px var(--mf-middle,250px) 6px minmax(0,1fr) var(--mf-chat,340px);min-height:0}.mf-body.no-chat{grid-template-columns:48px var(--mf-left,210px) 6px var(--mf-middle,250px) 6px minmax(0,1fr)}",
    ".mf-chat{display:flex;min-width:0;min-height:0;flex-direction:column;border-left:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-elevated,transparent)}.mf-chat-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12.5px;font-weight:650}.mf-chat-head>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mf-chat-head small{font-weight:400;color:var(--dsw-alias-label-tertiary);font-size:10.5px}.mf-chat-body{flex:1;min-height:0;min-width:0;overflow-x:hidden;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:10px}.mf-chat-msg{max-width:min(525px,82%);min-width:0;padding:10px 16px;border-radius:22px;font-size:12.5px;line-height:1.65;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;box-sizing:border-box;display:flex;flex-direction:column;gap:6px}.mf-chat-msg.user{align-self:flex-end;background:var(--dsw-specific-bubble,var(--dsw-alias-state-business-primary));color:var(--dsw-alias-label-primary)}.mf-chat-msg.assistant{align-self:flex-start;background:var(--dsw-alias-interactive-bg-hover)}.mf-chat-msg .mf-chat-src{display:block;font-size:10px;opacity:.7;margin-bottom:2px}.mf-chat-tool{font-size:11px;color:var(--dsw-alias-label-secondary);padding:4px 8px;border:1px dashed var(--dsw-alias-border-l1);border-radius:6px;align-self:flex-start;max-width:100%;min-width:0;box-sizing:border-box;overflow-wrap:anywhere}.mf-chat-tool .mf-chat-tool-ok{color:#4ade80}.mf-chat-tool .mf-chat-tool-err{color:#f87171}.mf-chat-input{display:flex;gap:6px;padding:8px;border-top:1px solid var(--dsw-alias-border-l1)}.mf-chat-input textarea{flex:1;min-width:0;min-height:44px;max-height:120px;resize:vertical;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:22px;background:var(--dsw-alias-bg-base);color:inherit;font:12px/1.6 sans-serif;padding:10px 14px}.mf-chat-input button{flex:none}.mf-chat-empty{color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:1.7;padding:4px 2px}",
    ".mf-activity{display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 0;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-elevated,transparent);overflow-y:auto}.mf-act{display:flex;flex-direction:column;align-items:center;gap:3px;width:46px;padding:8px 0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:17px;line-height:1}.mf-act:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.mf-act.on{background:var(--dsw-alias-state-business-primary);color:#fff}.mf-act span{font-size:9.5px;font-weight:650;line-height:1.2;max-width:44px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mf-act-bottom{margin-top:auto}",
    ".mf-gutter{flex:0 0 6px;width:6px;min-width:6px;cursor:col-resize;background:transparent;border:0;padding:0;z-index:1}",
    ".mf-gutter:hover,.mf-gutter.dragging{background:var(--dsw-alias-state-business-primary);opacity:.55}",
    ".mf-body.resizing{user-select:none}",
    ".mf-world-tools{display:grid;gap:6px;padding:8px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-world-search{box-sizing:border-box;width:100%;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:12px}.mf-world-batch{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary)}.mf-world-selall{display:inline-flex;align-items:center;gap:4px;cursor:pointer}.mf-wcheck,.mf-wselect-all{accent-color:var(--dsw-alias-state-business-primary)}.mf-danger{color:#dc2626;border-color:rgba(220,38,38,.45)}.mf-bridge-note{font-size:11px;color:#2563eb;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".mf-col{display:flex;min-width:0;min-height:0;flex-direction:column;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-elevated,transparent)}",
    ".mf-tabs{display:flex;gap:4px;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-tab{flex:1;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);padding:5px 0;cursor:pointer;font:600 12px/1.2 sans-serif}.mf-tab.on{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
    ".mf-sh,.mf-eh{height:46px;font-size:12px;font-weight:650}.mf-eh-actions{display:flex;align-items:center;gap:8px}",
    ".mf-list{overflow:auto;padding:8px}",
    ".mf-item{display:block;width:100%;min-width:0;padding:6px 8px;border:0;border-radius:5px;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit;transition:background .12s ease,opacity .12s ease}.mf-item:hover,.mf-item.on{background:var(--dsw-alias-interactive-bg-hover)}.mf-item.on{font-weight:650}.mf-item.dragging{opacity:.45}.mf-item.drop-target{outline:1px dashed var(--dsw-alias-state-business-primary)}.mf-item small{display:block;margin-top:3px;color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:400}",
    ".mf-row{display:flex;align-items:center;gap:6px;width:100%;min-width:0}.mf-title{flex:1;min-width:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mf-minis{display:flex;gap:4px;flex-shrink:0}",
    ".mf-mini{display:grid;place-items:center;min-width:24px;height:22px;padding:0 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;line-height:1;transition:background .12s ease,color .12s ease}.mf-mini:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.mf-mini.danger{color:var(--dsw-alias-state-error-primary,var(--dsw-alias-label-tertiary));border-color:rgba(224,117,110,.35)}.mf-mini.danger:hover{background:var(--dsw-alias-interactive-bg-hover-danger)}.mf-mini.danger.armed{background:rgba(224,117,110,.2);color:var(--dsw-alias-state-error-primary)}.mf-mini.on{background:var(--dsw-alias-state-business-primary);border-color:transparent;color:#fff}",
    ".mf-vol{font-weight:650;font-size:12px;padding:6px 8px 2px;color:var(--dsw-alias-label-secondary)}.mf-vol-head{display:flex;align-items:center;gap:5px}.mf-vol-head .mf-title{font-weight:650;color:var(--dsw-alias-label-primary)}.mf-vol small{margin-left:4px;font-weight:400;color:var(--dsw-alias-label-secondary);font-size:11px}.mf-vol-children{margin-left:10px;border-left:1px solid var(--dsw-alias-border-l1);padding-left:4px}",
    ".mf-btn{border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-base);color:inherit;padding:6px 9px;cursor:pointer;font:inherit;transition:background .12s ease,opacity .12s ease}.mf-btn:disabled{opacity:.5}.mf-primary{border-color:transparent;background:var(--dsw-alias-state-business-primary);color:#fff}",
    ".mf-form{display:grid;gap:7px;padding:9px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-input{box-sizing:border-box;width:100%;padding:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit}.mf-rename{min-width:0;padding:4px 6px;font-size:12px}",
    ".mf-goal{padding:6px 9px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-goal-btn{width:100%;border:1px dashed var(--dsw-alias-border-l1);border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);padding:6px;cursor:pointer;font:inherit;font-size:11px}",
    ".mf-empty{padding:18px 14px;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.8}",
    ".mf-editor{display:flex;min-width:0;min-height:0;height:100%;flex-direction:column}.mf-editor-pane{display:flex;flex:1 1 auto;min-width:0;min-height:0;flex-direction:column}.mf-status{font-size:11px;color:var(--dsw-alias-label-secondary)}.mf-status.unsaved{color:#b45309}.mf-status.saving{color:#2563eb}.mf-status.error{color:#dc2626}",
    ".mf-title-input{box-sizing:border-box;width:100%;padding:12px 18px;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:700 17px/1.4 ui-serif,Georgia,serif;outline:0}",
    ".mf-alert{padding:10px 14px;border-bottom:1px solid rgba(220,38,38,.25);background:rgba(220,38,38,.08);color:#dc2626;font-size:12px}.mf-actions{display:flex;gap:7px;margin-top:8px}",
    ".mf-text{box-sizing:border-box;width:100%;flex:1;min-height:0;resize:none;border:0;outline:0;background:var(--dsw-alias-bg-base);color:inherit;padding:28px clamp(20px,6vw,72px);font:16px/1.85 ui-serif,Georgia,serif}",
    ".mf-hist{max-height:240px;overflow:auto;border-bottom:1px solid var(--dsw-alias-border-l1);padding:8px}.mf-hist-head{display:flex;align-items:center;justify-content:space-between;padding:2px 6px 8px;font-size:12px;font-weight:650}.mf-hist-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 8px;border-radius:5px}.mf-hist-item:hover{background:var(--dsw-alias-interactive-bg-hover)}.mf-hist-meta{display:flex;align-items:center;gap:10px;min-width:0}.mf-hist-meta strong{font-size:12px}.mf-hist-meta span{color:var(--dsw-alias-label-secondary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".mf-foot{flex:0 0 38px;height:38px;min-height:38px;padding:0 14px;border-top:1px solid var(--dsw-alias-border-l1);border-bottom:0;color:var(--dsw-alias-label-secondary);font-size:11.5px;overflow:hidden}.mf-stat{display:inline-flex;gap:12px;min-width:0;white-space:nowrap}.mf-context-status{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary)}",
    ".mf-search{padding:8px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-search input{box-sizing:border-box;width:100%;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:12px}.mf-sr-item{padding:6px 4px;border-bottom:1px dashed var(--dsw-alias-border-l1)}.mf-sr-item strong{font-size:12px}.mf-sr-line{color:var(--dsw-alias-label-secondary);font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".mf-sel{font:inherit;font-size:11px;border:1px solid var(--dsw-alias-border-l1);border-radius:4px;background:var(--dsw-alias-bg-base);color:inherit;max-width:110px}",
    ".mf-import{position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4)}.mf-import-card{width:min(560px,calc(100vw - 32px));max-height:82vh;overflow:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:16px;display:grid;gap:10px;box-shadow:0 20px 60px rgba(0,0,0,.3)}.mf-import-card h3{margin:0;font-size:14px}.mf-imp-vol{padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;font-size:12px}.mf-import-card small{color:var(--dsw-alias-label-secondary);font-size:11px}.mf-import-actions{display:flex;gap:8px;justify-content:flex-end}",
    ".mf-tabs2{display:flex;gap:4px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);overflow-x:auto}.mf-tab2{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:transparent;color:inherit;padding:3px 8px;font-size:12px;cursor:pointer;white-space:nowrap}.mf-tab2.on{background:var(--dsw-alias-interactive-bg-hover)}.mf-tab2.dragging{opacity:.45}.mf-tab2.drop-target{outline:1px dashed var(--dsw-alias-state-business-primary)}.mf-tab2 .mf-tabx{border:0;background:transparent;color:inherit;cursor:pointer;font-size:11px;padding:0 2px;border-radius:3px}.mf-tab2 .mf-tabx:hover{background:rgba(220,38,38,.25)}.mf-tab2 .mf-tab-kind{font-size:9px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:3px;padding:0 3px}.mf-tab2 .mf-tab-pin{font-size:10px;color:var(--dsw-alias-state-warn-primary)}.mf-tabmenu{position:absolute;z-index:140;min-width:150px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;box-shadow:0 12px 36px rgba(0,0,0,.3);padding:4px;display:grid;gap:2px}.mf-tabmenu button{display:block;width:100%;text-align:left;border:0;background:transparent;color:inherit;padding:6px 10px;border-radius:4px;cursor:pointer;font:inherit;font-size:12px}.mf-tabmenu button:hover{background:var(--dsw-alias-interactive-bg-hover)}",
    ".mf-findbar{display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap}.mf-findbar input{box-sizing:border-box;width:170px;padding:5px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:4px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:12px}.mf-findbar input.mf-find-repl{width:150px}.mf-findbar span{font-size:11px;color:var(--dsw-alias-label-secondary);min-width:34px;text-align:center}",
    ".mf-heat{padding:8px 14px;border-top:1px solid var(--dsw-alias-border-l1);display:grid;gap:8px}.mf-heat-grid{display:grid;grid-template-columns:repeat(12,12px);grid-auto-rows:12px;gap:3px;justify-content:start}.mf-hm-cell{width:12px;height:12px;border-radius:3px;background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l1)}.mf-hm-cell.l1{background:rgba(67,160,71,.35)}.mf-hm-cell.l2{background:rgba(67,160,71,.55)}.mf-hm-cell.l3{background:rgba(67,160,71,.75)}.mf-hm-cell.l4{background:rgba(67,160,71,.95)}.mf-heat small{color:var(--dsw-alias-label-secondary);font-size:11px}",
    ".mf-ai{display:grid;gap:8px;padding:10px 14px;border-top:1px solid var(--dsw-alias-border-l1);max-height:280px;overflow:auto}.mf-ai-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.mf-ai select{font:inherit;font-size:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:4px;background:var(--dsw-alias-bg-base);color:inherit;padding:4px 6px}.mf-ai textarea{box-sizing:border-box;width:100%;min-height:56px;padding:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-base);color:inherit;font:12px/1.6 sans-serif;resize:vertical}.mf-ai-result{white-space:pre-wrap;font:13px/1.7 ui-serif,Georgia,serif;padding:8px 10px;border:1px dashed var(--dsw-alias-border-l1);border-radius:5px;max-height:140px;overflow:auto;color:var(--dsw-alias-label-primary)}",
    ".mf-panel.mf-focus .mf-body{grid-template-columns:minmax(0,1fr)}.mf-panel.mf-focus .mf-col,.mf-panel.mf-focus .mf-activity,.mf-panel.mf-focus .mf-gutter,.mf-panel.mf-focus .mf-chat{display:none}",
    "@media(max-width:760px){.mf-panel{width:100vw;height:100vh;margin:0;border:0;border-radius:0}.mf-body{grid-template-columns:48px 110px minmax(0,1fr)}.mf-body>.mf-col.mf-mid{display:none}.mf-gutter{display:none}.mf-chat{display:none}.mf-text{padding:18px 15px}.mf-head small{display:none}}",
    ".mf-standalone .mf-overlay{position:absolute;background:transparent}.mf-standalone .mf-panel{width:100vw;height:100vh;margin:0;border-radius:0;border:none}",
    ".mf-palette{position:fixed;left:50%;top:72px;transform:translateX(-50%);width:min(620px,calc(100% - 24px));max-height:min(520px,calc(100vh - 96px));overflow:auto;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.35);z-index:130}.mf-palette-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mf-palette-head strong{font-size:13px;font-weight:680}.mf-palette-head small{display:block;margin-top:2px;color:var(--dsw-alias-label-secondary);font-size:11px}.mf-palette-close{flex:0 0 auto;width:28px;height:28px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:18px/1 sans-serif}.mf-palette-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.mf-palette input{box-sizing:border-box;width:100%;padding:10px 12px;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);background:transparent;color:inherit;font:inherit}.mf-palette-item{display:block;width:100%;padding:9px 12px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;font-size:13px}.mf-palette-item:hover,.mf-palette-item.on{background:var(--dsw-alias-interactive-bg-hover)}.mf-palette-item small{display:block;margin-top:3px;color:var(--dsw-alias-label-secondary);font-size:11px}",
    ".mf-stylebar{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary)}.mf-stylebar select{font:inherit;border:1px solid var(--dsw-alias-border-l1);border-radius:4px;background:var(--dsw-alias-bg-base);color:inherit;padding:3px 6px}",
    ".mf-git{max-height:46vh;overflow:auto;border-bottom:1px solid var(--dsw-alias-border-l1);padding:8px 12px;display:grid;gap:6px}.mf-git pre{white-space:pre-wrap;font:11px/1.6 ui-monospace,Consolas,monospace;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-elevated,transparent);border:1px solid var(--dsw-alias-border-l1);border-radius:5px;padding:8px;margin:0;max-height:220px;overflow:auto}.mf-git-item{display:flex;align-items:center;gap:10px;padding:5px 8px;border-radius:5px}.mf-git-item:hover{background:var(--dsw-alias-interactive-bg-hover)}.mf-git-item code{font:11px ui-monospace,Consolas,monospace;color:var(--dsw-alias-label-secondary)}",
    ".mf-git-diff{font:11px/1.6 ui-monospace,Consolas,monospace;max-height:240px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:var(--dsw-alias-bg-elevated,transparent)}.mf-diff-line{white-space:pre-wrap;padding:0 6px}.mf-diff-add{color:#4ade80;background:rgba(74,222,128,.08)}.mf-diff-del{color:#f87171;background:rgba(248,113,113,.08)}.mf-diff-hunk{color:#60a5fa;background:rgba(96,165,250,.08)}.mf-diff-meta{color:var(--dsw-alias-label-secondary)}",
    // v0.12.1 对话面板：pending 审批/提问卡片
    ".mf-pends{display:grid;gap:8px;padding:8px 10px}.mf-pend{border:1px solid var(--dsw-alias-state-warn-secondary);background:var(--dsw-specific-input-major);border-radius:14px;padding:10px 12px;display:grid;gap:8px;color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-shadow-lv2,0 4px 16px rgba(0,0,0,.2))}.mf-pend-head{font-size:12px;font-weight:650;color:var(--dsw-alias-state-warn-primary)}.mf-pend-body,.mf-pend-q{font-size:13px;line-height:1.6;display:grid;gap:4px;min-width:0}.mf-pend-qtext{font-weight:600}.mf-pend-reason{font-size:12px;color:var(--dsw-alias-label-tertiary);white-space:pre-wrap}.mf-pend-actions{display:flex;gap:6px;justify-content:flex-end}.mf-pend-opts{display:flex;flex-wrap:wrap;gap:6px}.mf-pend-opt{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:inherit;border-radius:999px;padding:3px 10px;font-size:12px;cursor:pointer;font-family:inherit}.mf-pend-opt:hover{background:var(--dsw-alias-interactive-bg-hover)}.mf-pend-opt.on{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-specific-bubble-highlight);color:var(--dsw-alias-label-primary)}.mf-pend-custom{box-sizing:border-box;width:100%;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:12px}",
    ".mf-chat-jump{align-self:flex-end;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:999px;padding:2px 10px;font-size:11px;cursor:pointer;font-family:inherit}.mf-chat-jump:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-state-business-primary)}",
    // v0.14 变形工作态：原版 web 完整保留；墨扉 = 右下角 orb 按钮 + 左侧滑入工作台。
    // 工作态的阅读顺序固定为「墨扉工作台 | DSH 写作助手 | DSH 窄轨」。
    ".mf-bubble{position:fixed;inset:0;pointer-events:none;z-index:90;overflow:hidden}",
    // 宽屏让原生 DSH composer 留在最右；空间不足时，优先完整保住写作区，只留下 DSH 窄轨供切回。
    ".mf-bubble-panel{position:absolute;top:0;left:0;bottom:0;width:calc(100% - var(--mf-dsh-sidebar,55px) - var(--mf-dsh-composer,clamp(380px,31vw,520px)));min-width:0;display:flex;flex-direction:column;overflow:hidden;container-type:inline-size;background:var(--dsw-alias-bg-layer-1,#0d0e11);border-right:1px solid var(--dsw-alias-border-l1);transform:translateX(-100%);transition:transform .32s cubic-bezier(.22,.61,.36,1),width .2s ease;pointer-events:auto;box-shadow:14px 0 36px rgba(0,0,0,.28)}",
    ".mf-bubble.on .mf-bubble-panel{transform:translateX(0)}",
    ".mf-orb{position:fixed;right:18px;bottom:18px;width:46px;height:46px;border:0;border-radius:50%;background:var(--dsw-alias-state-business-primary,#4d8dff);color:#fff;cursor:pointer;font:700 17px/1 sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5);pointer-events:auto;z-index:95;transition:transform .2s ease,background .2s ease,opacity .2s ease}",
    ".mf-orb:hover{transform:scale(1.08)}.mf-orb.on{background:var(--dsw-alias-label-secondary,#6b6b74)}",
    // 变形后 orb 退场（收起走工作台顶栏），避免悬在官方 composer 上方挡操作。
    ".mf-bubble.on .mf-orb{opacity:0;pointer-events:none}",
    // 变形时：官方侧栏由官方机制收成窄条，并显式放到 DSH 助手右侧。
    // 不能隐藏官方 grid 列：这样会触发 grid 自动排版，反而会压扁整页。
    "body.mf-transform{--mf-dsh-sidebar:55px;--mf-dsh-composer:clamp(380px,31vw,520px)}body.mf-transform.mf-sidebar-expanded{--mf-dsh-sidebar:280px}",
    'body.mf-transform [class*="_frame"]{grid-template-columns:minmax(0,1fr) var(--mf-dsh-sidebar) 0 !important}',
    'body.mf-transform [class*="centerCol"]{grid-column:1 !important;grid-row:1 !important}',
    'body.mf-transform [class*="hHd-Xa_root"]{grid-column:2 !important;grid-row:1 !important;width:var(--mf-dsh-sidebar) !important;min-width:var(--mf-dsh-sidebar) !important;max-width:var(--mf-dsh-sidebar) !important;overflow:hidden !important}',
    // centerCol 本身已经排除了官方侧栏，内层只需为 Composer 预留空间；重复扣侧栏会让 Composer 被工作台遮住。
    'body.mf-transform [class*="centerCol"] [class*="root"]{padding-left:calc(100% - var(--mf-dsh-composer)) !important;transition:padding-left .2s ease}',
    // 右侧仍是官方 composer，只收紧容器并用同一套分隔线把它收为助手栏。
    'body.mf-transform [class*="scrollBody"]{background:var(--dsw-alias-bg-layer-1,#101115);border-left:1px solid var(--dsw-alias-border-l1)}',
    'body.mf-transform [class*="composerSeat"]{padding:0 16px 18px !important}',
    'body.mf-transform [class*="composerHero"]{box-sizing:border-box;width:100%;max-width:100%;overflow:hidden;padding:20px 0 0}',
    'body.mf-transform [class*="composerHero"]>svg{display:none}',
    // v0.17.1: 430px 窄条下头部压缩——标题单行截断，工作区行（Router Standard 下拉）不换行，避免重叠
    'body.mf-transform [class*="composerHero"] [class*="headline"]{font-size:15px !important;line-height:1.3 !important;letter-spacing:0 !important;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    'body.mf-transform [class*="composerHero"] [class*="headlineText"]{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    'body.mf-transform [class*="composerHero"] [class*="heroWorkspaceRow"]{margin-top:2px;padding:0 2px;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12px !important;line-height:1.5 !important;color:var(--dsw-alias-label-secondary) !important}',
    'body.mf-transform [class*="composerHero"] [class*="card"]{border-radius:8px !important;box-shadow:0 10px 28px rgba(0,0,0,.28)}',
    'body.mf-transform [class*="composerHero"] [class*="card"],body.mf-transform [class*="composerHero"] [class*="row"]{width:100%;max-width:100%}',
    // 窄屏优先保留墨扉编辑区；官方会话切换仍在右侧 55px 窄轨中可达。
    '@media(max-width:760px){body.mf-transform,body.mf-transform.mf-sidebar-expanded{--mf-dsh-sidebar:55px;--mf-dsh-composer:0px}body.mf-transform [class*="centerCol"] [class*="root"]{padding-left:0 !important}}',
    // 墨扉工作台：扁平的目录、编辑器与 DSH 助手三栏，不使用悬浮卡片来分区。
    ".mf-panel.mf-view{background:var(--dsw-alias-bg-layer-1,#0d0e11)}.mf-panel.mf-view .mf-head{position:relative;height:56px;padding:0 20px;background:var(--dsw-alias-bg-layer-2,#111217);border-bottom-color:var(--dsw-alias-border-l1)}.mf-panel.mf-view .mf-body{display:flex;gap:0;padding:0;min-height:0;background:var(--dsw-alias-bg-layer-1,#0d0e11)}",
    ".mf-panel.mf-view .mf-activity,.mf-panel.mf-view .mf-gutter,.mf-panel.mf-view .mf-col.mf-mid{display:none}",
    ".mf-panel.mf-view .mf-col{width:286px;flex:none;border:0;border-right:1px solid var(--dsw-alias-border-l1);border-radius:0;background:var(--dsw-alias-bg-layer-1,#101115);overflow:hidden;box-shadow:none}",
    ".mf-panel.mf-view .mf-editor{flex:1;min-height:0;border:0;border-radius:0;background:var(--dsw-alias-bg-base,#0d0e11);overflow:hidden;box-shadow:none}",
    "@media(max-width:1140px){.mf-panel.mf-view .mf-col{width:228px}.mf-panel.mf-view .mf-text{padding-inline:30px}}",
    // 官方会话栏展开后，墨扉使用紧凑工作态而不是把编辑区压成窄缝。
    "body.mf-transform.mf-sidebar-expanded .mf-panel.mf-view .mf-col{width:204px}body.mf-transform.mf-sidebar-expanded .mf-panel.mf-view .mf-head{height:48px;padding-inline:12px}body.mf-transform.mf-sidebar-expanded .mf-head-context{max-width:140px}body.mf-transform.mf-sidebar-expanded .mf-panel.mf-view .mf-text{padding-inline:22px;font-size:15px}body.mf-transform.mf-sidebar-expanded .mf-panel.mf-view .mf-mininav{padding-inline:6px}body.mf-transform.mf-sidebar-expanded .mf-panel.mf-view .mf-proj{padding:7px 8px}",
    ".mf-head-main{display:flex;align-items:center;gap:10px;min-width:0}.mf-head-main strong{font-size:15px;font-weight:680;letter-spacing:0}.mf-head-context{min-width:0;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:12px}.mf-head-actions{display:flex;align-items:center;justify-content:flex-end;gap:4px;min-width:0}.mf-head-actions .mf-btn{min-height:30px}.mf-head-actions .mf-primary{padding-inline:11px}.mf-action-icon{display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:18px/1 sans-serif}.mf-action-icon:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.mf-head-actions .mf-stylebar{margin-right:6px}.mf-head-actions .mf-stylebar select{max-width:104px;border:0;background:transparent;padding:4px;color:var(--dsw-alias-label-secondary)}",
    "@container (max-width:680px){.mf-panel.mf-view .mf-col{width:190px}.mf-panel.mf-view .mf-head{height:48px;padding-inline:10px}.mf-head-context{display:none}.mf-panel.mf-view .mf-text{padding-inline:18px;font-size:15px}.mf-panel.mf-view .mf-mininav{padding-inline:5px}.mf-panel.mf-view .mf-proj{padding:7px}.mf-panel.mf-view .mf-proj-meta{gap:5px}}",
    "@container (max-width:510px){.mf-panel.mf-view .mf-col{width:164px}.mf-panel.mf-view .mf-mininav{display:none}.mf-panel.mf-view .mf-head-actions .mf-stylebar{display:none}.mf-panel.mf-view .mf-text{padding-inline:14px;font-size:14px}.mf-panel.mf-view .mf-proj-meta{display:none}.mf-panel.mf-view .mf-list{padding:5px}}",
    ".mf-writer-session-menu{position:absolute;right:12px;top:46px;z-index:115;width:260px;max-height:min(360px,calc(100vh - 80px));display:flex;flex-direction:column;gap:3px;padding:7px;background:var(--dsw-alias-bg-overlay,#141416);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;box-shadow:0 16px 42px rgba(0,0,0,.42);overflow:auto}.mf-writer-session-menu h3{margin:2px 5px 5px;font-size:11px;font-weight:650;color:var(--dsw-alias-label-secondary)}.mf-writer-session-item{display:flex;align-items:center;gap:8px;width:100%;min-width:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);padding:7px 8px;text-align:left;cursor:pointer;font:12px/1.35 sans-serif}.mf-writer-session-item:hover,.mf-writer-session-item.on{background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-label-primary)}.mf-writer-session-item .name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mf-writer-session-item .time{flex:none;color:var(--dsw-alias-label-tertiary);font-size:10px}.mf-writer-session-empty{padding:10px 8px;color:var(--dsw-alias-label-tertiary);font-size:11.5px}.mf-writer-session-menu .mf-btn{margin:4px 1px 1px;text-align:center}.mf-writer-session-menu .mf-btn.danger{color:#f87171;border-color:rgba(248,113,113,.3)}.mf-writer-session-menu-sep{height:1px;margin:8px 2px;background:var(--dsw-alias-border-l1)}.mf-writer-session-item .badge{flex:none;width:18px;text-align:center;color:var(--dsw-alias-state-success-primary,#55c98d);font-size:12px}",
    // v0.13.1 预览对齐：迷你导航移入左内栏底部横排（此前为 col/editor 间竖向窄条）
    ".mf-panel.mf-view .mf-col .mf-list{flex:1;min-height:0}",
    ".mf-panel.mf-view .mf-col > .mf-list{display:flex;flex-direction:column;gap:2px}",
    ".mf-panel.mf-view .mf-mininav{flex:none;border-top:1px solid var(--dsw-alias-border-l1);padding:8px 10px}",
    // v0.17.1: 迷你导航对比度提升（tertiary 在墨韵皮肤中过暗，视觉审查发现难读）
    ".mf-panel.mf-view .mf-mininav button{color:var(--dsw-alias-label-secondary)}",
    ".mf-panel.mf-view .mf-mininav button:hover{color:var(--dsw-alias-label-primary)}",
    ".mf-proj-list{display:flex;flex-direction:column;gap:4px;padding:0 2px 8px}",
    // v0.14.1 预览对齐：编辑区空态垂直居中、占位符对比度
    ".mf-panel.mf-view .mf-editor-pane > .mf-empty{display:grid;flex:1;place-items:center;min-height:0;padding:24px;color:var(--dsw-alias-label-secondary)}",
    ".mf-panel.mf-view input::placeholder,.mf-panel.mf-view textarea::placeholder{color:var(--dsw-alias-label-secondary)}",
    // 写作助手入口兼作会话隔离器：只展开 mofei-writer 会话，减少顶栏重复状态。
    '.mf-wstate{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);padding:6px 8px;cursor:pointer;font:12px/1.2 sans-serif;white-space:nowrap}.mf-wstate::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}.mf-wstate:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.mf-wstate.on{color:var(--dsw-alias-label-primary)}.mf-wstate.on::before{background:var(--dsw-alias-state-success-primary,#55c98d);box-shadow:0 0 0 3px rgba(85,201,141,.12)}',
    // v0.13.1 预览对齐：左栏行操作 hover 才显现（静止态 = 极简，功能不丢）
    ".mf-panel.mf-view .mf-col .mf-minis{opacity:0;pointer-events:none;transition:opacity .12s ease}",
    ".mf-panel.mf-view .mf-col .mf-item:hover .mf-minis,.mf-panel.mf-view .mf-col .mf-vol-head:hover .mf-minis,.mf-panel.mf-view .mf-col .mf-proj:hover .mf-minis{opacity:1;pointer-events:auto}",
    // v0.13.1 预览对齐：项目行 = 标题 + 元信息（无封面块/进度条）
    ".mf-panel.mf-view .mf-col .mf-proj{display:flex;flex-direction:column;gap:2px;padding:9px 10px;border:1px solid transparent;border-radius:5px;cursor:pointer;transition:background .12s ease,border-color .12s ease}",
    ".mf-panel.mf-view .mf-col .mf-proj:hover{background:var(--dsw-alias-interactive-bg-hover)}",
    ".mf-panel.mf-view .mf-col .mf-proj.active{background:var(--dsw-alias-state-business-tertiary);border-color:var(--dsw-alias-border-l1)}",
    ".mf-panel.mf-view .mf-col .mf-proj-head{display:flex;align-items:center;gap:6px;min-width:0}",
    ".mf-panel.mf-view .mf-col .mf-proj-name{flex:1;min-width:0;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".mf-panel.mf-view .mf-col .mf-proj-meta{display:flex;gap:8px;font-size:10.5px;color:var(--dsw-alias-label-secondary)}",
    ".mf-panel.mf-view .mf-col .mf-proj .mf-minis{opacity:0;pointer-events:none;flex-shrink:0}",
    ".mf-mininav{display:flex;gap:2px;padding:8px 10px;border-top:1px solid var(--dsw-alias-border-l1);flex:none}.mf-mininav button{flex:1;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:9.5px;font-family:inherit;padding:4px 0;border-radius:7px}.mf-mininav button:hover{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}.mf-mininav button.on{color:var(--dsw-alias-state-business-primary)}.mf-mininav .ic{font-size:15px}",
    ".mf-back{background:transparent;border:0;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;padding:0 4px;font-family:inherit}.mf-back:hover{color:var(--dsw-alias-label-primary)}",
    ".mf-sess-toggle{display:flex;align-items:center;gap:6px;width:100%;padding:7px 12px;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:11.5px;flex:none}.mf-sess-toggle:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}",
    ".mf-sess-list{max-height:180px;overflow:auto;border-bottom:1px solid var(--dsw-alias-border-l1);padding:4px 6px 6px;display:flex;flex-direction:column;gap:1px;flex:none}.mf-sess-item{display:flex;align-items:center;gap:7px;padding:5px 8px;border-radius:7px;cursor:pointer;font-size:11.5px;color:var(--dsw-alias-label-secondary)}.mf-sess-item:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.mf-sess-item.on{background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-label-primary)}.mf-sess-item .name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mf-sess-item .time{font-size:9.5px;color:var(--dsw-alias-label-tertiary);flex:none}",
    ".mf-panel.mf-view .mf-chat-input{padding:8px 12px 12px;border-top:0}.mf-panel.mf-view .mf-chat-input textarea{border-radius:16px;background:var(--dsw-alias-bg-base);font-size:13px}",
    // v0.18: 初始向导
    '.mf-onboard{position:fixed;inset:0;z-index:150;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)}.mf-onboard-card{width:min(560px,calc(100vw - 40px));display:grid;gap:14px;padding:28px 30px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 26px 80px rgba(0,0,0,.5)}.mf-onboard-card h2{margin:0;font-size:18px}.mf-onboard-card p{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.7}.mf-onboard-folder{display:flex;gap:8px;align-items:center}.mf-onboard-folder input{flex:1;min-width:0;box-sizing:border-box;padding:9px 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-base);color:inherit;font:12px/1.4 sans-serif;outline:0}.mf-onboard-folder input:focus{border-color:var(--dsw-alias-state-business-primary)}.mf-onboard input[type="text"]{box-sizing:border-box;width:100%;padding:9px 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-base);color:inherit;font:13px/1.4 sans-serif;outline:0}.mf-onboard input:focus{border-color:var(--dsw-alias-state-business-primary)}.mf-onboard-actions{display:flex;gap:8px;justify-content:flex-end;align-items:center}.mf-onboard-error{color:#f87171;font-size:12px}.mf-onboard-note{font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.6}',
    SETTINGS_PANEL_CSS,
    AGENT_MODELS_PANEL_CSS
  ].join("\n");
  let styleEl = null;
  function ensureStyles2() {
    if (!styleEl && typeof document !== "undefined") {
      styleEl = document.createElement("style");
      styleEl.textContent = css;
      document.head.appendChild(styleEl);
    }
  }
  function removeStyles() {
    if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    styleEl = null;
  }
  const timers = /* @__PURE__ */ new Set();
  function later(fn, ms) {
    const id = setTimeout(fn, ms);
    timers.add(id);
    return () => {
      clearTimeout(id);
      timers.delete(id);
    };
  }
  function debounce(fn, ms) {
    let t = null;
    const run = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        fn();
      }, ms);
      timers.add(t);
    };
    run.dispose = () => {
      if (t) {
        clearTimeout(t);
        timers.delete(t);
        t = null;
      }
    };
    return run;
  }
  function applyWritingComposerPlaceholder() {
    if (typeof document === "undefined") return;
    const ta = document.querySelector('[data-composer-seat] textarea,[class*="composerSeat"] textarea');
    if (!ta) return;
    if (!ta.dataset.mofeiPh) {
      ta.dataset.mofeiPh = "1";
      ta.dataset.mofeiOriginalPlaceholder = ta.placeholder;
    }
    const writing = document.body.classList.contains("mf-transform");
    ta.placeholder = writing ? "\u8F93\u5165\u5199\u4F5C\u6307\u4EE4\uFF1A\u7EED\u5199 / \u5BA1\u7A3F / \u67E5\u8BBE\u5B9A\u2026" : ta.dataset.mofeiOriginalPlaceholder || ta.placeholder;
  }
  const panel = { open: false, listeners: [] };
  let dshClientSessions = null;
  let dshClientConnection = null;
  let dshClientWorkspaces = null;
  function currentDshWorkspacePath() {
    try {
      const sessions = dshClientSessions;
      const snapshot = sessions && sessions.list && typeof sessions.list.getSnapshot === "function" ? sessions.list.getSnapshot() : null;
      const current = snapshot && snapshot.current && snapshot.byId && snapshot.byId[snapshot.current];
      if (current && typeof current.cwd === "string" && current.cwd.trim()) return current.cwd.trim();
      const workspaces = dshClientWorkspaces;
      const workspaceSnapshot = workspaces && workspaces.list && typeof workspaces.list.getSnapshot === "function" ? workspaces.list.getSnapshot() : null;
      const recent = workspaceSnapshot && workspaceSnapshot.recentWorkspaceId;
      const item = recent && Array.isArray(workspaceSnapshot.items) ? workspaceSnapshot.items.find((entry) => entry && entry.workspaceId === recent) : null;
      return item && typeof item.path === "string" ? item.path.trim() : "";
    } catch (error) {
      return "";
    }
  }
  function setOpen(value) {
    panel.open = value;
    panel.listeners.slice().forEach((listener) => listener(value));
  }
  function useOpen() {
    const state = React.useState(panel.open);
    React.useEffect(() => {
      panel.listeners.push(state[1]);
      return () => {
        panel.listeners = panel.listeners.filter((listener) => listener !== state[1]);
      };
    }, []);
    return state[0];
  }
  function OpenButton(props) {
    return h("button", { className: props && props.float ? "mf-open mf-float" : "mf-open", type: "button", onClick: () => {
      ensureStyles2();
      setOpen(true);
    } }, "\u6253\u5F00 \u58A8\u6249");
  }
  const ErrorBoundary = class extends React.Component {
    constructor(props) {
      super(props);
      this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
      return { error };
    }
    render() {
      if (this.state.error) return h("div", { style: { position: "fixed", inset: 0, zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--dsw-alias-bg-base)", color: "#dc2626", font: "13px/1.6 sans-serif", padding: 24 } }, "\u58A8\u6249 \u6E32\u67D3\u51FA\u9519\uFF1A" + String(this.state.error && this.state.error.message || this.state.error));
      return this.props.children;
    }
  };
  function RunCard() {
    return h("div", { className: "mf-card" }, h("span", null, "\u58A8\u6249\u5199\u4F5C\u5E73\u53F0\u5DF2\u8FD0\u884C"), h(OpenButton, null));
  }
  function SideAction(props) {
    return h("button", { className: "mf-side", type: "button", onClick: () => {
      ensureStyles2();
      setBubbleOn(true);
    }, title: "\u6253\u5F00 \u58A8\u6249" }, h("span", { className: "mf-mark" }, "\u58A8"), props && props.wide ? h("span", null, "\u58A8\u6249") : null);
  }
  function MiniButton(props) {
    return h("button", { className: "mf-mini" + (props.danger ? " danger" : "") + (props.armed ? " armed" : "") + (props.on ? " on" : ""), type: "button", title: props.title || "", disabled: props.disabled, onClick: (event) => {
      event.stopPropagation();
      if (props.onClick) props.onClick(event);
    } }, props.label);
  }
  const bubble = { on: false, listeners: [] };
  let sidebarSyncTarget = null;
  let sidebarSyncTimer = null;
  function setBubbleOn(value) {
    const next = !!value;
    if (next && typeof document !== "undefined") {
      document.body.classList.add("mf-transform");
      syncOfficialSidebar(true);
    }
    bubble.on = next;
    bubble.listeners.slice().forEach((listener) => listener(bubble.on));
  }
  function useBubbleOn() {
    const state = React.useState(bubble.on);
    React.useEffect(() => {
      bubble.listeners.push(state[1]);
      return () => {
        bubble.listeners = bubble.listeners.filter((listener) => listener !== state[1]);
      };
    }, []);
    return state[0];
  }
  function syncOfficialSidebar(collapse) {
    if (typeof document === "undefined") return;
    try {
      const root = document.querySelector('[class*="hHd-Xa_root"]');
      const isCollapsed = !!(root && String(root.className).includes("collapsed"));
      const target = !!collapse;
      if (sidebarSyncTarget === target) return;
      if (root && target !== isCollapsed) {
        const toggle = document.querySelector('[class*="hHd-Xa_toggle"]');
        if (toggle) {
          sidebarSyncTarget = target;
          if (sidebarSyncTimer) clearTimeout(sidebarSyncTimer);
          toggle.click();
          sidebarSyncTimer = setTimeout(() => {
            sidebarSyncTarget = null;
            sidebarSyncTimer = null;
          }, 450);
        }
      }
    } catch (error) {
    }
  }
  function MofeiBubble() {
    ensureStyles2();
    const on = useBubbleOn();
    const previousOn = React.useRef(on);
    React.useEffect(() => {
      return later(applyWritingComposerPlaceholder, 340);
    }, []);
    React.useEffect(() => {
      const wasOn = previousOn.current;
      previousOn.current = on;
      if (on) {
        if (typeof document !== "undefined") document.body.classList.add("mf-transform");
        syncOfficialSidebar(true);
        return later(applyWritingComposerPlaceholder, 340);
      } else {
        if (typeof document !== "undefined") document.body.classList.remove("mf-transform");
        if (wasOn) return later(() => {
          syncOfficialSidebar(false);
          applyWritingComposerPlaceholder();
        }, 300);
        syncOfficialSidebar(false);
        return later(applyWritingComposerPlaceholder, 0);
      }
      return void 0;
    }, [on]);
    React.useEffect(() => {
      if (!on || typeof document === "undefined") return void 0;
      const root = document.querySelector('[class*="hHd-Xa_root"]');
      if (!root) return void 0;
      const syncSidebarWidth = () => document.body.classList.toggle("mf-sidebar-expanded", !String(root.className).includes("collapsed"));
      syncSidebarWidth();
      const observer = new MutationObserver(syncSidebarWidth);
      observer.observe(root, { attributes: true, attributeFilter: ["class"] });
      return () => {
        observer.disconnect();
        document.body.classList.remove("mf-sidebar-expanded");
      };
    }, [on]);
    return h(
      "div",
      { className: "mf-bubble" + (on ? " on" : "") },
      h("div", { className: "mf-bubble-panel", "aria-hidden": on ? void 0 : "true" }, h(ErrorBoundary, null, h(Workspace, { mode: "web", onCollapse: () => setBubbleOn(false), onOpenSettings: () => setBubbleOn(true) }))),
      h("button", { className: "mf-orb" + (on ? " on" : ""), type: "button", title: on ? "\u6536\u8D77\u58A8\u6249\uFF0C\u8FD4\u56DE\u539F\u7248 web" : "\u6253\u5F00\u58A8\u6249\u5199\u4F5C\u53F0\uFF08\u539F\u7248 web \u53D8\u5F62\uFF09", onClick: () => setBubbleOn(!on) }, on ? "\u2715" : "\u58A8")
    );
  }
  function PendingCard(props) {
    const item = props && props.item;
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState("");
    const [picks, setPicks] = React.useState({});
    if (!item || !item.payload) return null;
    const fail = (failure) => {
      setError("\u5E94\u7B54\u5931\u8D25\uFF1A" + (failure && failure.message || String(failure)));
      setBusy(false);
    };
    if (item.kind === "approval") {
      const payload = item.payload;
      const send = (outcome) => {
        if (busy) return;
        setBusy(true);
        setError("");
        Promise.resolve(item.respond({ sessionId: item.sessionId, approvalId: payload.approvalId, outcome })).catch(fail);
      };
      return h(
        "div",
        { className: "mf-pend" },
        h("div", { className: "mf-pend-head" }, "\u26A0 \u5DE5\u5177\u5BA1\u6279"),
        h("div", { className: "mf-pend-body" }, h("strong", null, payload.toolName || "\u5DE5\u5177\u8C03\u7528"), payload.reason ? h("div", { className: "mf-pend-reason" }, payload.reason) : null),
        error ? h("div", { className: "mf-alert" }, error) : null,
        h(
          "div",
          { className: "mf-pend-actions" },
          h("button", { className: "mf-btn mf-primary", type: "button", disabled: busy, onClick: () => send("allowed-once") }, busy ? "\u63D0\u4EA4\u4E2D\u2026" : "\u5141\u8BB8\u4E00\u6B21"),
          h("button", { className: "mf-btn", type: "button", disabled: busy, onClick: () => send("rejected") }, "\u62D2\u7EDD")
        )
      );
    }
    const questions = Array.isArray(item.payload.questions) ? item.payload.questions : [];
    const toggleOption = (qId, label) => setPicks((prev) => {
      const current = prev[qId] && prev[qId].selected || [];
      return { ...prev, [qId]: { selected: current.includes(label) ? current.filter((x) => x !== label) : current.concat([label]), custom: prev[qId] && prev[qId].custom || "" } };
    });
    const pickOption = (qId, label) => setPicks((prev) => ({ ...prev, [qId]: { selected: [label], custom: prev[qId] && prev[qId].custom || "" } }));
    const setCustom = (qId, text) => setPicks((prev) => ({ ...prev, [qId]: { selected: prev[qId] && prev[qId].selected || [], custom: text } }));
    const submit = () => {
      if (busy) return;
      const answers = questions.map((q) => ({ id: q.id, selected: picks[q.id] && picks[q.id].selected || [], custom: picks[q.id] && picks[q.id].custom || void 0 }));
      setBusy(true);
      setError("");
      Promise.resolve(item.respond({ sessionId: item.sessionId, answer: { answers } })).catch(fail);
    };
    return h(
      "div",
      { className: "mf-pend" },
      h("div", { className: "mf-pend-head" }, "\u2753 \u63D0\u95EE"),
      questions.map((q) => h(
        "div",
        { key: q.id, className: "mf-pend-q" },
        h("div", { className: "mf-pend-qtext" }, (q.header ? q.header + " \xB7 " : "") + q.question),
        q.detail ? h("div", { className: "mf-pend-reason" }, q.detail) : null,
        Array.isArray(q.options) && q.options.length ? h("div", { className: "mf-pend-opts" }, q.options.map((opt) => {
          const chosen = ((picks[q.id] || {}).selected || []).includes(opt.label);
          return h("button", { key: opt.label, type: "button", className: "mf-pend-opt" + (chosen ? " on" : ""), disabled: busy, title: opt.description || "", onClick: () => q.multiSelect ? toggleOption(q.id, opt.label) : pickOption(q.id, opt.label) }, opt.label);
        })) : h("input", { className: "mf-input mf-pend-custom", value: (picks[q.id] || {}).custom || "", placeholder: "\u8F93\u5165\u56DE\u7B54\u2026", disabled: busy, onChange: (event) => setCustom(q.id, event.target.value) })
      )),
      error ? h("div", { className: "mf-alert" }, error) : null,
      h(
        "div",
        { className: "mf-pend-actions" },
        h("button", { className: "mf-btn mf-primary", type: "button", disabled: busy, onClick: submit }, busy ? "\u63D0\u4EA4\u4E2D\u2026" : "\u63D0\u4EA4\u56DE\u7B54")
      )
    );
  }
  function parseMentionIds(text) {
    const source = typeof text === "string" ? text : "";
    const project = source.match(/projectId:\s*([A-Za-z0-9_-]+)/);
    const chapter = source.match(/chapterId:\s*([A-Za-z0-9_-]+)/);
    return { projectId: project ? project[1] : "", chapterId: chapter ? chapter[1] : "" };
  }
  function Workspace(props) {
    const mode = props && props.mode || "overlay";
    const onCollapse = props && props.onCollapse;
    const openState = useOpen();
    const open = mode === "web" ? true : openState;
    React.useEffect(() => {
      if (mode !== "web") return void 0;
      ensureStyles2();
      later(applyWritingComposerPlaceholder, 300);
      return () => {
        removeStyles();
      };
    }, [mode]);
    const [projects, setProjects] = React.useState([]);
    const [drafts, setDrafts] = React.useState([]);
    const [stats, setStats] = React.useState(null);
    const [projectId, setProjectId] = React.useState("");
    const [projQuery, setProjQuery] = React.useState("");
    const [chapterId, setChapterId] = React.useState("");
    const [draft, setDraft] = React.useState("");
    const [saved, setSaved] = React.useState("");
    const [titleDraft, setTitleDraft] = React.useState("");
    const [revision, setRevision] = React.useState(0);
    const [status, setStatus] = React.useState("saved");
    const [error, setError] = React.useState("");
    const [conflict, setConflict] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [projectForm, setProjectForm] = React.useState(false);
    const [chapterForm, setChapterForm] = React.useState(false);
    const [newProject, setNewProject] = React.useState("");
    const [newChapter, setNewChapter] = React.useState("");
    const [focus, setFocus] = React.useState(false);
    const [showHistory, setShowHistory] = React.useState(false);
    const [historyList, setHistoryList] = React.useState([]);
    const [historyLoading, setHistoryLoading] = React.useState(false);
    const [armed, setArmed] = React.useState(null);
    const [rename, setRename] = React.useState(null);
    const [renameValue, setRenameValue] = React.useState("");
    const [goalForm, setGoalForm] = React.useState(false);
    const [goalInput, setGoalInput] = React.useState("");
    const [projectWide, setProjectWide] = React.useState(false);
    const [summaryOpen, setSummaryOpen] = React.useState(false);
    const [summaryRows, setSummaryRows] = React.useState([]);
    const [summaryRanges, setSummaryRanges] = React.useState([]);
    const [summaryLoading, setSummaryLoading] = React.useState(false);
    const [summaryError, setSummaryError] = React.useState("");
    const [summaryBusy, setSummaryBusy] = React.useState(null);
    const [summaryProgress, setSummaryProgress] = React.useState(null);
    const [summaryResult, setSummaryResult] = React.useState(null);
    const [bridgeNotice, setBridgeNotice] = React.useState("");
    const bridgeNoticeTimer = React.useRef(null);
    const [worldQuery, setWorldQuery] = React.useState("");
    const [worldSelected, setWorldSelected] = React.useState([]);
    const [worldBatchBusy, setWorldBatchBusy] = React.useState(false);
    const [worldDeleteArmed, setWorldDeleteArmed] = React.useState(false);
    const worldDeleteTimer = React.useRef(null);
    const [entityHistOpen, setEntityHistOpen] = React.useState(false);
    const [entityHistKind, setEntityHistKind] = React.useState("");
    const [entityHistList, setEntityHistList] = React.useState([]);
    const [entityHistLoading, setEntityHistLoading] = React.useState(false);
    const [entityHistError, setEntityHistError] = React.useState("");
    const [chainsOpen, setChainsOpen] = React.useState(false);
    const [chains, setChains] = React.useState([]);
    const [chainActiveId, setChainActiveId] = React.useState("");
    const [chainBusy, setChainBusy] = React.useState(false);
    const [chainError, setChainError] = React.useState("");
    const [chainResult, setChainResult] = React.useState("");
    const [chainLastPrompt, setChainLastPrompt] = React.useState("");
    const [rolesOpen, setRolesOpen] = React.useState(false);
    const [settingsOpen, setSettingsOpen] = React.useState(false);
    const [modelsOpen, setModelsOpen] = React.useState(false);
    const [modelSettings, setModelSettings] = React.useState({ version: 1, general: {}, byRole: {}, byProject: {} });
    const [modelCatalog, setModelCatalog] = React.useState({ providers: [] });
    const [modelBusy, setModelBusy] = React.useState(false);
    const [modelError, setModelError] = React.useState("");
    const [settingsSection, setSettingsSection] = React.useState("agents");
    const [retrievalStatus, setRetrievalStatus] = React.useState(null);
    const [retrievalBusy, setRetrievalBusy] = React.useState(false);
    const [roles, setRoles] = React.useState([]);
    const [roleScopeId, setRoleScopeId] = React.useState("");
    const [roleActiveId, setRoleActiveId] = React.useState("");
    const [roleDetail, setRoleDetail] = React.useState(null);
    const [roleBusy, setRoleBusy] = React.useState(false);
    const [roleError, setRoleError] = React.useState("");
    const [privateInstructions, setPrivateInstructions] = React.useState([]);
    const [skillsOpen, setSkillsOpen] = React.useState(false);
    const [writingSkills, setWritingSkills] = React.useState([]);
    const [skillSettings, setSkillSettings] = React.useState(null);
    const [skillsLoading, setSkillsLoading] = React.useState(false);
    const [skillsError, setSkillsError] = React.useState("");
    const [dashOpen, setDashOpen] = React.useState(false);
    const [paletteOpen, setPaletteOpen] = React.useState(false);
    const [paletteQuery, setPaletteQuery] = React.useState("");
    const [styles, setStyles] = React.useState([]);
    const [currentStyle, setCurrentStyle] = React.useState("default");
    const [retrieveQuery, setRetrieveQuery] = React.useState("");
    const [retrieveResults, setRetrieveResults] = React.useState([]);
    const [retrieveBusy, setRetrieveBusy] = React.useState(false);
    const [retrieveError, setRetrieveError] = React.useState("");
    const [selStyleId, setSelStyleId] = React.useState("");
    const [styleName, setStyleName] = React.useState("");
    const [styleDesc, setStyleDesc] = React.useState("");
    const [styleTags, setStyleTags] = React.useState("");
    const [styleContent, setStyleContent] = React.useState("");
    const [styleDirty, setStyleDirty] = React.useState(false);
    const [styleError, setStyleError] = React.useState("");
    const [styleScope, setStyleScope] = React.useState("global");
    const [stylePreview, setStylePreview] = React.useState(false);
    const [gitHistOpen, setGitHistOpen] = React.useState(false);
    const [gitHistData, setGitHistData] = React.useState(null);
    const [gitHistLoading, setGitHistLoading] = React.useState(false);
    const [gitHistDiff, setGitHistDiff] = React.useState(false);
    const [gitHistChain, setGitHistChain] = React.useState(null);
    const [jobListOpen, setJobListOpen] = React.useState(false);
    const [mofeiJobs, setMofeiJobs] = React.useState([]);
    const [aiBatchJobId, setAiBatchJobId] = React.useState("");
    const [chatOpen, setChatOpen] = React.useState(true);
    const [chatInput, setChatInput] = React.useState("");
    const [chatSessionId, setChatSessionId] = React.useState("");
    const [chatSnap, setChatSnap] = React.useState(null);
    const [chatSummary, setChatSummary] = React.useState(null);
    const [chatBusy, setChatBusy] = React.useState(false);
    const [chatError, setChatError] = React.useState("");
    const [chatHint, setChatHint] = React.useState("");
    const [chatPresets, setChatPresets] = React.useState([]);
    const [chatPresetId, setChatPresetId] = React.useState("mofei-writer");
    const [chatSessionsOpen, setChatSessionsOpen] = React.useState(false);
    const [chatSessionList, setChatSessionList] = React.useState({ ids: [], byId: {} });
    const [agentContextBound, setAgentContextBound] = React.useState(false);
    const [onboardOpen, setOnboardOpen] = React.useState(false);
    const [onboardFolder, setOnboardFolder] = React.useState(() => currentDshWorkspacePath());
    const [onboardTitle, setOnboardTitle] = React.useState("");
    const [onboardBusy, setOnboardBusy] = React.useState(false);
    const [onboardError, setOnboardError] = React.useState("");
    const [onboardPicking, setOnboardPicking] = React.useState(false);
    const autoSessionMenuRef = React.useRef(false);
    const chatBodyRef = React.useRef(null);
    const [tabMenu, setTabMenu] = React.useState(null);
    const [tabDragId, setTabDragId] = React.useState("");
    const [layout, setLayout] = React.useState(() => loadLayout(typeof localStorage !== "undefined" ? localStorage : null));
    const [dragAxis, setDragAxis] = React.useState("");
    const layoutRef = React.useRef(layout);
    const layoutDragRef = React.useRef(null);
    function applyLayout(next) {
      layoutRef.current = next;
      setLayout(next);
    }
    function panelWidth() {
      if (typeof window !== "undefined" && typeof document !== "undefined") {
        const panelEl = document.querySelector(".mf-panel");
        if (panelEl && panelEl.clientWidth) return panelEl.clientWidth;
        return window.innerWidth;
      }
      return 1240;
    }
    function resetLayoutAxis(axis) {
      const base = layoutRef.current || LAYOUT_DEFAULTS;
      const next = normalizeLayout(axis === "left" ? { left: LAYOUT_DEFAULTS.left, middle: base.middle } : { left: base.left, middle: LAYOUT_DEFAULTS.middle }, panelWidth());
      applyLayout(next);
      saveLayout(typeof localStorage !== "undefined" ? localStorage : null, "mofei.layout", next);
    }
    function startGutterDrag(event) {
      const axis = event.currentTarget.getAttribute("data-axis");
      if (axis !== "left" && axis !== "middle") return;
      event.preventDefault();
      setDragAxis(axis);
      layoutDragRef.current = { axis, startX: event.clientX, startLayout: layoutRef.current };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch (error2) {
      }
    }
    function moveGutterDrag(event) {
      const drag = layoutDragRef.current;
      if (!drag) return;
      applyLayout(nextLayout(drag.startLayout, drag.axis, event.clientX - drag.startX, panelWidth()));
    }
    function endGutterDrag() {
      const drag = layoutDragRef.current;
      if (drag) {
        layoutDragRef.current = null;
        setDragAxis("");
        saveLayout(typeof localStorage !== "undefined" ? localStorage : null, "mofei.layout", layoutRef.current);
      }
    }
    function cancelGutterDrag() {
      layoutDragRef.current = null;
      setDragAxis("");
    }
    function resetGutter(event) {
      const axis = event.currentTarget.getAttribute("data-axis");
      if (axis === "left" || axis === "middle") resetLayoutAxis(axis);
    }
    const [tab, setTab] = React.useState("projects");
    const [selChar, setSelChar] = React.useState("");
    const [charName, setCharName] = React.useState("");
    const [charDesc, setCharDesc] = React.useState("");
    const [charDirty, setCharDirty] = React.useState(false);
    const [charForm, setCharForm] = React.useState(false);
    const [newChar, setNewChar] = React.useState("");
    const [selNote, setSelNote] = React.useState("");
    const [noteTitle, setNoteTitle] = React.useState("");
    const [noteContent, setNoteContent] = React.useState("");
    const [noteDirty, setNoteDirty] = React.useState(false);
    const [noteForm, setNoteForm] = React.useState(false);
    const [newNote, setNewNote] = React.useState("");
    const [catForm, setCatForm] = React.useState(false);
    const [newCat, setNewCat] = React.useState("");
    const [subCatFor, setSubCatFor] = React.useState("");
    const [newSubCat, setNewSubCat] = React.useState("");
    const [volForm, setVolForm] = React.useState(false);
    const [newVol, setNewVol] = React.useState("");
    const [moveVolFor, setMoveVolFor] = React.useState("");
    const [searchOpen, setSearchOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");
    const [searchResults, setSearchResults] = React.useState([]);
    const [searching, setSearching] = React.useState(false);
    const [importOpen, setImportOpen] = React.useState(false);
    const [importBusy, setImportBusy] = React.useState(false);
    const [importError, setImportError] = React.useState("");
    const [importPreview, setImportPreview] = React.useState(null);
    const [importContent, setImportContent] = React.useState("");
    const [importName, setImportName] = React.useState("");
    const [importEncoding, setImportEncoding] = React.useState("");
    const [openTabs, setOpenTabs] = React.useState([]);
    const [findOpen, setFindOpen] = React.useState(false);
    const [findQuery, setFindQuery] = React.useState("");
    const [replaceQuery, setReplaceQuery] = React.useState("");
    const [findMatches, setFindMatches] = React.useState([]);
    const [findIndex, setFindIndex] = React.useState(-1);
    const [aiOpen, setAiOpen] = React.useState(false);
    const [aiMode, setAiMode] = React.useState("continue");
    const [aiPrompt, setAiPrompt] = React.useState("");
    const [aiBusy, setAiBusy] = React.useState(false);
    const [aiResult, setAiResult] = React.useState("");
    const [aiError, setAiError] = React.useState("");
    const [aiHistory, setAiHistory] = React.useState([]);
    const [aiHistoryOpen, setAiHistoryOpen] = React.useState(false);
    const [aiBatchBusy, setAiBatchBusy] = React.useState(false);
    const [aiBatchResults, setAiBatchResults] = React.useState([]);
    const [aiBatchError, setAiBatchError] = React.useState("");
    const aiAbort = React.useRef(null);
    const restoredProjectRef = React.useRef("");
    const projectRestoredRef = React.useRef(false);
    const [statsOpen, setStatsOpen] = React.useState(false);
    const [dragKind, setDragKind] = React.useState("");
    const [dragId, setDragId] = React.useState("");
    const [selStart, setSelStart] = React.useState(0);
    const [selEnd, setSelEnd] = React.useState(0);
    const [selWorld, setSelWorld] = React.useState("");
    const [worldName, setWorldName] = React.useState("");
    const [worldKeys, setWorldKeys] = React.useState("");
    const [worldContent, setWorldContent] = React.useState("");
    const [worldDirty, setWorldDirty] = React.useState(false);
    const [worldForm, setWorldForm] = React.useState(false);
    const [newWorld, setNewWorld] = React.useState("");
    const [worldImportOpen, setWorldImportOpen] = React.useState(false);
    const [worldImportMode, setWorldImportMode] = React.useState("append");
    const [worldImportBusy, setWorldImportBusy] = React.useState(false);
    const [worldImportError, setWorldImportError] = React.useState("");
    const [worldImportResult, setWorldImportResult] = React.useState("");
    const locks = React.useRef({});
    const agentMutationRefreshRef = React.useRef("");
    const project = projects.find((item) => item.id === projectId);
    const chapter = project && project.chapters.find((item) => item.id === chapterId);
    const character = project && project.characters.find((item) => item.id === selChar);
    const note = project && project.notes.find((item) => item.id === selNote);
    const worldEntry = project && project.worldEntries && project.worldEntries.find((item) => item.id === selWorld);
    const changed = !!chapterId && draft !== saved;
    const activeTabId = tab === "notes" && selNote ? selNote : chapterId;
    const retrieveGrouped = React.useMemo(() => {
      const groups = [];
      const byKey = /* @__PURE__ */ new Map();
      retrieveResults.forEach((hit) => {
        const key = hit.entityType === "chapter" || hit.entityType === "summary" ? hit.volumeTitle || "\u672A\u5206\u7EC4" : hit.entityType === "character" ? "\u89D2\u8272" : hit.entityType === "note" ? "\u7B14\u8BB0" : hit.entityType === "world" ? "\u4E16\u754C\u4E66" : "\u5176\u4ED6";
        let group = byKey.get(key);
        if (!group) {
          group = { title: key, hits: [] };
          byKey.set(key, group);
          groups.push(group);
        }
        group.hits.push(hit);
      });
      return groups;
    }, [retrieveResults]);
    const projectChars = project ? project.chapters.reduce((sum, item) => sum + item.content.length, 0) : 0;
    const volumes = project ? project.volumes.slice().sort((a, b) => a.order - b.order) : [];
    const ungrouped = project ? project.chapters.filter((c) => !c.volumeId).slice().sort((a, b) => a.order - b.order) : [];
    const categories = project ? project.noteCategories.slice().sort((a, b) => a.title.localeCompare(b.title, "zh")) : [];
    const worldEntries = project && Array.isArray(project.worldEntries) ? project.worldEntries.slice().sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
    const worldFiltered = filterWorldEntries(worldEntries, worldQuery);
    const rootCats = categories.filter((c) => !c.parentId);
    const childCats = categories.filter((c) => c.parentId);
    function arm(kind, id) {
      if (armed && armed.kind === kind && armed.id === id) return true;
      setArmed({ kind, id });
      later(() => setArmed((current) => current && current.kind === kind && current.id === id ? null : current), 4e3);
      return false;
    }
    function disarm() {
      setArmed(null);
    }
    function reload() {
      return call("bootstrap", {}).then((result) => {
        const nextProjects = result && Array.isArray(result.projects) ? result.projects : [];
        setProjects(nextProjects);
        setDrafts(result && Array.isArray(result.drafts) ? result.drafts : []);
        if (result && result.stats) setStats(result.stats);
        setOpenTabs((tabs) => tabs.map((t) => {
          const currentProject = nextProjects.find((item) => item.id === projectId);
          if (t.kind === "note") {
            const note2 = currentProject && currentProject.notes.find((item2) => item2.id === t.id);
            return note2 ? { kind: "note", id: t.id, title: note2.title, pinned: t.pinned } : t;
          }
          const currentChapter = currentProject && currentProject.chapters.find((item2) => item2.id === t.id);
          return currentChapter ? { kind: "chapter", id: t.id, title: currentChapter.title, pinned: t.pinned } : t;
        }));
        if (projectId && !nextProjects.find((item) => item.id === projectId)) {
          setProjectId("");
          setChapterId("");
          setDraft("");
          setSaved("");
          setRevision(0);
          setStatus("saved");
          setError("");
          setConflict(null);
          setSelChar("");
          setSelNote("");
          setSelWorld("");
          setWorldName("");
          setWorldKeys("");
          setWorldContent("");
          setWorldDirty(false);
          setAiHistory([]);
          setAiResult("");
          setAiError("");
          setAiBatchResults([]);
          setAiBatchError("");
          setOpenTabs([]);
        } else if (chapterId && nextProjects.find((item) => item.id === projectId) && !nextProjects.find((item) => item.id === projectId).chapters.find((item2) => item2.id === chapterId)) {
          setChapterId("");
          setDraft("");
          setSaved("");
          setRevision(0);
          setStatus("saved");
          setError("");
          setConflict(null);
        } else {
          const latest = chapterId && nextProjects.find((item) => item.id === projectId) && nextProjects.find((item) => item.id === projectId).chapters.find((item) => item.id === chapterId);
          if (latest && latest.revision !== revision) {
            if (changed) {
              setConflict(latest);
              setStatus("error");
              setError("\u5199\u4F5C Agent \u5DF2\u66F4\u65B0\u8FDC\u7AEF\u6B63\u6587\uFF0C\u5F53\u524D\u8349\u7A3F\u6CA1\u6709\u88AB\u8986\u76D6\u3002");
            } else {
              setDraft(latest.content);
              setSaved(latest.content);
              setRevision(latest.revision);
              setStatus("saved");
              setError("");
              setConflict(null);
            }
          }
        }
        return result;
      }).catch((failure) => {
        setError("\u64CD\u4F5C\u5931\u8D25");
        console.error(failure);
        return null;
      });
    }
    function pickOnboardFolder() {
      if (onboardPicking) return;
      setOnboardPicking(true);
      setOnboardError("");
      dshCall("host.pickDirectory", {}).then((picked) => {
        setOnboardPicking(false);
        if (typeof picked === "string" && picked.trim()) setOnboardFolder(picked.trim());
      }).catch((failure) => {
        setOnboardPicking(false);
        setOnboardError("\u9009\u62E9\u6587\u4EF6\u5939\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function startOnboardProject() {
      if (onboardBusy) return;
      const title = onboardTitle.trim() || "\u672A\u547D\u540D\u5C0F\u8BF4";
      setOnboardBusy(true);
      setOnboardError("");
      call("create-project", { title, ...onboardFolder ? { rootDir: onboardFolder } : {} }).then((result) => {
        setOnboardBusy(false);
        if (result && result.project) {
          setOnboardOpen(false);
          setProjectId(result.project.id);
          try {
            if (typeof localStorage !== "undefined") localStorage["mofei.lastProject"] = result.project.id;
          } catch (persistError) {
          }
          reload();
        } else setOnboardError(result && result.error || "\u521B\u5EFA\u9879\u76EE\u5931\u8D25");
      }).catch((failure) => {
        setOnboardBusy(false);
        setOnboardError("\u521B\u5EFA\u9879\u76EE\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    React.useEffect(() => {
      if (!open) return void 0;
      let alive = true;
      setLoading(true);
      call("bootstrap", {}).then((result) => {
        if (!alive) return;
        const nextProjects = result && Array.isArray(result.projects) ? result.projects : [];
        setProjects(nextProjects);
        setDrafts(result && Array.isArray(result.drafts) ? result.drafts : []);
        if (result && result.stats) setStats(result.stats);
        if (!projectRestoredRef.current) {
          projectRestoredRef.current = true;
          try {
            if (typeof localStorage !== "undefined") {
              const lastProject = localStorage["mofei.lastProject"] || null;
              if (lastProject && nextProjects.find((item) => item.id === lastProject)) setProjectId(lastProject);
              else if (lastProject) delete localStorage["mofei.lastProject"];
            }
          } catch (persistError) {
          }
        }
        setLoading(false);
      }).catch((failure) => {
        if (alive) {
          setLoading(false);
          setError("\u65E0\u6CD5\u52A0\u8F7D\u5199\u4F5C\u5DE5\u4F5C\u533A");
        }
        ;
        console.error(failure);
      });
      return () => {
        alive = false;
      };
    }, [open]);
    function persist() {
      if (!projectId || !chapterId || !changed) return Promise.resolve(null);
      return call("save-draft", { projectId, chapterId, content: draft, baseRevision: revision }).then((result) => {
        if (result && result.draft) setDrafts((items) => items.filter((item) => !(item.projectId === projectId && item.chapterId === chapterId)).concat([result.draft]));
        return result;
      }).catch((failure) => {
        setStatus("error");
        setError("\u8349\u7A3F\u6301\u4E45\u5316\u5931\u8D25\uFF0C\u8BF7\u52FF\u5173\u95ED\u9875\u9762");
        console.error(failure);
        return null;
      });
    }
    function updateView(next) {
      setProjects((items) => items.map((item) => item.id !== projectId ? item : { ...item, chapters: item.chapters.map((current) => current.id === next.id ? next : current) }));
    }
    function accept(next) {
      updateView(next);
      setDraft(next.content);
      setSaved(next.content);
      setRevision(next.revision);
      setDrafts((items) => items.filter((item) => !(item.projectId === projectId && item.chapterId === next.id)));
      setStatus("saved");
      setError("");
      setConflict(null);
    }
    function saveChapter() {
      if (!changed || status === "saving" || conflict) return Promise.resolve(null);
      const contentLimit = getEditorContentLimit(draft);
      if (!contentLimit.isWithinLimit) {
        setStatus("error");
        setError(formatContentLimitError(contentLimit));
        return Promise.resolve(null);
      }
      const key = projectId + ":" + chapterId;
      if (locks.current[key]) return locks.current[key];
      setStatus("saving");
      setError("");
      const operation = call("update-chapter", { projectId, chapterId, content: draft, expectedRevision: revision }).then((result) => {
        if (result && result.stats) setStats(result.stats);
        if (result && result.conflict) {
          setConflict(result.chapter);
          setStatus("error");
          setError("\u8FDC\u7AEF\u6B63\u6587\u5DF2\u66F4\u65B0\uFF0C\u5F53\u524D\u8349\u7A3F\u6CA1\u6709\u88AB\u8986\u76D6\u3002");
        } else if (result && result.chapter) accept(result.chapter);
        else {
          setStatus("error");
          setError("\u4FDD\u5B58\u5931\u8D25\uFF0C\u8349\u7A3F\u4ECD\u5DF2\u4FDD\u7559");
        }
        ;
        return result;
      }).catch((failure) => {
        setStatus("error");
        setError("\u4FDD\u5B58\u5931\u8D25\uFF0C\u8349\u7A3F\u4ECD\u5DF2\u4FDD\u7559");
        console.error(failure);
        return null;
      }).then((result) => {
        delete locks.current[key];
        return result;
      });
      locks.current[key] = operation;
      return operation;
    }
    React.useEffect(() => {
      if (!open || !changed) return void 0;
      const task = debounce(() => {
        persist();
      }, 800);
      task();
      return () => task.dispose();
    }, [open, projectId, chapterId, draft, revision]);
    React.useEffect(() => {
      if (!open || !changed || status !== "unsaved" || conflict) return void 0;
      const task = debounce(() => {
        saveChapter();
      }, 3e3);
      task();
      return () => task.dispose();
    }, [open, projectId, chapterId, draft, revision, status, conflict]);
    React.useEffect(() => {
      if (!open || !showHistory || !projectId || !chapterId) {
        if (!showHistory) setHistoryList([]);
        return void 0;
      }
      let alive = true;
      setHistoryLoading(true);
      call("chapter-history", { projectId, chapterId }).then((result) => {
        if (alive) {
          setHistoryList(result && Array.isArray(result.history) ? result.history : []);
          setHistoryLoading(false);
        }
      }).catch((failure) => {
        if (alive) {
          setHistoryLoading(false);
          setError("\u65E0\u6CD5\u8BFB\u53D6\u5386\u53F2\u7248\u672C");
        }
        ;
        console.error(failure);
      });
      return () => {
        alive = false;
      };
    }, [open, showHistory, projectId, chapterId]);
    React.useEffect(() => {
      if (!open || !searchOpen || !projectId) {
        if (!searchOpen) {
          setSearchResults([]);
          setSearchQuery("");
        }
        return void 0;
      }
      const query = searchQuery.trim();
      if (!query) {
        setSearchResults([]);
        setSearching(false);
        return void 0;
      }
      setSearching(true);
      const task = debounce(() => {
        call("search-chapters", { projectId, query }).then((result) => {
          setSearchResults(result && Array.isArray(result.results) ? result.results : []);
          setSearching(false);
        }).catch((failure) => {
          setSearching(false);
          console.error(failure);
        });
      }, 350);
      task();
      return () => task.dispose();
    }, [open, searchOpen, projectId, searchQuery]);
    function pickProject(id) {
      persist();
      disarm();
      setShowHistory(false);
      setSearchOpen(false);
      setOpenTabs([]);
      setFindOpen(false);
      setProjectId(id);
      setChapterId("");
      setDraft("");
      setSaved("");
      setRevision(0);
      setStatus("saved");
      setError("");
      setConflict(null);
      setSelChar("");
      setSelNote("");
      setSelWorld("");
      setWorldName("");
      setWorldKeys("");
      setWorldContent("");
      setWorldDirty(false);
      setAiHistory([]);
      setAiResult("");
      setAiError("");
      setAiBatchResults([]);
      setAiBatchError("");
      try {
        if (typeof localStorage !== "undefined") localStorage["mofei.lastProject"] = id;
      } catch (persistError) {
      }
    }
    function backToProjectList() {
      persist();
      disarm();
      setShowHistory(false);
      setSearchOpen(false);
      setOpenTabs([]);
      setFindOpen(false);
      setProjectId("");
      setChapterId("");
      setDraft("");
      setSaved("");
      setRevision(0);
      setStatus("saved");
      setError("");
      setConflict(null);
      setSelChar("");
      setSelNote("");
      setSelWorld("");
      setWorldName("");
      setWorldKeys("");
      setWorldContent("");
      setWorldDirty(false);
      setAiHistory([]);
      setAiResult("");
      setAiError("");
      setAiBatchResults([]);
      setAiBatchError("");
    }
    function fmtAgo(value) {
      const at = typeof value === "number" ? value : Date.parse(String(value || ""));
      if (!Number.isFinite(at)) return "";
      const diff = Math.max(0, Date.now() - at);
      const m = Math.floor(diff / 6e4);
      if (m < 1) return "\u521A\u521A";
      if (m < 60) return m + "\u5206";
      const h2 = Math.floor(m / 60);
      if (h2 < 24) return h2 + "\u65F6";
      const d = Math.floor(h2 / 24);
      return d + "\u5929";
    }
    function selectChatSession(sessionId) {
      if (!sessionId || !project || project.writerSessionId !== sessionId) return;
      const sessions = dshClientSessions;
      setChatSessionId(sessionId);
      try {
        if (sessions && typeof sessions.open === "function") sessions.open(sessionId);
      } catch (error2) {
      }
      setChatSessionsOpen(false);
    }
    function pickChapter(next) {
      persist();
      disarm();
      setProjectWide(false);
      setShowHistory(false);
      setTab("projects");
      const local = drafts.find((item) => item.projectId === projectId && item.chapterId === next.id);
      ensureTab(next);
      setChapterId(next.id);
      setSaved(next.content);
      setDraft(local ? local.content : next.content);
      setRevision(local ? local.baseRevision : next.revision);
      if (local && local.baseRevision !== next.revision) {
        setConflict(next);
        setStatus("error");
        setError("\u6B63\u6587\u7248\u672C\u5DF2\u53D8\u5316\uFF0C\u672C\u5730\u8349\u7A3F\u5DF2\u6062\u590D\u4F46\u4E0D\u4F1A\u8986\u76D6\u6B63\u6587\u3002");
      } else {
        setConflict(null);
        setStatus(local && local.content !== next.content ? "unsaved" : "saved");
        setError("");
      }
      try {
        if (typeof localStorage !== "undefined") localStorage["mofei.lastChapter." + projectId] = next.id;
      } catch (persistError) {
      }
      restoreScrollPos();
    }
    React.useEffect(() => {
      setTitleDraft(chapter && typeof chapter.title === "string" ? chapter.title : "");
    }, [chapterId]);
    React.useEffect(() => {
      if (!open || !projectId || chapterId || restoredProjectRef.current === projectId) return void 0;
      const currentProject = projects.find((item) => item.id === projectId);
      if (!currentProject) return void 0;
      restoredProjectRef.current = projectId;
      let lastId = null;
      try {
        if (typeof localStorage !== "undefined") lastId = localStorage["mofei.lastChapter." + projectId] || null;
      } catch (error2) {
        lastId = null;
      }
      if (!lastId) return void 0;
      const target = currentProject.chapters.find((c) => c.id === lastId);
      if (target) pickChapter(target);
      return void 0;
    }, [open, projectId, chapterId, projects]);
    function jumpToResult(res) {
      const target = project && project.chapters.find((c) => c.id === res.chapterId);
      if (!target) return;
      pickChapter(target);
      later(() => {
        const el = document.querySelector("textarea.mf-text");
        if (el) {
          const lines = el.value.split("\n");
          const first = res.matches && res.matches[0] ? res.matches[0].line : 1;
          let pos = 0;
          for (let i = 0; i < first - 1 && i < lines.length; i++) pos += lines[i].length + 1;
          el.focus();
          el.setSelectionRange(pos, pos);
          el.scrollTop = lines.length ? (first - 1) / lines.length * el.scrollHeight : 0;
        }
      }, 350);
    }
    function createProject() {
      if (!newProject.trim()) return;
      const rootDir = currentDshWorkspacePath();
      call("create-project", { title: newProject, ...rootDir ? { rootDir } : {} }).then((result) => {
        if (result && result.project) {
          setNewProject("");
          setProjectForm(false);
          setProjectId(result.project.id);
          try {
            if (typeof localStorage !== "undefined") localStorage["mofei.lastProject"] = result.project.id;
          } catch (persistError) {
          }
          reload();
        }
      }).catch((failure) => {
        setError("\u521B\u5EFA\u9879\u76EE\u5931\u8D25");
        console.error(failure);
      });
    }
    function createChapter(volumeId) {
      if (!projectId || !newChapter.trim()) return;
      call("create-chapter", { projectId, title: newChapter, volumeId: volumeId || null }).then((result) => {
        if (result && result.chapter) {
          setNewChapter("");
          setChapterForm(false);
          setProjects((items) => items.map((item) => item.id !== projectId ? item : { ...item, chapters: item.chapters.concat([result.chapter]) }));
          pickChapter(result.chapter);
        }
      }).catch((failure) => {
        setError("\u521B\u5EFA\u7AE0\u8282\u5931\u8D25");
        console.error(failure);
      });
    }
    function startRename(kind, id, currentTitle) {
      setRename({ kind, id });
      setRenameValue(currentTitle);
    }
    function commitRename() {
      if (!rename || !renameValue.trim()) {
        setRename(null);
        return;
      }
      const args = rename.kind === "project" ? { projectId: rename.id, title: renameValue } : rename.kind === "chapter" ? { projectId, chapterId: rename.id, title: renameValue } : rename.kind === "volume" ? { projectId, volumeId: rename.id, title: renameValue } : rename.kind === "character" ? { projectId, characterId: rename.id, name: renameValue } : rename.kind === "note" ? { projectId, noteId: rename.id, title: renameValue } : { projectId, categoryId: rename.id, title: renameValue };
      const method = rename.kind === "project" ? "update-project" : rename.kind === "chapter" ? "update-chapter-meta" : rename.kind === "volume" ? "update-volume" : rename.kind === "character" ? "update-character" : rename.kind === "note" ? "update-note" : "rename-note-category";
      call(method, args).then(() => {
        setRename(null);
        setRenameValue("");
        reload();
      }).catch((failure) => {
        setError("\u91CD\u547D\u540D\u5931\u8D25");
        console.error(failure);
      });
    }
    function commitTitle() {
      if (!projectId || !chapterId || !chapter) return;
      const value = String(titleDraft || "").trim();
      if (!value || value === chapter.title) {
        setTitleDraft(chapter.title);
        return;
      }
      call("update-chapter-meta", { projectId, chapterId, title: value }).then(() => {
        setProjects((items) => items.map((item) => item.id !== projectId ? item : { ...item, chapters: item.chapters.map((current) => current.id === chapterId ? { ...current, title: value } : current) }));
        setOpenTabs((tabs) => tabs.map((t) => t.id === chapterId ? { ...t, title: value } : t));
        setTitleDraft(value);
      }).catch((failure) => {
        setError("\u7AE0\u8282\u6807\u9898\u4FDD\u5B58\u5931\u8D25");
        console.error(failure);
      });
    }
    function deleteProject(id, confirmed) {
      if (!confirmed && !arm("delete-project", id)) return;
      call("delete-project", { projectId: id }).then(() => {
        disarm();
        try {
          if (typeof localStorage !== "undefined") {
            if (localStorage["mofei.lastProject"] === id) delete localStorage["mofei.lastProject"];
            const key = "mofei.lastChapter." + id;
            if (localStorage[key]) delete localStorage[key];
          }
        } catch (persistError) {
        }
        reload();
      }).catch((failure) => {
        disarm();
        setError("\u5220\u9664\u9879\u76EE\u5931\u8D25");
        console.error(failure);
      });
    }
    function saveProjectDescription(item, description) {
      call("update-project", { projectId: item.id, description }).then(() => reload()).catch((failure) => {
        setError("\u7B80\u4ECB\u4FDD\u5B58\u5931\u8D25");
        console.error(failure);
      });
    }
    function deleteChapter(id) {
      if (!arm("delete-chapter", id)) return;
      call("delete-chapter", { projectId, chapterId: id }).then(() => {
        disarm();
        try {
          if (typeof localStorage !== "undefined" && localStorage["mofei.lastChapter." + projectId] === id) delete localStorage["mofei.lastChapter." + projectId];
        } catch (error2) {
        }
        reload();
      }).catch((failure) => {
        disarm();
        setError("\u5220\u9664\u7AE0\u8282\u5931\u8D25");
        console.error(failure);
      });
    }
    function deleteVolume(id) {
      if (!arm("delete-volume", id)) return;
      call("delete-volume", { projectId, volumeId: id }).then(() => {
        disarm();
        reload();
      }).catch((failure) => {
        disarm();
        setError("\u5220\u9664\u5377\u5931\u8D25");
        console.error(failure);
      });
    }
    function deleteCharacter(id) {
      if (!arm("delete-character", id)) return;
      call("delete-character", { projectId, characterId: id }).then(() => {
        disarm();
        if (selChar === id) {
          setSelChar("");
          setCharName("");
          setCharDesc("");
          setCharDirty(false);
        }
        reload();
      }).catch((failure) => {
        disarm();
        setError("\u5220\u9664\u89D2\u8272\u5931\u8D25");
        console.error(failure);
      });
    }
    function deleteNote(id) {
      if (!arm("delete-note", id)) return;
      call("delete-note", { projectId, noteId: id }).then(() => {
        disarm();
        if (selNote === id) {
          setSelNote("");
          setNoteTitle("");
          setNoteContent("");
          setNoteDirty(false);
        }
        reload();
      }).catch((failure) => {
        disarm();
        setError("\u5220\u9664\u7B14\u8BB0\u5931\u8D25");
        console.error(failure);
      });
    }
    function deleteCategory(id) {
      if (!arm("delete-category", id)) return;
      call("delete-note-category", { projectId, categoryId: id }).then(() => {
        disarm();
        reload();
      }).catch((failure) => {
        disarm();
        setError("\u5220\u9664\u5206\u7C7B\u5931\u8D25");
        console.error(failure);
      });
    }
    function moveChapter(id, direction) {
      call("move-chapter", { projectId, chapterId: id, direction }).then(() => reload()).catch((failure) => {
        setError("\u8C03\u6574\u987A\u5E8F\u5931\u8D25");
        console.error(failure);
      });
    }
    function moveVolume(id, direction) {
      call("move-volume", { projectId, volumeId: id, direction }).then(() => reload()).catch((failure) => {
        setError("\u8C03\u6574\u5377\u987A\u5E8F\u5931\u8D25");
        console.error(failure);
      });
    }
    function reorderChapters(targetId, before) {
      if (!project || dragKind !== "chapter" || !dragId || dragId === targetId) return;
      const ordered = project.chapters.slice().sort((a, b) => a.order - b.order).map((c) => c.id);
      const from = ordered.indexOf(dragId);
      if (from < 0) return;
      ordered.splice(from, 1);
      let to = ordered.indexOf(targetId);
      if (to < 0) return;
      if (!before) to += 1;
      ordered.splice(to, 0, dragId);
      call("reorder-chapters", { projectId, chapterIds: ordered }).then(() => reload()).catch((failure) => {
        setError("\u62D6\u62FD\u6392\u5E8F\u5931\u8D25");
        console.error(failure);
      });
    }
    function reorderVolumes(targetId, before) {
      if (!project || dragKind !== "volume" || !dragId || dragId === targetId) return;
      const ordered = project.volumes.slice().sort((a, b) => a.order - b.order).map((v) => v.id);
      const from = ordered.indexOf(dragId);
      if (from < 0) return;
      ordered.splice(from, 1);
      let to = ordered.indexOf(targetId);
      if (to < 0) return;
      if (!before) to += 1;
      ordered.splice(to, 0, dragId);
      call("reorder-volumes", { projectId, volumeIds: ordered }).then(() => reload()).catch((failure) => {
        setError("\u62D6\u62FD\u6392\u5E8F\u5931\u8D25");
        console.error(failure);
      });
    }
    function setChapterVolume(id, volumeId) {
      call("set-chapter-volume", { projectId, chapterId: id, volumeId: volumeId || null }).then(() => {
        setMoveVolFor("");
        reload();
      }).catch((failure) => {
        setError("\u79FB\u52A8\u7AE0\u8282\u5931\u8D25");
        console.error(failure);
      });
    }
    function commitGoal() {
      const value = parseInt(goalInput, 10);
      if (isNaN(value) || value < 0) {
        setGoalForm(false);
        return;
      }
      call("update-project", { projectId, goal: value }).then(() => {
        setGoalForm(false);
        reload();
      }).catch((failure) => {
        setError("\u8BBE\u7F6E\u76EE\u6807\u5931\u8D25");
        console.error(failure);
      });
    }
    function rollbackTo(rev) {
      if (!arm("rollback", String(rev))) return;
      call("rollback-chapter", { projectId, chapterId, toRevision: rev }).then((result) => {
        disarm();
        setShowHistory(false);
        if (result && result.chapter) accept(result.chapter);
        else reload();
      }).catch((failure) => {
        disarm();
        setError("\u56DE\u6EDA\u5931\u8D25");
        console.error(failure);
      });
    }
    function pickCharacter(item) {
      setSelChar(item.id);
      setCharName(item.name);
      setCharDesc(item.description);
      setCharDirty(false);
      setEntityHistOpen(false);
      setEntityHistList([]);
    }
    function saveCharacter() {
      if (!selChar) return;
      call("update-character", { projectId, characterId: selChar, name: charName, description: charDesc }).then(() => {
        setCharDirty(false);
        reload();
      }).catch((failure) => {
        setError("\u4FDD\u5B58\u89D2\u8272\u5931\u8D25");
        console.error(failure);
      });
    }
    function createCharacter() {
      if (!newChar.trim()) return;
      call("create-character", { projectId, name: newChar }).then((result) => {
        if (result && result.character) {
          setNewChar("");
          setCharForm(false);
          reload();
        }
      }).catch((failure) => {
        setError("\u521B\u5EFA\u89D2\u8272\u5931\u8D25");
        console.error(failure);
      });
    }
    function toggleFavorite(id) {
      call("toggle-character-favorite", { projectId, characterId: id }).then(() => reload()).catch((failure) => {
        setError("\u6536\u85CF\u5931\u8D25");
        console.error(failure);
      });
    }
    function pickWorld(item) {
      setSelWorld(item.id);
      setWorldName(item.name);
      setWorldKeys((item.keys || []).join("\uFF0C"));
      setWorldContent(item.content);
      setWorldDirty(false);
      setEntityHistOpen(false);
      setEntityHistList([]);
    }
    function saveWorld() {
      if (!selWorld) return;
      if (worldNameConflict(worldEntries, worldName, selWorld)) {
        setError("\u4E16\u754C\u4E66\u6761\u76EE\u540D\u79F0\u5DF2\u5B58\u5728");
        return;
      }
      ;
      call("update-world-entry", { projectId, entryId: selWorld, name: worldName, keys: worldKeys, content: worldContent }).then(() => {
        setWorldDirty(false);
        reload();
      }).catch((failure) => {
        setError("\u4FDD\u5B58\u4E16\u754C\u4E66\u6761\u76EE\u5931\u8D25");
        console.error(failure);
      });
    }
    function createWorld() {
      if (!newWorld.trim()) return;
      if (worldNameConflict(worldEntries, newWorld, null)) {
        setError("\u4E16\u754C\u4E66\u6761\u76EE\u540D\u79F0\u5DF2\u5B58\u5728");
        return;
      }
      ;
      call("create-world-entry", { projectId, name: newWorld, content: "" }).then((result) => {
        if (result && result.entry) {
          setNewWorld("");
          setWorldForm(false);
          pickWorld(result.entry);
          reload();
        }
      }).catch((failure) => {
        setError("\u521B\u5EFA\u4E16\u754C\u4E66\u6761\u76EE\u5931\u8D25");
        console.error(failure);
      });
    }
    function deleteWorld(id) {
      if (!arm("delete-world", id)) return;
      call("delete-world-entry", { projectId, entryId: id }).then(() => {
        disarm();
        if (selWorld === id) {
          setSelWorld("");
          setWorldName("");
          setWorldKeys("");
          setWorldContent("");
          setWorldDirty(false);
        }
        reload();
      }).catch((failure) => {
        disarm();
        setError("\u5220\u9664\u4E16\u754C\u4E66\u6761\u76EE\u5931\u8D25");
        console.error(failure);
      });
    }
    function toggleWorldFlag(id, field) {
      const current = worldEntries.find((item) => item.id === id);
      call("update-world-entry", { projectId, entryId: id, [field]: !(current ? current[field] : false) }).then(() => reload()).catch((failure) => {
        setError("\u5207\u6362\u5931\u8D25");
        console.error(failure);
      });
    }
    function toggleWorldSelect(id) {
      setWorldSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : items.concat([id]));
    }
    function toggleWorldSelectAll() {
      setWorldSelected((items) => toggleAllSelection(worldEntries, items, filterWorldEntries(worldEntries, worldQuery)));
    }
    function runWorldBulkToggle(isEnabled) {
      if (!projectId || worldBatchBusy) return;
      const plan = buildBulkTogglePlan(worldEntries, worldSelected, isEnabled);
      if (!plan.entryIds.length) return;
      setWorldBatchBusy(true);
      setError("");
      const direct = () => call("update-world-entries", { projectId, entryIds: plan.entryIds, patch: { isEnabled } });
      direct().then(() => {
        setWorldBatchBusy(false);
        reload();
      }).catch((failure) => {
        if (String(failure && failure.message || "").includes("METHOD_NOT_FOUND")) {
          Promise.all(plan.entryIds.map((entryId) => call("update-world-entry", { projectId, entryId, isEnabled }))).then(() => {
            setWorldBatchBusy(false);
            reload();
          }).catch((failure2) => {
            setWorldBatchBusy(false);
            setError("\u6279\u91CF\u5207\u6362\u5931\u8D25");
            console.error(failure2);
          });
        } else {
          setWorldBatchBusy(false);
          setError("\u6279\u91CF\u5207\u6362\u5931\u8D25");
          console.error(failure);
        }
      });
    }
    function runWorldBulkDelete() {
      if (!projectId || worldBatchBusy) return;
      const plan = buildBulkDeletePlan(worldEntries, worldSelected);
      if (!plan.entryIds.length) {
        setWorldDeleteArmed(false);
        return;
      }
      setWorldBatchBusy(true);
      setError("");
      const direct = () => call("delete-world-entries", { projectId, entryIds: plan.entryIds });
      direct().then(() => {
        setWorldBatchBusy(false);
        setWorldSelected([]);
        setWorldDeleteArmed(false);
        reload();
      }).catch((failure) => {
        if (String(failure && failure.message || "").includes("METHOD_NOT_FOUND")) {
          Promise.all(plan.entryIds.map((entryId) => call("delete-world-entry", { projectId, entryId }))).then(() => {
            setWorldBatchBusy(false);
            setWorldSelected([]);
            setWorldDeleteArmed(false);
            reload();
          }).catch((failure2) => {
            setWorldBatchBusy(false);
            setError("\u6279\u91CF\u5220\u9664\u5931\u8D25");
            console.error(failure2);
          });
        } else {
          setWorldBatchBusy(false);
          setError("\u6279\u91CF\u5220\u9664\u5931\u8D25");
          console.error(failure);
        }
      });
    }
    function handleWorldBulkDeleteClick() {
      if (worldDeleteArmed) {
        if (worldDeleteTimer.current) {
          clearTimeout(worldDeleteTimer.current);
          worldDeleteTimer.current = null;
        }
        runWorldBulkDelete();
      } else {
        setWorldDeleteArmed(true);
        worldDeleteTimer.current = later(() => {
          setWorldDeleteArmed(false);
          worldDeleteTimer.current = null;
        }, 3e3);
      }
    }
    function currentEntityId() {
      if (entityHistKind === "character") return character ? character.id : selChar;
      if (entityHistKind === "note") return note ? note.id : selNote;
      if (entityHistKind === "world-entry") return worldEntry ? worldEntry.id : selWorld;
      return "";
    }
    function entitySnapshotLabel(kind, entry) {
      const snap = entry && entry.snapshot ? entry.snapshot : {};
      if (kind === "character") return (snap.name || "\u672A\u547D\u540D\u89D2\u8272") + (snap.description ? " \xB7 " + String(snap.description).slice(0, 24) : "");
      if (kind === "note") return (snap.title || "\u672A\u547D\u540D\u7B14\u8BB0") + (snap.content ? " \xB7 " + String(snap.content).slice(0, 24) : "");
      return (snap.name || "\u672A\u547D\u540D\u6761\u76EE") + " \xB7 " + (snap.isEnabled === false ? "\u7981\u7528" : "\u542F\u7528");
    }
    function toggleEntityHistory(kind, id) {
      if (entityHistOpen && entityHistKind === kind) {
        setEntityHistOpen(false);
        setEntityHistList([]);
        setEntityHistError("");
        return;
      }
      setEntityHistOpen(true);
      setEntityHistKind(kind);
      setEntityHistLoading(true);
      setEntityHistList([]);
      setEntityHistError("");
      call("entity-history", { projectId, kind, entityId: id }).then((result) => {
        setEntityHistList(Array.isArray(result && result.history) ? result.history : []);
        setEntityHistLoading(false);
      }).catch((failure) => {
        setEntityHistLoading(false);
        setEntityHistError("\u5386\u53F2\u52A0\u8F7D\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function rollbackEntity(entry) {
      const entityId = currentEntityId();
      if (!projectId || !entityId || !entry) return;
      const revision2 = typeof entry.revision === "number" ? entry.revision : Number(entry.revision);
      if (!Number.isFinite(revision2)) return;
      const key = entityHistKind + ":" + entityId + ":" + String(revision2);
      if (!arm("rollback-entity", key)) return;
      call("rollback-entity", { projectId, kind: entityHistKind, entityId, toRevision: revision2 }).then((result) => {
        disarm();
        const entity = result && result.entity;
        if (entity) {
          if (entityHistKind === "character") {
            setCharName(entity.name || "");
            setCharDesc(entity.description || "");
            setCharDirty(false);
          } else if (entityHistKind === "note") {
            setNoteTitle(entity.title || "");
            setNoteContent(entity.content || "");
            setNoteDirty(false);
          } else if (entityHistKind === "world-entry") {
            setWorldName(entity.name || "");
            setWorldKeys(Array.isArray(entity.keys) ? entity.keys.join("\uFF0C") : "");
            setWorldContent(entity.content || "");
            setWorldDirty(false);
          }
        }
        setEntityHistOpen(false);
        setEntityHistList([]);
        reload();
      }).catch((failure) => {
        disarm();
        setEntityHistError("\u56DE\u6EDA\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function loadPromptChains(scopeId = projectId) {
      if (!scopeId) return;
      call("list-prompt-chains", { projectId: scopeId }).then((result) => {
        setChains(Array.isArray(result && result.chains) ? result.chains : []);
        setChainError("");
      }).catch((failure) => {
        setChains([]);
        setChainError("\u94FE\u529F\u80FD\u9700\u91CD\u542F DSH \u540E\u53EF\u7528\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function openPromptChains(scopeId = "") {
      const selectedId = scopeId || projectId || projects[0] && projects[0].id || "";
      if (!selectedId) {
        setChainsOpen(true);
        setChainError("\u8BF7\u5148\u521B\u5EFA\u4E00\u4E2A\u9879\u76EE\uFF0C\u518D\u914D\u7F6E\u63D0\u793A\u8BCD\u94FE\u3002");
        return;
      }
      if (!projectId) pickProject(selectedId);
      setChainsOpen(true);
      setChainError("");
      setChainResult("");
      setChainLastPrompt("");
      loadPromptChains(selectedId);
    }
    function openWritingSkills() {
      setSkillsOpen(true);
      setSkillsLoading(true);
      setSkillsError("");
      Promise.all([call("list-writing-skills"), call("list-skill-settings")]).then(([skillsResult, settingsResult]) => {
        setWritingSkills(Array.isArray(skillsResult && skillsResult.skills) ? skillsResult.skills : []);
        setSkillSettings(settingsResult || null);
        setSkillsLoading(false);
      }).catch((failure) => {
        setWritingSkills([]);
        setSkillSettings(null);
        setSkillsLoading(false);
        setSkillsError("\u5199\u4F5C\u6307\u4EE4\u52A0\u8F7D\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function refreshSkillSettings() {
      if (!skillsOpen) return;
      call("list-instructions").then((result) => {
        if (result) setWritingSkills(result.items || result.instructions || []);
      }).catch(() => {
      });
    }
    function toggleSkill(skillId, enabled) {
      Promise.resolve({}).then((result) => {
        if (result && result.error) {
          setSkillsError(String(result.error));
          return;
        }
        setSkillSettings((current) => {
          if (!current) return current;
          const next = new Set(Array.isArray(current.disabledSkills) ? current.disabledSkills : []);
          if (enabled) next.delete(skillId);
          else next.add(skillId);
          return { ...current, disabledSkills: [...next] };
        });
        setSkillsError("");
      }).catch((failure) => {
        setSkillsError("\u6280\u80FD\u5F00\u5173\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function createCustomSkill(form) {
      return call("create-custom-skill", form).then((result) => {
        if (result && result.error) return result;
        refreshSkillSettings();
        return result;
      }).catch((failure) => ({ error: String(failure && failure.message || failure) }));
    }
    function deleteCustomSkill(name) {
      call("delete-custom-skill", { name }).then(() => refreshSkillSettings()).catch(() => {
      });
    }
    React.useEffect(() => {
      if (mode !== "web" || loading) return;
      setOnboardOpen(!projects.length);
      if (!onboardFolder) {
        const workspacePath = currentDshWorkspacePath();
        if (workspacePath) setOnboardFolder(workspacePath);
      }
    }, [mode, loading, projects, onboardFolder]);
    const chatSessionListRef = React.useRef(chatSessionList);
    chatSessionListRef.current = chatSessionList;
    const sessionListNonEmpty = (chatSessionList.ids || []).length > 0;
    React.useEffect(() => {
      if (chatSessionId) autoSessionMenuRef.current = false;
    }, [chatSessionId]);
    React.useEffect(() => {
      if (mode !== "web" || loading || chatSessionId) return void 0;
      if (autoSessionMenuRef.current) return void 0;
      const list = chatSessionListRef.current;
      const hasHistory = (Array.isArray(list.ids) ? list.ids : []).some((id) => {
        const summary = list.byId && list.byId[id];
        return summary && summary.origin !== "subagent";
      });
      if (!hasHistory) return void 0;
      autoSessionMenuRef.current = true;
      return later(() => setChatSessionsOpen(true), 400);
    }, [mode, loading, chatSessionId, sessionListNonEmpty]);
    function handleSaveChain(input) {
      if (!projectId || chainBusy) return;
      setChainBusy(true);
      setChainError("");
      call("save-prompt-chain", { projectId, chainId: input && input.chainId, name: input && input.name, content: input && input.content }).then((result) => {
        setChainBusy(false);
        if (result && result.chain) setChainActiveId(result.chain.id);
        loadPromptChains();
      }).catch((failure) => {
        setChainBusy(false);
        setChainError("\u4FDD\u5B58\u94FE\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function handleDeleteChain(chain) {
      if (!projectId || !chain || chainBusy) return;
      if (!arm("delete-chain", chain.id)) return;
      call("delete-prompt-chain", { projectId, chainId: chain.id }).then(() => {
        disarm();
        if (chainActiveId === chain.id) setChainActiveId("");
        loadPromptChains();
      }).catch((failure) => {
        disarm();
        setChainError("\u5220\u9664\u94FE\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function handleRunChain(chain) {
      if (!projectId || !chain || chainBusy) return;
      setChainBusy(true);
      setChainError("");
      setChainResult("");
      setChainLastPrompt("");
      const selected = draft.slice(selStart, selEnd);
      call("run-prompt-chain", { projectId, chainId: chain.id, chapterId: chapterId || void 0, selected: selected || void 0 }).then((result) => {
        setChainBusy(false);
        setChainResult(result && result.text || "");
        setChainLastPrompt(result && result.prompt || "");
        if (result && result.historyCount) loadAiHistory();
      }).catch((failure) => {
        setChainBusy(false);
        setChainError("\u8FD0\u884C\u94FE\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function loadRoleDetail(scopeId, roleId) {
      if (!scopeId || !roleId) {
        setRoleDetail(null);
        return Promise.resolve(null);
      }
      setRoleDetail(null);
      return call("read-role", { projectId: scopeId, roleId }).then((result) => {
        if (result && result.error) throw new Error(result.error);
        const next = result && result.role ? result.role : null;
        setRoleDetail(next);
        return next;
      });
    }
    function loadRoles(scopeId = roleScopeId || projectId, preferredRoleId = roleActiveId) {
      if (!scopeId) return;
      Promise.all([call("list-roles", { projectId: scopeId }), call("list-instructions")]).then(([rolesResult, instructionResult]) => {
        if (rolesResult && rolesResult.error) throw new Error(rolesResult.error);
        if (instructionResult && instructionResult.error) throw new Error(instructionResult.error);
        const nextRoles = Array.isArray(rolesResult && rolesResult.roles) ? rolesResult.roles : [];
        const nextRoleId = nextRoles.some((role) => role && role.id === preferredRoleId) ? preferredRoleId : nextRoles[0] && nextRoles[0].id || "";
        setRoleScopeId(scopeId);
        setRoles(nextRoles);
        setRoleActiveId(nextRoleId);
        setPrivateInstructions(Array.isArray(instructionResult && (instructionResult.items || instructionResult.instructions)) ? instructionResult.items || instructionResult.instructions : []);
        setRoleError("");
        return loadRoleDetail(scopeId, nextRoleId);
      }).catch((failure) => {
        setRoles([]);
        setPrivateInstructions([]);
        setRoleError("\u63D0\u793A\u8BCD\u52A0\u8F7D\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function loadRetrievalStatus() {
      setRetrievalBusy(true);
      call("retrieval-model-status").then((result) => setRetrievalStatus(result || null)).catch((failure) => setRetrievalStatus({ embeddingReady: false, rerankReady: false, embeddingError: String(failure && failure.message || failure) })).finally(() => setRetrievalBusy(false));
    }
    function openSettingsPanel() {
      if (props && props.onOpenSettings) props.onOpenSettings();
      setSettingsOpen(true);
      if (!retrievalStatus) loadRetrievalStatus();
    }
    function openModelsPanel() {
      setModelsOpen(true);
      setModelError("");
      Promise.all([projectId ? call("list-roles", { projectId }) : Promise.resolve({ roles: [{ id: "writer", name: "\u6B63\u6587\u5199\u4F5C\u8005" }, { id: "reviewer", name: "\u5BA1\u7A3F\u8005" }, { id: "analyzer", name: "\u8BBE\u5B9A\u5206\u6790\u8005" }, { id: "polisher", name: "\u8BED\u8A00\u6DA6\u8272\u8005" }] }), call("get-model-settings"), call("list-model-catalog")]).then(([rolesResult, modelResult, catalogResult]) => {
        setRoles(Array.isArray(rolesResult && rolesResult.roles) ? rolesResult.roles : []);
        setModelSettings(modelResult && modelResult.settings ? modelResult.settings : { version: 1, general: {}, byRole: {}, byProject: {} });
        setModelCatalog(catalogResult && catalogResult.providers ? catalogResult : { providers: [] });
      }).catch((failure) => setModelError("\u6A21\u578B\u914D\u7F6E\u52A0\u8F7D\u5931\u8D25\uFF1A" + String(failure && failure.message || failure)));
    }
    function saveModelSettings(settings) {
      setModelBusy(true);
      setModelError("");
      const current = modelSettings && typeof modelSettings === "object" ? modelSettings : { version: 1, general: {}, byRole: {}, byProject: {} };
      const next = { ...current, version: 1, general: current.general || {}, byRole: current.byRole || {}, byProject: { ...current.byProject || {} } };
      if (projectId) next.byProject[projectId] = { general: settings.general || {}, byRole: settings.byRole || {} };
      else {
        next.general = settings.general || {};
        next.byRole = settings.byRole || {};
      }
      call("save-model-settings", { settings: next }).then((result) => {
        setModelSettings(result && result.settings ? result.settings : next);
        setModelBusy(false);
        setModelsOpen(false);
      }).catch((failure) => {
        setModelBusy(false);
        setModelError("\u6A21\u578B\u914D\u7F6E\u4FDD\u5B58\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function openRolesPanel(scopeId = "") {
      const selectedId = scopeId || projectId || projects[0] && projects[0].id || "";
      if (!selectedId) {
        setRolesOpen(true);
        setRoleError("\u8BF7\u5148\u521B\u5EFA\u4E00\u4E2A\u9879\u76EE\uFF0C\u518D\u914D\u7F6E\u5B50\u4EE3\u7406\u63D0\u793A\u8BCD\u3002");
        return;
      }
      if (!projectId) pickProject(selectedId);
      setRoleScopeId(selectedId);
      setRolesOpen(true);
      setRoleError("");
      setRoleDetail(null);
      setRoleActiveId("");
      loadRoles(selectedId, "");
    }
    function handleSelectRole(roleId) {
      setRoleActiveId(roleId || "");
      const scopeId = roleScopeId || projectId;
      loadRoleDetail(scopeId, roleId).catch((failure) => {
        setRoleError("\u8BFB\u53D6\u63D0\u793A\u8BCD\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function handleSaveRole(input) {
      const scopeId = roleScopeId || projectId;
      if (!scopeId || roleBusy) return;
      setRoleBusy(true);
      setRoleError("");
      call("save-role", { projectId: scopeId, roleId: input && input.roleId, name: input && input.name, entries: input && input.entries, defaultInstructions: input && input.defaultInstructions }).then((result) => {
        if (result && result.error) throw new Error(result.error);
        setRoleBusy(false);
        if (result && result.role) setRoleActiveId(result.role.id);
        loadRoles(scopeId, result && result.role ? result.role.id : "");
      }).catch((failure) => {
        setRoleBusy(false);
        setRoleError("\u4FDD\u5B58\u63D0\u793A\u8BCD\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function handleDeleteRole(role) {
      const scopeId = roleScopeId || projectId;
      if (!scopeId || !role || roleBusy) return;
      if (!arm("delete-role", role.id)) return;
      call("delete-role", { projectId: scopeId, roleId: role.id }).then((result) => {
        if (result && result.error) throw new Error(result.error);
        disarm();
        loadRoles(scopeId, result && result.role ? result.role.id : "");
      }).catch((failure) => {
        disarm();
        setRoleError("\u5220\u9664\u63D0\u793A\u8BCD\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function handleAddEntry() {
      const list = roleDetail && Array.isArray(roleDetail.entries) ? roleDetail.entries.slice() : [];
      list.push({ name: "", content: "", order: list.length, isEnabled: true });
      setRoleDetail(Object.assign({}, roleDetail, { entries: list }));
    }
    function handleUpdateRoleName(name) {
      if (!roleDetail) return;
      setRoleDetail(Object.assign({}, roleDetail, { name: String(name == null ? "" : name) }));
    }
    function handleUpdateEntry(index, patch) {
      if (!roleDetail || !Array.isArray(roleDetail.entries)) return;
      const list = roleDetail.entries.slice();
      if (index < 0 || index >= list.length) return;
      list[index] = Object.assign({}, list[index], patch);
      setRoleDetail(Object.assign({}, roleDetail, { entries: list }));
    }
    function handleToggleInstruction(index, patch) {
      if (!roleDetail || !Array.isArray(roleDetail.defaultInstructions)) return;
      const list = roleDetail.defaultInstructions.slice();
      if (index < 0) return;
      if (index >= list.length) {
        if (!patch || typeof patch.instructionId !== "string" || !patch.instructionId) return;
        list.push(Object.assign({ instructionId: patch.instructionId, order: (list.length + 1) * 10, isEnabled: true }, patch));
      } else list[index] = Object.assign({}, list[index], patch);
      setRoleDetail(Object.assign({}, roleDetail, { defaultInstructions: list }));
    }
    function handleDeleteEntry(index) {
      if (!roleDetail || !Array.isArray(roleDetail.entries)) return;
      const list = roleDetail.entries.slice();
      if (index < 0 || index >= list.length) return;
      list.splice(index, 1);
      setRoleDetail(Object.assign({}, roleDetail, { entries: list }));
    }
    function moveWorld(id, direction) {
      call("move-world-entry", { projectId, entryId: id, direction }).then(() => reload()).catch((failure) => {
        setError("\u8C03\u6574\u4E16\u754C\u4E66\u987A\u5E8F\u5931\u8D25");
        console.error(failure);
      });
    }
    function readWorldImportFile(file) {
      if (!file) return;
      setWorldImportBusy(true);
      setWorldImportError("");
      setWorldImportResult("");
      const reader = new FileReader();
      reader.onload = () => {
        call("import-world-info-json", { projectId, content: String(reader.result || ""), mode: worldImportMode }).then((result) => {
          setWorldImportBusy(false);
          if (result && result.error) {
            setWorldImportError(result.error);
            setWorldImportResult("");
            return;
          }
          setWorldImportResult("\u5DF2\u5BFC\u5165 " + String(result && result.importedCount || 0) + " \u6761\uFF08" + (worldImportMode === "overwrite" ? "\u8986\u76D6\u6A21\u5F0F" : "\u8FFD\u52A0\u6A21\u5F0F") + "\uFF09");
          reload();
        }).catch((failure) => {
          setWorldImportBusy(false);
          setWorldImportError("\u5BFC\u5165\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
        });
      };
      reader.onerror = () => {
        setWorldImportBusy(false);
        setWorldImportError("\u65E0\u6CD5\u8BFB\u53D6\u6587\u4EF6");
      };
      reader.readAsText(file, "utf-8");
    }
    function pickNote(item) {
      setSelNote(item.id);
      setNoteTitle(item.title);
      setNoteContent(item.content);
      setNoteDirty(false);
      setEntityHistOpen(false);
      setEntityHistList([]);
      ensureNoteTab(item);
    }
    function saveNote() {
      if (!selNote) return;
      call("update-note", { projectId, noteId: selNote, title: noteTitle, content: noteContent }).then(() => {
        setNoteDirty(false);
        reload();
      }).catch((failure) => {
        setError("\u4FDD\u5B58\u7B14\u8BB0\u5931\u8D25");
        console.error(failure);
      });
    }
    function createNote(categoryId) {
      if (!newNote.trim()) return;
      call("create-note", { projectId, title: newNote, categoryId: categoryId || null }).then((result) => {
        if (result && result.note) {
          setNewNote("");
          setNoteForm(false);
          reload();
        }
      }).catch((failure) => {
        setError("\u521B\u5EFA\u7B14\u8BB0\u5931\u8D25");
        console.error(failure);
      });
    }
    function toggleNoteFlag(id, field) {
      call("update-note", { projectId, noteId: id, [field]: !(note && note.id === id ? note[field] : false) }).then(() => reload()).catch((failure) => {
        setError("\u5207\u6362\u5931\u8D25");
        console.error(failure);
      });
    }
    function createCategory(parentId) {
      const title = parentId ? newSubCat : newCat;
      if (!title.trim()) return;
      call("create-note-category", { projectId, title, parentId: parentId || null }).then(() => {
        setNewCat("");
        setNewSubCat("");
        setCatForm(false);
        setSubCatFor("");
        reload();
      }).catch((failure) => {
        setError("\u521B\u5EFA\u5206\u7C7B\u5931\u8D25");
        console.error(failure);
      });
    }
    function moveNote(id, categoryId) {
      call("move-note", { projectId, noteId: id, categoryId: categoryId || null }).then(() => reload()).catch((failure) => {
        setError("\u79FB\u52A8\u7B14\u8BB0\u5931\u8D25");
        console.error(failure);
      });
    }
    function createVolume() {
      if (!newVol.trim()) return;
      call("create-volume", { projectId, title: newVol }).then((result) => {
        if (result && result.volume) {
          setNewVol("");
          setVolForm(false);
          reload();
        }
      }).catch((failure) => {
        setError("\u521B\u5EFA\u5377\u5931\u8D25");
        console.error(failure);
      });
    }
    function close() {
      persist();
      setOpen(false);
      removeStyles();
    }
    function closePalette() {
      setPaletteOpen(false);
      setPaletteQuery("");
    }
    function rebase() {
      if (conflict) {
        updateView(conflict);
        setSaved(conflict.content);
        setRevision(conflict.revision);
        setConflict(null);
        setStatus("unsaved");
        setError("\u8349\u7A3F\u5DF2\u57FA\u4E8E\u8FDC\u7AEF\u6700\u65B0\u7248\u672C\uFF0C\u53EF\u68C0\u67E5\u540E\u4FDD\u5B58\u3002");
      }
    }
    function decodeTxtBuffer(buffer) {
      const bytes = new Uint8Array(buffer);
      const bom = [];
      if (bytes.length >= 3 && bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) {
        bom.push("utf-8");
        try {
          return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "UTF-8 BOM" };
        } catch (error2) {
        }
      } else if (bytes.length >= 2 && bytes[0] === 255 && bytes[1] === 254) {
        try {
          return { text: new TextDecoder("utf-16le", { fatal: true }).decode(bytes), encoding: "UTF-16 LE BOM" };
        } catch (error2) {
        }
      } else if (bytes.length >= 2 && bytes[0] === 254 && bytes[1] === 255) {
        try {
          return { text: new TextDecoder("utf-16be", { fatal: true }).decode(bytes), encoding: "UTF-16 BE BOM" };
        } catch (error2) {
        }
      }
      if (!bom.length) {
        try {
          return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "UTF-8" };
        } catch (error2) {
        }
        const candidates = ["gb18030", "big5"];
        for (const label2 of candidates) {
          try {
            return { text: new TextDecoder(label2, { fatal: true }).decode(bytes), encoding: label2.toUpperCase() };
          } catch (error2) {
          }
        }
      }
      return { text: new TextDecoder("utf-8").decode(bytes), encoding: "UTF-8\uFF08\u66FF\u6362\u89E3\u7801\uFF09" };
    }
    function readImportFile(file) {
      if (!file) return;
      setImportBusy(true);
      setImportError("");
      setImportPreview(null);
      setImportContent("");
      setImportEncoding("");
      file.arrayBuffer().then((buffer) => {
        const decoded = decodeTxtBuffer(buffer);
        setImportContent(decoded.text);
        setImportEncoding(decoded.encoding);
        return call("import-txt-preview", { content: decoded.text }).then((result) => {
          if (result && result.error) {
            setImportError(result.error);
            setImportPreview(null);
          } else setImportPreview(result);
          setImportBusy(false);
        });
      }).catch((failure) => {
        setImportBusy(false);
        setImportError("\u89E3\u6790\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function confirmImport() {
      if (!importContent || importBusy) return;
      setImportBusy(true);
      setImportError("");
      call("import-txt-confirm", { title: importName, description: "", content: importContent }).then((result) => {
        setImportBusy(false);
        if (result && result.project) {
          setImportOpen(false);
          setImportPreview(null);
          setImportContent("");
          setImportName("");
          setImportEncoding("");
          setProjectId(result.project.id);
          reload();
        } else setImportError("\u5BFC\u5165\u5931\u8D25");
      }).catch((failure) => {
        setImportBusy(false);
        setImportError("\u5BFC\u5165\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function exportProjectTxt() {
      if (!projectId) return;
      call("export-project-txt", { projectId }).then((result) => {
        if (!result || typeof result.content !== "string") {
          setError("\u5BFC\u51FA\u5931\u8D25");
          return;
        }
        const blob = new Blob([result.content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename || "\u58A8\u6249.txt";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        later(() => URL.revokeObjectURL(url), 5e3);
      }).catch((failure) => {
        setError("\u5BFC\u51FA\u5931\u8D25");
        console.error(failure);
      });
    }
    function ensureTab(chapterItem) {
      setOpenTabs((tabs) => tabs.some((t) => t.id === chapterItem.id) ? tabs : tabs.concat([{ kind: "chapter", id: chapterItem.id, title: chapterItem.title }]));
    }
    function ensureNoteTab(noteItem) {
      setOpenTabs((tabs) => tabs.some((t) => t.kind === "note" && t.id === noteItem.id) ? tabs : tabs.concat([{ kind: "note", id: noteItem.id, title: noteItem.title }]));
    }
    function switchChapterTab(id) {
      if (!project) return;
      const targetTab = openTabs.find((t) => t.id === id);
      if (!targetTab) return;
      persist();
      if (targetTab.kind === "note") {
        const item = project.notes.find((n) => n.id === id);
        if (item) {
          setTab("notes");
          pickNote(item);
        }
      } else {
        const target = project.chapters.find((c) => c.id === id);
        if (target) pickChapter(target);
      }
    }
    function closeChapterTab(id) {
      if (!project) return;
      const targetTab = openTabs.find((t) => t.id === id);
      if (targetTab && targetTab.pinned) return;
      const tabs = openTabs.filter((t) => t.id !== id);
      setOpenTabs(tabs);
      if (id !== activeTabId) return;
      persist();
      if (tabs.length) {
        const next = tabs[tabs.length - 1];
        if (next.kind === "note") {
          const item = project.notes.find((n) => n.id === next.id);
          if (item) {
            setTab("notes");
            pickNote(item);
          } else clearChapter();
        } else {
          const target = project.chapters.find((c) => c.id === next.id);
          if (target) pickChapter(target);
          else clearChapter();
        }
      } else clearChapter();
    }
    function clearChapter() {
      setChapterId("");
      setDraft("");
      setSaved("");
      setRevision(0);
      setStatus("saved");
      setError("");
      setConflict(null);
    }
    function openTabMenu(event, t) {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const x = Math.min(Math.max(rect.left, 8), Math.max(8, (typeof window !== "undefined" ? window.innerWidth : 1024) - 170));
      setTabMenu({ id: t.id, kind: t.kind, x, y: rect.bottom + 4, pinned: !!t.pinned });
    }
    function closeTabMenu() {
      setTabMenu(null);
    }
    function pinTab(id) {
      setOpenTabs((tabs) => tabs.map((t) => t.id === id ? { ...t, pinned: !t.pinned } : t));
    }
    function closeOtherTabs(id) {
      setOpenTabs((tabs) => tabs.filter((t) => t.id === id || t.pinned));
    }
    function moveTab(targetId, before) {
      if (!tabDragId || tabDragId === targetId) return;
      const list = openTabs.slice();
      const from = list.findIndex((t) => t.id === tabDragId);
      if (from < 0) return;
      const moved = list.splice(from, 1)[0];
      let to = list.findIndex((t) => t.id === targetId);
      if (to < 0) return;
      if (!before) to += 1;
      list.splice(to, 0, moved);
      setOpenTabs(list);
    }
    function saveScrollPos() {
      if (!projectId || !chapterId) return;
      const el = document.querySelector("textarea.mf-text");
      if (!el) return;
      try {
        if (typeof localStorage !== "undefined") localStorage["mofei.scroll." + projectId + "." + chapterId] = String(el.scrollTop);
      } catch (error2) {
      }
    }
    function restoreScrollPos() {
      if (!projectId || !chapterId) return;
      let top = 0;
      try {
        if (typeof localStorage !== "undefined") top = Number(localStorage["mofei.scroll." + projectId + "." + chapterId] || 0);
      } catch (error2) {
        top = 0;
      }
      if (!Number.isFinite(top) || top <= 0) return;
      later(() => {
        const el = document.querySelector("textarea.mf-text");
        if (el) el.scrollTop = top;
      }, 80);
    }
    function findAt(pos) {
      if (pos < 0) return;
      const el = document.querySelector("textarea.mf-text");
      if (!el) return;
      const lines = el.value.slice(0, pos).split("\n");
      el.focus();
      el.setSelectionRange(pos, pos + findQuery.length);
      el.scrollTop = lines.length ? (lines.length - 1) / Math.max(1, el.value.split("\n").length) * el.scrollHeight : 0;
    }
    function updateFind(query) {
      setFindQuery(query);
      const matches = [];
      if (query) {
        const text = draft;
        let pos = 0;
        while ((pos = text.indexOf(query, pos)) !== -1) {
          matches.push(pos);
          pos += query.length;
        }
      }
      setFindMatches(matches);
      if (matches.length) {
        setFindIndex(0);
        findAt(matches[0]);
      } else setFindIndex(-1);
    }
    function findNext() {
      if (!findMatches.length) return;
      const next = (findIndex + 1) % findMatches.length;
      setFindIndex(next);
      findAt(findMatches[next]);
    }
    function findPrev() {
      if (!findMatches.length) return;
      const prev = (findIndex - 1 + findMatches.length) % findMatches.length;
      setFindIndex(prev);
      findAt(findMatches[prev]);
    }
    function replaceOne() {
      if (!findMatches.length || findIndex < 0 || !findQuery) return;
      const pos = findMatches[findIndex];
      const nextDraft = draft.slice(0, pos) + replaceQuery + draft.slice(pos + findQuery.length);
      setDraft(nextDraft);
      if (!conflict) {
        setStatus("unsaved");
        setError("");
      }
      const remaining = findMatches.slice(findIndex + 1).map((p) => p - findQuery.length + replaceQuery.length);
      setFindMatches(remaining);
      setFindIndex(remaining.length ? 0 : -1);
      if (remaining.length) findAt(remaining[0]);
    }
    function replaceAll() {
      if (!findQuery) return;
      setDraft(draft.split(findQuery).join(replaceQuery));
      if (!conflict) {
        setStatus("unsaved");
        setError("");
      }
      setFindMatches([]);
      setFindIndex(-1);
    }
    function lineRange(text, start, end) {
      const lineStart = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
      let lineEnd = text.indexOf("\n", end);
      if (lineEnd < 0) lineEnd = text.length;
      return { lineStart, lineEnd };
    }
    function applyMarkdown(kind) {
      const el = document.querySelector("textarea.mf-text");
      if (!el) return;
      const text = el.value;
      const start = el.selectionStart || 0;
      const end = el.selectionEnd || start;
      let next = text;
      let nextStart = start;
      let nextEnd = end;
      if (kind === "h2" || kind === "h3" || kind === "list" || kind === "quote") {
        const range = lineRange(text, start, end);
        const prefix = kind === "h2" ? "## " : kind === "h3" ? "### " : kind === "list" ? "- " : "> ";
        const block = text.slice(range.lineStart, range.lineEnd).split("\n").map((line) => line.startsWith(prefix) ? line.slice(prefix.length) : prefix + line).join("\n");
        next = text.slice(0, range.lineStart) + block + text.slice(range.lineEnd);
        nextStart = range.lineStart;
        nextEnd = range.lineStart + block.length;
      } else if (kind === "hr") {
        const marker = (text.slice(0, start).trim() ? "\n\n" : "") + "---\n";
        next = text.slice(0, start) + marker + text.slice(end);
        nextStart = nextEnd = start + marker.length;
      } else {
        const selected = text.slice(start, end);
        const pad = kind === "bold" ? "**" : kind === "italic" ? "*" : kind === "inline" ? "`" : kind === "code" ? "```\n" : "";
        const close2 = kind === "code" ? "\n```" : pad;
        const body = selected || (kind === "bold" ? "\u91CD\u70B9" : kind === "italic" ? "\u5F3A\u8C03" : kind === "inline" ? "\u4EE3\u7801" : kind === "code" ? "\u4EE3\u7801\u5757" : "");
        next = text.slice(0, start) + pad + body + close2 + text.slice(end);
        nextStart = start + pad.length;
        nextEnd = nextStart + body.length;
      }
      setDraft(next);
      if (!conflict) {
        setStatus("unsaved");
        setError("");
      }
      later(() => {
        const target = document.querySelector("textarea.mf-text");
        if (target) {
          target.focus();
          target.setSelectionRange(nextStart, nextEnd);
        }
      }, 0);
    }
    function stopAi() {
      if (aiAbort.current) {
        try {
          aiAbort.current.abort();
        } catch (error2) {
        }
        aiAbort.current = null;
      }
      setAiBusy(false);
    }
    function parseSseFrames(buffer, onFrame) {
      let rest = buffer;
      let separator = -1;
      while ((separator = rest.indexOf("\n\n")) >= 0) {
        const frame = rest.slice(0, separator);
        rest = rest.slice(separator + 2);
        let event = "message";
        let data = "";
        frame.split("\n").forEach((line) => {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).replace(/^ /, "");
        });
        if (!data) continue;
        let payload = null;
        try {
          payload = JSON.parse(data);
        } catch (error2) {
          payload = null;
        }
        onFrame(event, payload);
      }
      return rest;
    }
    function runAi() {
      if (!chapterId || aiBusy) return;
      let selected = "";
      if (aiMode === "rewrite") {
        selected = draft.slice(selStart, selEnd);
        if (!selected) {
          setAiError("\u8BF7\u5148\u5728\u6B63\u6587\u4E2D\u9009\u4E2D\u8981\u6539\u5199\u7684\u6587\u672C");
          setAiResult("");
          return;
        }
      }
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      aiAbort.current = controller;
      setAiBusy(true);
      setAiError("");
      setAiResult("");
      let output = "";
      let buffer = "";
      let completed = false;
      const finishStream = (persisted) => {
        completed = true;
        if (persisted && output) loadAiHistory();
        setAiBusy(false);
        aiAbort.current = null;
      };
      fetch("/api/mofei/stream/ai-assist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ args: { projectId, chapterId, mode: aiMode, selected, prompt: aiPrompt } }),
        signal: controller ? controller.signal : void 0
      }).then(async (response) => {
        if (!response.ok) throw new Error("HTTP " + String(response.status));
        if (!response.body) throw new Error("\u5F53\u524D\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u6D41\u5F0F\u54CD\u5E94");
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        while (true) {
          const step = await reader.read();
          if (step.done) break;
          buffer += decoder.decode(step.value, { stream: true });
          buffer = parseSseFrames(buffer, (event, payload) => {
            if (event === "delta" && payload && typeof payload.text === "string") {
              output += payload.text;
              setAiResult(output);
            } else if (event === "done") {
              setAiResult(payload && typeof payload.text === "string" ? payload.text : output);
              finishStream(true);
            } else if (event === "error") {
              setAiError(payload && payload.message || payload && payload.code || "\u751F\u6210\u5931\u8D25");
              setAiBusy(false);
              aiAbort.current = null;
            }
          });
        }
        buffer += decoder.decode();
        buffer = parseSseFrames(buffer, (event, payload) => {
          if (event === "delta" && payload && typeof payload.text === "string") {
            output += payload.text;
            setAiResult(output);
          } else if (event === "done") {
            setAiResult(payload && typeof payload.text === "string" ? payload.text : output);
            finishStream(true);
          } else if (event === "error") {
            setAiError(payload && payload.message || payload && payload.code || "\u751F\u6210\u5931\u8D25");
            setAiBusy(false);
            aiAbort.current = null;
          }
        });
        if (!completed && aiAbort.current && controller && !controller.signal.aborted) {
          setAiBusy(false);
          aiAbort.current = null;
        }
      }).catch((failure) => {
        if (controller && controller.signal.aborted) {
          setAiBusy(false);
          aiAbort.current = null;
          return;
        }
        setAiBusy(false);
        aiAbort.current = null;
        setAiError("\u751F\u6210\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function loadAiHistory() {
      if (!projectId) return Promise.resolve(null);
      return call("ai-history", { projectId }).then((result) => {
        setAiHistory(result && Array.isArray(result.messages) ? result.messages : []);
        return result;
      }).catch((failure) => {
        console.error(failure);
        return null;
      });
    }
    function clearAiHistory() {
      if (!projectId) return;
      call("ai-clear-history", { projectId }).then(() => {
        setAiHistory([]);
        setAiResult("");
        setAiError("");
      }).catch((failure) => {
        setAiError("\u6E05\u7A7A\u5386\u53F2\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function runAiBatch() {
      if (!projectId || aiBatchBusy) return;
      setAiBatchBusy(true);
      setAiBatchError("");
      setAiBatchResults([]);
      call("job-start-summarize", { projectId, kind: "chapters" }).then((result) => {
        if (result && result.jobId) {
          setAiBatchJobId(result.jobId);
          setAiBatchBusy(false);
          setJobListOpen(true);
          pollMofeiJobs();
          return;
        }
        if (result && result.error === "JOBS_UNAVAILABLE") {
          call("ai-summarize-chapters", { projectId }).then((sync) => {
            setAiBatchBusy(false);
            if (sync && Array.isArray(sync.summaries)) setAiBatchResults(sync.summaries);
            else setAiBatchError(sync && sync.error || "\u6279\u91CF\u6458\u8981\u5931\u8D25");
          }).catch((failure) => {
            setAiBatchBusy(false);
            setAiBatchError("\u6279\u91CF\u6458\u8981\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
          });
          return;
        }
        setAiBatchBusy(false);
        setAiBatchError(result && result.error || "\u542F\u52A8\u540E\u53F0\u6458\u8981\u5931\u8D25");
      }).catch((failure) => {
        setAiBatchBusy(false);
        setAiBatchError("\u542F\u52A8\u540E\u53F0\u6458\u8981\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function pollMofeiJobs() {
      call("job-list-mofei", {}).then((result) => {
        setMofeiJobs(Array.isArray(result && result.jobs) ? result.jobs : []);
      }).catch(() => {
      });
    }
    React.useEffect(() => {
      if (!jobListOpen) return void 0;
      let alive = true;
      const poll = () => {
        call("job-list-mofei", {}).then((result) => {
          if (alive) setMofeiJobs(Array.isArray(result && result.jobs) ? result.jobs : []);
        }).catch(() => {
        });
      };
      poll();
      const timer = setInterval(poll, 2e3);
      return () => {
        alive = false;
        clearInterval(timer);
      };
    }, [jobListOpen]);
    React.useEffect(() => {
      if (!aiBatchJobId) return void 0;
      let alive = true;
      const poll = () => {
        call("job-result-mofei", { jobId: aiBatchJobId }).then((result) => {
          if (!alive || !result) return;
          if (result.status === "completed") {
            setAiBatchJobId("");
            if (Array.isArray(result.summaries)) setAiBatchResults(result.summaries);
            if (projectId) refreshSummaryPanel();
          } else if (result.status === "failed" || result.status === "killed") {
            setAiBatchJobId("");
            setAiBatchError(result.status === "killed" ? "\u540E\u53F0\u6458\u8981\u5DF2\u53D6\u6D88" : result.error || "\u540E\u53F0\u6458\u8981\u5931\u8D25");
          }
        }).catch(() => {
        });
      };
      poll();
      const timer = setInterval(poll, 2e3);
      return () => {
        alive = false;
        clearInterval(timer);
      };
    }, [aiBatchJobId]);
    function killMofeiJob(jobId) {
      call("job-kill-mofei", { jobId }).then(() => pollMofeiJobs()).catch(() => {
      });
    }
    React.useEffect(() => {
      if (!open) return void 0;
      const sessions = dshClientSessions;
      if (!sessions || !sessions.list || typeof sessions.list.subscribe !== "function") {
        setChatHint("DSH \u4F1A\u8BDD\u670D\u52A1\u4E0D\u53EF\u7528");
        return void 0;
      }
      const syncList = () => {
        try {
          const snap = sessions.list.getSnapshot();
          setChatSessionList({ ids: snap && snap.ids || [], byId: snap && snap.byId || {} });
          if (chatSessionId) setChatSummary(snap && snap.byId && snap.byId[chatSessionId] || null);
        } catch (error2) {
        }
      };
      syncList();
      const unsub = sessions.list.subscribe(syncList);
      return () => {
        if (unsub && typeof unsub === "function") unsub();
      };
    }, [open, chatSessionId]);
    React.useEffect(() => {
      if (!open || !chatSessionId) return void 0;
      const sessions = dshClientSessions;
      if (!sessions || typeof sessions.binding !== "function") {
        setChatHint("DSH \u4F1A\u8BDD\u670D\u52A1\u4E0D\u53EF\u7528");
        return void 0;
      }
      let unsub = null;
      try {
        const binding2 = sessions.binding(chatSessionId);
        if (binding2 && binding2.session && typeof binding2.session.subscribe === "function") {
          setChatHint("");
          if (typeof binding2.session.open === "function") {
            try {
              binding2.session.open();
            } catch (openError) {
            }
          }
          unsub = binding2.session.subscribe(() => {
            setChatSnap(binding2.session.getSnapshot());
          });
          setChatSnap(binding2.session.getSnapshot());
        } else {
          setChatHint("\u4F1A\u8BDD\u4E0D\u53EF\u7ED1\u5B9A\uFF08\u53EF\u80FD\u5DF2\u5F52\u6863\uFF09");
        }
      } catch (error2) {
        setChatHint("\u4F1A\u8BDD\u7ED1\u5B9A\u5931\u8D25\uFF1A" + String(error2 && error2.message || error2));
      }
      return () => {
        if (unsub && typeof unsub === "function") unsub();
      };
    }, [open, chatSessionId]);
    React.useEffect(() => {
      let alive = true;
      if (!open || !chatSessionId || !projectId) {
        setAgentContextBound(false);
        return void 0;
      }
      call("bind-agent-context", { sessionId: chatSessionId, projectId, ...chapterId ? { chapterId } : {} }).then((result) => {
        if (alive) setAgentContextBound(!!(result && result.bound));
      }).catch(() => {
        if (alive) setAgentContextBound(false);
      });
      return () => {
        alive = false;
      };
    }, [open, chatSessionId, projectId, chapterId]);
    React.useEffect(() => {
      if (!open || !project || !chatSessionId || project.writerSessionId !== chatSessionId || !chatSnap) return void 0;
      const writes = normalizeChatItems(chatSnap).filter((item) => item.kind === "tool" && !item.running && item.ok !== false && /^(?:mofei|openfic)_(?:write|edit|update|create|delete|move|set|reorder|save|revert|rollback)-/.test(String(item.name || "")));
      const token = writes.map((item) => item.key || item.name).join("|");
      if (!token || token === agentMutationRefreshRef.current) return void 0;
      agentMutationRefreshRef.current = token;
      const cancel = later(() => {
        reload();
      }, 80);
      return cancel;
    }, [open, projectId, project && project.writerSessionId, chatSessionId, chatSnap]);
    const reloadRef = React.useRef(reload);
    reloadRef.current = reload;
    const syncStoreRef = React.useRef(null);
    const syncFileRef = React.useRef(null);
    const workspaceDiscoveryRef = React.useRef({ path: "", at: 0 });
    React.useEffect(() => {
      if (mode !== "web") return void 0;
      let alive = true;
      let busy = false;
      const sync = async () => {
        if (busy || !alive) return;
        busy = true;
        try {
          const workspaceRoot = currentDshWorkspacePath();
          const discovery = workspaceDiscoveryRef.current;
          if (workspaceRoot && (workspaceRoot !== discovery.path || Date.now() - discovery.at > 5e3)) {
            workspaceDiscoveryRef.current = { path: workspaceRoot, at: Date.now() };
            await timedCall("discover-workspace", { workspaceRoot }, 15e3);
          }
          const result = await timedCall("sync-status", {}, 5e3);
          if (!alive || !result) return;
          const storeStamp = result && result.storeStamp || "";
          const fileStamp = result && result.fileStamp || "";
          const first = syncStoreRef.current === null && syncFileRef.current === null;
          const storeChanged = storeStamp !== (syncStoreRef.current || "");
          const fileChanged = fileStamp !== (syncFileRef.current || "");
          syncStoreRef.current = storeStamp;
          syncFileRef.current = fileStamp;
          if (first || fileChanged && !storeChanged) {
            const imported = await timedCall("reload-from-files", {}, 15e3);
            if (!alive || !imported) return;
          }
          if (first || storeChanged || fileChanged) await reloadRef.current();
        } catch (error2) {
        } finally {
          busy = false;
        }
      };
      sync();
      const timer = setInterval(sync, 2e3);
      return () => {
        alive = false;
        clearInterval(timer);
      };
    }, [mode]);
    React.useEffect(() => {
      if (!open) return void 0;
      const api = dshClientConnection && dshClientConnection.api;
      if (!api || !api.agentPresets || typeof api.agentPresets.list !== "function") return void 0;
      let alive = true;
      Promise.resolve(api.agentPresets.list({})).then((response) => {
        if (!alive) return;
        const value = response && response.result && response.result.ok ? response.result.value : null;
        const presets = value && Array.isArray(value.presets) ? value.presets.filter((p) => !p.broken) : [];
        setChatPresets(presets);
        if (presets.length && !presets.some((p) => p.id === chatPresetId)) setChatPresetId(presets[0].id);
      }).catch(() => {
      });
      return () => {
        alive = false;
      };
    }, [open]);
    React.useEffect(() => {
      if (chatBodyRef.current) chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }, [chatSnap, chatOpen]);
    function sendChat() {
      const text = chatInput.trim();
      if (!text || chatBusy || !chatSessionId) return;
      const sessions = dshClientSessions;
      const binding2 = sessions && sessions.binding(chatSessionId);
      if (!binding2 || !binding2.session || typeof binding2.session.prompt !== "function") {
        setChatError("\u4F1A\u8BDD\u4E0D\u53EF\u7528");
        return;
      }
      setChatBusy(true);
      setChatError("");
      binding2.session.prompt([{ type: "text", text }], "queue").then((result) => {
        setChatBusy(false);
        if (result && result.ok === false) setChatError("\u53D1\u9001\u5931\u8D25\uFF1A" + String(result.error || "\u672A\u77E5\u9519\u8BEF"));
      }).catch((failure) => {
        setChatBusy(false);
        setChatError("\u53D1\u9001\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
      setChatInput("");
    }
    function cancelChat() {
      const sessions = dshClientSessions;
      const binding2 = sessions && chatSessionId && sessions.binding(chatSessionId);
      if (binding2 && binding2.session && typeof binding2.session.cancel === "function") {
        try {
          binding2.session.cancel();
        } catch (error2) {
        }
      }
    }
    function createdSessionId(created, sessions, before) {
      let sessionId = created && (created.value && created.value.sessionId || created.sessionId) || null;
      if (sessionId) return sessionId;
      const after = sessions && sessions.list && sessions.list.getSnapshot ? sessions.list.getSnapshot() : {};
      return (after.ids || []).find((id) => !before.has(id)) || null;
    }
    async function activateProjectWriterSession(targetProjectId, forceNew) {
      const sessions = dshClientSessions;
      if (!targetProjectId) {
        setChatError("\u8BF7\u5148\u9009\u62E9\u4E00\u672C\u5C0F\u8BF4\u9879\u76EE");
        return null;
      }
      if (!sessions || !sessions.list || typeof sessions.create !== "function") {
        setChatError("DSH \u4F1A\u8BDD\u670D\u52A1\u4E0D\u53EF\u7528");
        return null;
      }
      setChatBusy(true);
      setChatError("");
      try {
        if (!forceNew) {
          const bound2 = await call("writer-session", { projectId: targetProjectId });
          const assignedId = bound2 && bound2.sessionId;
          const snapshot2 = sessions.list.getSnapshot();
          const summary = assignedId && snapshot2 && snapshot2.byId && snapshot2.byId[assignedId];
          if (assignedId && summary && summary.agentPreset === "mofei-writer") {
            if (typeof sessions.open === "function") {
              try {
                sessions.open(assignedId);
              } catch (error2) {
              }
            }
            setChatSessionId(assignedId);
            setChatSummary(summary);
            setChatBusy(false);
            return assignedId;
          }
        }
        const before = new Set(sessions.list.getSnapshot().ids || []);
        const workspaceRoot = currentDshWorkspacePath();
        const created = await dshCall("session.create", { agentPreset: "mofei-writer", ...workspaceRoot ? { cwd: workspaceRoot } : {} });
        const sessionId = createdSessionId(created, sessions, before);
        if (!sessionId) {
          setChatError("\u521B\u5EFA\u9879\u76EE\u5199\u4F5C\u4F1A\u8BDD\u5931\u8D25");
          setChatBusy(false);
          return null;
        }
        const bound = await call("bind-writer-session", { projectId: targetProjectId, sessionId });
        if (!bound || bound.error) {
          setChatError("\u5199\u4F5C\u4F1A\u8BDD\u5F52\u5C5E\u4FDD\u5B58\u5931\u8D25");
          setChatBusy(false);
          return null;
        }
        setProjects((items) => items.map((item) => item.id === targetProjectId ? { ...item, writerSessionId: sessionId } : item));
        if (typeof sessions.open === "function") {
          try {
            sessions.open(sessionId);
          } catch (error2) {
          }
        }
        const snapshot = sessions.list.getSnapshot();
        setChatSessionId(sessionId);
        setChatSummary(snapshot && snapshot.byId && snapshot.byId[sessionId] || { agentPreset: "mofei-writer" });
        setChatBusy(false);
        return sessionId;
      } catch (failure) {
        setChatBusy(false);
        setChatError("\u6253\u5F00\u9879\u76EE\u5199\u4F5C\u4F1A\u8BDD\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
        return null;
      }
    }
    React.useEffect(() => {
      let alive = true;
      if (!open || !projectId) {
        setChatSessionId("");
        setChatSummary(null);
        setChatSnap(null);
        setAgentContextBound(false);
        return void 0;
      }
      activateProjectWriterSession(projectId, false).then((sessionId) => {
        if (!alive || !sessionId) return;
        setChatHint("");
      });
      return () => {
        alive = false;
      };
    }, [open, projectId]);
    async function newChatSession() {
      if (!projectId) {
        setChatError("\u8BF7\u5148\u9009\u62E9\u4E00\u672C\u5C0F\u8BF4\u9879\u76EE");
        return;
      }
      await activateProjectWriterSession(projectId, true);
    }
    async function enterWritingMode() {
      if (!projectId) {
        flashBridgeNotice("\u8BF7\u5148\u5728\u58A8\u6249\u9009\u62E9\u6216\u65B0\u5EFA\u4E00\u672C\u5C0F\u8BF4\u9879\u76EE");
        return;
      }
      const sessionId = await activateProjectWriterSession(projectId, false);
      if (sessionId) flashBridgeNotice("\u270D \u5DF2\u6253\u5F00\u300A" + (project && project.title || "\u5F53\u524D\u9879\u76EE") + "\u300B\u7684\u4E13\u5C5E\u5199\u4F5C\u4F1A\u8BDD");
    }
    function exitCurrentChat() {
      setChatSessionId("");
      setChatSnap(null);
      setChatSummary(null);
      setAgentContextBound(false);
      setChatError("");
    }
    function switchChatSession(sessionId) {
      const sessions = dshClientSessions;
      if (!sessions || !sessionId) return;
      try {
        if (typeof sessions.open === "function") sessions.open(sessionId);
      } catch (error2) {
      }
      const snap = sessions.list && typeof sessions.list.getSnapshot === "function" ? sessions.list.getSnapshot() : null;
      setChatSessionId(sessionId);
      setChatSummary(snap && snap.byId && snap.byId[sessionId] || null);
      setChatSnap(null);
      setChatError("");
      setChatSessionsOpen(false);
    }
    function sessionMenuLabel(summary) {
      if (!summary) return "";
      if (typeof summary.title === "string" && summary.title.trim()) return summary.title.trim();
      return String(summary.id || "").slice(0, 16);
    }
    function sessionMenuBadge(summary) {
      return summary && summary.agentPreset === "mofei-writer" ? "\u270D" : "\xB7";
    }
    function sessionMenuTime(summary) {
      const at = summary && (summary.updatedAt || summary.lastActivityAt);
      if (!at) return "";
      try {
        return fmtTime(at);
      } catch (error2) {
        return "";
      }
    }
    function refreshSummaryPanel(scopeId = projectId) {
      const scopeProject = projects.find((item) => item.id === scopeId) || project;
      if (!scopeId) {
        setSummaryLoading(false);
        setSummaryError("\u8BF7\u5148\u521B\u5EFA\u4E00\u4E2A\u9879\u76EE\uFF0C\u518D\u67E5\u770B\u6458\u8981\u3002");
        return;
      }
      setSummaryLoading(true);
      setSummaryError("");
      const sorted = scopeProject ? scopeProject.chapters.slice().sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
      const chaptersPromise = call("chapter-summaries", { projectId: scopeId }).then((result) => {
        const rows = result && Array.isArray(result.chapters) ? result.chapters : [];
        return rows.length || !sorted.length ? rows : sorted.map((item) => ({ chapterId: item.id, title: item.title, order: item.order, revision: item.revision, volumeId: item.volumeId || null, entry: null, stale: true }));
      }).catch((failure) => {
        if (String(failure && failure.message || "").includes("METHOD_NOT_FOUND")) {
          return Promise.all(sorted.map((item) => call("chapter-summary", { projectId: scopeId, chapterId: item.id }).then((view) => ({ chapterId: item.id, title: item.title, order: item.order, revision: item.revision, volumeId: item.volumeId || null, entry: view.entry, stale: view.stale }))));
        }
        throw failure;
      });
      Promise.all([chaptersPromise, call("range-summary-groups", { projectId: scopeId }).then((result) => result.groups)]).then(([rows, groups]) => {
        setSummaryRows(Array.isArray(rows) ? rows : []);
        setSummaryRanges(Array.isArray(groups) ? groups : []);
        setSummaryLoading(false);
      }).catch((failure) => {
        setSummaryLoading(false);
        setSummaryError("\u6458\u8981\u52A0\u8F7D\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function openSummaryPanel(scopeId = "") {
      const selectedId = scopeId || projectId || projects[0] && projects[0].id || "";
      if (!selectedId) {
        setSummaryOpen(true);
        setSummaryError("\u8BF7\u5148\u521B\u5EFA\u4E00\u4E2A\u9879\u76EE\uFF0C\u518D\u67E5\u770B\u6458\u8981\u3002");
        return;
      }
      if (!projectId) pickProject(selectedId);
      setSummaryOpen(true);
      refreshSummaryPanel(selectedId);
    }
    function flashBridgeNotice(text) {
      setBridgeNotice(text);
      if (bridgeNoticeTimer.current) {
        clearTimeout(bridgeNoticeTimer.current);
        bridgeNoticeTimer.current = null;
      }
      bridgeNoticeTimer.current = later(() => {
        setBridgeNotice("");
        bridgeNoticeTimer.current = null;
      }, 4e3);
    }
    function currentDshSessionId() {
      try {
        if (dshClientSessions && dshClientSessions.list && typeof dshClientSessions.list.getSnapshot === "function") {
          const snapshot = dshClientSessions.list.getSnapshot();
          if (snapshot && snapshot.current) return snapshot.current;
        }
      } catch (error2) {
      }
      try {
        if (typeof localStorage !== "undefined") {
          const raw = localStorage["dsh.sessions.current"];
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.sessionId) return parsed.sessionId;
          }
        }
      } catch (error2) {
      }
      return null;
    }
    function sendMentionToSession(text) {
      const sessionId = currentDshSessionId();
      if (!sessionId || !dshClientSessions || typeof dshClientSessions.binding !== "function") return Promise.resolve(false);
      try {
        const binding2 = dshClientSessions.binding(sessionId);
        if (!binding2 || !binding2.session || typeof binding2.session.prompt !== "function") return Promise.resolve(false);
        return binding2.session.prompt([{ type: "text", text }], "queue").then((result) => !!(result && result.ok === true && result.value && result.value.accepted === true)).catch(() => false);
      } catch (error2) {
        return Promise.resolve(false);
      }
    }
    function copyTextToClipboard(text) {
      if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") return navigator.clipboard.writeText(text);
      return new Promise((resolve, reject) => {
        try {
          const el = document.createElement("textarea");
          el.value = text;
          el.style.position = "fixed";
          el.style.opacity = "0";
          document.body.appendChild(el);
          el.select();
          const ok = document.execCommand("copy");
          document.body.removeChild(el);
          if (ok) resolve();
          else reject(new Error("copy rejected"));
        } catch (error2) {
          reject(error2);
        }
      });
    }
    function bridgeMention(mode2) {
      if (!project || !chapter) {
        flashBridgeNotice("\u8BF7\u5148\u6253\u5F00\u7AE0\u8282");
        return;
      }
      const base = { projectTitle: project.title, projectId, chapter };
      let text = "";
      if (mode2 === "selection") {
        const selected = draft.slice(selStart, selEnd);
        if (!selected.trim()) {
          flashBridgeNotice("\u8BF7\u5148\u9009\u4E2D\u6B63\u6587");
          return;
        }
        text = buildSelectionMention({ ...base, selected });
      } else if (mode2 === "writer") {
        text = buildWriterMention(base);
      } else if (mode2 === "reviewer") {
        text = buildReviewerMention(base);
      } else {
        text = buildChapterMention(base);
      }
      sendMentionToSession(text).then((sent) => {
        if (sent) flashBridgeNotice("\u5DF2\u53D1\u9001\u5230\u5F53\u524D DSH \u4F1A\u8BDD");
        else copyTextToClipboard(text).then(() => flashBridgeNotice("\u672A\u627E\u5230\u53EF\u53D1\u9001\u4F1A\u8BDD\uFF0C\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F")).catch(() => flashBridgeNotice("\u53D1\u9001\u5931\u8D25\u4E14\u526A\u8D34\u677F\u4E0D\u53EF\u7528"));
      });
    }
    function finishSummaryRun(kind, payload) {
      setSummaryBusy(null);
      setSummaryProgress(null);
      if (payload) {
        setSummaryResult({ kind, count: typeof payload.count === "number" ? payload.count : 0, total: typeof payload.total === "number" ? payload.total : 0, staleCount: typeof payload.staleCount === "number" ? payload.staleCount : 0, freshCount: typeof payload.freshCount === "number" ? payload.freshCount : 0 });
      }
      refreshSummaryPanel();
    }
    function runSummary(kind, extraArgs, busyKind, busyId) {
      if (!projectId || summaryBusy) return;
      setSummaryBusy({ kind: busyKind, id: busyId || null });
      setSummaryProgress({ done: 0, total: 0, label: kind === "chapters" ? "\u51C6\u5907\u751F\u6210\u7AE0\u8282\u6458\u8981\u2026" : "\u51C6\u5907\u751F\u6210\u533A\u95F4\u6458\u8981\u2026" });
      setSummaryError("");
      setSummaryResult(null);
      const streamArgs = { kind, projectId, ...extraArgs || {} };
      let buffer = "";
      let finalPayload = null;
      const onFrame = (event, payload) => {
        if (event === "progress" && payload) {
          const title = payload.title || payload.chapterId || payload.rangeId || "";
          setSummaryProgress({ done: typeof payload.done === "number" ? payload.done : 0, total: typeof payload.total === "number" ? payload.total : 0, label: title ? "\u6B63\u5728\u751F\u6210\u300A" + title + "\u300B" : "\u751F\u6210\u4E2D" });
        } else if (event === "done") {
          finalPayload = payload;
        } else if (event === "error") {
          setSummaryError(payload && payload.message || payload && payload.code || "\u6458\u8981\u751F\u6210\u5931\u8D25");
          setSummaryBusy(null);
          setSummaryProgress(null);
        }
      };
      const fallback = () => {
        const force = extraArgs && extraArgs.force === true ? true : void 0;
        const promise = kind === "chapters" ? call("ai-summarize-chapters", { projectId, chapterIds: extraArgs && extraArgs.chapterIds, force }) : call("ai-summarize-ranges", { projectId, rangeIds: extraArgs && extraArgs.rangeIds, size: extraArgs && extraArgs.size, force });
        promise.then((payload) => finishSummaryRun(kind, payload)).catch((failure) => {
          setSummaryBusy(null);
          setSummaryProgress(null);
          setSummaryError("\u6458\u8981\u751F\u6210\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
        });
      };
      fetch("/api/mofei/stream/ai-summarize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ args: streamArgs })
      }).then(async (response) => {
        if (!response.ok) {
          fallback();
          return;
        }
        if (!response.body) {
          fallback();
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let completed = false;
        while (true) {
          const step = await reader.read();
          if (step.done) break;
          buffer += decoder.decode(step.value, { stream: true });
          buffer = parseSseFrames(buffer, (event, payload) => {
            if (event === "done") completed = true;
            onFrame(event, payload);
          });
        }
        buffer += decoder.decode();
        buffer = parseSseFrames(buffer, onFrame);
        if (!completed) fallback();
        else finishSummaryRun(kind, finalPayload);
      }).catch(() => fallback());
    }
    function insertAiResult() {
      if (!aiResult) return;
      const el = document.querySelector("textarea.mf-text");
      const pos = el ? el.selectionStart : draft.length;
      setDraft(draft.slice(0, pos) + aiResult + draft.slice(pos));
      if (!conflict) {
        setStatus("unsaved");
        setError("");
      }
    }
    function insertChatIntoEditor(text) {
      if (!chapterId) {
        setChatError("\u8BF7\u5148\u5728\u7F16\u8F91\u5668\u6253\u5F00\u7AE0\u8282\uFF0C\u518D\u63D2\u5165\u6B63\u6587");
        return;
      }
      const body = typeof text === "string" ? text : "";
      if (!body.trim()) return;
      const el = document.querySelector("textarea.mf-text");
      const pos = el ? el.selectionStart : draft.length;
      const next = draft.slice(0, pos) + body + draft.slice(pos);
      setDraft(next);
      if (!conflict) {
        setStatus("unsaved");
        setError("");
      }
      later(() => {
        const target = document.querySelector("textarea.mf-text");
        if (target) {
          target.focus();
          target.setSelectionRange(pos + body.length, pos + body.length);
        }
      }, 0);
    }
    function jumpToChapter(ids) {
      if (!ids || !ids.chapterId) return;
      const owner = projects.find((p) => p.id === ids.projectId) || projects.find((p) => p.chapters.some((c) => c.id === ids.chapterId));
      if (!owner) {
        setChatError("\u672A\u627E\u5230\u63D0\u53CA\u7684\u9879\u76EE\uFF08\u53EF\u80FD\u5DF2\u5220\u9664\uFF09");
        return;
      }
      const chapter2 = owner.chapters.find((c) => c.id === ids.chapterId);
      if (!chapter2) {
        setChatError("\u672A\u627E\u5230\u63D0\u53CA\u7684\u7AE0\u8282\uFF08\u53EF\u80FD\u5DF2\u5220\u9664\uFF09");
        return;
      }
      if (owner.id !== projectId) pickProject(owner.id);
      pickChapter(chapter2);
      setChatError("");
    }
    function latestAssistantText() {
      const items = normalizeChatItems(chatSnap);
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].kind === "assistant" && !items[i].streaming && items[i].text && items[i].text.trim()) return items[i].text;
      }
      return "";
    }
    function insertLatestReply() {
      const text = latestAssistantText();
      if (!text) {
        flashBridgeNotice("\u8FD8\u6CA1\u6709 Agent \u56DE\u590D\u53EF\u63D2\u5165");
        return;
      }
      insertChatIntoEditor(text);
      flashBridgeNotice("\u5DF2\u628A\u6700\u65B0\u56DE\u590D\u63D2\u5165\u5149\u6807\u5904");
    }
    function jumpLatestMention() {
      const text = latestAssistantText();
      const ids = parseMentionIds(text);
      if (!ids.chapterId) {
        flashBridgeNotice("\u6700\u65B0\u56DE\u590D\u91CC\u6CA1\u6709\u7AE0\u8282\u63D0\u53CA\uFF08\u5148\u70B9\u300C\u9001\u7AE0\u300D\u8BA9 Agent \u6536\u5230\u7AE0\u8282\uFF09");
        return;
      }
      jumpToChapter(ids);
    }
    React.useEffect(() => {
      if (!open || !aiOpen || !projectId) return void 0;
      let alive = true;
      call("ai-history", { projectId }).then((result) => {
        if (alive) setAiHistory(result && Array.isArray(result.messages) ? result.messages : []);
      }).catch((failure) => {
        console.error(failure);
      });
      return () => {
        alive = false;
      };
    }, [open, aiOpen, projectId]);
    function refreshStyles() {
      if (typeof open !== "undefined" && !open) return Promise.resolve(null);
      return call("list-styles", projectId ? { projectId } : {}).then((result) => {
        setStyles(result && Array.isArray(result.styles) ? result.styles : []);
        return result;
      }).catch(() => {
        setStyles([{ id: "default", name: "\u9ED8\u8BA4", content: "", scope: "global" }]);
        return null;
      });
    }
    React.useEffect(() => {
      if (!open) return void 0;
      let alive = true;
      call("list-styles", projectId ? { projectId } : {}).then((result) => {
        if (alive) setStyles(result && Array.isArray(result.styles) ? result.styles : []);
      }).catch(() => {
        if (alive) setStyles([{ id: "default", name: "\u9ED8\u8BA4", content: "" }]);
      });
      return () => {
        alive = false;
      };
    }, [open, projectId]);
    function runRetrieve() {
      if (!projectId || !retrieveQuery.trim() || retrieveBusy) return;
      setRetrieveBusy(true);
      setRetrieveError("");
      const query = retrieveQuery.trim();
      call("rag-status", { projectId }).then((status2) => {
        if (!status2 || status2.status !== "fresh") return call("rag-build-index", { projectId }).then(() => status2);
        return status2;
      }).then(() => call("search-rag", { projectId, query, limit: 50, force: true })).then((result) => {
        const hits = Array.isArray(result && result.results) ? result.results : [];
        setRetrieveBusy(false);
        setRetrieveResults(hits.map((hit) => Object.assign({}, hit, { line: Number(hit.chunkIndex || 0) + 1, snippet: hit.text || "", score: Number(hit.score || 0).toFixed(2) })));
        if (result && result.rerankError && result.rerankError !== "RERANK_MODEL_LANGUAGE_MISMATCH") setRetrieveError("Rerank \u672A\u542F\u7528\uFF0C\u5DF2\u4FDD\u7559\u5411\u91CF\u53EC\u56DE\u7ED3\u679C\uFF1A" + result.rerankError);
      }).catch((failure) => {
        setRetrieveBusy(false);
        setRetrieveError("\u68C0\u7D22\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function entityKindLabel(kind) {
      return kind === "chapter" ? "\u7AE0\u8282" : kind === "character" ? "\u89D2\u8272" : kind === "note" ? "\u7B14\u8BB0" : kind === "world" ? "\u4E16\u754C" : kind === "summary" ? "\u6458\u8981" : kind;
    }
    function renderGitPatch(patch) {
      if (!patch) return null;
      const lines = String(patch).split("\n");
      return h("div", { className: "mf-git-diff" }, lines.map((line, index) => {
        let cls = "";
        if (line.startsWith("+++") || line.startsWith("---") || /^(commit |Author:|Date:|index |diff --git)/.test(line)) cls = "mf-diff-meta";
        else if (line.startsWith("@@")) cls = "mf-diff-hunk";
        else if (line.startsWith("+")) cls = "mf-diff-add";
        else if (line.startsWith("-")) cls = "mf-diff-del";
        return h("div", { key: index, className: "mf-diff-line" + (cls ? " " + cls : "") }, line || "\xA0");
      }));
    }
    function jumpRetrieveHit(hit) {
      if (!project || !hit) return;
      if (hit.entityType === "chapter" || hit.entityType === "summary") {
        const target = project.chapters.find((c) => c.id === hit.entityId);
        if (target) {
          setTab("projects");
          pickChapter(target);
        }
      } else if (hit.entityType === "character") {
        const target = project.characters.find((c) => c.id === hit.entityId);
        if (target) {
          setTab("characters");
          pickCharacter(target);
        }
      } else if (hit.entityType === "world") {
        const target = project.worldEntries.find((c) => c.id === hit.entityId);
        if (target) {
          setTab("world");
          pickWorld(target);
        }
      } else if (hit.entityType === "note") {
        const target = project.notes.find((c) => c.id === hit.entityId);
        if (target) {
          setTab("notes");
          pickNote(target);
        }
      }
    }
    function loadStyleIntoEditor(styleId) {
      setStyleError("");
      if (!styleId) {
        setSelStyleId("");
        setStyleName("");
        setStyleDesc("");
        setStyleTags("");
        setStyleContent("");
        setStyleDirty(false);
        setStyleScope("global");
        return;
      }
      call("get-style", { styleId, projectId: projectId || void 0 }).then((result) => {
        if (result && result.error) {
          setStyleError(result.error);
          return;
        }
        setSelStyleId(styleId);
        setStyleName(result.style && result.style.name || styleId);
        setStyleDesc(result.style && result.style.description || "");
        setStyleTags(Array.isArray(result.style && result.style.tags) ? result.style.tags.join("\uFF0C") : "");
        setStyleContent(result.style && result.style.content || "");
        setStyleScope(result && result.scope || "global");
        setStyleDirty(false);
      }).catch((failure) => {
        setStyleError("\u8BFB\u53D6\u98CE\u683C\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function createStyle() {
      const id = "custom-" + String(Date.now()).slice(-4);
      setSelStyleId(id);
      setStyleName("\u65B0\u98CE\u683C");
      setStyleDesc("");
      setStyleTags("");
      setStyleContent("# \u65B0\u5199\u4F5C\u98CE\u683C\n\n- \u63CF\u8FF0\u4F60\u7684\u6587\u98CE\u8981\u6C42\u2026");
      setStyleScope(projectId ? "project" : "global");
      setStyleDirty(true);
      setStyleError("");
      setTab("styles");
    }
    function saveStyleEditor() {
      if (!selStyleId || !styleName.trim()) {
        setStyleError("\u98CE\u683C\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
        return;
      }
      const tags = styleTags.split(/[，,]/).map((t) => t.trim()).filter(Boolean);
      call("save-style", { styleId: selStyleId, name: styleName.trim(), description: styleDesc, tags, content: styleContent, scope: styleScope, projectId: styleScope === "project" ? projectId : void 0 }).then(() => {
        setStyleDirty(false);
        setStyleError("");
        refreshStyles();
      }).catch((failure) => {
        setStyleError("\u4FDD\u5B58\u98CE\u683C\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function deleteStyleItem(styleId, scope) {
      if (!arm("delete-style", styleId + ":" + (scope || "global"))) return;
      call("delete-style", { styleId, scope: scope || "global", projectId: scope === "project" ? projectId : void 0 }).then(() => {
        disarm();
        if (selStyleId === styleId) loadStyleIntoEditor("");
        refreshStyles();
      }).catch((failure) => {
        disarm();
        setStyleError("\u5220\u9664\u98CE\u683C\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    function refreshGitHistory(chainId, diff) {
      if (!projectId) return;
      const wantDiff = typeof diff === "boolean" ? diff : gitHistDiff;
      setGitHistLoading(true);
      call("git-history", chainId ? { projectId, chainId, diff: wantDiff } : { projectId, diff: wantDiff }).then((result) => {
        setGitHistLoading(false);
        setGitHistData(result);
      }).catch((failure) => {
        setGitHistLoading(false);
        setGitHistData({ available: false, reason: String(failure && failure.message || failure), commits: [], patch: "" });
      });
    }
    function openGitHistory(chainId) {
      if (!projectId) {
        flashBridgeNotice("\u8BF7\u5148\u6253\u5F00\u9879\u76EE");
        return;
      }
      setGitHistOpen(true);
      setGitHistData(null);
      setGitHistChain(chainId || null);
      refreshGitHistory(chainId);
    }
    function toggleGitHistDiff() {
      const next = !gitHistDiff;
      setGitHistDiff(next);
      refreshGitHistory(gitHistChain, next);
    }
    function revertProjectTo(hash) {
      if (!projectId || !gitHistData) return;
      const key = "git-revert:" + hash;
      if (!arm("git-revert", key)) return;
      call("git-revert-project", { projectId, to: hash }).then((result) => {
        disarm();
        if (result && result.reverted) {
          setGitHistOpen(false);
          setGitHistData(null);
          setGitHistChain(null);
          reload();
          setError("\u5DF2\u56DE\u6EDA\u9879\u76EE\u6587\u4EF6\u6811\u5230 " + String(hash).slice(0, 8));
        } else {
          setError("\u56DE\u6EDA\u5931\u8D25\uFF1A" + String(result && result.error || result && result.reason || "\u672A\u77E5\u9519\u8BEF"));
        }
      }).catch((failure) => {
        disarm();
        setError("\u56DE\u6EDA\u5931\u8D25\uFF1A" + String(failure && failure.message || failure));
      });
    }
    React.useEffect(() => {
      if (!open) return void 0;
      const onKey = (event) => {
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === "P" || event.key === "p")) {
          event.preventDefault();
          setPaletteOpen(true);
          setPaletteQuery("");
        } else if (event.key === "Escape") {
          closePalette();
          setTabMenu(null);
        }
      };
      if (typeof window !== "undefined") window.addEventListener("keydown", onKey);
      return () => {
        if (typeof window !== "undefined") window.removeEventListener("keydown", onKey);
      };
    }, [open]);
    React.useEffect(() => {
      if (!paletteOpen || typeof document === "undefined") return void 0;
      const onPointerDown = (event) => {
        const target = event.target;
        if (target && target.closest && (target.closest(".mf-palette") || target.closest("[data-mf-palette-trigger]"))) return;
        closePalette();
      };
      document.addEventListener("pointerdown", onPointerDown);
      return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [paletteOpen]);
    function changeStyle(styleId) {
      setCurrentStyle(styleId);
      if (projectId) call("set-project-style", { projectId, styleId }).then(() => reload()).catch((failure) => {
        setError("\u5207\u6362\u5199\u4F5C\u98CE\u683C\u5931\u8D25");
        console.error(failure);
      });
    }
    const paletteCommands = [
      { id: "new-project", label: "\u65B0\u5EFA\u9879\u76EE", hint: "\u521B\u5EFA\u5C0F\u8BF4\u9879\u76EE", run: () => {
        setProjectForm(true);
        setTab("projects");
        setPaletteOpen(false);
        setPaletteQuery("");
      } },
      { id: "mofei-new-chapter", label: "\u65B0\u5EFA\u7AE0\u8282", hint: "\u5728\u5F53\u524D\u9879\u76EE\u65B0\u5EFA\u7AE0\u8282", run: () => {
        setChapterForm(true);
        setTab("projects");
        closePalette();
      } },
      { id: "mofei-writer", label: "\u53D1\u9001 Writer \u4EFB\u52A1", hint: "\u628A\u5199\u4F5C\u4EFB\u52A1\u53D1\u7ED9\u5F53\u524D DSH \u4F1A\u8BDD", run: () => {
        closePalette();
        if (chapter) bridgeMention("writer");
      } },
      { id: "mofei-reviewer", label: "\u53D1\u9001 Reviewer \u5BA1\u7A3F", hint: "\u628A\u5BA1\u7A3F\u4EFB\u52A1\u53D1\u7ED9\u5F53\u524D DSH \u4F1A\u8BDD", run: () => {
        closePalette();
        if (chapter) bridgeMention("reviewer");
      } },
      { id: "mofei-summary", label: "\u6253\u5F00\u6458\u8981", hint: "\u7EF4\u62A4\u7AE0\u8282\u548C\u533A\u95F4\u6458\u8981", run: () => {
        setSummaryOpen(true);
        closePalette();
      } },
      { id: "mofei-skills", label: "\u5199\u4F5C\u6307\u4EE4", hint: "\u6D4F\u89C8\u58A8\u6249\u79C1\u6709\u5199\u4F5C\u6307\u4EE4", run: () => {
        openWritingSkills();
        closePalette();
      } },
      { id: "mofei-style", label: "\u5199\u4F5C\u98CE\u683C", hint: "\u65B0\u5EFA\u3001\u7F16\u8F91\u3001\u9884\u89C8\u6216\u5220\u9664\u6587\u98CE", run: () => {
        setTab("styles");
        closePalette();
      } },
      { id: "mofei-settings", label: "\u58A8\u6249\u8BBE\u7F6E", hint: "\u7BA1\u7406\u68C0\u7D22\u6A21\u578B\u3001\u5B50\u4EE3\u7406\u3001\u6458\u8981\u548C\u5199\u4F5C\u914D\u7F6E", run: () => {
        setSettingsOpen(true);
        closePalette();
      } },
      { id: "mofei-retrieve", label: "\u8DE8\u9879\u76EE\u68C0\u7D22", hint: "\u641C\u7D22\u89D2\u8272\u3001\u7B14\u8BB0\u3001\u4E16\u754C\u4E66\u548C\u7AE0\u8282", run: () => {
        setTab("retrieve");
        closePalette();
      } },
      { id: "mofei-git-history", label: "\u9879\u76EE\u7248\u672C\u5386\u53F2", hint: "\u67E5\u770B\u9879\u76EE Git \u5386\u53F2\u548C\u94FE\u7248\u672C\u5DEE\u5F02", run: () => {
        closePalette();
        openGitHistory(null);
      } },
      { id: "mofei-jobs", label: "\u540E\u53F0\u4EFB\u52A1", hint: "\u67E5\u770B\u6216\u53D6\u6D88\u6458\u8981\u7B49\u957F\u4EFB\u52A1", run: () => {
        setJobListOpen(true);
        closePalette();
      } },
      { id: "open-chains", label: "\u63D0\u793A\u8BCD\u94FE", hint: "\u6253\u5F00\u9879\u76EE\u7EA7 Prompt Chains", run: () => {
        setChainsOpen(true);
        closePalette();
      } },
      { id: "open-roles", label: "\u5B50\u4EE3\u7406\u63D0\u793A\u8BCD", hint: "\u7F16\u8F91\u5B50\u4EE3\u7406\u4EBA\u683C\u63D0\u793A\u8BCD\uFF08entries \u53EF\u5F00\u5173/\u6392\u5E8F/\u589E\u5220\uFF09", run: () => {
        openRolesPanel();
        closePalette();
      } },
      { id: "open-dashboard", label: "\u5199\u4F5C\u8BB0\u5F55", hint: "\u6253\u5F00\u5199\u4F5C\u4EEA\u8868\u76D8", run: () => {
        setDashOpen(true);
        closePalette();
      } },
      { id: "open-heatmap", label: "\u5199\u4F5C\u70ED\u529B\u56FE", hint: "\u6253\u5F00\u6700\u8FD1 84 \u5929\u5199\u4F5C\u70ED\u529B\u56FE", run: () => {
        setStatsOpen(true);
        closePalette();
      } },
      { id: "mofei-sessions", label: "\u5207\u6362\u5199\u4F5C\u4F1A\u8BDD", hint: "\u5207\u6362\u5386\u53F2\u4F1A\u8BDD\u6216\u9000\u51FA\u5F53\u524D\u5BF9\u8BDD", run: () => {
        closePalette();
        setChatSessionsOpen(true);
      } },
      { id: "exit-chat", label: "\u9000\u51FA\u5F53\u524D\u5BF9\u8BDD", hint: "\u89E3\u9664\u53F3\u4FA7 Agent \u9762\u677F\u7684\u4F1A\u8BDD\u7ED1\u5B9A\uFF0C\u56DE\u5230\u4F1A\u8BDD\u9009\u62E9\u6001", run: () => {
        exitCurrentChat();
        closePalette();
      } },
      { id: "close-workbench", label: "\u9000\u51FA\u58A8\u6249", hint: "\u8FD4\u56DE\u6807\u51C6 DSH", run: () => {
        closePalette();
        close();
      } }
    ];
    const filteredCommands = (mode === "web" ? paletteCommands.filter((item) => item.id !== "close-workbench") : paletteCommands).filter((item) => !paletteQuery.trim() || (item.label + " " + item.hint).toLowerCase().includes(paletteQuery.toLowerCase()));
    const writingSession = !!(project && project.writerSessionId && project.writerSessionId === chatSessionId && chatSummary && chatSummary.agentPreset === "mofei-writer");
    if (!open) return null;
    const label = status === "saving" ? "\u6B63\u5728\u4FDD\u5B58" : status === "unsaved" ? "\u672A\u4FDD\u5B58" : status === "error" ? "\u9700\u8981\u5904\u7406" : "\u5DF2\u4FDD\u5B58";
    const volumesSorted = volumes;
    const renderChapterRow = (item) => h("div", { key: item.id, className: "mf-item" + (item.id === chapterId ? " on" : "") + (dragId === item.id ? " dragging" : ""), draggable: true, onDragStart: (event) => {
      event.stopPropagation();
      setDragKind("chapter");
      setDragId(item.id);
      try {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", item.id);
      } catch (error2) {
      }
    }, onDragOver: (event) => {
      if (dragKind === "chapter") {
        event.preventDefault();
        event.stopPropagation();
      }
    }, onDrop: (event) => {
      if (dragKind !== "chapter") return;
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      reorderChapters(item.id, event.clientY < rect.top + rect.height / 2);
    }, onDragEnd: () => {
      setDragKind("");
      setDragId("");
    } }, h("div", { className: "mf-row" }, h("button", { className: "mf-title", type: "button", onClick: () => pickChapter(item) }, item.title, h("small", null, "r" + String(item.revision) + (item.historyCount ? " \xB7 \u5386\u53F2 " + String(item.historyCount) : ""))), rename && rename.kind === "chapter" && rename.id === item.id ? h("input", { className: "mf-input mf-rename", value: renameValue, autoFocus: true, onFocus: (event) => event.target.select(), onChange: (event) => setRenameValue(event.target.value), onKeyDown: (event) => {
      if (event.key === "Enter") commitRename();
      if (event.key === "Escape") setRename(null);
    } }) : h("span", { className: "mf-minis" }, moveVolFor === item.id ? h("select", { className: "mf-sel", value: item.volumeId || "", onChange: (event) => setChapterVolume(item.id, event.target.value), onBlur: () => setMoveVolFor("") }, h("option", { value: "" }, "\u672A\u5206\u5377"), volumesSorted.map((v) => h("option", { key: v.id, value: v.id }, v.title))) : null, h(MiniButton, { label: "\u5377", title: "\u79FB\u52A8\u5230\u5377", on: !!item.volumeId, onClick: () => setMoveVolFor(moveVolFor === item.id ? "" : item.id) }), h(MiniButton, { label: "\u2191", title: "\u4E0A\u79FB", onClick: () => moveChapter(item.id, "up") }), h(MiniButton, { label: "\u2193", title: "\u4E0B\u79FB", onClick: () => moveChapter(item.id, "down") }), h(MiniButton, { label: "\u270E", title: "\u91CD\u547D\u540D", onClick: () => startRename("chapter", item.id, item.title) }), h(MiniButton, { label: "\xD7", danger: true, armed: armed && armed.kind === "delete-chapter" && armed.id === item.id, title: armed && armed.kind === "delete-chapter" && armed.id === item.id ? "\u518D\u6B21\u70B9\u51FB\u786E\u8BA4\u5220\u9664" : "\u5220\u9664\u7AE0\u8282", onClick: () => deleteChapter(item.id) }))));
    const renderVolume = (v) => h("div", { key: v.id, className: "mf-vol" + (dragId === v.id ? " dragging" : ""), draggable: true, onDragStart: (event) => {
      event.stopPropagation();
      setDragKind("volume");
      setDragId(v.id);
      try {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", v.id);
      } catch (error2) {
      }
    }, onDragOver: (event) => {
      if (dragKind === "volume") {
        event.preventDefault();
        event.stopPropagation();
      }
    }, onDrop: (event) => {
      if (dragKind !== "volume") return;
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      reorderVolumes(v.id, event.clientY < rect.top + rect.height / 2);
    }, onDragEnd: () => {
      setDragKind("");
      setDragId("");
    } }, h("div", { className: "mf-vol-head" }, h("button", { className: "mf-title", type: "button" }, v.title, h("small", null, String(v.chapterCount) + " \u7AE0")), h("span", { className: "mf-minis" }, rename && rename.kind === "volume" && rename.id === v.id ? h("input", { className: "mf-input mf-rename", value: renameValue, autoFocus: true, onFocus: (event) => event.target.select(), onChange: (event) => setRenameValue(event.target.value), onKeyDown: (event) => {
      if (event.key === "Enter") commitRename();
      if (event.key === "Escape") setRename(null);
    } }) : h(MiniButton, { label: "\u270E", title: "\u91CD\u547D\u540D\u5377", onClick: () => startRename("volume", v.id, v.title) }), h(MiniButton, { label: "\u2191", title: "\u4E0A\u79FB", onClick: () => moveVolume(v.id, "up") }), h(MiniButton, { label: "\u2193", title: "\u4E0B\u79FB", onClick: () => moveVolume(v.id, "down") }), h(MiniButton, { label: "\xD7", danger: true, armed: armed && armed.kind === "delete-volume" && armed.id === v.id, title: armed && armed.kind === "delete-volume" && armed.id === v.id ? "\u518D\u6B21\u70B9\u51FB\u786E\u8BA4\u5220\u9664\uFF08\u542B\u5377\u5185\u7AE0\u8282\uFF09" : "\u5220\u9664\u5377", onClick: () => deleteVolume(v.id) }))), h("div", { className: "mf-vol-children" }, project.chapters.filter((c) => c.volumeId === v.id).map(renderChapterRow)));
    function renderEntityHistory() {
      return h(
        "div",
        { className: "mf-hist" },
        h("div", { className: "mf-hist-head" }, h("span", null, "\u5386\u53F2\u7248\u672C\uFF08\u56DE\u6EDA\u5C06\u4EA7\u751F\u65B0\u7248\u672C\uFF09"), h("button", { className: "mf-close", type: "button", onClick: () => {
          setEntityHistOpen(false);
          setEntityHistList([]);
        }, title: "\u5173\u95ED" }, "\xD7")),
        entityHistLoading ? h("div", { className: "mf-empty" }, "\u6B63\u5728\u52A0\u8F7D\u2026") : entityHistError ? h("div", { className: "mf-alert" }, entityHistError) : entityHistList.length ? entityHistList.map((entry) => h(
          "div",
          { key: entityHistKind + ":" + entry.revision, className: "mf-hist-item" },
          h("div", { className: "mf-hist-meta" }, h("strong", null, "r" + String(entry.revision)), h("span", null, fmtTime(entry.at) + " \xB7 " + entitySnapshotLabel(entityHistKind, entry))),
          h(MiniButton, { label: armed && armed.kind === "rollback-entity" && armed.id === entityHistKind + ":" + currentEntityId() + ":" + String(entry.revision) ? "\u786E\u8BA4\u56DE\u6EDA" : "\u56DE\u6EDA", danger: true, armed: armed && armed.kind === "rollback-entity" && armed.id === entityHistKind + ":" + currentEntityId() + ":" + String(entry.revision), title: "\u56DE\u6EDA\u5230\u6B64\u7248\u672C", onClick: () => rollbackEntity(entry) })
        )) : h("div", { className: "mf-empty" }, "\u6682\u65E0\u5386\u53F2\u7248\u672C")
      );
    }
    const mfChildren = [
      h(
        "section",
        { className: "mf-panel" + (mode === "web" ? " mf-view" : "") + (focus ? " mf-focus" : ""), role: "dialog", "aria-label": "\u58A8\u6249\u5199\u4F5C\u5DE5\u4F5C\u533A" },
        h(
          "header",
          { className: "mf-head" },
          h("div", { className: "mf-head-main" }, h("strong", null, "\u58A8\u6249"), h("span", { className: "mf-head-context", title: project ? project.title : "\u5199\u4F5C\u5DE5\u4F5C\u53F0" }, project ? project.title : "\u5199\u4F5C\u5DE5\u4F5C\u53F0")),
          h(
            "span",
            { className: "mf-head-actions" },
            h("button", { className: "mf-action-icon", type: "button", title: paletteOpen ? "\u5173\u95ED\u5FEB\u6377\u64CD\u4F5C" : "\u5FEB\u6377\u64CD\u4F5C\uFF08Ctrl+Shift+P\uFF09", "aria-label": paletteOpen ? "\u5173\u95ED\u5FEB\u6377\u64CD\u4F5C" : "\u6253\u5F00\u5FEB\u6377\u64CD\u4F5C", "aria-expanded": paletteOpen, "aria-controls": "mf-palette", "data-mf-palette-trigger": "true", onClick: () => paletteOpen ? closePalette() : (setPaletteOpen(true), setPaletteQuery("")) }, "\u22EF"),
            mode === "web" ? h("button", { className: "mf-btn mf-primary", type: "button", title: project ? "\u5728\u5F53\u524D\u9879\u76EE\u65B0\u5EFA\u7AE0\u8282" : "\u65B0\u5EFA\u9879\u76EE", onClick: () => {
              if (project) {
                setChapterForm(true);
                setTab("projects");
              } else {
                setProjectForm(true);
                setTab("projects");
              }
            } }, "\uFF0B \u65B0\u5EFA") : null,
            mode === "web" ? h("button", { className: "mf-action-icon", type: "button", title: "\u58A8\u6249\u8BBE\u7F6E", "aria-label": "\u58A8\u6249\u8BBE\u7F6E", onClick: openSettingsPanel }, "\u2699") : null,
            mode === "web" && onCollapse ? h("button", { className: "mf-action-icon", type: "button", title: "\u6536\u8D77\u58A8\u6249\uFF0C\u8FD4\u56DE\u539F\u7248 web", onClick: onCollapse }, "\xD7") : null,
            mode === "web" ? null : h("button", { className: "mf-close", type: "button", onClick: close, title: "\u5173\u95ED" }, "\xD7")
          ),
          // Web 模式的会话选择统一交给右侧官方 DSH 侧栏；独立工作台仍可使用本地菜单。
          mode !== "web" && chatSessionsOpen ? h(
            "div",
            { className: "mf-writer-session-menu", role: "menu", "aria-label": "\u58A8\u6249\u4F1A\u8BDD" },
            h("h3", null, project ? "\u300A" + project.title + "\u300B\u7684\u5199\u4F5C\u4F1A\u8BDD" : "\u5199\u4F5C\u4F1A\u8BDD"),
            project ? h("div", { className: "mf-writer-session-item on" }, h("span", { className: "name" }, writingSession ? "\u9879\u76EE\u4E13\u5C5E\u5199\u4F5C\u4F1A\u8BDD\u5DF2\u6253\u5F00" : "\u9879\u76EE\u4E13\u5C5E\u5199\u4F5C\u4F1A\u8BDD"), h("span", { className: "time" }, writingSession ? "mofei-writer" : "\u6B63\u5728\u5173\u8054")) : h("div", { className: "mf-writer-session-empty" }, "\u5148\u9009\u62E9\u4E00\u672C\u5C0F\u8BF4\u9879\u76EE"),
            project ? h("button", { className: "mf-btn", type: "button", onClick: () => {
              enterWritingMode();
              setChatSessionsOpen(false);
            } }, "\u6253\u5F00\u9879\u76EE\u4F1A\u8BDD") : null,
            project ? h("button", { className: "mf-btn mf-primary", type: "button", onClick: () => {
              newChatSession();
              setChatSessionsOpen(false);
            } }, "\uFF0B \u65B0\u5EFA\u672C\u9879\u76EE\u4F1A\u8BDD") : null,
            h("div", { className: "mf-writer-session-menu-sep" }),
            h("h3", null, "\u5168\u90E8\u4F1A\u8BDD\uFF08\u70B9\u51FB\u5207\u6362\uFF09"),
            (Array.isArray(chatSessionList.ids) ? chatSessionList.ids : []).slice().sort((a, b) => {
              const ta = chatSessionList.byId[a] && (chatSessionList.byId[a].updatedAt || chatSessionList.byId[a].lastActivityAt) || 0;
              const tb = chatSessionList.byId[b] && (chatSessionList.byId[b].updatedAt || chatSessionList.byId[b].lastActivityAt) || 0;
              return tb - ta;
            }).slice(0, 30).map((id) => {
              const summary = chatSessionList.byId[id] || { id };
              if (summary.origin === "subagent") return null;
              const active = id === chatSessionId;
              return h(
                "button",
                { key: id, className: "mf-writer-session-item" + (active ? " on" : ""), type: "button", title: "\u5207\u6362\u5230\u8BE5\u4F1A\u8BDD\uFF08" + id + "\uFF09", onClick: () => switchChatSession(id) },
                h("span", { className: "badge" }, sessionMenuBadge(summary)),
                h("span", { className: "name" }, sessionMenuLabel(summary)),
                h("span", { className: "time" }, sessionMenuTime(summary))
              );
            }),
            chatSessionId ? h("button", { className: "mf-btn danger", type: "button", onClick: () => {
              exitCurrentChat();
              setChatSessionsOpen(false);
            } }, "\u9000\u51FA\u5F53\u524D\u5BF9\u8BDD") : null
          ) : null
        ),
        h(
          "div",
          { className: "mf-body" + (dragAxis ? " resizing" : "") + (chatOpen ? "" : " no-chat"), style: { "--mf-left": layout.left + "px", "--mf-middle": layout.middle + "px" } },
          h(
            "nav",
            { className: "mf-activity", "aria-label": "\u58A8\u6249\u6D3B\u52A8\u680F" },
            h("button", { className: "mf-act" + (tab === "projects" ? " on" : ""), type: "button", title: "\u9879\u76EE", onClick: () => setTab("projects") }, "\u25A4", h("span", null, "\u9879\u76EE")),
            h("button", { className: "mf-act" + (tab === "retrieve" ? " on" : ""), type: "button", title: "\u68C0\u7D22\uFF08\u8DE8\u5B9E\u4F53 RAG\uFF09", onClick: () => setTab("retrieve") }, "\u2315", h("span", null, "\u68C0\u7D22")),
            h("button", { className: "mf-act" + (tab === "characters" ? " on" : ""), type: "button", title: "\u89D2\u8272", onClick: () => setTab("characters") }, "\u263A", h("span", null, "\u89D2\u8272")),
            h("button", { className: "mf-act" + (tab === "world" ? " on" : ""), type: "button", title: "\u4E16\u754C\u4E66", onClick: () => setTab("world") }, "\u25C8", h("span", null, "\u4E16\u754C")),
            h("button", { className: "mf-act" + (tab === "notes" ? " on" : ""), type: "button", title: "\u7B14\u8BB0", onClick: () => setTab("notes") }, "\u2630", h("span", null, "\u7B14\u8BB0")),
            h("button", { className: "mf-act" + (settingsOpen ? " on" : ""), type: "button", title: "\u58A8\u6249\u8BBE\u7F6E", onClick: openSettingsPanel }, "\u2699", h("span", null, "\u8BBE\u7F6E")),
            h("button", { className: "mf-act" + (chatOpen ? " on" : ""), type: "button", title: "Agent \u5BF9\u8BDD\uFF08\u7F29\u5C0F\u7248 DSH\uFF09", onClick: () => setChatOpen(!chatOpen) }, "\u{1F4AC}", h("span", null, "\u5BF9\u8BDD")),
            h("button", { className: "mf-act mf-act-bottom" + (dashOpen ? " on" : ""), type: "button", title: "\u5199\u4F5C\u4EEA\u8868\u76D8", onClick: () => setDashOpen(!dashOpen) }, "\u25A6", h("span", null, "\u8BB0\u5F55"))
          ),
          h(
            "aside",
            { className: "mf-col" },
            tab === "projects" ? mode === "web" && projectId ? h(
              "div",
              { className: "mf-list" },
              h("div", { className: "mf-sh" }, h("span", null, h("button", { className: "mf-back", type: "button", title: "\u8FD4\u56DE\u9879\u76EE\u5217\u8868", onClick: backToProjectList }, "\u2190"), project ? project.title : "\u7AE0\u8282"), h("span", { className: "mf-eh-actions" }, h("button", { className: "mf-btn", type: "button", onClick: () => setSearchOpen(!searchOpen) }, "\u641C\u7D22"), h("button", { className: "mf-btn", type: "button", disabled: !project, onClick: () => setChapterForm(!chapterForm) }, "+ \u65B0\u5EFA"))),
              searchOpen ? h("div", { className: "mf-search" }, h("input", { className: "mf-input", value: searchQuery, placeholder: "\u641C\u7D22\u7AE0\u8282\u5168\u6587\u2026", autoFocus: true, onChange: (event) => setSearchQuery(event.target.value), onKeyDown: (event) => {
                if (event.key === "Escape") {
                  setSearchOpen(false);
                  setSearchQuery("");
                  setSearchResults([]);
                }
              } }), searching ? h("div", { className: "mf-empty" }, "\u641C\u7D22\u4E2D\u2026") : searchResults.length ? searchResults.map((res) => h("div", { key: res.chapterId, className: "mf-sr-item" }, h("button", { className: "mf-title", type: "button", onClick: () => jumpToResult(res) }, h("strong", null, res.title)), res.matches.slice(0, 3).map((m) => h("div", { key: m.line, className: "mf-sr-line" }, "L" + String(m.line) + ": " + m.text)))) : searchQuery.trim() ? h("div", { className: "mf-empty" }, "\u65E0\u5339\u914D") : null) : null,
              chapterForm && project ? h("div", { className: "mf-form" }, h("input", { className: "mf-input", value: newChapter, placeholder: "\u7AE0\u8282\u6807\u9898", onChange: (event) => setNewChapter(event.target.value), onKeyDown: (event) => {
                if (event.key === "Enter") createChapter(null);
              } }), h("button", { className: "mf-btn mf-primary", type: "button", onClick: () => createChapter(null) }, "\u521B\u5EFA")) : null,
              h(
                "div",
                { className: "mf-list" },
                h("div", { className: "mf-vol" }, h("div", { className: "mf-vol-head" }, h("button", { className: "mf-title", type: "button" }, "\u672A\u5206\u5377", h("small", null, String(ungrouped.length) + " \u7AE0")), h("span", { className: "mf-minis" }, h(MiniButton, { label: "+", title: "\u65B0\u5EFA\u5377", onClick: () => setVolForm(!volForm) }))), volForm ? h("div", { className: "mf-form" }, h("input", { className: "mf-input", value: newVol, placeholder: "\u5377\u540D\u79F0", onChange: (event) => setNewVol(event.target.value), onKeyDown: (event) => {
                  if (event.key === "Enter") createVolume();
                } }), h("button", { className: "mf-btn mf-primary", type: "button", onClick: createVolume }, "\u521B\u5EFA")) : null),
                volumesSorted.map(renderVolume),
                ungrouped.map(renderChapterRow)
              )
            ) : h(
              "div",
              { className: "mf-list" },
              h("div", { className: "mf-sh" }, h("span", { title: currentDshWorkspacePath() || "\u5F53\u524D\u4F1A\u8BDD\u672A\u9009\u62E9\u5DE5\u4F5C\u533A" }, "\u9879\u76EE"), h("span", { className: "mf-eh-actions" }, mode === "web" ? h("button", { className: "mf-btn", type: "button", title: "\u626B\u63CF\u5F53\u524D DSH \u5DE5\u4F5C\u533A\u4E2D\u7684\u58A8\u6249\u9879\u76EE\u6587\u4EF6", onClick: () => {
                const workspaceRoot = currentDshWorkspacePath();
                if (workspaceRoot) call("discover-workspace", { workspaceRoot }).then(() => reload());
              } }, "\u540C\u6B65") : h("button", { className: "mf-btn", type: "button", title: projectWide ? "\u6536\u8D77\u9879\u76EE\u5BBD\u5E45\u9875" : "\u6253\u5F00\u9879\u76EE\u5BBD\u5E45\u9875", onClick: () => setProjectWide(!projectWide) }, projectWide ? "\u6536\u8D77" : "\u5BBD\u5E45"), h("button", { className: "mf-btn", type: "button", onClick: () => setProjectForm(!projectForm) }, "+ \u65B0\u5EFA"))),
              mode === "web" ? h("div", { className: "mf-search", style: { borderBottom: 0, padding: "0 10px 8px" } }, h("input", { className: "mf-input", value: projQuery, placeholder: "\u641C\u7D22\u9879\u76EE\u2026", onChange: (event) => setProjQuery(event.target.value) })) : null,
              projectForm ? h("div", { className: "mf-form" }, h("input", { className: "mf-input", value: newProject, placeholder: "\u9879\u76EE\u540D\u79F0", onChange: (event) => setNewProject(event.target.value), onKeyDown: (event) => {
                if (event.key === "Enter") createProject();
              } }), h("button", { className: "mf-btn mf-primary", type: "button", onClick: createProject }, "\u521B\u5EFA")) : null,
              loading ? h("div", { className: "mf-empty" }, "\u6B63\u5728\u52A0\u8F7D\u2026") : projects.length ? h(
                "div",
                null,
                rename && rename.kind === "project" ? h("div", { className: "mf-form" }, h("input", { className: "mf-input mf-rename", value: renameValue, autoFocus: true, onFocus: (event) => event.target.select(), onChange: (event) => setRenameValue(event.target.value), onKeyDown: (event) => {
                  if (event.key === "Enter") commitRename();
                  if (event.key === "Escape") setRename(null);
                } })) : null,
                mode === "web" ? h("div", { className: "mf-proj-list" }, sortProjects(filterProjects(projects, projQuery), "updated").map((item) => {
                  const title = String(item.title == null ? "" : item.title).trim() || "\u672A\u547D\u540D\u9879\u76EE";
                  const chars = (Array.isArray(item.chapters) ? item.chapters : []).reduce((sum, c) => sum + String(c && c.content || "").length, 0);
                  const chapCount = Array.isArray(item.chapters) ? item.chapters.length : 0;
                  return h(
                    "div",
                    { key: item.id, className: "mf-proj" + (projectId === item.id ? " active" : ""), onClick: () => pickProject(item.id) },
                    h(
                      "div",
                      { className: "mf-proj-head" },
                      h("span", { className: "mf-proj-name", title }, title),
                      h(
                        "span",
                        { className: "mf-minis" },
                        h(MiniButton, { label: "\u270E", title: "\u91CD\u547D\u540D", onClick: (event) => {
                          event.stopPropagation();
                          startRename("project", item.id, item.title);
                        } }),
                        h(MiniButton, { label: armed && armed.kind === "delete-project" && armed.id === item.id ? "\u786E\u8BA4\u5220\u9664" : "\xD7", danger: true, armed: armed && armed.kind === "delete-project" && armed.id === item.id, title: "\u5220\u9664\u9879\u76EE\uFF08\u518D\u6B21\u70B9\u51FB\u786E\u8BA4\uFF09", onClick: (event) => {
                          event.stopPropagation();
                          if (armed && armed.kind === "delete-project" && armed.id === item.id) {
                            disarm();
                            deleteProject(item.id, true);
                          } else arm("delete-project", item.id);
                        } })
                      )
                    ),
                    h("div", { className: "mf-proj-meta" }, h("span", null, chars.toLocaleString("en-US") + " \u5B57"), h("span", null, String(chapCount) + " \u7AE0"))
                  );
                })) : h(ProjectGrid, { projects, activeId: projectId, onPick: (item) => pickProject(item.id), onRename: (item) => startRename("project", item.id, item.title), onDelete: (item) => deleteProject(item.id, true) })
              ) : h("div", { className: "mf-empty" }, "\u521B\u5EFA\u7B2C\u4E00\u4E2A\u5C0F\u8BF4\u9879\u76EE\u3002"),
              mode === "web" ? null : project ? h("div", { className: "mf-goal" }, goalForm ? h("div", { className: "mf-form" }, h("input", { className: "mf-input", value: goalInput, placeholder: "\u76EE\u6807\u603B\u5B57\u6570", type: "number", onChange: (event) => setGoalInput(event.target.value), onKeyDown: (event) => {
                if (event.key === "Enter") commitGoal();
              } }), h("button", { className: "mf-btn mf-primary", type: "button", onClick: commitGoal }, "\u8BBE\u7F6E")) : h("button", { className: "mf-goal-btn", type: "button", onClick: () => {
                setGoalInput(String(project.goal || ""));
                setGoalForm(true);
              } }, "\u76EE\u6807 " + String(project.goal || 0) + " \u5B57 \xB7 \u8FDB\u5EA6 " + (project.goal ? String(Math.min(100, Math.round(projectChars / project.goal * 100))) + "%" : "\u2014") + " \u270E")) : null
            ) : tab === "characters" ? h(
              "div",
              { className: "mf-list" },
              h("div", { className: "mf-sh" }, h("span", null, "\u89D2\u8272"), h("button", { className: "mf-btn", type: "button", onClick: () => setCharForm(!charForm) }, "+ \u65B0\u5EFA")),
              charForm ? h("div", { className: "mf-form" }, h("input", { className: "mf-input", value: newChar, placeholder: "\u89D2\u8272\u540D\u79F0", onChange: (event) => setNewChar(event.target.value), onKeyDown: (event) => {
                if (event.key === "Enter") createCharacter();
              } }), h("button", { className: "mf-btn mf-primary", type: "button", onClick: createCharacter }, "\u521B\u5EFA")) : null,
              project && project.characters.length ? project.characters.map((item) => h("div", { key: item.id, className: "mf-item" + (item.id === selChar ? " on" : "") }, h("div", { className: "mf-row" }, h("button", { className: "mf-title", type: "button", onClick: () => pickCharacter(item) }, item.name, h("small", null, item.isFavorited ? "\u2605" : "")), h("span", { className: "mf-minis" }, h(MiniButton, { label: item.isFavorited ? "\u2605" : "\u2606", title: "\u6536\u85CF", on: item.isFavorited, onClick: () => toggleFavorite(item.id) }), h(MiniButton, { label: "\u270E", title: "\u91CD\u547D\u540D", onClick: () => startRename("character", item.id, item.name) }), h(MiniButton, { label: "\xD7", danger: true, armed: armed && armed.kind === "delete-character" && armed.id === item.id, title: armed && armed.kind === "delete-character" && armed.id === item.id ? "\u518D\u6B21\u70B9\u51FB\u786E\u8BA4\u5220\u9664" : "\u5220\u9664\u89D2\u8272", onClick: () => deleteCharacter(item.id) }))))) : h("div", { className: "mf-empty" }, "\u8FD8\u6CA1\u6709\u89D2\u8272\u3002")
            ) : tab === "world" ? h(
              "div",
              { className: "mf-list" },
              h("div", { className: "mf-sh" }, h("span", null, "\u4E16\u754C\u4E66"), h("span", { className: "mf-minis" }, h(MiniButton, { label: "+", title: "\u65B0\u5EFA\u6761\u76EE", onClick: () => setWorldForm(!worldForm) }), h(MiniButton, { label: "\u5BFC\u5165", title: "\u5BFC\u5165 SillyTavern \u4E16\u754C\u4E66 JSON", onClick: () => setWorldImportOpen(true) }))),
              worldForm && project ? h("div", { className: "mf-form" }, h("input", { className: "mf-input", value: newWorld, placeholder: "\u6761\u76EE\u540D\u79F0\uFF08\u5982\uFF1A\u9752\u57CE\u8BBE\u5B9A\uFF09", onChange: (event) => setNewWorld(event.target.value), onKeyDown: (event) => {
                if (event.key === "Enter") createWorld();
              } }), h("button", { className: "mf-btn mf-primary", type: "button", onClick: createWorld }, "\u521B\u5EFA")) : null,
              project ? h(
                "div",
                { className: "mf-world-tools" },
                h("input", { className: "mf-world-search", value: worldQuery, placeholder: "\u641C\u7D22\u6761\u76EE\uFF08\u540D\u79F0 / \u89E6\u53D1\u8BCD\uFF09\u2026", onChange: (event) => setWorldQuery(event.target.value) }),
                worldFiltered.length ? h(
                  "div",
                  { className: "mf-world-batch" },
                  h("label", { className: "mf-world-selall" }, h("input", { className: "mf-wselect-all", type: "checkbox", checked: worldFiltered.length > 0 && worldFiltered.every((item) => worldSelected.includes(item.id)), onChange: toggleWorldSelectAll }), " \u5168\u9009"),
                  h("span", { className: "mf-world-batch-count" }, "\u5DF2\u9009 " + String(worldSelected.length) + " \u9879"),
                  h("button", { className: "mf-btn", type: "button", disabled: worldBatchBusy || !worldSelected.length, onClick: () => runWorldBulkToggle(true) }, "\u542F\u7528"),
                  h("button", { className: "mf-btn", type: "button", disabled: worldBatchBusy || !worldSelected.length, onClick: () => runWorldBulkToggle(false) }, "\u7981\u7528"),
                  h("button", { className: "mf-btn mf-danger", type: "button", disabled: worldBatchBusy || !worldSelected.length, onClick: handleWorldBulkDeleteClick }, worldDeleteArmed ? "\u786E\u8BA4\u5220\u9664" : "\u5220\u9664")
                ) : null
              ) : null,
              project && worldFiltered.length ? worldFiltered.map((item) => h("div", { key: item.id, className: "mf-item" + (item.id === selWorld ? " on" : "") }, h("div", { className: "mf-row" }, h("input", { className: "mf-wcheck", type: "checkbox", checked: worldSelected.includes(item.id), onChange: () => toggleWorldSelect(item.id) }), h("button", { className: "mf-title", type: "button", onClick: () => pickWorld(item) }, (item.isEnabled ? "" : "\u23F8 ") + (item.constant ? "\u2605 " : "") + item.name, h("small", null, item.keys && item.keys.length ? item.keys.join("\u3001") : "\u65E0\u89E6\u53D1\u8BCD")), h("span", { className: "mf-minis" }, h(MiniButton, { label: "\u2191", title: "\u4E0A\u79FB", onClick: () => moveWorld(item.id, "up") }), h(MiniButton, { label: "\u2193", title: "\u4E0B\u79FB", onClick: () => moveWorld(item.id, "down") }), h(MiniButton, { label: "\u2605", title: "\u5E38\u9A7B\uFF08\u59CB\u7EC8\u6CE8\u5165\u4E0A\u4E0B\u6587\uFF09", on: item.constant, onClick: () => toggleWorldFlag(item.id, "constant") }), h(MiniButton, { label: "\u5F00\u5173", title: item.isEnabled ? "\u542F\u7528" : "\u7981\u7528", on: item.isEnabled, onClick: () => toggleWorldFlag(item.id, "isEnabled") }), h(MiniButton, { label: "\xD7", danger: true, armed: armed && armed.kind === "delete-world" && armed.id === item.id, title: armed && armed.kind === "delete-world" && armed.id === item.id ? "\u518D\u6B21\u70B9\u51FB\u786E\u8BA4\u5220\u9664" : "\u5220\u9664\u6761\u76EE", onClick: () => deleteWorld(item.id) }))))) : h("div", { className: "mf-empty" }, project ? worldQuery ? "\u65E0\u5339\u914D\u6761\u76EE\u3002" : "\u8FD8\u6CA1\u6709\u4E16\u754C\u4E66\u6761\u76EE\uFF0C\u53EF\u65B0\u5EFA\u6216\u5BFC\u5165 ST JSON\u3002" : "\u9009\u62E9\u9879\u76EE\u540E\u7BA1\u7406\u4E16\u754C\u4E66\u3002")
            ) : tab === "retrieve" ? h(
              "div",
              { className: "mf-list" },
              h("div", { className: "mf-sh" }, h("span", null, "\u68C0\u7D22\uFF08RAG\uFF09"), h("span", { className: "mf-eh-actions" }, h("button", { className: "mf-btn", type: "button", disabled: retrieveBusy || !projectId, onClick: runRetrieve }, retrieveBusy ? "\u68C0\u7D22\u4E2D" : "\u68C0\u7D22"))),
              h("div", { className: "mf-search", style: { borderBottom: 0, paddingBottom: 4 } }, h("input", { className: "mf-input", value: retrieveQuery, placeholder: "\u8DE8\u7AE0\u8282/\u89D2\u8272/\u7B14\u8BB0/\u4E16\u754C\u4E66/\u6458\u8981\u2026", onChange: (event) => setRetrieveQuery(event.target.value), onKeyDown: (event) => {
                if (event.key === "Enter") runRetrieve();
              } })),
              retrieveError ? h("div", { className: "mf-alert" }, retrieveError) : null,
              !projectId ? h("div", { className: "mf-empty" }, "\u9009\u62E9\u9879\u76EE\u540E\u68C0\u7D22\u3002") : retrieveBusy ? h("div", { className: "mf-empty" }, "\u68C0\u7D22\u4E2D\u2026") : retrieveResults.length ? h(
                "div",
                null,
                h("div", { className: "mf-vol" }, String(retrieveResults.length) + " \u4E2A\u547D\u4E2D\uFF08\u70B9\u51FB\u8DF3\u8F6C\u5B9E\u4F53\uFF09"),
                retrieveGrouped.map((group) => h(
                  "div",
                  { key: group.title },
                  h("div", { className: "mf-vol" }, group.title + " \xB7 " + String(group.hits.length)),
                  group.hits.map((hit, index) => h(
                    "div",
                    { key: hit.entityType + ":" + hit.entityId + ":" + hit.line + ":" + index, className: "mf-sr-item" },
                    h("button", { className: "mf-title", type: "button", onClick: () => jumpRetrieveHit(hit) }, h("strong", null, entityKindLabel(hit.entityType) + " \xB7 " + hit.title), h("div", { className: "mf-sr-line" }, "L" + String(hit.line) + " \xB7 score " + String(hit.score))),
                    h("div", { className: "mf-sr-line" }, hit.snippet)
                  ))
                ))
              ) : retrieveQuery.trim() ? h("div", { className: "mf-empty" }, "\u65E0\u547D\u4E2D\u3002") : h("div", { className: "mf-empty" }, "\u8F93\u5165\u68C0\u7D22\u8BCD\uFF0C\u56DE\u8F66\u6216\u70B9\u300C\u68C0\u7D22\u300D\u3002")
            ) : tab === "styles" ? h(
              "div",
              { className: "mf-list" },
              h("div", { className: "mf-sh" }, h("span", null, "\u5199\u4F5C\u98CE\u683C" + (projectId ? " \xB7 \u9879\u76EE\u7EA7\u4F18\u5148" : "")), h("span", { className: "mf-eh-actions" }, h("button", { className: "mf-btn", type: "button", onClick: createStyle }, "+ \u65B0\u5EFA"))),
              styleError ? h("div", { className: "mf-alert" }, styleError) : null,
              styles.length ? styles.map((item) => h("div", { key: item.id, className: "mf-item" + (item.id === selStyleId ? " on" : "") }, h("div", { className: "mf-row" }, h("button", { className: "mf-title", type: "button", onClick: () => loadStyleIntoEditor(item.id) }, item.name + (project && project.currentStyle === item.id ? " \u2713" : ""), h("small", null, (item.description || "") + (item.scope === "project" ? " \xB7 \u9879\u76EE\u7EA7" : ""))), h("span", { className: "mf-minis" }, h(MiniButton, { label: "\u270E", title: "\u7F16\u8F91", onClick: () => loadStyleIntoEditor(item.id) }), h(MiniButton, { label: "\xD7", danger: true, armed: armed && armed.kind === "delete-style" && armed.id === item.id + ":" + (item.scope || "global"), title: "\u5220\u9664\u98CE\u683C", onClick: () => deleteStyleItem(item.id, item.scope) }))))) : h("div", { className: "mf-empty" }, "\u6682\u65E0\u98CE\u683C\u6587\u4EF6\uFF0C\u70B9\u300C+ \u65B0\u5EFA\u300D\u521B\u5EFA\u3002")
            ) : h(
              "div",
              { className: "mf-list" },
              h("div", { className: "mf-sh" }, h("span", null, "\u7B14\u8BB0"), h("button", { className: "mf-btn", type: "button", onClick: () => setCatForm(!catForm) }, "+ \u5206\u7C7B")),
              catForm ? h("div", { className: "mf-form" }, h("input", { className: "mf-input", value: newCat, placeholder: "\u5206\u7C7B\u540D\u79F0", onChange: (event) => setNewCat(event.target.value), onKeyDown: (event) => {
                if (event.key === "Enter") createCategory(null);
              } }), h("button", { className: "mf-btn mf-primary", type: "button", onClick: () => createCategory(null) }, "\u521B\u5EFA")) : null,
              h("button", { className: "mf-btn mf-primary", type: "button", style: { width: "calc(100% - 16px)", margin: "8px" }, onClick: () => {
                setNoteForm(!noteForm);
                setSelNote("");
              } }, "+ \u65B0\u5EFA\u7B14\u8BB0"),
              noteForm ? h("div", { className: "mf-form" }, h("input", { className: "mf-input", value: newNote, placeholder: "\u7B14\u8BB0\u6807\u9898", onChange: (event) => setNewNote(event.target.value), onKeyDown: (event) => {
                if (event.key === "Enter") createNote(null);
              } }), h("button", { className: "mf-btn mf-primary", type: "button", onClick: () => createNote(null) }, "\u521B\u5EFA")) : null,
              rootCats.map((cat) => h(
                "div",
                { key: cat.id },
                h(
                  "div",
                  { className: "mf-item mf-vol" },
                  h(
                    "div",
                    { className: "mf-vol-head" },
                    h("button", { className: "mf-title", type: "button", onClick: () => setSubCatFor(subCatFor === cat.id ? "" : cat.id) }, "\u{1F4C1} " + cat.title),
                    h(
                      "span",
                      { className: "mf-minis" },
                      h(MiniButton, { label: "+", title: "\u5B50\u5206\u7C7B", onClick: () => setSubCatFor(subCatFor === cat.id ? "" : cat.id) }),
                      h(MiniButton, { label: "\u270E", title: "\u91CD\u547D\u540D", onClick: () => startRename("category", cat.id, cat.title) }),
                      h(MiniButton, { label: "\xD7", danger: true, armed: armed && armed.kind === "delete-category" && armed.id === cat.id, title: armed && armed.kind === "delete-category" && armed.id === cat.id ? "\u518D\u6B21\u70B9\u51FB\u786E\u8BA4\u5220\u9664" : "\u5220\u9664\u5206\u7C7B", onClick: () => deleteCategory(cat.id) })
                    )
                  )
                ),
                subCatFor === cat.id ? h(
                  "div",
                  { className: "mf-vol-children" },
                  h(
                    "div",
                    { className: "mf-form" },
                    h("input", { className: "mf-input", value: newSubCat, placeholder: "\u5B50\u5206\u7C7B\u540D\u79F0", onChange: (event) => setNewSubCat(event.target.value), onKeyDown: (event) => {
                      if (event.key === "Enter") createCategory(cat.id);
                    } }),
                    h("button", { className: "mf-btn mf-primary", type: "button", onClick: () => createCategory(cat.id) }, "\u521B\u5EFA")
                  )
                ) : null,
                childCats.filter((c) => c.parentId === cat.id).map((child) => h(
                  "div",
                  { key: child.id },
                  h(
                    "div",
                    { className: "mf-item mf-vol" },
                    h(
                      "div",
                      { className: "mf-vol-head" },
                      h("button", { className: "mf-title", type: "button" }, "\u2514 " + child.title),
                      h(
                        "span",
                        { className: "mf-minis" },
                        h(MiniButton, { label: "\u270E", title: "\u91CD\u547D\u540D", onClick: () => startRename("category", child.id, child.title) }),
                        h(MiniButton, { label: "\xD7", danger: true, armed: armed && armed.kind === "delete-category" && armed.id === child.id, title: "\u5220\u9664\u5206\u7C7B", onClick: () => deleteCategory(child.id) })
                      )
                    )
                  ),
                  project.notes.filter((n) => n.categoryId === child.id).map((n) => renderNoteItem(n, child.id))
                )),
                project.notes.filter((n) => n.categoryId === cat.id).map((n) => renderNoteItem(n, cat.id))
              )),
              project ? h("div", { className: "mf-vol" }, h("div", { className: "mf-vol-head" }, h("button", { className: "mf-title", type: "button" }, "\u672A\u5206\u7C7B"), h("span", { className: "mf-minis" }))) : null,
              project ? project.notes.filter((n) => !n.categoryId).map((n) => renderNoteItem(n, null)) : null,
              h("div", { className: "mf-empty" }, "\u7B14\u8BB0\u6811\uFF1A\u4E24\u7EA7\u5206\u7C7B \xB7 \u9501\u5B9A=Agent \u4E0D\u53EF\u6539")
            ),
            mode === "web" ? h(
              "div",
              { className: "mf-mininav" },
              [["projects", "\u25A4", "\u9879\u76EE"], ["retrieve", "\u2315", "\u68C0\u7D22"], ["characters", "\u263A", "\u89D2\u8272"], ["world", "\u25C8", "\u4E16\u754C"], ["notes", "\u2630", "\u7B14\u8BB0"]].map((item) => h("button", { key: item[0], type: "button", className: tab === item[0] ? "on" : "", onClick: () => setTab(item[0]) }, h("span", { className: "ic" }, item[1]), item[2])),
              h("button", { type: "button", className: skillsOpen ? "on" : "", title: "\u5199\u4F5C\u6307\u4EE4\u4E0E\u5DE5\u4F5C\u6D41", onClick: openWritingSkills }, h("span", { className: "ic" }, "\u2726"), "\u6280\u80FD")
            ) : null
          ),
          h("div", { className: "mf-gutter" + (dragAxis === "left" ? " dragging" : ""), "data-axis": "left", role: "separator", title: "\u62D6\u52A8\u8C03\u6574\u5BBD\u5EA6", onPointerDown: startGutterDrag, onPointerMove: moveGutterDrag, onPointerUp: endGutterDrag, onPointerCancel: cancelGutterDrag, onDoubleClick: resetGutter }),
          h(
            "aside",
            { className: "mf-col mf-mid" },
            h("div", { className: "mf-sh" }, h("span", null, tab === "characters" ? "\u89D2\u8272" : tab === "notes" ? "\u7B14\u8BB0" : tab === "styles" ? "\u7AE0\u8282\uFF08\u53EF\u6DF7\u5F00\u7B14\u8BB0\u6807\u7B7E\uFF09" : tab === "retrieve" ? "\u7AE0\u8282" : "\u7AE0\u8282"), h("button", { className: "mf-btn", type: "button", onClick: () => setSearchOpen(!searchOpen) }, "\u641C\u7D22"), h("button", { className: "mf-btn", type: "button", disabled: !project, onClick: () => setChapterForm(!chapterForm) }, "+ \u65B0\u5EFA")),
            searchOpen ? h("div", { className: "mf-search" }, h("input", { className: "mf-input", value: searchQuery, placeholder: "\u641C\u7D22\u7AE0\u8282\u5168\u6587\u2026", autoFocus: true, onChange: (event) => setSearchQuery(event.target.value), onKeyDown: (event) => {
              if (event.key === "Escape") {
                setSearchOpen(false);
                setSearchQuery("");
                setSearchResults([]);
              }
            } }), searching ? h("div", { className: "mf-empty" }, "\u641C\u7D22\u4E2D\u2026") : searchResults.length ? searchResults.map((res) => h("div", { key: res.chapterId, className: "mf-sr-item" }, h("button", { className: "mf-title", type: "button", onClick: () => jumpToResult(res) }, h("strong", null, res.title)), res.matches.slice(0, 3).map((m) => h("div", { key: m.line, className: "mf-sr-line" }, "L" + String(m.line) + ": " + m.text)))) : searchQuery.trim() ? h("div", { className: "mf-empty" }, "\u65E0\u5339\u914D") : null) : null,
            chapterForm && project ? h("div", { className: "mf-form" }, h("input", { className: "mf-input", value: newChapter, placeholder: "\u7AE0\u8282\u6807\u9898", onChange: (event) => setNewChapter(event.target.value), onKeyDown: (event) => {
              if (event.key === "Enter") createChapter(null);
            } }), h("button", { className: "mf-btn mf-primary", type: "button", onClick: () => createChapter(null) }, "\u521B\u5EFA")) : null,
            h("div", { className: "mf-list" }, !project ? h("div", { className: "mf-empty" }, "\u9009\u62E9\u9879\u76EE\u3002") : h(
              "div",
              null,
              h("div", { className: "mf-vol" }, h("div", { className: "mf-vol-head" }, h("button", { className: "mf-title", type: "button" }, "\u672A\u5206\u5377", h("small", null, String(ungrouped.length) + " \u7AE0")), h("span", { className: "mf-minis" }, h(MiniButton, { label: "+", title: "\u65B0\u5EFA\u5377", onClick: () => setVolForm(!volForm) }))), volForm ? h("div", { className: "mf-form" }, h("input", { className: "mf-input", value: newVol, placeholder: "\u5377\u540D\u79F0", onChange: (event) => setNewVol(event.target.value), onKeyDown: (event) => {
                if (event.key === "Enter") createVolume();
              } }), h("button", { className: "mf-btn mf-primary", type: "button", onClick: createVolume }, "\u521B\u5EFA")) : null),
              volumesSorted.map(renderVolume),
              ungrouped.map(renderChapterRow)
            ))
          ),
          h("div", { className: "mf-gutter" + (dragAxis === "middle" ? " dragging" : ""), "data-axis": "middle", role: "separator", title: "\u62D6\u52A8\u8C03\u6574\u5BBD\u5EA6", onPointerDown: startGutterDrag, onPointerMove: moveGutterDrag, onPointerUp: endGutterDrag, onPointerCancel: cancelGutterDrag, onDoubleClick: resetGutter }),
          h(
            "main",
            { className: "mf-editor" },
            openTabs.length ? h("div", { className: "mf-tabs2", onClick: closeTabMenu }, openTabs.map((t) => h("span", { key: t.kind + ":" + t.id, className: "mf-tab2" + (t.id === activeTabId ? " on" : "") + (tabDragId === t.id ? " dragging" : "") + (tabDragId && tabDragId !== t.id ? " drop-target" : ""), draggable: true, onDragStart: (event) => {
              event.stopPropagation();
              setTabDragId(t.id);
            }, onDragOver: (event) => {
              event.preventDefault();
            }, onDrop: (event) => {
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              moveTab(t.id, event.clientX < rect.left + rect.width / 2);
            }, onDragEnd: () => setTabDragId(""), onContextMenu: (event) => openTabMenu(event, t), onClick: () => switchChapterTab(t.id) }, h("span", { className: "mf-tab-kind" }, t.kind === "note" ? "\u7B14" : "\u7AE0"), t.pinned ? h("span", { className: "mf-tab-pin" }, "\u{1F4CC}") : null, t.title, t.pinned ? null : h("button", { className: "mf-tabx", type: "button", title: "\u5173\u95ED\u6807\u7B7E\uFF08\u53F3\u952E\u66F4\u591A\u64CD\u4F5C\uFF09", onClick: (event) => {
              event.stopPropagation();
              closeChapterTab(t.id);
            } }, "\xD7")))) : null,
            tabMenu ? h("div", { className: "mf-tabmenu", style: { left: tabMenu.x, top: tabMenu.y } }, h("button", { type: "button", onClick: () => {
              pinTab(tabMenu.id);
              closeTabMenu();
            } }, tabMenu.pinned ? "\u53D6\u6D88\u56FA\u5B9A" : "\u56FA\u5B9A\u6807\u7B7E"), h("button", { type: "button", onClick: () => {
              closeOtherTabs(tabMenu.id);
              closeTabMenu();
            } }, "\u5173\u95ED\u5176\u4ED6"), h("button", { type: "button", disabled: tabMenu.pinned, onClick: () => {
              closeChapterTab(tabMenu.id);
              closeTabMenu();
            } }, "\u5173\u95ED")) : null,
            tab === "projects" && projectWide ? h(ProjectPage, { projects, activeId: projectId, onPick: (item) => pickProject(item.id), onRename: (item) => startRename("project", item.id, item.title), onDelete: (item) => deleteProject(item.id, true), onCreate: () => setProjectForm(!projectForm), onClose: () => setProjectWide(false), onSaveDescription: saveProjectDescription }) : tab === "world" ? h(
              "div",
              null,
              h("div", { className: "mf-eh" }, h("span", null, worldEntry ? worldEntry.name : "\u4E16\u754C\u4E66\u7F16\u8F91"), h("span", { className: "mf-eh-actions" }, worldEntry ? h(MiniButton, { label: entityHistOpen && entityHistKind === "world-entry" ? "\u6536\u8D77\u5386\u53F2" : "\u5386\u53F2", title: "\u6761\u76EE\u5386\u53F2\u7248\u672C", on: entityHistOpen && entityHistKind === "world-entry", onClick: () => toggleEntityHistory("world-entry", worldEntry.id) }) : null, h("span", { className: "mf-status" }, worldEntry ? (worldEntry.isEnabled ? "" : "\u23F8 \u7981\u7528 \xB7 ") + (worldEntry.constant ? "\u2605 \u5E38\u9A7B \xB7 " : "") + (worldDirty ? "\u672A\u4FDD\u5B58" : "") : ""))),
              entityHistOpen && entityHistKind === "world-entry" ? renderEntityHistory() : null,
              worldEntry ? h(
                "div",
                { className: "mf-form", style: { border: 0, padding: "14px 18px" } },
                h("input", { className: "mf-input", value: worldName, placeholder: "\u6761\u76EE\u540D\u79F0", onChange: (event) => {
                  setWorldName(event.target.value);
                  setWorldDirty(true);
                } }),
                h("input", { className: "mf-input", value: worldKeys, placeholder: "\u89E6\u53D1\u8BCD\uFF0C\u7528\u9017\u53F7\u5206\u9694\uFF08\u5982\uFF1A\u6797\u8F69\uFF0C\u9752\u57CE\uFF09\u3002\u7559\u7A7A\u5219\u6761\u76EE\u540D\u547D\u4E2D\u65F6\u6FC0\u6D3B\u3002", onChange: (event) => {
                  setWorldKeys(event.target.value);
                  setWorldDirty(true);
                } }),
                h("textarea", { className: "mf-text", style: { flex: "1", minHeight: "40vh", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: "6px" }, value: worldContent, placeholder: "\u6761\u76EE\u5185\u5BB9\uFF08AI \u7EED\u5199/\u6458\u8981\u65F6\uFF0C\u547D\u4E2D\u89E6\u53D1\u8BCD\u540E\u6CE8\u5165\u4E0A\u4E0B\u6587\uFF09\u2026", onChange: (event) => {
                  setWorldContent(event.target.value);
                  setWorldDirty(true);
                } }),
                h(
                  "div",
                  { className: "mf-actions" },
                  h("button", { className: "mf-btn mf-primary", type: "button", disabled: !worldDirty, onClick: saveWorld }, "\u4FDD\u5B58\u6761\u76EE"),
                  h(MiniButton, { label: "\u2605", title: "\u5E38\u9A7B\uFF08\u59CB\u7EC8\u6CE8\u5165\u4E0A\u4E0B\u6587\uFF09", on: worldEntry.constant, onClick: () => toggleWorldFlag(worldEntry.id, "constant") }),
                  h(MiniButton, { label: worldEntry.isEnabled ? "\u542F\u7528" : "\u7981\u7528", title: "\u542F\u7528/\u7981\u7528", on: worldEntry.isEnabled, onClick: () => toggleWorldFlag(worldEntry.id, "isEnabled") }),
                  h(MiniButton, { label: "\xD7", danger: true, armed: armed && armed.kind === "delete-world" && armed.id === worldEntry.id, title: "\u5220\u9664\u6761\u76EE", onClick: () => deleteWorld(worldEntry.id) })
                )
              ) : h("div", { className: "mf-empty" }, "\u5728\u5DE6\u4FA7\u521B\u5EFA\u6216\u5BFC\u5165\u4E16\u754C\u4E66\u6761\u76EE\u3002")
            ) : tab === "characters" ? h(
              "div",
              null,
              h("div", { className: "mf-eh" }, h("span", null, character ? character.name : "\u89D2\u8272\u7F16\u8F91"), h("span", { className: "mf-eh-actions" }, character ? h(MiniButton, { label: entityHistOpen && entityHistKind === "character" ? "\u6536\u8D77\u5386\u53F2" : "\u5386\u53F2", title: "\u89D2\u8272\u5386\u53F2\u7248\u672C", on: entityHistOpen && entityHistKind === "character", onClick: () => toggleEntityHistory("character", character.id) }) : null, h("span", { className: "mf-status" }, character && charDirty ? "\u672A\u4FDD\u5B58" : ""))),
              entityHistOpen && entityHistKind === "character" ? renderEntityHistory() : null,
              character ? h(
                "div",
                { className: "mf-form", style: { border: 0, padding: "14px 18px" } },
                h("input", { className: "mf-input", value: charName, placeholder: "\u89D2\u8272\u540D\u79F0", onChange: (event) => {
                  setCharName(event.target.value);
                  setCharDirty(true);
                } }),
                h("textarea", { className: "mf-text", style: { flex: "1", minHeight: "40vh", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: "6px" }, value: charDesc, placeholder: "\u89D2\u8272\u63CF\u8FF0\uFF08\u5916\u8C8C/\u6027\u683C/\u80CC\u666F/\u5173\u7CFB\u2026\uFF09", onChange: (event) => {
                  setCharDesc(event.target.value);
                  setCharDirty(true);
                } }),
                h(
                  "div",
                  { className: "mf-actions" },
                  h("button", { className: "mf-btn mf-primary", type: "button", disabled: !charDirty, onClick: saveCharacter }, "\u4FDD\u5B58\u89D2\u8272"),
                  h(MiniButton, { label: "\u2605", title: "\u6536\u85CF", on: character.isFavorited, onClick: () => toggleFavorite(character.id) }),
                  h(MiniButton, { label: "\xD7", danger: true, armed: armed && armed.kind === "delete-character" && armed.id === character.id, title: "\u5220\u9664\u89D2\u8272", onClick: () => deleteCharacter(character.id) })
                )
              ) : h("div", { className: "mf-empty" }, "\u9009\u62E9\u89D2\u8272\u5F00\u59CB\u7F16\u8F91\u3002")
            ) : tab === "notes" ? h(
              "div",
              null,
              h("div", { className: "mf-eh" }, h("span", null, note ? note.title : "\u7B14\u8BB0\u7F16\u8F91"), h("span", { className: "mf-eh-actions" }, note ? h(MiniButton, { label: entityHistOpen && entityHistKind === "note" ? "\u6536\u8D77\u5386\u53F2" : "\u5386\u53F2", title: "\u7B14\u8BB0\u5386\u53F2\u7248\u672C", on: entityHistOpen && entityHistKind === "note", onClick: () => toggleEntityHistory("note", note.id) }) : null, h("span", { className: "mf-status" }, note ? (note.isLocked ? "\u{1F512} \u9501\u5B9A" : "") + (note.isHidden ? " \u{1F441} \u9690\u85CF" : "") + (noteDirty ? " \xB7 \u672A\u4FDD\u5B58" : "") : ""))),
              entityHistOpen && entityHistKind === "note" ? renderEntityHistory() : null,
              note ? h(
                "div",
                { className: "mf-form", style: { border: 0, padding: "14px 18px" } },
                h("input", { className: "mf-input", value: noteTitle, placeholder: "\u7B14\u8BB0\u6807\u9898", onChange: (event) => {
                  setNoteTitle(event.target.value);
                  setNoteDirty(true);
                } }),
                h("textarea", { className: "mf-text", style: { flex: "1", minHeight: "40vh", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: "6px" }, value: noteContent, placeholder: "\u7B14\u8BB0\u5185\u5BB9\u2026", onChange: (event) => {
                  setNoteContent(event.target.value);
                  setNoteDirty(true);
                } }),
                h(
                  "div",
                  { className: "mf-actions" },
                  h("button", { className: "mf-btn mf-primary", type: "button", disabled: !noteDirty, onClick: saveNote }, "\u4FDD\u5B58\u7B14\u8BB0"),
                  h("select", { className: "mf-sel", value: note.categoryId || "", onChange: (event) => moveNote(note.id, event.target.value) }, h("option", { value: "" }, "\u672A\u5206\u7C7B"), categories.map((c) => h("option", { key: c.id, value: c.id }, c.title))),
                  h(MiniButton, { label: "\u{1F512}", title: "\u9501\u5B9A\uFF08Agent \u4E0D\u53EF\u6539\uFF09", on: note.isLocked, onClick: () => toggleNoteFlag(note.id, "isLocked") }),
                  h(MiniButton, { label: "\u{1F441}", title: "\u9690\u85CF", on: note.isHidden, onClick: () => toggleNoteFlag(note.id, "isHidden") }),
                  h(MiniButton, { label: "\xD7", danger: true, armed: armed && armed.kind === "delete-note" && armed.id === note.id, title: "\u5220\u9664\u7B14\u8BB0", onClick: () => deleteNote(note.id) })
                )
              ) : h("div", { className: "mf-empty" }, "\u9009\u62E9\u7B14\u8BB0\u5F00\u59CB\u7F16\u8F91\u3002")
            ) : tab === "styles" ? h(
              "div",
              null,
              h("div", { className: "mf-eh" }, h("span", null, selStyleId ? "\u98CE\u683C\u7F16\u8F91\uFF1A" + styleName : "\u5199\u4F5C\u98CE\u683C\uFF08\u6587\u7B14/\u6587\u98CE\u63D0\u793A\u8BCD\uFF09"), h("span", { className: "mf-eh-actions" }, selStyleId ? h(MiniButton, { label: stylePreview ? "\u6536\u8D77\u9884\u89C8" : "\u9884\u89C8", title: "\u9884\u89C8\u63D0\u793A\u8BCD\u6B63\u6587", on: stylePreview, onClick: () => setStylePreview(!stylePreview) }) : null, h("span", { className: "mf-status" }, selStyleId ? (styleScope === "project" ? "\u9879\u76EE\u7EA7 \xB7 " : "\u5168\u5C40 \xB7 ") + (styleDirty ? "\u672A\u4FDD\u5B58" : "\u5DF2\u4FDD\u5B58") : "\u98CE\u683C\u53EA\u6CE8\u5165\u5199\u4F5C\u4E0A\u4E0B\u6587\uFF0C\u4E0D\u8FDB\u5165 coding \u4F1A\u8BDD"))),
              selStyleId ? h(
                "div",
                { className: "mf-form", style: { border: 0, padding: "14px 18px" } },
                h("input", { className: "mf-input", value: styleName, placeholder: "\u98CE\u683C\u540D\u79F0", onChange: (event) => {
                  setStyleName(event.target.value);
                  setStyleDirty(true);
                } }),
                h("input", { className: "mf-input", value: styleDesc, placeholder: "\u4E00\u53E5\u8BDD\u63CF\u8FF0\uFF08\u5217\u8868\u5C55\u793A\uFF09", onChange: (event) => {
                  setStyleDesc(event.target.value);
                  setStyleDirty(true);
                } }),
                h("input", { className: "mf-input", value: styleTags, placeholder: "\u6807\u7B7E\uFF0C\u9017\u53F7\u5206\u9694", onChange: (event) => {
                  setStyleTags(event.target.value);
                  setStyleDirty(true);
                } }),
                h("textarea", { className: "mf-text", style: { flex: "1", minHeight: "42vh", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: "6px" }, value: styleContent, placeholder: "\u98CE\u683C\u63D0\u793A\u8BCD\u6B63\u6587\uFF08Markdown\uFF09\u2026", onChange: (event) => {
                  setStyleContent(event.target.value);
                  setStyleDirty(true);
                } }),
                stylePreview ? h("div", { className: "mf-ai-result" }, styleContent) : null,
                h(
                  "div",
                  { className: "mf-actions" },
                  h("button", { className: "mf-btn mf-primary", type: "button", disabled: !styleDirty, onClick: saveStyleEditor }, "\u4FDD\u5B58\u98CE\u683C"),
                  h(MiniButton, { label: "\xD7", danger: true, armed: armed && armed.kind === "delete-style" && armed.id === selStyleId + ":" + styleScope, title: "\u5220\u9664\u8BE5\u98CE\u683C", onClick: () => deleteStyleItem(selStyleId, styleScope) })
                )
              ) : h("div", { className: "mf-empty" }, "\u5728\u5DE6\u4FA7\u9009\u62E9\u98CE\u683C\u6587\u4EF6\u7F16\u8F91\uFF0C\u6216\u70B9\u300C+ \u65B0\u5EFA\u300D\u3002")
            ) : h(
              "div",
              { className: "mf-editor-pane" },
              findOpen ? h(
                "div",
                { className: "mf-findbar" },
                h("input", { value: findQuery, placeholder: "\u67E5\u627E\u2026", onChange: (event) => updateFind(event.target.value), onKeyDown: (event) => {
                  if (event.key === "Enter") findNext();
                  if (event.key === "Escape") setFindOpen(false);
                } }),
                h("span", null, findMatches.length ? String(findIndex + 1) + "/" + String(findMatches.length) : "0/0"),
                h("button", { className: "mf-mini", type: "button", title: "\u4E0A\u4E00\u4E2A", onClick: findPrev }, "\u2191"),
                h("button", { className: "mf-mini", type: "button", title: "\u4E0B\u4E00\u4E2A", onClick: findNext }, "\u2193"),
                h("input", { className: "mf-find-repl", value: replaceQuery, placeholder: "\u66FF\u6362\u4E3A\u2026", onChange: (event) => setReplaceQuery(event.target.value) }),
                h("button", { className: "mf-btn", type: "button", disabled: !findMatches.length, onClick: replaceOne }, "\u66FF\u6362"),
                h("button", { className: "mf-btn", type: "button", disabled: !findQuery, onClick: replaceAll }, "\u5168\u90E8\u66FF\u6362"),
                h("button", { className: "mf-close", type: "button", onClick: () => setFindOpen(false), title: "\u5173\u95ED" }, "\xD7")
              ) : null,
              error ? h("div", { className: "mf-alert" }, h("div", null, error), conflict ? h("div", { className: "mf-actions" }, h("button", { className: "mf-btn", type: "button", onClick: rebase }, "\u4FDD\u7559\u8349\u7A3F\u7EE7\u7EED"), h("button", { className: "mf-btn", type: "button", onClick: () => accept(conflict) }, "\u4F7F\u7528\u8FDC\u7AEF\u6B63\u6587")) : null) : null,
              showHistory && chapter ? h("div", { className: "mf-hist" }, h("div", { className: "mf-hist-head" }, h("span", null, "\u5386\u53F2\u7248\u672C\uFF08\u56DE\u6EDA\u5C06\u4EA7\u751F\u65B0\u4FEE\u8BA2\uFF09"), h("button", { className: "mf-close", type: "button", onClick: () => setShowHistory(false), title: "\u5173\u95ED" }, "\xD7")), historyLoading ? h("div", { className: "mf-empty" }, "\u6B63\u5728\u52A0\u8F7D\u2026") : historyList.length ? historyList.map((item) => h("div", { key: item.revision, className: "mf-hist-item" }, h("div", { className: "mf-hist-meta" }, h("strong", null, "r" + String(item.revision)), h("span", null, fmtTime(item.at) + " \xB7 " + String(item.chars) + " \u5B57")), h(MiniButton, { label: armed && armed.kind === "rollback" && armed.id === String(item.revision) ? "\u786E\u8BA4\u56DE\u6EDA" : "\u56DE\u6EDA", danger: true, armed: armed && armed.kind === "rollback" && armed.id === String(item.revision), title: "\u56DE\u6EDA\u5230\u6B64\u7248\u672C", onClick: () => rollbackTo(item.revision) }))) : h("div", { className: "mf-empty" }, "\u6682\u65E0\u5386\u53F2\u7248\u672C")) : null,
              chapter ? h("input", { key: "title-" + chapterId, className: "mf-title-input", value: titleDraft, placeholder: "\u7AE0\u8282\u6807\u9898", spellCheck: false, onChange: (event) => setTitleDraft(event.target.value), onKeyDown: (event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.target.blur();
                }
              }, onBlur: () => commitTitle(), title: "\u7AE0\u8282\u6807\u9898" }) : null,
              chapter ? h("textarea", { className: "mf-text", value: draft, spellCheck: true, placeholder: "\u5F00\u59CB\u5199\u4F5C\u2026\uFF08Ctrl+S \u4FDD\u5B58\u6B63\u6587\uFF0CCtrl+F \u67E5\u627E\u66FF\u6362\uFF09", onScroll: saveScrollPos, onSelect: (event) => {
                setSelStart(event.target.selectionStart);
                setSelEnd(event.target.selectionEnd);
              }, onMouseUp: (event) => {
                setSelStart(event.target.selectionStart);
                setSelEnd(event.target.selectionEnd);
              }, onChange: (event) => {
                setDraft(event.target.value);
                if (!conflict) {
                  setStatus("unsaved");
                  setError("");
                }
              }, onKeyDown: (event) => {
                const key = String(event.key).toLowerCase();
                if ((event.ctrlKey || event.metaKey) && key === "s") {
                  event.preventDefault();
                  saveChapter();
                }
                if ((event.ctrlKey || event.metaKey) && key === "f") {
                  event.preventDefault();
                  setFindOpen(true);
                  updateFind("");
                  later(() => {
                    const el = document.querySelector(".mf-findbar input");
                    if (el) el.focus();
                  }, 60);
                }
                if (event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey) {
                  event.preventDefault();
                  const el = event.target;
                  const start = el.selectionStart || 0;
                  const end = el.selectionEnd || start;
                  const next = draft.slice(0, start) + "\u3000\u3000" + draft.slice(end);
                  const caret = start + 2;
                  setDraft(next);
                  if (!conflict) {
                    setStatus("unsaved");
                    setError("");
                  }
                  later(() => {
                    const target = document.querySelector("textarea.mf-text");
                    if (target) {
                      target.focus();
                      target.setSelectionRange(caret, caret);
                    }
                  }, 0);
                }
              } }) : h("div", { className: "mf-empty" }, "\u9009\u62E9\u7AE0\u8282\u540E\u5F00\u59CB\u5199\u4F5C\u3002"),
              aiOpen ? h(
                "div",
                { className: "mf-ai" },
                h(
                  "div",
                  { className: "mf-ai-head" },
                  h("select", { value: aiMode, onChange: (event) => setAiMode(event.target.value) }, h("option", { value: "continue" }, "\u7EED\u5199"), h("option", { value: "rewrite" }, "\u6539\u5199\u9009\u4E2D"), h("option", { value: "summary" }, "\u7AE0\u8282\u6458\u8981"), h("option", { value: "custom" }, "\u81EA\u5B9A\u4E49\u6307\u4EE4")),
                  h("button", { className: "mf-btn mf-primary", type: "button", disabled: !chapter, onClick: aiBusy ? stopAi : runAi }, aiBusy ? "\u505C\u6B62" : "\u751F\u6210"),
                  aiResult ? h("button", { className: "mf-btn", type: "button", onClick: insertAiResult }, "\u63D2\u5165\u5230\u5149\u6807") : null
                ),
                h(
                  "div",
                  { className: "mf-ai-head" },
                  h(MiniButton, { label: aiHistoryOpen ? "\u6536\u8D77\u5386\u53F2" : "\u4F1A\u8BDD\u5386\u53F2", title: "\u67E5\u770B/\u6536\u8D77\u672C\u9879\u76EE\u7684 AI \u4F1A\u8BDD\u5386\u53F2", on: aiHistoryOpen, onClick: () => setAiHistoryOpen(!aiHistoryOpen) }),
                  h("span", { className: "mf-status" }, String(aiHistory.length) + " \u6761"),
                  h(MiniButton, { label: "\u6E05\u7A7A", title: "\u6E05\u7A7A\u672C\u9879\u76EE AI \u4F1A\u8BDD\u5386\u53F2", danger: true, disabled: !aiHistory.length, onClick: clearAiHistory }),
                  h(MiniButton, { label: aiBatchBusy ? "\u6458\u8981\u4E2D\u2026" : "\u6279\u91CF\u6458\u8981", title: "\u4E3A\u5168\u90E8\u7AE0\u8282\u987A\u5E8F\u751F\u6210\u6458\u8981\uFF08\u6700\u591A 30 \u7AE0\uFF09", disabled: aiBatchBusy || !project, onClick: runAiBatch })
                ),
                aiMode === "custom" || aiMode === "rewrite" ? h("textarea", { value: aiPrompt, placeholder: aiMode === "rewrite" ? "\u6539\u5199\u8981\u6C42\uFF08\u53EF\u9009\uFF09\u2026" : "\u8F93\u5165\u6307\u4EE4\uFF0C\u5982\uFF1A\u8BA9\u4E3B\u89D2\u5728\u96E8\u4E2D\u56DE\u5FC6\u7AE5\u5E74\u2026", onChange: (event) => setAiPrompt(event.target.value) }) : null,
                aiError ? h("div", { className: "mf-alert" }, aiError) : null,
                aiBatchError ? h("div", { className: "mf-alert" }, aiBatchError) : null,
                aiHistoryOpen ? aiHistory.length ? aiHistory.slice(-6).map((item) => h("div", { key: item.id, className: "mf-ai-result", style: { maxHeight: "80px" } }, (item.role === "assistant" ? "\u52A9\u624B " : "\u4F60 ") + (item.mode ? "(" + item.mode + ") " : "") + fmtTime(item.at) + "\n" + String(item.content).slice(0, 300))) : h("div", { className: "mf-empty" }, "\u6682\u65E0\u4F1A\u8BDD\u5386\u53F2\u3002") : null,
                aiBatchResults.length ? h("div", { className: "mf-hist" }, aiBatchResults.map((item) => h("div", { key: item.chapterId, className: "mf-ai-result", style: { maxHeight: "90px" } }, "\u3010" + item.title + "\u3011" + item.summary))) : null,
                aiResult || aiBusy ? h("div", { className: "mf-ai-result" }, (aiResult || "") + (aiBusy ? "\u258C" : "")) : null
              ) : null,
              statsOpen && stats ? h(
                "div",
                { className: "mf-heat" },
                h("div", null, h("small", null, "\u6700\u8FD1 84 \u5929\u5199\u4F5C\u70ED\u529B\u56FE \xB7 \u6BCF\u683C=\u4E00\u5929 \xB7 \u989C\u8272\u8D8A\u6DF1\u5F53\u5929\u51C0\u589E\u5B57\u6570\u8D8A\u591A")),
                h("div", { className: "mf-heat-grid" }, Array.from({ length: 84 }, (_, index) => {
                  const date = /* @__PURE__ */ new Date();
                  date.setDate(date.getDate() - (83 - index));
                  const key = dateKey(date);
                  const chars = stats.calendar && stats.calendar[key] || 0;
                  const level = chars === 0 ? 0 : chars < 200 ? 1 : chars < 800 ? 2 : chars < 2e3 ? 3 : 4;
                  return h("div", { key, className: "mf-hm-cell" + (level ? " l" + String(level) : ""), title: key + " \xB7 " + String(chars) + " \u5B57" });
                }))
              ) : null,
              h(
                "div",
                { className: "mf-foot" },
                mode === "web" ? h("span", { className: "mf-stat" }, chapter ? h("span", null, countWords(draft) + " \u5B57") : null, chapter ? h("span", { className: "mf-status " + status }, "\xB7 " + label) : null, agentContextBound && chatSummary && chatSummary.agentPreset === "mofei-writer" ? h("span", { className: "mf-context-status", title: "\u5F53\u524D\u9879\u76EE\u548C\u7AE0\u8282\u5DF2\u5173\u8054\u5230\u5199\u4F5C\u52A9\u624B\uFF1B\u5B83\u4F1A\u6309\u9700\u8BFB\u53D6\u7CBE\u88C5\u4E0A\u4E0B\u6587\u4E0E\u6700\u65B0\u4FEE\u8BA2\u3002" }, "\u5DF2\u5173\u8054\u5199\u4F5C\u52A9\u624B") : null) : h("span", { className: "mf-stat" }, chapter ? countWords(draft) + " \u5B57" : "", project && project.goal ? " \xB7 \u76EE\u6807 " + String(project.goal) + "\uFF08" + String(Math.min(100, Math.round(projectChars / project.goal * 100))) + "%\uFF09" : "", stats ? " \xB7 \u4ECA\u65E5 +" + String(stats.todayChars) + " \xB7 \u8FDE\u7EED " + String(stats.streak) + " \u5929 \xB7 \u7D2F\u8BA1 " + String(stats.totalChars) + " \u5B57" : ""),
                mode === "web" ? null : h("span", { className: "mf-eh-actions" }, h("button", { className: "mf-btn", type: "button", onClick: () => setJobListOpen(!jobListOpen) }, jobListOpen ? "\u6536\u8D77\u4EFB\u52A1" : "\u4EFB\u52A1"), h("button", { className: "mf-btn", type: "button", onClick: () => setDashOpen(!dashOpen) }, dashOpen ? "\u6536\u8D77\u8BB0\u5F55" : "\u5199\u4F5C\u8BB0\u5F55"), h("button", { className: "mf-btn", type: "button", onClick: () => setStatsOpen(!statsOpen) }, statsOpen ? "\u6536\u8D77\u70ED\u529B\u56FE" : "\u5199\u4F5C\u70ED\u529B\u56FE"), h("button", { className: "mf-btn mf-primary", type: "button", disabled: !changed || status === "saving" || !!conflict, onClick: saveChapter }, status === "saving" ? "\u4FDD\u5B58\u4E2D" : "\u4FDD\u5B58\u6B63\u6587"))
              )
            )
          ),
          mode === "web" ? null : chatOpen ? h(
            "aside",
            { className: "mf-chat", "aria-label": "Agent \u5BF9\u8BDD" },
            mode === "web" ? chatSessionsOpen ? h(
              "div",
              { className: "mf-sess-list" },
              chatSessionList.ids.length ? chatSessionList.ids.slice(0, 30).map((id) => {
                const summary = chatSessionList.byId[id] || {};
                return h(
                  "div",
                  { key: id, className: "mf-sess-item" + (id === chatSessionId ? " on" : ""), onClick: () => selectChatSession(id) },
                  h("span", { className: "name" }, summary.title || "\u672A\u547D\u540D"),
                  h("span", { className: "time" }, summary.agentPreset ? summary.agentPreset + " \xB7 " : "", fmtAgo(summary.updatedAt))
                );
              }) : h("div", { className: "mf-empty" }, "\u6682\u65E0\u4F1A\u8BDD"),
              h("button", { className: "mf-btn", type: "button", style: { margin: "4px auto 2px" }, onClick: () => {
                newChatSession();
                setChatSessionsOpen(false);
              } }, "\uFF0B \u65B0\u4F1A\u8BDD")
            ) : h("button", { className: "mf-sess-toggle", type: "button", title: "\u5207\u6362/\u9000\u51FA\u5F53\u524D\u4F1A\u8BDD", onClick: () => setChatSessionsOpen(true) }, "\u2039 \u4F1A\u8BDD\u5217\u8868") : null,
            h(
              "div",
              { className: "mf-chat-head" },
              h("span", null, "Agent \u5BF9\u8BDD", chatSummary ? h("small", null, " \xB7 " + (chatSummary.title || "\u672A\u547D\u540D") + (chatSummary.agentPreset ? " \xB7 " + chatSummary.agentPreset : "")) : null),
              h(
                "span",
                { className: "mf-eh-actions" },
                chatSnap && chatSnap.running ? h(MiniButton, { label: "\u505C\u6B62", danger: true, title: "\u505C\u6B62\u5F53\u524D\u56DE\u5408", onClick: cancelChat }) : null,
                chatPresets.length > 1 ? h("select", { className: "mf-sel", title: "\u65B0\u5EFA\u4F1A\u8BDD\u4F7F\u7528\u7684\u9884\u8BBE", value: chatPresetId, onChange: (event) => setChatPresetId(event.target.value) }, chatPresets.map((preset) => h("option", { key: preset.id, value: preset.id }, preset.name || preset.id))) : null,
                h(MiniButton, { label: "\uFF0B", title: "\u65B0\u5EFA\u4F1A\u8BDD\uFF08" + (chatPresetId || "\u9ED8\u8BA4") + " \u9884\u8BBE\uFF09", disabled: chatBusy, onClick: newChatSession }),
                mode === "web" ? null : h(MiniButton, { label: "\xD7", title: "\u6536\u8D77\u5BF9\u8BDD\u9762\u677F", onClick: () => setChatOpen(false) })
              )
            ),
            mode === "web" ? h(
              "div",
              { className: "mf-chat-body", ref: chatBodyRef },
              chatHint ? h("div", { className: "mf-chat-empty" }, chatHint) : null,
              !chatSessionId ? h("div", { className: "mf-chat-empty" }, dshClientSessions ? "\u8FD8\u6CA1\u6709\u7ED1\u5B9A DSH \u4F1A\u8BDD\uFF0C\u70B9\u53F3\u4E0A\u300C\uFF0B\u300D\u65B0\u5EFA\u5199\u4F5C\u4F1A\u8BDD\uFF08mofei-writer\uFF09\u3002" : "DSH \u4F1A\u8BDD\u670D\u52A1\u4E0D\u53EF\u7528\u3002") : null,
              normalizeChatItems(chatSnap).length ? normalizeChatItems(chatSnap).map((item) => item.kind === "user" ? h("div", { key: item.key, className: "mf-chat-msg user" }, item.text, parseMentionIds(item.text).chapterId ? h("button", { type: "button", className: "mf-chat-jump", title: "\u8DF3\u8F6C\u5230\u63D0\u53CA\u7AE0\u8282", onClick: () => jumpToChapter(parseMentionIds(item.text)) }, "\u{1F4C4} \u8DF3\u8F6C\u7AE0\u8282") : null) : item.kind === "assistant" ? h("div", { key: item.key, className: "mf-chat-msg assistant" }, item.streaming ? h("span", { className: "mf-chat-src" }, "\u5199\u4F5C Agent \u6B63\u5728\u8F93\u5165\u2026") : null, item.text || "", item.streaming ? "\u258C" : "", item.tools && item.tools.length ? item.tools.map((tool, toolIndex) => h("div", { key: toolIndex, className: "mf-chat-tool" }, "\u2699 " + tool.name)) : null, !item.streaming && item.text && item.text.trim() ? h("button", { type: "button", className: "mf-chat-jump", title: "\u628A\u56DE\u590D\u63D2\u5165\u6B63\u6587\uFF08\u5149\u6807\u5904\uFF09", onClick: () => insertChatIntoEditor(item.text) }, "\u2193 \u63D2\u5165\u6B63\u6587") : null) : item.kind === "tool" ? h("div", { key: item.key, className: "mf-chat-tool" }, (item.running ? "\u23F3 " : item.ok === false ? "\u2716 " : "\u2714 ") + (item.name || "\u5DE5\u5177") + (item.text ? "\uFF1A" + item.text : "")) : h("div", { key: item.key, className: "mf-chat-tool" }, item.text)) : h("div", { className: "mf-chat-empty" }, "\u548C\u5199\u4F5C Agent \u5BF9\u8BDD\u5427\uFF1A\u7EED\u5199 / \u5BA1\u7A3F / \u67E5\u8BBE\u5B9A\u3002"),
              chatSnap && chatSnap.pending && chatSnap.pending.length ? h("div", { className: "mf-pends" }, chatSnap.pending.map((pending) => h(PendingCard, { key: pending.key, item: pending }))) : null,
              chatError ? h("div", { className: "mf-alert" }, chatError) : null
            ) : h(
              "div",
              { className: "mf-chat-body", ref: chatBodyRef },
              chatHint ? h("div", { className: "mf-chat-empty" }, chatHint) : null,
              !chatSessionId ? h("div", { className: "mf-chat-empty" }, dshClientSessions ? "\u8FD8\u6CA1\u6709\u7ED1\u5B9A DSH \u4F1A\u8BDD\uFF0C\u70B9\u53F3\u4E0A\u300C\uFF0B\u300D\u65B0\u5EFA\u5199\u4F5C\u4F1A\u8BDD\uFF08mofei-writer\uFF09\u3002" : "DSH \u4F1A\u8BDD\u670D\u52A1\u4E0D\u53EF\u7528\u3002") : null,
              normalizeChatItems(chatSnap).length ? normalizeChatItems(chatSnap).map((item) => item.kind === "user" ? h("div", { key: item.key, className: "mf-chat-msg user" }, item.text, parseMentionIds(item.text).chapterId ? h("button", { type: "button", className: "mf-chat-jump", title: "\u8DF3\u8F6C\u5230\u63D0\u53CA\u7AE0\u8282", onClick: () => jumpToChapter(parseMentionIds(item.text)) }, "\u{1F4C4} \u8DF3\u8F6C\u7AE0\u8282") : null) : item.kind === "assistant" ? h("div", { key: item.key, className: "mf-chat-msg assistant" }, item.streaming ? h("span", { className: "mf-chat-src" }, "\u5199\u4F5C Agent \u6B63\u5728\u8F93\u5165\u2026") : null, item.text || "", item.streaming ? "\u258C" : "", item.tools && item.tools.length ? item.tools.map((tool, toolIndex) => h("div", { key: toolIndex, className: "mf-chat-tool" }, "\u2699 " + tool.name)) : null, !item.streaming && item.text && item.text.trim() ? h("button", { type: "button", className: "mf-chat-jump", title: "\u628A\u56DE\u590D\u63D2\u5165\u6B63\u6587\uFF08\u5149\u6807\u5904\uFF09", onClick: () => insertChatIntoEditor(item.text) }, "\u2193 \u63D2\u5165\u6B63\u6587") : null) : item.kind === "tool" ? h("div", { key: item.key, className: "mf-chat-tool" }, (item.running ? "\u23F3 " : item.ok === false ? "\u2716 " : "\u2714 ") + (item.name || "\u5DE5\u5177") + (item.text ? "\uFF1A" + item.text : "")) : h("div", { key: item.key, className: "mf-chat-tool" }, item.text)) : h("div", { className: "mf-chat-empty" }, "\u548C\u5199\u4F5C Agent \u5BF9\u8BDD\u5427\uFF1A\u7EED\u5199 / \u5BA1\u7A3F / \u67E5\u8BBE\u5B9A\u3002"),
              chatSnap && chatSnap.pending && chatSnap.pending.length ? h("div", { className: "mf-pends" }, chatSnap.pending.map((pending) => h(PendingCard, { key: pending.key, item: pending }))) : null,
              chatError ? h("div", { className: "mf-alert" }, chatError) : null
            ),
            h(
              "div",
              { className: "mf-chat-input" },
              h("textarea", { value: chatInput, placeholder: "\u8F93\u5165\u5199\u4F5C\u6307\u4EE4\uFF1A\u7EED\u5199 / \u5BA1\u7A3F / \u67E5\u8BBE\u5B9A\u2026\uFF08Enter \u53D1\u9001\uFF09", disabled: !chatSessionId, onChange: (event) => setChatInput(event.target.value), onKeyDown: (event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendChat();
                }
              } }),
              h("button", { className: "mf-btn mf-primary", type: "button", disabled: !chatSessionId || !chatInput.trim() || chatBusy, onClick: sendChat }, chatBusy ? "\u53D1\u9001\u4E2D" : "\u53D1\u9001")
            )
          ) : null
        )
      ),
      modelsOpen ? h(AgentModelsPanel, { roles, settings: projectId && modelSettings.byProject && modelSettings.byProject[projectId] ? modelSettings.byProject[projectId] : modelSettings, catalog: modelCatalog, busy: modelBusy, error: modelError, onSave: saveModelSettings, onClose: () => setModelsOpen(false) }) : null,
      settingsOpen ? h(SettingsPanel, { active: settingsSection, onSelect: (section) => {
        setSettingsSection(section);
        if (section === "retrieval" && !retrievalStatus && !retrievalBusy) loadRetrievalStatus();
      }, retrievalStatus, retrievalBusy, onRefreshRetrieval: loadRetrievalStatus, onClose: () => setSettingsOpen(false), onOpenModels: () => {
        setSettingsOpen(false);
        openModelsPanel();
      }, onOpenRoles: () => {
        setSettingsOpen(false);
        openRolesPanel();
      }, onOpenInstructions: () => {
        setSettingsOpen(false);
        openWritingSkills();
      }, onOpenSummary: () => {
        setSettingsOpen(false);
        openSummaryPanel();
      }, onOpenChains: () => {
        setSettingsOpen(false);
        openPromptChains();
      }, onOpenStyles: () => {
        setSettingsOpen(false);
        setTab("styles");
      } }) : null,
      importOpen ? h("div", { className: "mf-import", onMouseDown: (event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) setImportOpen(false);
      } }, h(
        "div",
        { className: "mf-import-card" },
        h("h3", null, "TXT \u6574\u4E66\u5BFC\u5165"),
        h("small", null, "\u652F\u6301\u300C\u7B2CX\u5377\u300D\u300C\u7B2CX\u7AE0/\u56DE\u300D\u6807\u9898\u8BC6\u522B\uFF1B\u81EA\u52A8\u68C0\u6D4B UTF-8 / UTF-16 BOM / GBK / GB18030 / Big5\u3002"),
        h("input", { type: "file", accept: ".txt,text/plain", onChange: (event) => readImportFile(event.target.files && event.target.files[0]) }),
        importEncoding ? h("small", null, "\u68C0\u6D4B\u7F16\u7801\uFF1A" + importEncoding) : null,
        h("input", { className: "mf-input", value: importName, placeholder: "\u9879\u76EE\u540D\u79F0\uFF08\u7559\u7A7A\u7528\u9ED8\u8BA4\uFF09", onChange: (event) => setImportName(event.target.value) }),
        importBusy ? h("div", { className: "mf-empty" }, "\u6B63\u5728\u89E3\u6790\u2026") : importError ? h("div", { className: "mf-alert" }, importError) : importPreview ? h(
          "div",
          null,
          h("small", null, "\u5377 " + String(importPreview.volumeCount) + " \xB7 \u7AE0 " + String(importPreview.chapterCount) + " \xB7 " + String(importPreview.chars) + " \u5B57"),
          importPreview.volumes.map((v) => h("div", { key: v.title || "\u672A\u5206\u5377", className: "mf-imp-vol" }, (v.title || "\u672A\u5206\u5377") + " \xB7 " + String(v.chapterCount) + " \u7AE0 \xB7 " + String(v.chars) + " \u5B57"))
        ) : h("div", { className: "mf-empty" }, "\u9009\u62E9 .txt \u6587\u4EF6\u5F00\u59CB\u3002"),
        h(
          "div",
          { className: "mf-import-actions" },
          h("button", { className: "mf-btn", type: "button", onClick: () => {
            setImportOpen(false);
            setImportPreview(null);
            setImportContent("");
            setImportName("");
            setImportEncoding("");
          } }, "\u53D6\u6D88"),
          h("button", { className: "mf-btn mf-primary", type: "button", disabled: !importPreview || importBusy, onClick: confirmImport }, "\u786E\u8BA4\u5BFC\u5165")
        )
      )) : null,
      worldImportOpen ? h("div", { className: "mf-import", onMouseDown: (event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) setWorldImportOpen(false);
      } }, h(
        "div",
        { className: "mf-import-card" },
        h("h3", null, "\u5BFC\u5165 SillyTavern \u4E16\u754C\u4E66"),
        h("small", null, "\u652F\u6301 ST Lorebook JSON\uFF1Aentries.keys / secondary_keys / constant / selective / disable / order / comment\u3002"),
        h("select", { className: "mf-sel", value: worldImportMode, onChange: (event) => setWorldImportMode(event.target.value) }, h("option", { value: "append" }, "\u8FFD\u52A0\u6A21\u5F0F"), h("option", { value: "overwrite" }, "\u8986\u76D6\u6A21\u5F0F\uFF08\u6E05\u7A7A\u73B0\u6709\u6761\u76EE\uFF09")),
        h("input", { type: "file", accept: ".json,application/json", disabled: !project || worldImportBusy, onChange: (event) => readWorldImportFile(event.target.files && event.target.files[0]) }),
        worldImportBusy ? h("div", { className: "mf-empty" }, "\u6B63\u5728\u5BFC\u5165\u2026") : worldImportError ? h("div", { className: "mf-alert" }, worldImportError) : worldImportResult ? h("div", { className: "mf-empty" }, worldImportResult) : h("div", { className: "mf-empty" }, project ? "\u9009\u62E9 .json \u4E16\u754C\u4E66\u6587\u4EF6\u5F00\u59CB\u3002" : "\u8BF7\u5148\u9009\u62E9\u9879\u76EE\u3002"),
        h(
          "div",
          { className: "mf-import-actions" },
          h("button", { className: "mf-btn", type: "button", onClick: () => {
            setWorldImportOpen(false);
            setWorldImportError("");
            setWorldImportResult("");
            setWorldImportMode("append");
          } }, "\u5173\u95ED"),
          h("button", { className: "mf-btn mf-primary", type: "button", onClick: () => setWorldImportOpen(false) }, "\u5B8C\u6210")
        )
      )) : null,
      summaryOpen ? h(SummaryPanel, { open: true, onClose: () => setSummaryOpen(false), projectTitle: project ? project.title : "", chapterRows: summaryRows, ranges: summaryRanges, loading: summaryLoading, error: summaryError, busy: summaryBusy, progress: summaryProgress, result: summaryResult, onRegenerateChapter: (row) => runSummary("chapters", { chapterIds: [row.chapterId], force: true }, "chapter", row.chapterId), onRegenerateRange: (range) => runSummary("ranges", { rangeIds: [range.id], force: true }, "range", range.id), onGenerateChapters: () => runSummary("chapters", {}, "chapters", null), onGenerateRanges: () => runSummary("ranges", {}, "ranges", null), onRefresh: refreshSummaryPanel }) : null,
      skillsOpen ? h(WritingSkillsPanel, { open: true, onClose: () => setSkillsOpen(false), onOpenChains: projectId ? () => {
        setSkillsOpen(false);
        openPromptChains();
      } : null, skills: writingSkills, settings: skillSettings, loading: skillsLoading, error: skillsError, onToggle: toggleSkill, onCreateSkill: createCustomSkill, onDeleteCustom: deleteCustomSkill, onRefresh: refreshSkillSettings }) : null,
      chainsOpen ? h(PromptChainsPanel, { open: true, onClose: () => setChainsOpen(false), chains, activeChainId: chainActiveId, onSelect: setChainActiveId, busy: chainBusy, error: chainError, result: chainResult, lastPrompt: chainLastPrompt, onSave: handleSaveChain, onDelete: handleDeleteChain, onRun: handleRunChain, onHistory: (chain) => {
        if (chain && chain.id) openGitHistory(chain.id);
      } }) : null,
      rolesOpen ? h(RolesPanel, { open: true, onClose: () => setRolesOpen(false), roles, activeRoleId: roleActiveId, onSelect: handleSelectRole, detail: roleDetail, busy: roleBusy, error: roleError, onSave: handleSaveRole, onDelete: handleDeleteRole, onAddEntry: handleAddEntry, onUpdateName: handleUpdateRoleName, onUpdateEntry: handleUpdateEntry, onDeleteEntry: handleDeleteEntry, instructions: privateInstructions, onToggleInstruction: handleToggleInstruction }) : null,
      dashOpen ? h(WritingDashboard, { open: true, onClose: () => setDashOpen(false), days: stats && stats.calendar ? stats.calendar : {} }) : null,
      gitHistOpen ? h("div", { className: "mf-import", onMouseDown: (event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) setGitHistOpen(false);
      } }, h(
        "div",
        { className: "mf-import-card" },
        h("h3", null, "Git \u5386\u53F2 / \u5BF9\u6BD4" + (gitHistData && gitHistData.chainId ? " \xB7 \u94FE " + gitHistData.chainId : "")),
        gitHistLoading ? h("div", { className: "mf-empty" }, "\u6B63\u5728\u8BFB\u53D6 git \u5386\u53F2\u2026") : !gitHistData ? null : !gitHistData.available ? h("div", { className: "mf-empty" }, (gitHistData.reason || "git \u4E0D\u53EF\u7528") + "\uFF08\u58A8\u6249\u81EA\u52A8\u5728\u6BCF\u6B21\u5199\u5165\u540E\u63D0\u4EA4 .mofei\uFF09") : h(
          "div",
          { className: "mf-git" },
          h(
            "div",
            { className: "mf-hist-head" },
            h("span", null, "\u63D0\u4EA4 " + String((gitHistData.commits || []).length) + " \u6761" + (gitHistData.patch ? " \xB7 \u542B diff" : "")),
            h(
              "span",
              { className: "mf-eh-actions" },
              h("label", { className: "mf-world-selall" }, h("input", { type: "checkbox", checked: gitHistDiff, onChange: () => toggleGitHistDiff() }), " \u542B diff"),
              h("button", { className: "mf-btn", type: "button", onClick: () => openGitHistory(gitHistChain) }, "\u5237\u65B0")
            )
          ),
          (gitHistData.commits || []).length ? gitHistData.commits.map((c) => h("div", { key: c.hash, className: "mf-git-item" }, h("code", null, String(c.hash).slice(0, 8)), h("span", null, c.subject || ""), h("small", null, fmtTime(c.at)), h(MiniButton, { label: armed && armed.kind === "git-revert" && armed.id === "git-revert:" + c.hash ? "\u786E\u8BA4\u56DE\u6EDA" : "\u56DE\u6EDA", danger: true, armed: armed && armed.kind === "git-revert" && armed.id === "git-revert:" + c.hash, title: "\u628A\u9879\u76EE\u6587\u4EF6\u6811\u56DE\u6EDA\u5230\u6B64\u63D0\u4EA4\uFF08\u8C28\u614E\uFF09", onClick: () => revertProjectTo(c.hash) }))) : h("div", { className: "mf-empty" }, "\u6682\u65E0\u63D0\u4EA4\u3002"),
          gitHistData.patch ? renderGitPatch(gitHistData.patch) : null
        ),
        h("div", { className: "mf-import-actions" }, h("button", { className: "mf-btn mf-primary", type: "button", onClick: () => setGitHistOpen(false) }, "\u5173\u95ED"))
      )) : null,
      jobListOpen ? h("div", { className: "mf-import", onMouseDown: (event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) setJobListOpen(false);
      } }, h(
        "div",
        { className: "mf-import-card" },
        h("h3", null, "\u540E\u53F0\u4EFB\u52A1\uFF08DSH Jobs\uFF09"),
        mofeiJobs.length ? h("div", { className: "mf-git" }, mofeiJobs.map((job) => h(
          "div",
          { key: job.id, className: "mf-git-item" },
          h("code", null, job.id),
          h("span", null, job.label + (job.current ? " \xB7 \u6B63\u5728\u5904\u7406\u300A" + job.current + "\u300B" : "")),
          h("small", null, job.status + (job.total ? " \xB7 " + job.done + "/" + job.total : "") + (job.error ? " \xB7 " + job.error : "")),
          job.status === "running" || job.status === "stopping" ? h(MiniButton, { label: "\u53D6\u6D88", danger: true, title: "\u53D6\u6D88\u8BE5\u4EFB\u52A1", onClick: () => killMofeiJob(job.id) }) : null
        ))) : h("div", { className: "mf-empty" }, "\u6682\u65E0\u4EFB\u52A1\uFF1B\u300C\u6279\u91CF\u6458\u8981\u300D\u7B49\u957F\u4EFB\u52A1\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF0C\u53EF\u53D6\u6D88\u3002"),
        h("div", { className: "mf-import-actions" }, h("button", { className: "mf-btn mf-primary", type: "button", onClick: () => setJobListOpen(false) }, "\u5173\u95ED"))
      )) : null,
      paletteOpen ? h(
        "div",
        { id: "mf-palette", className: "mf-palette", role: "dialog", "aria-label": "\u58A8\u6249\u5FEB\u6377\u64CD\u4F5C", onMouseDown: (event) => event.stopPropagation() },
        h("div", { className: "mf-palette-head" }, h("div", null, h("strong", null, "\u5FEB\u6377\u64CD\u4F5C"), h("small", null, "\u641C\u7D22\u5E76\u6267\u884C\u5E38\u7528\u5199\u4F5C\u64CD\u4F5C")), h("button", { className: "mf-palette-close", type: "button", "aria-label": "\u5173\u95ED\u5FEB\u6377\u64CD\u4F5C", title: "\u5173\u95ED", onClick: closePalette }, "\xD7")),
        h("input", { value: paletteQuery, placeholder: "\u641C\u7D22\u64CD\u4F5C\u2026", autoFocus: true, onChange: (event) => setPaletteQuery(event.target.value), onKeyDown: (event) => {
          if (event.key === "Enter" && filteredCommands[0]) filteredCommands[0].run();
          if (event.key === "Escape") closePalette();
        } }),
        filteredCommands.length ? filteredCommands.map((item) => h("button", { key: item.id, className: "mf-palette-item", type: "button", onClick: () => item.run() }, item.label, h("small", null, item.hint))) : h("div", { className: "mf-empty" }, "\u65E0\u5339\u914D\u547D\u4EE4")
      ) : null,
      // v0.18: 初始向导（空白状态引导选择小说文件夹）
      mode === "web" && onboardOpen ? h(
        "div",
        { className: "mf-onboard", role: "presentation" },
        h(
          "div",
          { className: "mf-onboard-card", role: "dialog", "aria-label": "\u5F00\u59CB\u5199\u4F5C" },
          h("h2", null, "\u5F00\u59CB\u4F60\u7684\u7B2C\u4E00\u672C\u5C0F\u8BF4"),
          h("p", null, "\u5C0F\u8BF4\u9ED8\u8BA4\u4FDD\u5B58\u5728\u5F53\u524D DSH \u4F1A\u8BDD\u5DF2\u9009\u62E9\u7684\u5DE5\u4F5C\u533A\uFF1B\u4F60\u4E5F\u53EF\u4EE5\u6539\u9009\u4E13\u7528\u5C0F\u8BF4\u6587\u4EF6\u5939\u3002\u7AE0\u8282\u3001\u89D2\u8272\u3001\u4E16\u754C\u4E66\u3001\u7B14\u8BB0\u548C\u94FE\u90FD\u4F1A\u5199\u5165\u8BE5\u4F4D\u7F6E\u3002"),
          h(
            "div",
            { className: "mf-onboard-folder" },
            h("input", { value: onboardFolder, placeholder: "\u5F53\u524D\u4F1A\u8BDD\u672A\u9009\u62E9\u5DE5\u4F5C\u533A\uFF0C\u53EF\u9009\u62E9\u5C0F\u8BF4\u6587\u4EF6\u5939", readOnly: true, onChange: () => {
            } }),
            h("button", { className: "mf-btn", type: "button", disabled: onboardPicking, onClick: pickOnboardFolder }, onboardPicking ? "\u9009\u62E9\u4E2D\u2026" : "\u9009\u62E9\u6587\u4EF6\u5939")
          ),
          h("input", { type: "text", value: onboardTitle, placeholder: "\u5C0F\u8BF4\u540D\uFF08\u5982\uFF1A\u63A2\u6848\u672A\u81F3\u4E4B\u5883\uFF09", onChange: (event) => setOnboardTitle(event.target.value) }),
          onboardError ? h("div", { className: "mf-onboard-error" }, onboardError) : null,
          h("div", { className: "mf-onboard-note" }, "\u63D0\u793A\uFF1A\u4E5F\u53EF\u4EE5\u76F4\u63A5\u5F00\u59CB\u5199\u4F5C\uFF0C\u4E4B\u540E\u4ECD\u53EF\u5728\u547D\u4EE4\u9762\u677F\u4E2D\u7BA1\u7406\u5B58\u653E\u4F4D\u7F6E\u3002"),
          h(
            "div",
            { className: "mf-onboard-actions" },
            h("button", { className: "mf-btn mf-primary", type: "button", disabled: onboardBusy, onClick: startOnboardProject }, onboardBusy ? "\u521B\u5EFA\u4E2D\u2026" : "\u5F00\u59CB\u5199\u4F5C")
          )
        )
      ) : null
    ];
    if (mode === "web") return h("div", { className: "mf-view-root" }, mfChildren);
    return h("div", { className: "mf-overlay", onMouseDown: (event) => {
      if (event.target === event.currentTarget) close();
    } }, mfChildren);
    function renderNoteItem(n, catId) {
      return h("div", { key: n.id, className: "mf-item" + (n.id === selNote ? " on" : "") }, h("div", { className: "mf-row" }, h("button", { className: "mf-title", type: "button", onClick: () => pickNote(n) }, (n.isLocked ? "\u{1F512} " : "") + (n.isHidden ? "\u{1F441} " : "") + n.title), h("span", { className: "mf-minis" }, h(MiniButton, { label: "\u270E", title: "\u91CD\u547D\u540D", onClick: () => startRename("note", n.id, n.title) }), h(MiniButton, { label: "\xD7", danger: true, armed: armed && armed.kind === "delete-note" && armed.id === n.id, title: armed && armed.kind === "delete-note" && armed.id === n.id ? "\u518D\u6B21\u70B9\u51FB\u786E\u8BA4\u5220\u9664" : "\u5220\u9664\u7B14\u8BB0", onClick: () => deleteNote(n.id) }))));
    }
  }
  function apply(ctx) {
    const slots = ctx.get("slots");
    if (slots === void 0) return;
    try {
      dshClientSessions = ctx.get("sessions") || null;
    } catch (error) {
      dshClientSessions = null;
    }
    try {
      dshClientConnection = ctx.get("connection") || null;
    } catch (error) {
      dshClientConnection = null;
    }
    try {
      dshClientWorkspaces = ctx.get("workspaces") || null;
    } catch (error) {
      dshClientWorkspaces = null;
    }
    slots.inject("sidebar.footer.action", () => slots.register({ name: "sidebar.footer.action", id: "mofei-workspace", order: 20, label: "\u58A8\u6249" }, SideAction));
    slots.inject("shell.overlay", () => slots.register({ name: "shell.overlay", id: "mofei-draft-workspace", order: 20, label: "\u58A8\u6249 Workspace" }, () => h(ErrorBoundary, null, h(MofeiBubble, null))));
    return () => {
      removeStyles();
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
    };
  }
  exports.mountStandalone = function(root) {
    if (!root || typeof document === "undefined") return void 0;
    ensureStyles2();
    document.body.classList.add("mf-standalone");
    panel.open = true;
    const ReactDOM = require2("react-dom");
    const element = h(ErrorBoundary, null, h(Workspace, null));
    if (ReactDOM && typeof ReactDOM.createRoot === "function") {
      const reactRoot = ReactDOM.createRoot(root);
      reactRoot.render(element);
      return () => {
        try {
          reactRoot.unmount();
        } catch (error) {
        }
      };
    }
    if (ReactDOM && typeof ReactDOM.render === "function") {
      ReactDOM.render(element, root);
      return () => {
        try {
          ReactDOM.unmountComponentAtNode(root);
        } catch (error) {
        }
      };
    }
    root.textContent = "\u58A8\u6249\u9700\u8981 React \u8FD0\u884C\u65F6\uFF0C\u8BF7\u68C0\u67E5 vendor \u811A\u672C\u662F\u5426\u52A0\u8F7D\u3002";
    return void 0;
  };
  exports.apply = apply;
  exports.inject = ["slots"];
  return module.exports;
}

// plugin/src/client/index.js
window.__ModuleLoader__.load({ id: "mofei-dsh", factory: createClient });
//# sourceMappingURL=client.js.map
