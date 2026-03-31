import {
  getPendingSyncOpportunities,
  updateSyncStatus,
  buildNotionPageFromLocal
} from './opportunities-store.js';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const MAX_NOTION_RETRIES = 5;
const NOTION_TIMEOUT_MS = 15000;

/**
 * Sync pending opportunities to Notion.
 */
export async function syncPendingOpportunitiesToNotion() {
  console.log('[NotionSync] Starting Notion sync');
  const config = await getNotionConfig();
  
  if (!config.notionToken || !config.notionDbId) {
    return { ok: false, error: 'Notion not configured' };
  }

  const pending = await getPendingSyncOpportunities();
  if (pending.length === 0) return { ok: true, synced: 0 };

  let synced = 0;
  let failed = 0;

  for (const opp of pending) {
    try {
      const result = await pushToNotion(config.notionToken, config.notionDbId, opp);
      await updateSyncStatus(opp.id, 'synced', result.notionPageId);
      synced++;
    } catch (error) {
      failed++;
      await updateSyncStatus(opp.id, 'error', null, error.message);
    }
  }

  return { ok: true, synced, failed };
}

/**
 * Sync upcoming deadlines to local cache.
 */
export async function syncTriageCache() {
  const config = await getNotionConfig();
  
  if (!config.notionToken || !config.notionDbId) {
    await chrome.storage.local.set({ lastSyncOk: null, lastSyncError: 'Not configured' });
    return { ok: false, error: 'Not configured' };
  }

  try {
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    // Specific query for triage
    const res = await notionRequest(config.notionToken, `/databases/${config.notionDbId}/query`, 'POST', {
      filter: {
        and: [
          {
            property: 'Next Action Date',
            date: { on_or_before: sevenDaysFromNow.toISOString().split('T')[0] },
          },
          {
            property: 'Next Action Date',
            date: { on_or_after: new Date().toISOString().split('T')[0] },
          },
        ],
      },
      sorts: [{ property: 'Next Action Date', direction: 'ascending' }],
      page_size: 20,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      let msg = errBody?.message || `Notion error ${res.status}`;
      
      if (res.status === 401) {
        msg = 'Invalid API token. Ensure it is correct and the database is shared with the integration.';
      } else if (res.status === 404) {
        msg = 'Database not found. Check your Database ID.';
      }

      throw new Error(msg);
    }

    const data = await res.json();
    const cache = (data.results || []).map(page => ({
      id: page.id,
      name: page.properties?.Name?.title?.[0]?.plain_text || 'Untitled',
      deadline: page.properties?.['Final Deadline']?.date?.start,
      nextActionDate: page.properties?.['Next Action Date']?.date?.start,
      status: page.properties?.Status?.select?.name,
    }));

    await chrome.storage.local.set({
      triageCache: cache,
      lastSyncAt: new Date().toISOString(),
      lastSyncOk: true,
      lastSyncError: '',
    });
    
    return { ok: true, count: cache.length };
  } catch (err) {
    console.warn('[NotionSync] syncTriageCache silent fail:', err.message);
    await chrome.storage.local.set({
      lastSyncAt: new Date().toISOString(),
      lastSyncOk: false,
      lastSyncError: err.message,
    });
    return { ok: false, error: err.message };
  }
}

/**
 * Check if a URL already exists in Notion.
 */
export async function checkDuplicateInNotion(url) {
  const config = await getNotionConfig();
  if (!config.notionToken || !config.notionDbId) return { isDuplicate: false };

  try {
    const res = await notionRequest(config.notionToken, `/databases/${config.notionDbId}/query`, 'POST', {
      filter: { property: 'URL', url: { equals: url } },
      page_size: 1,
    });
    if (!res.ok) return { isDuplicate: false };
    const data = await res.json();
    return { isDuplicate: data.results && data.results.length > 0 };
  } catch {
    return { isDuplicate: false };
  }
}

async function pushToNotion(token, dbId, opportunity) {
  const payload = buildNotionPageFromLocal(opportunity, dbId);
  const res = await notionRequest(token, '/pages', 'POST', payload);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || `API error ${res.status}`);
  }
  return { notionPageId: (await res.json()).id };
}

async function notionRequest(token, endpoint, method = 'GET', body = null, attempt = 1) {
  const url = NOTION_API + endpoint;
  const headers = {
    Authorization: `Bearer ${token.trim()}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NOTION_TIMEOUT_MS);

  try {
    const options = { method, headers, signal: controller.signal };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(url, options);

    if (res.status === 429 && attempt < MAX_NOTION_RETRIES) {
      const wait = parseInt(res.headers.get('Retry-After') || '5', 10);
      await new Promise(r => setTimeout(r, wait * 1000));
      return notionRequest(token, endpoint, method, body, attempt + 1);
    }

    return res;
  } catch (err) {
    if (attempt < MAX_NOTION_RETRIES) {
      await new Promise(r => setTimeout(r, 1000 * attempt));
      return notionRequest(token, endpoint, method, body, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getNotionConfig() {
  return new Promise(resolve => {
    chrome.storage.local.get(['notionToken', 'notionDbId'], resolve);
  });
}
