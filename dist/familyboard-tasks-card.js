/**
 * Familyboard Tasks Card
 *
 * A "sticky notes" board for to-do items merged from several to-do list
 * entities (your own Familyboard list plus anything else you configured,
 * e.g. Bring! shopping lists). Each note shows title, optional
 * description, optional due date, and optional assignee avatars.
 * Talks to the backend only through the `familyboard_tasks/get_items`
 * WebSocket command and standard `todo.*` / `familyboard_tasks.*`
 * services exposed by the "Familyboard Tasks" custom integration.
 */

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function hexToRgba(hex, alpha) {
  const clean = (hex || "#8FC1D4").replace("#", "");
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hashCode(value) {
  let hash = 0;
  const str = String(value);
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function noteRotation(uid) {
  return (hashCode(uid) % 5) - 2; // -2..2 degrees, stable per item
}

function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDue(due, lang) {
  if (!due) return "";
  const hasTime = due.includes("T");
  const date = new Date(due);
  const dateLabel = date.toLocaleDateString(lang, { day: "2-digit", month: "2-digit" });
  if (!hasTime) return dateLabel;
  const timeLabel = date.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
  return `${dateLabel} ${timeLabel}`;
}

class FamilyboardTasksCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = null;
    this._data = null;
    this._lastSignature = null;
    this._fetching = false;
    this._tickTimer = null;
    this._refreshTimer = null;
    this._filter = { persons: new Set(), lists: new Set() };
    this._showDone = false;
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("familyboard-tasks-card: 'entity' is required (the Familyboard Tasks sensor entity).");
    }
    this._config = { title: null, language: "de", ...config };
    this._render();
  }

  set hass(hass) {
    const prevEntityState = this._hass ? this._hass.states[this._config.entity] : null;
    this._hass = hass;
    if (!this._config) return;

    const entityState = hass.states[this._config.entity];
    if (!entityState) {
      this._render();
      return;
    }

    const signature = `${entityState.state}|${JSON.stringify(entityState.attributes.lists || [])}`;
    if (signature !== this._lastSignature || !prevEntityState) {
      this._lastSignature = signature;
      this._fetchItems(entityState);
    } else if (!this._data) {
      this._render();
    }
  }

  connectedCallback() {
    this._tickTimer = window.setInterval(() => this._render(), 60 * 1000);
    this._refreshTimer = window.setInterval(() => {
      const entityState = this._hass && this._hass.states[this._config.entity];
      if (entityState) this._fetchItems(entityState);
    }, 2 * 60 * 1000);
  }

  disconnectedCallback() {
    if (this._tickTimer) window.clearInterval(this._tickTimer);
    if (this._refreshTimer) window.clearInterval(this._refreshTimer);
  }

  async _fetchItems(entityState) {
    if (!this._hass || this._fetching) return;
    const configEntryId = entityState.attributes.config_entry_id;
    if (!configEntryId) {
      this._render();
      return;
    }
    this._fetching = true;
    try {
      const result = await this._hass.connection.sendMessagePromise({
        type: "familyboard_tasks/get_items",
        config_entry_id: configEntryId,
      });
      this._data = result;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("familyboard-tasks-card: failed to fetch items", err);
    } finally {
      this._fetching = false;
      this._render();
    }
  }

  async _refreshAfterMutation() {
    try {
      await this._hass.callService("homeassistant", "update_entity", {
        entity_id: this._config.entity,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("familyboard-tasks-card: refresh failed", err);
    }
    const entityState = this._hass.states[this._config.entity];
    if (entityState) await this._fetchItems(entityState);
  }

  getCardSize() {
    return 8;
  }

  static getStubConfig(hass) {
    const match = Object.keys(hass.states).find(
      (id) => id.startsWith("sensor.") && "config_entry_id" in hass.states[id].attributes && "lists" in hass.states[id].attributes
    );
    return { entity: match || "sensor.familienboard_offene_punkte" };
  }

  static getConfigElement() {
    return document.createElement("familyboard-tasks-card-editor");
  }

  _personsFromItems(items) {
    const ids = new Set();
    for (const item of items) for (const id of item.assignees || []) ids.add(id);
    return Array.from(ids).map((id) => {
      const state = this._hass.states[id];
      return {
        person_entity_id: id,
        name: state ? state.attributes.friendly_name || id : id,
        picture: state ? state.attributes.entity_picture : null,
      };
    });
  }

  _allPersons() {
    return Object.keys(this._hass.states)
      .filter((id) => id.startsWith("person."))
      .map((id) => {
        const state = this._hass.states[id];
        return {
          person_entity_id: id,
          name: state.attributes.friendly_name || id,
          picture: state.attributes.entity_picture,
        };
      });
  }

  _toggleFilter(type, id) {
    const set = type === "person" ? this._filter.persons : this._filter.lists;
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this._render();
  }

  _render() {
    if (!this.shadowRoot) return;

    if (!this._config) {
      this.shadowRoot.innerHTML = "";
      return;
    }

    if (!this._hass || !this._hass.states[this._config.entity]) {
      this.shadowRoot.innerHTML = this._styles() + `
        <div class="fb-card">
          <div class="warning">Entity "${escapeHtml(this._config.entity)}" not found.</div>
        </div>`;
      return;
    }

    const lang = this._config.language === "en" ? "en" : "de";
    const title = this._config.title || "Familienboard";
    const items = (this._data && this._data.items) || [];
    const lists = (this._data && this._data.lists) || [];
    const persons = this._personsFromItems(items);

    const listHighlight = this._filter.lists;
    const personHighlight = this._filter.persons;
    const anyFilterActive = listHighlight.size > 0 || personHighlight.size > 0;

    const itemMatchesFilter = (item) => {
      if (!anyFilterActive) return true;
      if (listHighlight.has(item.list_entity_id)) return true;
      return (item.assignees || []).some((id) => personHighlight.has(id));
    };

    const open = items.filter((i) => i.status !== "completed");
    const done = items.filter((i) => i.status === "completed");
    open.sort((a, b) => {
      if (!a.due && !b.due) return 0;
      if (!a.due) return 1;
      if (!b.due) return -1;
      return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
    });

    const avatarOrDot = (entry) =>
      entry.picture
        ? `<img class="avatar" src="${escapeHtml(entry.picture)}" alt="">`
        : `<span class="dot" style="background:${entry.color || "#ccc"}"></span>`;

    const noteHtml = (item) => {
      const dimmed = anyFilterActive && !itemMatchesFilter(item);
      const rotation = noteRotation(item.uid);
      const today = todayDateStr();
      const overdue = item.due && item.due.slice(0, 10) < today && item.status !== "completed";
      const assigneeChips = (item.assignees || [])
        .map((id) => {
          const state = this._hass.states[id];
          const picture = state ? state.attributes.entity_picture : null;
          const name = state ? state.attributes.friendly_name || id : id;
          return picture
            ? `<img class="avatar avatar-sm" src="${escapeHtml(picture)}" title="${escapeHtml(name)}" alt="">`
            : `<span class="avatar avatar-sm avatar-fallback" title="${escapeHtml(name)}">${escapeHtml(name.slice(0, 1))}</span>`;
        })
        .join("");

      return `
        <div class="note ${item.status === "completed" ? "done" : ""} ${dimmed ? "dimmed" : ""}"
          style="background:${hexToRgba(item.color, 0.4)}; transform: rotate(${rotation}deg);"
          data-uid="${escapeHtml(item.uid)}"
          data-entity="${escapeHtml(item.list_entity_id)}"
        >
          <div class="note-top">
            <button class="note-check ${item.status === "completed" ? "checked" : ""}" data-action="toggle" aria-label="erledigt">
              ${item.status === "completed" ? "✓" : ""}
            </button>
            <div class="note-assignees">${assigneeChips}</div>
          </div>
          <div class="note-summary">${escapeHtml(item.summary)}</div>
          ${item.description ? `<div class="note-description">${escapeHtml(item.description)}</div>` : ""}
          <div class="note-footer">
            ${item.due ? `<span class="note-due ${overdue ? "overdue" : ""}">📅 ${formatDue(item.due, lang)}</span>` : "<span></span>"}
            <span class="note-list" style="color:${item.color}">${escapeHtml(item.list_name)}</span>
          </div>
        </div>`;
    };

    const personsRow = persons.length
      ? `<div class="header-persons">${persons
          .map((p) => {
            const active = personHighlight.has(p.person_entity_id);
            const inactive = anyFilterActive && !active;
            return `
              <button class="chip-btn avatar-only ${active ? "active" : ""} ${inactive ? "inactive" : ""}"
                data-filter-type="person" data-filter-id="${escapeHtml(p.person_entity_id)}"
                title="${escapeHtml(p.name)}"
              >${avatarOrDot(p)}</button>`;
          })
          .join("")}</div>`
      : "";

    const listsRow = lists.length
      ? `<div class="legend">${lists
          .map((l) => {
            const active = listHighlight.has(l.entity_id);
            const inactive = anyFilterActive && !active;
            return `
              <button class="chip-btn ${active ? "active" : ""} ${inactive ? "inactive" : ""}"
                style="${active ? `box-shadow: 0 0 0 2px ${l.color};` : ""}"
                data-filter-type="list" data-filter-id="${escapeHtml(l.entity_id)}"
              ><span class="dot" style="background:${l.color}"></span>${escapeHtml(l.name)}</button>`;
          })
          .join("")}</div>`
      : "";

    this.shadowRoot.innerHTML = this._styles() + `
      <div class="fb-card">
        <div class="header">
          <div class="header-titles">
            <div class="header-title">${escapeHtml(title)}</div>
            <div class="header-sub">${open.length} offen${done.length ? ` · ${done.length} erledigt` : ""}</div>
          </div>
          ${personsRow}
          <button class="add-btn" data-action="add" aria-label="Hinzufügen">+</button>
        </div>
        <div class="notes-grid">
          ${open.map(noteHtml).join("") || `<div class="empty">Keine offenen Einträge 🎉</div>`}
        </div>
        ${
          done.length
            ? `<button class="done-toggle" data-action="toggle-done">${this._showDone ? "▾" : "▸"} Erledigt (${done.length})</button>
               ${this._showDone ? `<div class="notes-grid done-grid">${done.map(noteHtml).join("")}</div>` : ""}`
            : ""
        }
        ${listsRow}

        <div class="modal-backdrop" hidden data-modal="edit">
          <div class="modal">
            <div class="modal-bar"></div>
            <input class="modal-summary-input" type="text" placeholder="Titel" />
            <textarea class="modal-description-input" placeholder="Beschreibung (optional)"></textarea>
            <div class="modal-row">
              <label>Fällig</label>
              <input class="modal-due-input" type="date" />
            </div>
            <div class="modal-row modal-assignees"></div>
            <div class="modal-actions">
              <button class="modal-delete">Löschen</button>
              <button class="modal-toggle-done"></button>
              <span class="modal-spacer"></span>
              <button class="modal-cancel">Abbrechen</button>
              <button class="modal-save">Speichern</button>
            </div>
          </div>
        </div>

        <div class="modal-backdrop" hidden data-modal="add">
          <div class="modal">
            <div class="modal-bar"></div>
            <div class="modal-row">
              <label>Liste</label>
              <select class="add-list-select">
                ${lists.map((l) => `<option value="${escapeHtml(l.entity_id)}">${escapeHtml(l.name)}</option>`).join("")}
              </select>
            </div>
            <input class="modal-summary-input" type="text" placeholder="Titel" />
            <textarea class="modal-description-input" placeholder="Beschreibung (optional)"></textarea>
            <div class="modal-row">
              <label>Fällig</label>
              <input class="modal-due-input" type="date" />
            </div>
            <div class="modal-row modal-assignees"></div>
            <div class="modal-actions">
              <span class="modal-spacer"></span>
              <button class="modal-cancel">Abbrechen</button>
              <button class="modal-save">Hinzufügen</button>
            </div>
          </div>
        </div>
      </div>`;

    this._attachEventHandlers(items, lists);
  }

  _renderAssigneePicker(container, selectedIds) {
    const persons = this._allPersons();
    container.innerHTML =
      `<label>Zuständig</label><div class="assignee-picker">` +
      persons
        .map((p) => {
          const face = p.picture
            ? `<img class="avatar" src="${escapeHtml(p.picture)}" alt="">`
            : `<span class="avatar avatar-fallback">${escapeHtml(p.name.slice(0, 1))}</span>`;
          return `
        <button type="button" class="assignee-option ${selectedIds.has(p.person_entity_id) ? "selected" : ""}"
          data-person="${escapeHtml(p.person_entity_id)}" title="${escapeHtml(p.name)}"
        >${face}</button>`;
        })
        .join("") +
      `</div>`;
    container.querySelectorAll(".assignee-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.person;
        if (selectedIds.has(id)) selectedIds.delete(id);
        else selectedIds.add(id);
        btn.classList.toggle("selected");
      });
    });
  }

  _attachEventHandlers(items, lists) {
    const root = this.shadowRoot;

    root.querySelectorAll(".chip-btn[data-filter-type]").forEach((el) => {
      el.addEventListener("click", () => {
        const { filterType, filterId } = el.dataset;
        this._toggleFilter(filterType, filterId);
      });
    });

    const doneToggle = root.querySelector(".done-toggle");
    if (doneToggle) {
      doneToggle.addEventListener("click", () => {
        this._showDone = !this._showDone;
        this._render();
      });
    }

    root.querySelectorAll(".note-check").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const note = btn.closest(".note");
        const entityId = note.dataset.entity;
        const uid = note.dataset.uid;
        const item = items.find((i) => i.uid === uid && i.list_entity_id === entityId);
        const newStatus = item && item.status === "completed" ? "needs_action" : "completed";
        await this._hass.callService("todo", "update_item", {
          entity_id: entityId,
          item: uid,
          status: newStatus,
        });
        await this._refreshAfterMutation();
      });
    });

    root.querySelectorAll(".note").forEach((note) => {
      note.addEventListener("click", () => {
        const entityId = note.dataset.entity;
        const uid = note.dataset.uid;
        const item = items.find((i) => i.uid === uid && i.list_entity_id === entityId);
        if (item) this._openEditModal(item);
      });
    });

    const addBtn = root.querySelector(".add-btn");
    if (addBtn) addBtn.addEventListener("click", () => this._openAddModal(lists));

    root.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
      backdrop.addEventListener("click", (ev) => {
        if (ev.target === backdrop) backdrop.setAttribute("hidden", "");
      });
      const cancelBtn = backdrop.querySelector(".modal-cancel");
      if (cancelBtn) cancelBtn.addEventListener("click", () => backdrop.setAttribute("hidden", ""));
    });
  }

  _openAddModal(lists) {
    const backdrop = this.shadowRoot.querySelector('.modal-backdrop[data-modal="add"]');
    if (!backdrop || !lists.length) return;
    const bar = backdrop.querySelector(".modal-bar");
    const listSelect = backdrop.querySelector(".add-list-select");
    const summaryInput = backdrop.querySelector(".modal-summary-input");
    const descriptionInput = backdrop.querySelector(".modal-description-input");
    const dueInput = backdrop.querySelector(".modal-due-input");
    const assigneesContainer = backdrop.querySelector(".modal-assignees");
    const saveBtn = backdrop.querySelector(".modal-save");

    summaryInput.value = "";
    descriptionInput.value = "";
    dueInput.value = "";
    const selected = new Set();
    this._renderAssigneePicker(assigneesContainer, selected);

    const updateBar = () => {
      const list = lists.find((l) => l.entity_id === listSelect.value);
      bar.style.background = list ? list.color : "#ccc";
    };
    listSelect.onchange = updateBar;
    updateBar();

    saveBtn.onclick = async () => {
      const entityId = listSelect.value;
      const summary = summaryInput.value.trim();
      if (!summary) return;
      saveBtn.disabled = true;
      try {
        await this._hass.connection.sendMessagePromise({
          type: "call_service",
          domain: "familyboard_tasks",
          service: "add_item",
          service_data: {
            entity_id: entityId,
            summary,
            description: descriptionInput.value.trim() || undefined,
            due_date: dueInput.value || undefined,
            person_entity_ids: Array.from(selected),
          },
          return_response: true,
        });
        backdrop.setAttribute("hidden", "");
        await this._refreshAfterMutation();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("familyboard-tasks-card: add_item failed", err);
      } finally {
        saveBtn.disabled = false;
      }
    };

    backdrop.removeAttribute("hidden");
    summaryInput.focus();
  }

  _openEditModal(item) {
    const backdrop = this.shadowRoot.querySelector('.modal-backdrop[data-modal="edit"]');
    if (!backdrop) return;
    const bar = backdrop.querySelector(".modal-bar");
    const summaryInput = backdrop.querySelector(".modal-summary-input");
    const descriptionInput = backdrop.querySelector(".modal-description-input");
    const dueInput = backdrop.querySelector(".modal-due-input");
    const assigneesContainer = backdrop.querySelector(".modal-assignees");
    const saveBtn = backdrop.querySelector(".modal-save");
    const deleteBtn = backdrop.querySelector(".modal-delete");
    const toggleDoneBtn = backdrop.querySelector(".modal-toggle-done");

    bar.style.background = item.color;
    summaryInput.value = item.summary;
    descriptionInput.value = item.description || "";
    dueInput.value = item.due ? item.due.slice(0, 10) : "";
    const selected = new Set(item.assignees || []);
    this._renderAssigneePicker(assigneesContainer, selected);

    const isDone = item.status === "completed";
    toggleDoneBtn.textContent = isDone ? "↺ Wieder öffnen" : "✓ Erledigt";
    toggleDoneBtn.classList.toggle("is-done", isDone);
    toggleDoneBtn.onclick = async () => {
      toggleDoneBtn.disabled = true;
      try {
        await this._hass.callService("todo", "update_item", {
          entity_id: item.list_entity_id,
          item: item.uid,
          status: isDone ? "needs_action" : "completed",
        });
        backdrop.setAttribute("hidden", "");
        await this._refreshAfterMutation();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("familyboard-tasks-card: toggle done failed", err);
      } finally {
        toggleDoneBtn.disabled = false;
      }
    };

    saveBtn.onclick = async () => {
      const summary = summaryInput.value.trim();
      if (!summary) return;
      saveBtn.disabled = true;
      try {
        await this._hass.callService("todo", "update_item", {
          entity_id: item.list_entity_id,
          item: item.uid,
          rename: summary,
          description: descriptionInput.value.trim(),
          due_date: dueInput.value || null,
        });
        await this._hass.callService("familyboard_tasks", "set_assignees", {
          entity_id: item.list_entity_id,
          uid: item.uid,
          person_entity_ids: Array.from(selected),
        });
        backdrop.setAttribute("hidden", "");
        await this._refreshAfterMutation();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("familyboard-tasks-card: update failed", err);
      } finally {
        saveBtn.disabled = false;
      }
    };

    deleteBtn.onclick = async () => {
      deleteBtn.disabled = true;
      try {
        await this._hass.callService("todo", "remove_item", {
          entity_id: item.list_entity_id,
          item: item.uid,
        });
        backdrop.setAttribute("hidden", "");
        await this._refreshAfterMutation();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("familyboard-tasks-card: delete failed", err);
      } finally {
        deleteBtn.disabled = false;
      }
    };

    backdrop.removeAttribute("hidden");
  }

  _styles() {
    return `<style>
      :host { display: block; }
      .fb-card {
        font-family: var(--paper-font-body1_-_font-family, "Nunito", "Segoe UI", sans-serif);
        background: var(--ha-card-background, var(--card-background-color, #fff));
        border-radius: var(--ha-card-border-radius, 16px);
        box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0,0,0,0.15));
        overflow: hidden;
        color: var(--primary-text-color);
      }
      .header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px 16px;
        padding: 16px 20px;
        background: var(--familyboard-header-background, linear-gradient(135deg, #F2A6A0, #F6D186));
        color: #2b2320;
      }
      .header-titles { flex: 1; min-width: 120px; }
      .header-title { font-size: 1.3em; font-weight: 700; letter-spacing: 0.02em; }
      .header-sub { margin-top: 2px; font-size: 0.85em; opacity: 0.85; }
      .header-persons { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .add-btn {
        width: 34px; height: 34px; border-radius: 50%; border: none;
        background: rgba(255,255,255,0.6); color: #2b2320; font-size: 1.3em;
        line-height: 1; cursor: pointer;
      }
      .add-btn:hover { background: rgba(255,255,255,0.9); }
      .notes-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 14px;
        padding: 18px;
      }
      .empty { grid-column: 1 / -1; text-align: center; color: var(--secondary-text-color); padding: 12px; }
      .note {
        border-radius: 4px;
        padding: 10px 12px 12px;
        box-shadow: 0 3px 8px rgba(0,0,0,0.18);
        cursor: pointer;
        transition: opacity 0.15s ease, transform 0.1s ease;
        min-height: 100px;
        display: flex;
        flex-direction: column;
      }
      .note:hover { transform: rotate(0deg) scale(1.03) !important; }
      .note.dimmed { opacity: 0.35; }
      .note.done .note-summary { text-decoration: line-through; opacity: 0.6; }
      .note-top { display: flex; align-items: flex-start; justify-content: space-between; }
      .note-check {
        width: 22px; height: 22px; border-radius: 50%; border: 2px solid rgba(0,0,0,0.35);
        background: rgba(255,255,255,0.6); cursor: pointer; font-size: 0.8em; line-height: 1;
        color: #2b2320; flex: none;
      }
      .note-check.checked { background: #2b2320; color: #fff; border-color: #2b2320; }
      .note-assignees { display: flex; }
      .note-assignees .avatar { margin-left: -6px; border: 2px solid rgba(255,255,255,0.8); }
      .note-assignees .avatar:first-child { margin-left: 0; }
      .note-summary { font-weight: 700; margin-top: 8px; font-size: 0.95em; word-break: break-word; }
      .note-description {
        font-size: 0.8em; margin-top: 4px; opacity: 0.8; overflow: hidden;
        display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
      }
      .note-footer {
        margin-top: auto; padding-top: 8px; display: flex; align-items: center;
        justify-content: space-between; font-size: 0.72em; font-weight: 600;
      }
      .note-due.overdue { color: #b3261e; }
      .note-list { text-transform: uppercase; letter-spacing: 0.03em; }
      .done-toggle {
        display: block; margin: 0 18px 12px; background: none; border: none;
        color: var(--secondary-text-color); cursor: pointer; font: inherit; font-size: 0.85em; padding: 4px 0;
      }
      .done-grid { padding-top: 0; }
      .avatar {
        width: 22px; height: 22px; border-radius: 50%; object-fit: cover; display: inline-block;
      }
      .avatar-sm { width: 20px; height: 20px; }
      .avatar-fallback {
        display: inline-flex; align-items: center; justify-content: center;
        background: #2b2320; color: #fff; font-size: 0.65em; font-weight: 700;
      }
      .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
      .chip-btn {
        display: flex; align-items: center; gap: 6px; font: inherit; font-size: 0.82em;
        color: var(--secondary-text-color); background: none; border: none; border-radius: 14px;
        padding: 3px 8px 3px 3px; cursor: pointer; transition: opacity 0.15s ease, background 0.15s ease;
      }
      .header-persons .chip-btn { color: #2b2320; background: rgba(255,255,255,0.4); border-radius: 50%; padding: 2px; }
      .header-persons .chip-btn.active { background: rgba(255,255,255,0.9); box-shadow: 0 1px 4px rgba(0,0,0,0.2); }
      .chip-btn.active { color: var(--primary-text-color); font-weight: 700; background: var(--secondary-background-color, rgba(0,0,0,0.05)); }
      .chip-btn.inactive { opacity: 0.4; }
      .legend { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 16px 16px; border-top: 1px solid var(--divider-color, #eee); }
      .warning { padding: 16px; color: var(--error-color, #db4437); }
      .modal-backdrop {
        position: fixed; inset: 0; background: rgba(0,0,0,0.45);
        display: flex; align-items: center; justify-content: center; z-index: 1000;
      }
      .modal-backdrop[hidden] { display: none; }
      .modal {
        background: var(--card-background-color, #fff); color: var(--primary-text-color);
        border-radius: 12px; width: min(360px, 90vw); overflow: hidden;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3); display: flex; flex-direction: column;
      }
      .modal-bar { height: 8px; background: #F2A6A0; }
      .modal-summary-input {
        margin: 16px 16px 0; padding: 8px 10px; font: inherit; font-size: 1.05em; font-weight: 700;
        border: 1px solid var(--divider-color, #ddd); border-radius: 8px; background: transparent;
        color: inherit;
      }
      .modal-description-input {
        margin: 10px 16px 0; padding: 8px 10px; font: inherit; font-size: 0.9em; min-height: 60px;
        border: 1px solid var(--divider-color, #ddd); border-radius: 8px; resize: vertical; background: transparent;
        color: inherit;
      }
      .modal-row { margin: 10px 16px 0; display: flex; flex-direction: column; gap: 4px; }
      .modal-row label { font-size: 0.75em; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: 0.03em; }
      .modal-row input, .modal-row select {
        font: inherit; padding: 6px 8px; border: 1px solid var(--divider-color, #ddd); border-radius: 8px;
        background: transparent; color: inherit;
      }
      .assignee-picker { display: flex; flex-wrap: wrap; gap: 10px; }
      .assignee-option {
        width: 46px; height: 46px; padding: 0; border-radius: 50%;
        border: 3px solid transparent; background: transparent; cursor: pointer; overflow: hidden;
      }
      .assignee-option .avatar { width: 100%; height: 100%; }
      .assignee-option .avatar-fallback { font-size: 1.1em; }
      .assignee-option.selected { border-color: var(--primary-color, #F2A6A0); }
      .modal-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 16px; }
      .modal-spacer { flex: 1; }
      .modal-actions button {
        font: inherit; font-weight: 600; padding: 8px 14px; border-radius: 8px; border: none; cursor: pointer;
      }
      .modal-delete { background: none; color: var(--error-color, #b3261e); padding: 8px 4px !important; }
      .modal-toggle-done { background: var(--secondary-background-color, rgba(0,0,0,0.06)); color: #2f8f5b; }
      .modal-toggle-done.is-done { color: var(--secondary-text-color); }
      .modal-cancel { background: var(--secondary-background-color, rgba(0,0,0,0.06)); color: inherit; }
      .modal-save { background: var(--primary-color, #F2A6A0); color: #fff; }
    </style>`;
  }
}

