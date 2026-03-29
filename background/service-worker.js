/* ──────────────────────────────────────────────────────────────
   ScholarScout — Background Service Worker
   ────────────────────────────────────────────────────────────── */

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const SYNC_ALARM = 'sync-triage-cache';
const RETRY_ALARM = 'retry-pending-queue';
const SYNC_INTERVAL_MINUTES = 360; // 6 hours
const RETRY_INTERVAL_MINUTES = 30;
const MAX_RETRY_ATTEMPTS = 5;

// Set up recurring sync alarm
chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_INTERVAL_MINUTES });
chrome.alarms.create(RETRY_ALARM, { periodInMinutes: RETRY_INTERVAL_MINUTES });
// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'scholarscout-clip',
    title: 'ScholarScout: Clip this page',
    contexts: ['page'],
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'scholarscout-clip') {
    chrome.action.openPopup();
  }
});

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SYNC_ALARM) {
    await syncTriageCache();
  }
  if (alarm.name === RETRY_ALARM) {
    await retryPendingQueue();
  }
});

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SAVE_OPPORTUNITY') {
    handleSave(msg.payload)
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.type === 'CHECK_DUPLICATE') {
    checkDuplicate(msg.url)
      .then(sendResponse)
      .catch(() => sendResponse({ isDuplicate: false }));
    return true;
  }
  if (msg.type === 'SYNC_CACHE') {
    syncTriageCache()
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === 'GET_ASSET_URLS') {
    getConfig().then(config => {
      sendResponse({
        resumeUrl: config.resumeUrl || '',
        essayUrl: config.essayUrl || '',
      });
    });
    return true;
  }
  if (msg.type === 'GET_HEALTH_STATUS') {
    getHealthStatus().then(sendResponse);
    return true;
  }
  if (msg.type === 'RETRY_PENDING') {
    retryPendingQueue().then(sendResponse).catch(err => {
      sendResponse({ ok: false, error: err.message });
    });
    return true;
  }
});

/**
 * Get Notion configuration from storage
 */
async function getConfig() {
  return new Promise(resolve => {
    chrome.storage.local.get(['notionToken', 'notionDbId', 'resumeUrl', 'essayUrl'], resolve);
  });
}

/**
 * Build Notion API headers
 */
function notionHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

/**
 * Save opportunity to Notion database
 */
async function handleSave(payload) {
  const { notionToken, notionDbId } = await getConfig();
  
  if (!notionToken || !notionDbId) {
    throw new Error(
      'Not configured. Open Options to add your Notion token and database ID.'
    );
  }

  try {
    await saveToNotion(payload, notionToken, notionDbId);
    // Refresh triage cache after saving
    await syncTriageCache();
    await setPendingBadge();
    return { ok: true };
  } catch (err) {
    await enqueuePending(payload, err.message);
    await setPendingBadge();
    return {
      ok: false,
      queued: true,
      error: 'Notion is unavailable right now. Saved to retry queue; it will auto-send later.',
    };
  }
}

async function saveToNotion(payload, notionToken, notionDbId) {
  const body = buildNotionPage(notionDbId, payload);
  const res = await notionRequest('/pages', {
    method: 'POST',
    headers: notionHeaders(notionToken),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Notion API error ${res.status}`);
  }
}

async function notionRequest(path, options) {
  const retries = 2;
  const timeoutMs = 15000;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${NOTION_API}${path}`, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        return res;
      }

      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < retries) {
        const retryAfter = Number(res.headers.get('Retry-After'));
        const delayMs = Number.isFinite(retryAfter)
          ? retryAfter * 1000
          : Math.min(3000, 400 * 2 ** attempt);
        await sleep(delayMs);
        continue;
      }

      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      if (attempt < retries) {
        await sleep(Math.min(3000, 400 * 2 ** attempt));
        continue;
      }
      throw err;
    }
  }

  throw new Error('Notion request failed after retries');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enqueuePending(payload, errorMessage) {
  const { pendingQueue = [] } = await chrome.storage.local.get('pendingQueue');
  const duplicate = pendingQueue.find(item => item.payload?.url && item.payload.url === payload.url);

  if (duplicate) {
    return;
  }

  pendingQueue.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    payload,
    attempts: 0,
    lastError: errorMessage || 'Unknown error',
    queuedAt: new Date().toISOString(),
  });

  await chrome.storage.local.set({ pendingQueue });
}

