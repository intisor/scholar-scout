# ScholarScout Debug Guide

## Communication Verification

The extension **is fully set up for proper communication** between the options page and the service worker. To verify everything is working:

### 1. **Reload the Extension**

Go to `edge://extensions` or `chrome://extensions`:
1. Toggle **Developer mode** (top right corner)
2. Find **ScholarScout** in the list
3. Click the **Refresh** button

### 2. **Monitor Service Worker Console**

After reloading:
1. In `edge://extensions` or `chrome://extensions`
2. Find **ScholarScout**
3. Click **Service Worker** link (under "Inspect views")
4. A new DevTools window opens - switch to **Console** tab

You should see messages like:
```
[ScholarScout Service Worker] Script loaded
```

### 3. **Monitor Options Page Console**

1. Right-click ScholarScout icon in toolbar
2. Select **Manage extension** or go to `chrome-extension://[EXTENSION_ID]/options/options.html`
3. Open DevTools with **Ctrl+Shift+I** (or F12)
4. Switch to **Console** tab

You should see:
```
[ScholarScout Options] Script loaded
[Options] initOptionsPage started
[Options] loadConfig started
[Options] Loaded config: { hasToken: false, hasDbId: false, ... }
[Options] initOptionsPage completed
```

### 4. **Test Configuration Save**

1. **Fill in at least Notion token and Database ID** (get these from your Notion workspace)
2. Click **Save Settings**
3. Watch both consoles simultaneously

**Expected sequence in Options console:**
```
[Options] saveConfig started
[Options] Saving to chrome.storage.local...
[Options] Config saved successfully
✓ saved! (button text)
[Options] Sending SYNC_CACHE message to service worker...
[Options] SYNC_CACHE acknowledged by service worker: { ok: true }
```

**Expected in Service Worker console:**
```
[Service Worker] Received message: SYNC_CACHE from sender: ...
[Service Worker] Processing SYNC_CACHE
[Service Worker] SYNC_CACHE function started
[Service Worker] Config retrieved - token: true dbId: true
[Service Worker] SYNC_CACHE fetching upcoming items...
[Service Worker] SYNC_CACHE got 0 items (or N items if you have data)
[Service Worker] SYNC_CACHE storing 0 items
[Service Worker] SYNC_CACHE completed successfully
[Service Worker] SYNC_CACHE completed: undefined
```

### 5. **Test Save Opportunity**

1. Go to any scholarship website (e.g., scholarships.com, fasterweb.com)
2. Click the ScholarScout icon or press **Ctrl+Shift+O**
3. Fill in fields and click **Save**
4. Watch Service Worker console

**Expected:**
```
[Service Worker] Received message: SAVE_OPPORTUNITY from sender: ...
[Service Worker] Processing SAVE_OPPORTUNITY
[Service Worker] handleSave called with: { name: "...", url: "https://..." }
[Service Worker] Calling saveToNotion...
[Service Worker] saveToNotion building page...
[Service Worker] saveToNotion succeeded
[Service Worker] SYNC_CACHE function started
...
[Service Worker] handleSave completed successfully
[Service Worker] SAVE_OPPORTUNITY result: { ok: true }
```

## Troubleshooting

### Problem: Options page shows "not connected" but I saved settings

**Check:**
1. Open DevTools console on options page
2. Look for any error messages (red text)
3. If you see `[Options] SYNC_CACHE message failed:`, the background script isn't responding

**Fix:**
- Reload extension again
- Check Service Worker console for loading errors

### Problem: Service Worker console is empty

**Cause:** Service worker may have crashed or not loaded  
**Fix:**
1. Go to `edge://extensions`
2. Click **Refresh** on ScholarScout
3. Immediately click **Service Worker** link again to open console
4. You should see `[ScholarScout Service Worker] Script loaded`

### Problem: Save button disabled after click

**Check Service Worker console:**
- If you see `handleSave called...` but then errors about "token" or "dbId"
- Your storage didn't save properly - verify all fields filled correctly

### Problem: Network errors (401, 403, 429)

These appear in Service Worker console:

- **401**: Notion token invalid or expired - reconnect OAuth or verify token format
- **403**: Database not shared with integration - go to your Notion DB, click ••• → Connections → add ScholarScout
- **429**: Rate limited - wait a few minutes, retry queue will auto-retry

## Key Files for Communication

| File | Purpose | Logs |
|------|---------|------|
| `options/options.js` | Settings form → storage → message passing | `[Options]` prefix |
| `background/service-worker.js` | Receives messages, talks to Notion & Gemini | `[Service Worker]` prefix |
| `manifest.json` | Declares permissions and message handlers | (no logs) |
| `popup/popup.js` | Quick capture → messages to service worker | `[ScholarScout Popup]` prefix |

## Full Message Flow Diagram

```
User fills options form
          ↓
[Options] saveConfig()
          ↓
chrome.storage.local.set({ notionToken, ... })
          ↓
chrome.runtime.sendMessage({ type: 'SYNC_CACHE' })
          ↓
[Service Worker] onMessage listener receives it
          ↓
syncTriageCache() — connects to Notion
          ↓
sendResponse({ ok: true })
          ↓
Back to options page → shows "✓ saved!"
```

## Next Steps

Once verified that logs show proper communication:
1. **Configure Notion**: Get token from notion.so/my-integrations
2. **Share database**: Go to Notion DB → ••• → Connections → add ScholarScout
3. **Test save**: You should see messages in Service Worker console
4. **(Optional) Configure Gemini**: Get API key from aistudio.google.com, enable AI extraction

---

**Questions?** Check the Service Worker console first — that's where the real action happens.
