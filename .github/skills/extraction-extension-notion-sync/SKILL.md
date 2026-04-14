---
name: extraction-extension-notion-sync
description: "Use when building or refactoring browser extraction extensions with local-first storage and Notion synchronization. Covers Manifest V3 architecture, popup/sidepanel extraction UX, content script messaging, service worker queue/retry behavior, Notion property mapping, and sync troubleshooting."
---

# Extraction Extension + Notion Sync Skill

## Purpose
Build reliable Manifest V3 browser extensions that:
- extract structured data from pages
- store locally first
- sync to Notion safely with retries and clear status

## Use When
- Creating a new extraction extension (Chrome/Edge MV3)
- Adding or fixing Notion sync in an extension
- Designing popup + sidepanel extraction workflows
- Debugging queue/pending/error sync states
- Hardening runtime messaging between popup/content/background

## Inputs To Collect First
- Target extraction schema (required + optional fields)
- Notion database ID and exact property names/types
- Desired save behavior: local-only, Notion-only, or hybrid local-first
- Retry policy and expected user feedback states

## Recommended Architecture

### 1. Manifest + Entry Points
- `manifest.json`
- `content_scripts` for DOM extraction
- `background.service_worker` for sync orchestration
- `action.default_popup` for quick capture UI
- `side_panel.default_path` reusing popup path when possible

### 2. Shared Data Contract
Define one normalized opportunity shape used by all layers:
- content extractor output
- popup form model
- local store entity
- Notion mapper input

Keep date fields normalized to `YYYY-MM-DD` before queueing.

### 3. Local-First Persistence
Always save locally first, then sync.
Use explicit statuses:
- `pending`
- `synced`
- `error`

Track:
- `syncError` (latest message)
- `syncedToNotionAt`
- `updatedAt`

### 4. Background Sync Queue
In service worker:
- process `pending` and retryable `error` records
- keep sync deterministic and idempotent
- record and expose summary metrics: synced, failed, pending
- return structured responses to popup (`ok`, `error`, counts)

### 5. Runtime Message Safety
Wrap popup runtime calls with wake-safe retry logic for MV3 worker cold starts.
Handle and classify worker connection errors:
- receiving end does not exist
- could not establish connection
- extension context invalidated

### 6. Notion Mapping Discipline
Map only properties that exist in the target Notion database.
For each mapped field, enforce type compatibility:
- title -> `title`
- url -> `url`
- select -> `select`
- text -> `rich_text`
- date -> `date`

Do not send optional properties blindly.
Feature-flag or remove fields not guaranteed in user databases.

### 7. UI State + Diagnostics
Expose health in popup/sidepanel:
- workflow mode (`notion live`, `local only`, `sync issue`)
- pending/synced/error counters
- last error text

Add concise logs with prefixes:
- `[Popup]`
- `[Service Worker]`
- `[NotionSync]`

## Implementation Checklist
- [ ] Manifest has required permissions and entry points
- [ ] Content script extraction returns normalized schema
- [ ] Popup and sidepanel share code with panel mode branching
- [ ] Service worker handles all message types used by UI
- [ ] Local store persists first, then sync pipeline runs
- [ ] Notion mapper uses exact property names/types
- [ ] Retry action includes retryable error items
- [ ] Health endpoint returns counts + last error
- [ ] Options page validates token/db id before enabling sync
- [ ] Logs are actionable but not noisy

## Common Failure Patterns
- Message receiver missing: background worker not loaded or no handler for message type
- Property mismatch: Notion field name/type differs from mapper
- Silent retries with no UI feedback: queue runs but health state is hidden
- Content script unavailable: tab URL restricted or script not injected

## Recovery Playbook
1. Validate message routing first (`onMessage` coverage)
2. Confirm local save still works when Notion is down
3. Inspect latest sync error and mapped property names
4. Retry errored records after mapping fix
5. Re-sync triage/derived caches after successful retry

## Done Criteria
- Save always succeeds locally
- Sync failures are visible, recoverable, and retryable
- Notion sync succeeds without manual DB edits after mapping is configured
- Popup and sidepanel show aligned status and behavior
