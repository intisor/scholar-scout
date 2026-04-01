const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const SYNC_ALARM = 'sync-triage-cache';
const SYNC_INTERVAL_MINUTES = 360; // 6 hours

chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_INTERVAL_MINUTES });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SYNC_ALARM) {
    await syncTriageCache();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SAVE_OPPORTUNITY') {
    handleSave(msg.payload).then(sendResponse).catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.type === 'CHECK_DUPLICATE') {
    checkDuplicate(msg.url).then(sendResponse).catch(() => sendResponse({ isDuplicate: false }));
    return true;
  }
  if (msg.type === 'SYNC_CACHE') {
    syncTriageCache().then(sendResponse).catch(() => sendResponse({ ok: false }));
    return true;
  }
});

async function getConfig() {
  return new Promise(resolve => {
    chrome.storage.local.get(['notionToken', 'notionDbId'], resolve);
  });
}

function notionHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

async function handleSave(payload) {
  const { notionToken, notionDbId } = await getConfig();
  if (!notionToken || !notionDbId) {
    return { ok: false, error: 'Not configured. Open Options to add your Notion token and database ID.' };
  }

  const body = buildNotionPage(notionDbId, payload);
  const res = await fetch(`${NOTION_API}/pages`, {
    method: 'POST',
    headers: notionHeaders(notionToken),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.message || `Notion API error ${res.status}` };
  }

  await syncTriageCache();
  return { ok: true };
}

function buildNotionPage(dbId, p) {
  const props = {
    Name: { title: [{ text: { content: p.name || 'Untitled Opportunity' } }] },
    URL: { url: p.url || null },
    Status: { select: { name: p.status || 'To Review' } },
    'Share with Juniors': { checkbox: !!p.shareWithJuniors },
    'Date Clipped': { date: { start: new Date().toISOString() } },
  };

  if (p.deadline) props['Final Deadline'] = { date: { start: p.deadline } };
  if (p.nextActionDate) props['Next Action Date'] = { date: { start: p.nextActionDate } };
  if (p.org) props['Organization'] = { rich_text: [{ text: { content: p.org } }] };

  return { parent: { database_id: dbId }, properties: props };
}

async function checkDuplicate(url) {
  const { notionToken, notionDbId } = await getConfig();
  if (!notionToken || !notionDbId) return { isDuplicate: false };

  const res = await fetch(`${NOTION_API}/databases/${notionDbId}/query`, {
    method: 'POST',
    headers: notionHeaders(notionToken),
    body: JSON.stringify({
      filter: { property: 'URL', url: { equals: url } },
      page_size: 1,
    }),
  });

  if (!res.ok) return { isDuplicate: false };
  const data = await res.json();
  return { isDuplicate: data.results && data.results.length > 0 };
}

async function syncTriageCache() {
  const { notionToken, notionDbId } = await getConfig();
  if (!notionToken || !notionDbId) return { ok: false };

  const sevenDaysOut = new Date();
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);

  const res = await fetch(`${NOTION_API}/databases/${notionDbId}/query`, {
    method: 'POST',
    headers: notionHeaders(notionToken),
    body: JSON.stringify({
      filter: {
        and: [
          { property: 'Next Action Date', date: { on_or_before: sevenDaysOut.toISOString() } },
          { property: 'Next Action Date', date: { on_or_after: new Date().toISOString() } },
        ],
      },
      sorts: [{ property: 'Next Action Date', direction: 'ascending' }],
      page_size: 10,
    }),
  });

  if (!res.ok) return { ok: false };
  const data = await res.json();

  const items = (data.results || []).map(page => {
    const props = page.properties;
    const name = props.Name?.title?.[0]?.text?.content || 'Untitled';
    const date = props['Next Action Date']?.date?.start || null;
    return { name, date };
  });

  await chrome.storage.local.set({ triageCache: items, triageSyncedAt: Date.now() });
  return { ok: true, items };
}
