// ASCII Approve — content script.
// Finds GitHub's "Review changes" textarea and adds an ASCII-art picker above it.
/* global ASCII_APPROVE_BUNDLED */
(() => {
  "use strict";

  const LOG = "[ascii-approve]";
  const hosts = new WeakMap(); // textarea -> host element
  let customArts = [];

  // ---------- storage ----------
  async function loadCustomArts() {
    try {
      const { customArts: saved = [] } = await chrome.storage.local.get("customArts");
      customArts = normalizeCustom(saved);
    } catch (e) {
      console.warn(LOG, "failed to load custom arts", e);
    }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.customArts) {
      customArts = normalizeCustom(changes.customArts.newValue);
    }
  });

  function normalizeCustom(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((a) => a && typeof a.art === "string" && a.art.trim())
      .map((a) => ({ ...a, name: a.name?.trim() || "Untitled", custom: true }));
  }

  function allArts() {
    return [...customArts, ...ASCII_APPROVE_BUNDLED];
  }

  // ---------- detection ----------
  const KNOWN_SELECTORS = [
    "#pull_request_review_body",
    'textarea[name="pull_request_review[body]"]',
  ].join(",");

  function findReviewTextareas() {
    const found = new Set();
    document.querySelectorAll(KNOWN_SELECTORS).forEach((t) => found.add(t));

    // Fallback heuristic (new React UI, "Finish your review" dialog): a container holding a
    // textarea plus a button that starts with "Submit review" (may carry a ⌘↩ kbd hint).
    if (/\/pull\/\d+/.test(location.pathname)) {
      for (const box of document.querySelectorAll('[role="dialog"], form, details-menu')) {
        const textareas = box.querySelectorAll("textarea");
        if (!textareas.length) continue;
        const heading = box.querySelector("h1, h2, h3, h4")?.textContent || "";
        const isReview =
          /finish your review/i.test(heading) ||
          [...box.querySelectorAll("button")].some((b) => /^submit review\b/i.test((b.textContent || "").trim()));
        if (isReview) textareas.forEach((t) => found.add(t));
      }
    }
    return [...found];
  }

  // Where to put the trigger. New UI: right below the markdown editor box (the ancestor that
  // holds the Write/Preview tablist or formatting toolbar). Classic: directly above the textarea.
  function findAnchor(textarea) {
    const stop = textarea.closest('[role="dialog"], form, details-menu') || document.body;
    let el = textarea.parentElement;
    while (el && el !== stop) {
      if (el.querySelector('[role="tablist"], [role="toolbar"]')) return { el, where: "afterend" };
      el = el.parentElement;
    }
    return { el: textarea, where: "beforebegin" };
  }

  function scan() {
    const found = findReviewTextareas();
    for (const textarea of found) {
      const existing = hosts.get(textarea);
      if (existing && existing.isConnected) continue;
      try {
        attach(textarea);
        console.info(LOG, "attached picker", { placement: hosts.get(textarea)?.dataset.placement, textarea });
      } catch (e) {
        console.error(LOG, "attach failed", e);
      }
    }
  }

  let scanTimer = null;
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, 150);
  }

  // ---------- theme ----------
  function isDark() {
    const html = document.documentElement;
    const mode = html.getAttribute("data-color-mode");
    if (mode === "dark") return true;
    if (mode === "light") return false;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  }

  // ---------- insertion ----------
  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) desc.set.call(el, value);
    else el.value = value;
  }

  function toBlock(art) {
    return "```text\n" + art.art.replace(/\s+$/, "") + "\n```";
  }

  function insertArt(textarea, art) {
    const block = toBlock(art);
    const current = textarea.value;
    let sep = "";
    if (current.trim()) sep = current.endsWith("\n") ? (current.endsWith("\n\n") ? "" : "\n") : "\n\n";
    const next = current + sep + block + "\n";
    setNativeValue(textarea, next);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
    textarea.focus();
    try {
      textarea.setSelectionRange(next.length, next.length);
    } catch {
      /* ignore */
    }
  }

  // ---------- UI ----------
  const STYLE = `
    :host { display: block; margin: 0 0 6px 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; font-size: 12px; }
    :host([data-placement="after"]) { margin: 8px 0 0 0; }
    * { box-sizing: border-box; }
    .trigger {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 3px 10px; border-radius: 6px; cursor: pointer; line-height: 20px;
      border: 1px solid var(--border); background: var(--btn-bg); color: var(--fg);
      font-weight: 500; font-size: 12px;
    }
    .trigger:hover { background: var(--btn-hover); }
    .trigger .chev { opacity: .7; font-size: 10px; }
    .panel {
      position: fixed; z-index: 2147483000; display: none; flex-direction: column;
      width: var(--panel-w); height: var(--panel-h);
      background: var(--bg); color: var(--fg); border: 1px solid var(--border);
      border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.35); overflow: hidden;
    }
    .panel.open { display: flex; }
    .head { display: flex; align-items: center; gap: 8px; padding: 8px; border-bottom: 1px solid var(--border); }
    .head input {
      flex: 1; padding: 5px 8px; border-radius: 6px; border: 1px solid var(--border);
      background: var(--input-bg); color: var(--fg); font-size: 13px; outline: none;
    }
    .head input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); }
    .hint { color: var(--muted); font-size: 11px; white-space: nowrap; }
    kbd { font: 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; padding: 2px 4px; border: 1px solid var(--border); border-bottom-width: 2px; border-radius: 4px; background: var(--btn-bg); }
    .body { flex: 1; display: flex; min-height: 0; }
    .list { width: 190px; flex: none; overflow-y: auto; border-right: 1px solid var(--border); padding: 4px; }
    .item {
      display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 6px; cursor: pointer;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px;
    }
    .item .badge { margin-left: auto; font-size: 10px; color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 0 6px; }
    .item.active { background: var(--accent); color: #fff; }
    .item.active .badge { color: #fff; border-color: rgba(255,255,255,.5); }
    .item:not(.active):hover { background: var(--btn-hover); }
    .empty { padding: 12px; color: var(--muted); }
    .preview { flex: 1; min-width: 0; overflow: auto; background: var(--pre-bg); padding: 10px 12px; }
    .preview pre { margin: 0; font: 11px/1.25 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--fg); white-space: pre; }
    .preview .rand { color: var(--muted); font-size: 13px; font-family: inherit; }
    .credit { flex: none; padding: 4px 12px; color: var(--muted); font-size: 11px; border-top: 1px solid var(--border); background: var(--pre-bg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .previewcol { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .foot { display: flex; align-items: center; gap: 8px; padding: 8px; border-top: 1px solid var(--border); }
    .btn { padding: 4px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--btn-bg); color: var(--fg); cursor: pointer; font-size: 12px; font-weight: 500; }
    .btn:hover { background: var(--btn-hover); }
    .btn.primary { background: var(--green); border-color: var(--green); color: #fff; }
    .btn.primary:hover { filter: brightness(1.08); }
    .foot .spacer { flex: 1; }
    .foot a { color: var(--accent); text-decoration: none; font-size: 12px; }
    .foot a:hover { text-decoration: underline; }
  `;

  const THEMES = {
    light: `--bg:#fff; --fg:#1f2328; --muted:#656d76; --border:#d0d7de; --btn-bg:#f6f8fa; --btn-hover:#eaeef2; --input-bg:#fff; --pre-bg:#f6f8fa; --accent:#0969da; --accent-glow:rgba(9,105,218,.3); --green:#1f883d;`,
    dark: `--bg:#161b22; --fg:#e6edf3; --muted:#8b949e; --border:#30363d; --btn-bg:#21262d; --btn-hover:#30363d; --input-bg:#0d1117; --pre-bg:#0d1117; --accent:#2f81f7; --accent-glow:rgba(47,129,247,.3); --green:#238636;`,
  };

  const RANDOM = { id: "__random__", name: "Random", random: true };

  function attach(textarea) {
    const host = document.createElement("div");
    host.className = "ascii-approve-host";
    hosts.set(textarea, host);
    const anchor = findAnchor(textarea);
    anchor.el.insertAdjacentElement(anchor.where, host);
    host.dataset.placement = anchor.where === "afterend" ? "after" : "before";

    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${STYLE}</style>
      <button type="button" class="trigger" title="Insert ASCII art">
        <span>ASCII art</span><span class="chev">▾</span>
      </button>
      <div class="panel" role="dialog" aria-label="Pick an ASCII art">
        <div class="head">
          <input type="text" placeholder="Filter arts…" spellcheck="false" />
          <span class="hint"><kbd>↑↓</kbd> pick · <kbd>⏎</kbd> insert · <kbd>esc</kbd></span>
        </div>
        <div class="body">
          <div class="list"></div>
          <div class="previewcol"><div class="preview"><pre></pre></div><div class="credit"></div></div>
        </div>
        <div class="foot">
          <button type="button" class="btn primary insert">Insert</button>
          <button type="button" class="btn copy">Copy</button>
          <span class="spacer"></span>
          <a href="#" class="manage">Manage arts →</a>
        </div>
      </div>
    `;

    const trigger = root.querySelector(".trigger");
    const panel = root.querySelector(".panel");
    const input = root.querySelector("input");
    const list = root.querySelector(".list");
    const pre = root.querySelector(".preview pre");
    const creditEl = root.querySelector(".credit");
    const insertBtn = root.querySelector(".insert");
    const copyBtn = root.querySelector(".copy");
    const manage = root.querySelector(".manage");

    let filtered = [];
    let activeIndex = 0;

    function applyTheme() {
      host.style.cssText = THEMES[isDark() ? "dark" : "light"];
    }

    function matches(art, q) {
      if (!q) return true;
      const hay = [art.name, ...(art.tags || [])].join(" ").toLowerCase();
      return q.split(/\s+/).every((w) => hay.includes(w));
    }

    function render() {
      const q = input.value.trim().toLowerCase();
      const arts = allArts().filter((a) => matches(a, q));
      filtered = arts.length ? [RANDOM, ...arts] : [];
      if (activeIndex >= filtered.length) activeIndex = 0;

      list.innerHTML = "";
      if (!filtered.length) {
        list.innerHTML = `<div class="empty">No arts match.</div>`;
        pre.innerHTML = "";
        return;
      }
      filtered.forEach((art, i) => {
        const el = document.createElement("div");
        el.className = "item" + (i === activeIndex ? " active" : "");
        el.dataset.index = String(i);
        const label = document.createElement("span");
        label.textContent = art.random ? "🎲 Random" : art.name;
        el.appendChild(label);
        if (art.custom) {
          const badge = document.createElement("span");
          badge.className = "badge";
          badge.textContent = "custom";
          el.appendChild(badge);
        }
        el.addEventListener("mousemove", () => {
          if (activeIndex !== i) {
            activeIndex = i;
            highlight();
          }
        });
        el.addEventListener("click", () => choose());
        list.appendChild(el);
      });
      highlight();
    }

    function highlight() {
      list.querySelectorAll(".item").forEach((el, i) => el.classList.toggle("active", i === activeIndex));
      const active = list.querySelector(".item.active");
      active?.scrollIntoView({ block: "nearest" });
      const art = filtered[activeIndex];
      if (!art) return;
      if (art.random) {
        pre.innerHTML = `<span class="rand">Insert a random art from the ${filtered.length - 1} shown.</span>`;
        creditEl.textContent = "";
      } else {
        pre.textContent = art.art.replace(/\s+$/, "");
        creditEl.textContent = art.custom ? "Custom art" : art.credit ? `Art: ${art.credit}` : "";
      }
    }

    function resolveActive() {
      const art = filtered[activeIndex];
      if (!art) return null;
      if (!art.random) return art;
      const pool = filtered.filter((a) => !a.random);
      return pool[Math.floor(Math.random() * pool.length)] || null;
    }

    function choose() {
      const art = resolveActive();
      if (!art) return;
      insertArt(textarea, art);
      close();
    }

    function position() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(760, vw - 24);
      const h = Math.min(440, vh - 24);
      host.style.setProperty("--panel-w", w + "px");
      host.style.setProperty("--panel-h", h + "px");
      const r = trigger.getBoundingClientRect();
      let top = r.bottom + 6;
      if (top + h > vh - 12) top = Math.max(12, r.top - 6 - h);
      let left = r.left;
      if (left + w > vw - 12) left = Math.max(12, vw - 12 - w);
      panel.style.top = top + "px";
      panel.style.left = left + "px";
    }

    function open() {
      applyTheme();
      input.value = "";
      activeIndex = 1; // first real art; Random stays at the top
      render();
      position();
      panel.classList.add("open");
      requestAnimationFrame(() => input.focus());
      document.addEventListener("pointerdown", onDocPointerDown, true);
      window.addEventListener("resize", position);
      window.addEventListener("scroll", position, true);
    }

    function close() {
      panel.classList.remove("open");
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    }

    function onDocPointerDown(e) {
      if (!e.composedPath().includes(host)) close();
    }

    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      panel.classList.contains("open") ? close() : open();
    });

    input.addEventListener("input", () => {
      activeIndex = 1; // top match, so typing + Enter is deterministic; Random stays available above
      render();
    });

    panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
        textarea.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (filtered.length) {
          activeIndex = (activeIndex + 1) % filtered.length;
          highlight();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (filtered.length) {
          activeIndex = (activeIndex - 1 + filtered.length) % filtered.length;
          highlight();
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        choose();
      }
    });

    // Keep keystrokes inside the panel from reaching GitHub's own shortcuts.
    panel.addEventListener("keypress", (e) => e.stopPropagation());
    panel.addEventListener("keyup", (e) => e.stopPropagation());

    insertBtn.addEventListener("click", choose);
    copyBtn.addEventListener("click", async () => {
      const art = resolveActive();
      if (!art) return;
      try {
        await navigator.clipboard.writeText(toBlock(art) + "\n");
        copyBtn.textContent = "Copied!";
        setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
      } catch (err) {
        console.warn(LOG, "copy failed", err);
      }
    });
    manage.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: "open-options" });
    });

    applyTheme();
  }

  // ---------- boot ----------
  loadCustomArts().then(() => {
    console.info(LOG, "content script active", { version: chrome.runtime.getManifest().version, url: location.href });
    scan();
    const mo = new MutationObserver(scheduleScan);
    mo.observe(document.documentElement, { childList: true, subtree: true });
    // GitHub SPA navigations
    window.addEventListener("turbo:load", scheduleScan);
    window.addEventListener("popstate", scheduleScan);
  });
})();
