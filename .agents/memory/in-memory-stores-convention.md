---
name: In-memory data store convention (ScheduleBot project)
description: Why schedules and custom commands are kept in-memory rather than persisted to disk/DB.
---

This project's feature stores (scheduled messages, custom auto-reply commands) are plain
in-memory arrays inside service modules, not backed by a database or JSON file on disk.

**Why:** The original schedule store was already in-memory-only, and WhatsApp auth/session
state itself resets on redeploys in this setup, so file-based persistence for secondary data
added complexity without a durability guarantee to match. Kept the custom-command store
consistent with that existing convention instead of introducing a new persistence layer.

**How to apply:** When adding new bot features that need simple CRUD state, default to an
in-memory module (same shape as `scheduleStore.js` / `customCommandStore.js`) unless the user
asks explicitly for persistence across restarts — in that case, add a real DB via the database
skill rather than ad-hoc JSON file writes.