customElements.define("familyboard-tasks-card", FamilyboardTasksCard);

const EDITOR_LABELS = {
  entity: "Entity",
  title: "Titel",
  language: "Sprache",
};

const EDITOR_HELPERS = {
  entity: "Sensor-Entity der Familyboard-Tasks-Integration",
};

class FamilyboardTasksCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  connectedCallback() {
    this._render();
  }

  _schema() {
    return [
      {
        name: "entity",
        required: true,
        selector: { entity: { filter: { integration: "familyboard_tasks" } } },
      },
      { name: "title", selector: { text: {} } },
      {
        name: "language",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "de", label: "Deutsch" },
              { value: "en", label: "English" },
            ],
          },
        },
      },
    ];
  }

  _render() {
    if (!this._hass || !this._config) return;

    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        this._config = ev.detail.value;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config } }));
      });
      this.appendChild(this._form);
    }

    this._form.hass = this._hass;
    this._form.data = { language: "de", ...this._config };
    this._form.schema = this._schema();
    this._form.computeLabel = (item) => EDITOR_LABELS[item.name] || item.name;
    this._form.computeHelper = (item) => EDITOR_HELPERS[item.name] || "";
  }
}

customElements.define("familyboard-tasks-card-editor", FamilyboardTasksCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "familyboard-tasks-card",
  name: "Familyboard Tasks Card",
  description: "Post-it-Board für To-Dos und Einkaufslisten (inkl. Bring!) mit Zuständigkeiten und Fälligkeiten.",
  preview: false,
});