async function retryPendingQueue() {
  const { notionToken, notionDbId } = await getConfig();
  const { pendingQueue = [] } = await chrome.storage.local.get('pendingQueue');

  if (!notionToken || !notionDbId) {
    return { ok: false, error: 'Notion is not configured.', retried: 0, remaining: pendingQueue.length };
  }

  if (pendingQueue.length === 0) {
    await setPendingBadge();
    return { ok: true, retried: 0, remaining: 0 };
  }

  const stillPending = [];
  let retried = 0;
  let sent = 0;

  for (const item of pendingQueue) {
    try {
      await saveToNotion(item.payload, notionToken, notionDbId);
      retried += 1;
      sent += 1;
    } catch (err) {
      retried += 1;
      const nextAttempts = (item.attempts || 0) + 1;
      if (nextAttempts < MAX_RETRY_ATTEMPTS) {
        stillPending.push({
          ...item,
          attempts: nextAttempts,
          lastError: err.message,
        });
      }
    }
  }

  await chrome.storage.local.set({ pendingQueue: stillPending });
  await setPendingBadge();

  if (sent > 0) {
    await syncTriageCache();
  }

  return { ok: true, retried, remaining: stillPending.length, sent };
}

async function setPendingBadge() {
  const { pendingQueue = [] } = await chrome.storage.local.get('pendingQueue');
  const count = pendingQueue.length;
  await chrome.action.setBadgeBackgroundColor({ color: '#ff4757' });
  await chrome.action.setBadgeText({ text: count > 0 ? String(Math.min(count, 99)) : '' });
}

async function getHealthStatus() {
  const { pendingQueue = [], lastSyncAt = null, lastSyncOk = null, lastSyncError = '' } =
    await chrome.storage.local.get(['pendingQueue', 'lastSyncAt', 'lastSyncOk', 'lastSyncError']);

  return {
    pendingCount: pendingQueue.length,
    lastSyncAt,
    lastSyncOk,
    lastSyncError,
  };
}

/**
 * Build Notion page payload from form data
 */
function buildNotionPage(dbId, p) {
  const props = {
    Name: {
      title: [{ text: { content: p.name || 'Untitled Opportunity' } }],
    },
    URL: {
      url: p.url || null,
    },
    Status: {
      select: { name: p.status || 'To Review' },
    },
    'Share with Juniors': {
      checkbox: !!p.shareWithJuniors,
    },
    'Date Clipped': {
      date: { start: new Date().toISOString().split('T')[0] },
    },
  };

  // Optional fields
  if (p.finalDeadline) {
    props['Final Deadline'] = { date: { start: p.finalDeadline } };
  }
  
  if (p.nextActionDate) {
    props['Next Action Date'] = { date: { start: p.nextActionDate } };
  }
  
  if (p.org) {
    props['Organization'] = {
      rich_text: [{ text: { content: p.org } }],
    };
  }

  // Full mode fields
  if (p.oppType) {
    props['Opportunity Type'] = { select: { name: p.oppType } };
  }
  
  if (p.valueAmount) {
    props['Value Amount'] = {
      rich_text: [{ text: { content: p.valueAmount } }],
    };
  }
  
  if (p.workingDoc) {
    props['Working Doc'] = { url: p.workingDoc };
  }
  
  if (p.blocker) {
    props['Current Blocker'] = {
      rich_text: [{ text: { content: p.blocker } }],
    };
  }
  
  if (p.reviewStage) {
    props['Review Stage'] = { select: { name: p.reviewStage } };
  }
  
  if (p.effortLevel) {
    props['Effort Level'] = { select: { name: p.effortLevel } };
  }
  
  if (p.portalUrl) {
    props['Portal Login URL'] = { url: p.portalUrl };
  }
  
  if (p.appId) {
    props['Application ID'] = {
      rich_text: [{ text: { content: p.appId } }],
    };
  }

  return {
    parent: { database_id: dbId },
    properties: props,
  };
}

