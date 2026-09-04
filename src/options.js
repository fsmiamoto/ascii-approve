/* global ASCII_APPROVE_BUNDLED */
(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const customEl = $("#custom");
  const bundledEl = $("#bundled");
  const emptyEl = $("#empty");
  const statusEl = $("#status");
  const tpl = $("#card-tpl");

  let arts = []; // custom arts: { id, name, tags[], art }
  let saveTimer = null;

  const uid = () => "c_" + Math.random().toString(36).slice(2, 10);

  function status(msg) {
    statusEl.textContent = msg;
    clearTimeout(status.t);
    status.t = setTimeout(() => (statusEl.textContent = ""), 1500);
  }

  async function load() {
    const { customArts = [] } = await chrome.storage.local.get("customArts");
    arts = Array.isArray(customArts) ? customArts : [];
    renderCustom();
    renderBundled();
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  async function save() {
    const clean = arts
      .map((a) => ({
        id: a.id,
        name: (a.name || "").trim(),
        tags: (a.tags || []).map((t) => t.trim()).filter(Boolean),
        art: a.art || "",
      }))
      .filter((a) => a.art.trim());
    await chrome.storage.local.set({ customArts: clean });
    status("Saved");
  }

  function renderCustom() {
    customEl.innerHTML = "";
    emptyEl.hidden = arts.length > 0;
    for (const art of arts) {
      const node = tpl.content.firstElementChild.cloneNode(true);
      const name = node.querySelector(".name");
      const tags = node.querySelector(".tags");
      const body = node.querySelector(".art");
      name.value = art.name || "";
      tags.value = (art.tags || []).join(", ");
      body.value = art.art || "";

      name.addEventListener("input", () => {
        art.name = name.value;
        scheduleSave();
      });
      tags.addEventListener("input", () => {
        art.tags = tags.value.split(",");
        scheduleSave();
      });
      body.addEventListener("input", () => {
        art.art = body.value;
        scheduleSave();
      });
      node.querySelector(".delete").addEventListener("click", () => {
        if (art.art.trim() && !confirm(`Delete "${art.name || "Untitled"}"?`)) return;
        arts = arts.filter((a) => a !== art);
        renderCustom();
        save();
      });
      customEl.appendChild(node);
    }
  }

  function renderBundled() {
    bundledEl.innerHTML = "";
    for (const art of ASCII_APPROVE_BUNDLED) {
      const card = document.createElement("article");
      card.className = "card";
      const head = document.createElement("div");
      head.className = "card-head";
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = art.name;
      const tagline = document.createElement("span");
      tagline.className = "tagline";
      tagline.textContent = [(art.tags || []).join(" · "), art.credit && `credit: ${art.credit}`].filter(Boolean).join("  —  ");
      head.append(title, tagline);
      const pre = document.createElement("pre");
      pre.className = "art";
      pre.textContent = art.art.replace(/\s+$/, "");
      card.append(head, pre);
      bundledEl.appendChild(card);
    }
  }

  $("#add").addEventListener("click", () => {
    arts.unshift({ id: uid(), name: "", tags: [], art: "" });
    renderCustom();
    customEl.querySelector(".name")?.focus();
  });

  $("#export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(arts, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ascii-approve-arts.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $("#import").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const list = Array.isArray(parsed) ? parsed : parsed?.arts;
      if (!Array.isArray(list)) throw new Error("Expected an array of arts");
      const incoming = list
        .filter((a) => a && typeof a.art === "string")
        .map((a) => ({
          id: typeof a.id === "string" ? a.id : uid(),
          name: typeof a.name === "string" ? a.name : "",
          tags: Array.isArray(a.tags) ? a.tags.map(String) : [],
          art: a.art,
        }));
      const byId = new Map(arts.map((a) => [a.id, a]));
      for (const a of incoming) byId.set(a.id, a);
      arts = [...byId.values()];
      renderCustom();
      await save();
      status(`Imported ${incoming.length} art(s)`);
    } catch (err) {
      alert("Import failed: " + err.message);
    } finally {
      e.target.value = "";
    }
  });

  load();
})();
