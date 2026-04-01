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

const AI_USAGE_KEY = 'aiProviderUsage';

const AI_PROVIDERS = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    requiresKey: true,
    rpm: 15,
    rpd: 1500,
    supportsOpenAiChat: false,
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    requiresKey: true,
    rpm: 30,
    rpd: 14400,
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-specdec',
    supportsOpenAiChat: true,
  },
  cerebras: {
    id: 'cerebras',
    label: 'Cerebras',
    requiresKey: true,
    rpm: 30,
    rpd: 14400,
    baseUrl: 'https://api.cerebras.ai/v1',
    model: 'llama-3.1-8b',
    supportsOpenAiChat: true,
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    requiresKey: true,
    rpm: 60,
    rpd: 5000,
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-small-latest',
    supportsOpenAiChat: true,
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    requiresKey: true,
    rpm: 20,
    rpd: 200,
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'google/gemini-2.0-flash-exp:free',
    supportsOpenAiChat: true,
  },
  unclose: {
    id: 'unclose',
    label: 'Unclose',
    requiresKey: false,
    rpm: 120,
    rpd: 5000,
    baseUrl: 'https://hermes.ai.unturf.com/v1',
    model: 'Hermes',
    supportsOpenAiChat: true,
  },
  pollinations: {
    id: 'pollinations',
    label: 'Pollinations',
    requiresKey: false,
    rpm: 120,
    rpd: 5000,
    baseUrl: 'https://text.pollinations.ai/openai',
    model: 'openai',
    supportsOpenAiChat: true,
  },
};

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
    extractOpportunityWithAi(msg.pageContext).then(sendResponse);
    return true;
  }

  if (msg.type === 'AI_TRANSLATE_SCRAPED') {
    translateScrapedWithAi(msg.payload).then(sendResponse);
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

function parseJsonFromModelText(text) {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function minuteKey(date = new Date()) {
  return `${todayKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

async function getAiSettings() {
  const settings = await chrome.storage.local.get([
    'useAiExtraction',
    'aiProviderOrder',
    'aiTargetLanguage',
    'geminiApiKey',
    'groqApiKey',
    'mistralApiKey',
    'cerebrasApiKey',
    'openrouterApiKey',
  ]);

  const providerKeys = {
    gemini: settings.geminiApiKey || '',
    groq: settings.groqApiKey || '',
    mistral: settings.mistralApiKey || '',
    cerebras: settings.cerebrasApiKey || '',
    openrouter: settings.openrouterApiKey || '',
    unclose: '',
    pollinations: '',
  };

  const rawOrder = String(settings.aiProviderOrder || 'gemini,groq,mistral,openrouter,cerebras,unclose,pollinations')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const providerOrder = rawOrder.filter(id => AI_PROVIDERS[id]);

  return {
    useAiExtraction: Boolean(settings.useAiExtraction),
    aiTargetLanguage: String(settings.aiTargetLanguage || 'English').trim() || 'English',
    providerOrder: providerOrder.length ? providerOrder : ['gemini', 'groq', 'mistral', 'openrouter', 'cerebras', 'unclose', 'pollinations'],
    providerKeys,
  };
}

async function getUsageState() {
  const { [AI_USAGE_KEY]: usage } = await chrome.storage.local.get([AI_USAGE_KEY]);
  const initial = usage && typeof usage === 'object' ? usage : { day: todayKey(), minute: minuteKey(), providers: {} };
  const nowDay = todayKey();
  const nowMinute = minuteKey();

  if (initial.day !== nowDay) {
    initial.day = nowDay;
    initial.providers = {};
  }

  if (initial.minute !== nowMinute) {
    initial.minute = nowMinute;
    Object.keys(initial.providers).forEach((id) => {
      initial.providers[id].minuteCount = 0;
    });
  }

  return initial;
}

async function incrementProviderUsage(providerId) {
  const usage = await getUsageState();
  if (!usage.providers[providerId]) {
    usage.providers[providerId] = { minuteCount: 0, dayCount: 0 };
  }
  usage.providers[providerId].minuteCount += 1;
  usage.providers[providerId].dayCount += 1;
  await chrome.storage.local.set({ [AI_USAGE_KEY]: usage });
}

function providerLoadScore(provider, counters) {
  const minuteRatio = provider.rpm > 0 ? (counters.minuteCount || 0) / provider.rpm : 0;
  const dayRatio = provider.rpd > 0 ? (counters.dayCount || 0) / provider.rpd : 0;
  return Math.max(minuteRatio, dayRatio);
}

async function getProviderExecutionOrder() {
  const settings = await getAiSettings();
  const usage = await getUsageState();
  const ranked = [];

  for (const id of settings.providerOrder) {
    const provider = AI_PROVIDERS[id];
    if (!provider) continue;
    const apiKey = settings.providerKeys[id] || '';
    if (provider.requiresKey && !apiKey) continue;

    const counters = usage.providers[id] || { minuteCount: 0, dayCount: 0 };
    const minuteAtCap = provider.rpm > 0 && counters.minuteCount >= provider.rpm;
    const dayAtCap = provider.rpd > 0 && counters.dayCount >= provider.rpd;
    if (minuteAtCap || dayAtCap) continue;

    ranked.push({
      id,
      provider,
      apiKey,
      score: providerLoadScore(provider, counters),
      configuredOrder: settings.providerOrder.indexOf(id),
    });
  }

  ranked.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.configuredOrder - b.configuredOrder;
  });

  return { settings, executionOrder: ranked };
}

async function callGeminiJson(apiKey, prompt) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini API error (${res.status}): ${body.slice(0, 180)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = parseJsonFromModelText(text);
  if (!parsed) throw new Error('Gemini returned non-JSON payload');
  return parsed;
}

async function callOpenAiCompatibleJson(provider, apiKey, prompt) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  if (provider.id === 'openrouter') {
    headers['HTTP-Referer'] = 'https://scholarscout.local';
    headers['X-Title'] = 'ScholarScout';
  }

  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Return strict JSON only.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${provider.label} API error (${res.status}): ${body.slice(0, 180)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  const parsed = parseJsonFromModelText(text);
  if (!parsed) throw new Error(`${provider.label} returned non-JSON payload`);
  return parsed;
}

async function runAiJsonTask(prompt) {
  const { executionOrder } = await getProviderExecutionOrder();
  if (!executionOrder.length) {
    return { ok: false, error: 'No AI providers available. Add at least one API key in Options.' };
  }

  const errors = [];
  for (const candidate of executionOrder) {
    const { provider, apiKey } = candidate;
    try {
      await incrementProviderUsage(provider.id);
      const output = provider.id === 'gemini'
        ? await callGeminiJson(apiKey, prompt)
        : await callOpenAiCompatibleJson(provider, apiKey, prompt);

      return {
        ok: true,
        output,
        provider: provider.id,
        providerLabel: provider.label,
      };
    } catch (err) {
      errors.push(`${provider.id}: ${err.message}`);
    }
  }

  return {
    ok: false,
    error: 'All configured AI providers failed',
    details: errors,
  };
}

async function extractOpportunityWithAi(pageContext) {
  const { useAiExtraction } = await getAiSettings();
  if (!useAiExtraction) {
    return { ok: false, error: 'AI extraction disabled' };
  }

  const prompt = `Extract scholarship/opportunity data. Return strict JSON ONLY: {"opportunityName":"string","organization":"string","finalDeadline":"YYYY-MM-DD","summary":"string","confidence":0.0-1.0}
  Context: ${JSON.stringify(pageContext)}`;

  const result = await runAiJsonTask(prompt);
  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    extracted: result.output,
    provider: result.provider,
    providerLabel: result.providerLabel,
  };
}

async function translateScrapedWithAi(payload) {
  const { useAiExtraction, aiTargetLanguage } = await getAiSettings();
  if (!useAiExtraction) {
    return { ok: false, error: 'AI translation disabled' };
  }

  const safePayload = {
    title: payload?.title || '',
    organization: payload?.organization || '',
    summary: payload?.summary || '',
  };

  if (!safePayload.title && !safePayload.organization && !safePayload.summary) {
    return { ok: false, error: 'No text to translate' };
  }

  const prompt = `Translate these DOM-scraped fields into ${aiTargetLanguage}. Return strict JSON only: {"title":"string","organization":"string","summary":"string","detectedLanguage":"string","confidence":0.0-1.0}.
Fields: ${JSON.stringify(safePayload)}`;

  const result = await runAiJsonTask(prompt);
  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    translated: result.output,
    targetLanguage: aiTargetLanguage,
    provider: result.provider,
    providerLabel: result.providerLabel,
  };
}