/**
 * Check if URL already exists in database (duplicate detection)
 */
async function checkDuplicate(url) {
  const { notionToken, notionDbId } = await getConfig();
  
  if (!notionToken || !notionDbId) {
    return { isDuplicate: false };
  }

  try {
    const res = await notionRequest(`/databases/${notionDbId}/query`, {
      method: 'POST',
      headers: notionHeaders(notionToken),
      body: JSON.stringify({
        filter: {
          property: 'URL',
          url: { equals: url },
        },
        page_size: 1,
      }),
    });

    if (!res.ok) {
      return { isDuplicate: false };
    }

    const data = await res.json();
    return { isDuplicate: data.results && data.results.length > 0 };
  } catch (err) {
    console.error('Duplicate check error:', err);
    return { isDuplicate: false };
  }
}

/**
 * Sync upcoming deadlines to local cache for triage display
 */
async function syncTriageCache() {
  const { notionToken, notionDbId } = await getConfig();
  
  if (!notionToken || !notionDbId) {
    await chrome.storage.local.set({
      lastSyncAt: new Date().toISOString(),
      lastSyncOk: false,
      lastSyncError: 'Notion is not configured.',
    });
    return;
  }

  try {
    // Query for items within next 7 days
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const res = await notionRequest(`/databases/${notionDbId}/query`, {
      method: 'POST',
      headers: notionHeaders(notionToken),
      body: JSON.stringify({
        filter: {
          and: [
            {
              property: 'Next Action Date',
              date: {
                on_or_before: sevenDaysFromNow.toISOString().split('T')[0],
              },
            },
            {
              property: 'Next Action Date',
              date: {
                on_or_after: new Date().toISOString().split('T')[0],
              },
            },
          ],
        },
        sorts: [
          {
            property: 'Next Action Date',
            direction: 'ascending',
          },
        ],
        page_size: 20,
      }),
    });

    if (!res.ok) {
      console.error('Triage sync failed:', res.status);
      await chrome.storage.local.set({
        lastSyncAt: new Date().toISOString(),
        lastSyncOk: false,
        lastSyncError: `Notion query failed (${res.status})`,
      });
      return;
    }

    const data = await res.json();
    
    // Extract relevant fields for triage display
    const cache = (data.results || []).map(page => ({
      id: page.id,
      name: page.properties?.Name?.title?.[0]?.plain_text || 'Untitled',
      deadline: page.properties?.['Final Deadline']?.date?.start,
      nextActionDate: page.properties?.['Next Action Date']?.date?.start,
      status: page.properties?.Status?.select?.name,
    }));

    // Store in local storage
    await chrome.storage.local.set({
      triageCache: cache,
      lastSyncAt: new Date().toISOString(),
      lastSyncOk: true,
      lastSyncError: '',
    });
  } catch (err) {
    console.error('Sync triage cache error:', err);
    await chrome.storage.local.set({
      lastSyncAt: new Date().toISOString(),
      lastSyncOk: false,
      lastSyncError: err.message,
    });
  }
}

// Run sync on startup
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install' || details.reason === 'update') {
    // Open options page for setup
    chrome.runtime.openOptionsPage();
  }
  // Initial sync
  await syncTriageCache();
  await setPendingBadge();
});

// Also sync when extension is activated
chrome.runtime.onStartup.addListener(async () => {
  await syncTriageCache();
  await setPendingBadge();
  await retryPendingQueue();
});
