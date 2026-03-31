import {
  saveOpportunityLocally,
  getLocalOpportunities,
  isDuplicateLocally,
  getLocalSyncStatus
} from './opportunities-store.js';

import {
  syncPendingOpportunitiesToNotion,
  syncTriageCache,
  checkDuplicateInNotion
} from './notion-sync.js';

console.log('[Service Worker] Script loaded');

const SYNC_ALARM = 'sync-to-notion';
const TRIAGE_SYNC_ALARM = 'sync-triage-from-notion';
const SYNC_INTERVAL_MINUTES = 30;
const TRIAGE_INTERVAL_MINUTES = 360;

// Set up recurring sync alarms
chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_INTERVAL_MINUTES });
chrome.alarms.create(TRIAGE_SYNC_ALARM, { periodInMinutes: TRIAGE_INTERVAL_MINUTES });

// Create context menu on install
chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.contextMenus.create({
    id: 'scholarscout-clip',
    title: 'ScholarScout: Clip this page',
    contexts: ['page'],
  });
  chrome.contextMenus.create({
    id: 'scholarscout-open-sidepanel',
    title: 'ScholarScout: Open side panel',
    contexts: ['page', 'action'],
  });
  
  if (details.reason === 'install' || details.reason === 'update') {
    chrome.runtime.openOptionsPage();
  }
  
  await syncTriageCache();
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await syncTriageCache();
  await updateBadge();
  await syncPendingOpportunitiesToNotion();
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'scholarscout-clip') {
    await openPopupSafely(tab);
  }
  if (info.menuItemId === 'scholarscout-open-sidepanel') {
    await openSidePanelSafely(tab);
  }
});

async function openSidePanelSafely(tab) {
  try {
    const tabId = tab?.id;
    if (!tabId) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) throw new Error('No active tab');
      await chrome.sidePanel.setOptions({
        tabId: activeTab.id,
        path: 'popup/popup.html?panel=1',
        enabled: true,
      });
      await chrome.sidePanel.open({ tabId: activeTab.id });
      return;
    }
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'popup/popup.html?panel=1',
      enabled: true,
    });
    await chrome.sidePanel.open({ tabId });
  } catch (err) {
    console.warn('SidePanel open failed, fallback to options:', err);
    chrome.runtime.openOptionsPage();
  }
}

async function openPopupSafely(tab) {
  try {
    await chrome.action.openPopup();
  } catch (err) {
    chrome.runtime.openOptionsPage();
  }
}

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SYNC_ALARM) {
    await syncPendingOpportunitiesToNotion();
    await updateBadge();
  }
  if (alarm.name === TRIAGE_SYNC_ALARM) {
    await syncTriageCache();
  }
});

// Listen for messages
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SAVE_OPPORTUNITY') {
    saveOpportunityLocally(msg.payload)
      .then(result => {
        updateBadge();
        // Trigger background sync immediately
        syncPendingOpportunitiesToNotion().then(updateBadge);
        sendResponse(result);
      })
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  
  if (msg.type === 'CHECK_DUPLICATE') {
    isDuplicateLocally(msg.url).then(localDup => {
      if (localDup) {
        sendResponse({ isDuplicate: true });
      } else {
        checkDuplicateInNotion(msg.url).then(sendResponse);
      }
    });
    return true;
  }
  
  if (msg.type === 'SYNC_TO_NOTION' || msg.type === 'RETRY_PENDING') {
    syncPendingOpportunitiesToNotion()
      .then(result => {
        updateBadge();
        sendResponse(result);
      });
    return true;
  }
  
  if (msg.type === 'SYNC_TRIAGE' || msg.type === 'SYNC_CACHE') {
    syncTriageCache().then(sendResponse);
    return true;
  }
  
  if (msg.type === 'GET_LOCAL_OPPORTUNITIES') {
    getLocalOpportunities().then(opps => sendResponse({ ok: true, opportunities: opps }));
    return true;
  }
  
  if (msg.type === 'GET_HEALTH_STATUS') {
    getHealthStatus().then(sendResponse);
    return true;
  }
  
  if (msg.type === 'AI_EXTRACT_OPPORTUNITY') {
    extractOpportunityWithGemini(msg.pageContext).then(sendResponse);
    return true;
  }
  
  if (msg.type === 'OPEN_SIDE_PANEL') {
    openSidePanelSafely(_sender?.tab).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'GET_ASSET_URLS') {
    chrome.storage.local.get(['resumeUrl', 'essayUrl'], (config) => {
      sendResponse({ resumeUrl: config.resumeUrl || '', essayUrl: config.essayUrl || '' });
    });
    return true;
  }
});

async function getHealthStatus() {
  const status = await getLocalSyncStatus();
  const { lastSyncAt, lastSyncOk, lastSyncError } = await chrome.storage.local.get(['lastSyncAt', 'lastSyncOk', 'lastSyncError']);
  return {
    ...status,
    lastSyncAt,
    lastSyncOk,
    lastSyncError,
    pendingCount: status.pendingSync || 0
  };
}

async function updateBadge() {
  const status = await getLocalSyncStatus();
  const count = status.pendingSync || 0;
  chrome.action.setBadgeBackgroundColor({ color: '#ff4757' });
  chrome.action.setBadgeText({ text: count > 0 ? String(Math.min(count, 99)) : '' });
}

async function extractOpportunityWithGemini(pageContext) {
  const { geminiApiKey, useAiExtraction } = await chrome.storage.local.get(['geminiApiKey', 'useAiExtraction']);
  if (!useAiExtraction || !geminiApiKey) return { ok: false, error: 'AI disabled or key missing' };

  const prompt = `Extract scholarship/opportunity data. Return strict JSON ONLY: {"opportunityName":"string","organization":"string","finalDeadline":"YYYY-MM-DD","summary":"string","confidence":0.0-1.0}
  Context: ${JSON.stringify(pageContext)}`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
      })
    });
    if (!res.ok) throw new Error('Gemini API error');
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const extracted = JSON.parse(text);
    return { ok: true, extracted };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
