/* ScholarScout — Popup Logic */

let juniorOn = false;
let fullMode = false;
let currentUrl = '';
let triageItems = [];

document.addEventListener('DOMContentLoaded', async () => {
  const isPanelMode = new URLSearchParams(window.location.search).get('panel') === '1';
  if (isPanelMode) {
    document.documentElement.classList.add('sidepanel');
    document.body.classList.add('sidepanel');
  }

  setupEventListeners();
  await scrapePage();
  await loadTriageCache();
  await refreshHealth();
});

function setupEventListeners() {
  document.getElementById('main-form').addEventListener('submit', (event) => {
    event.preventDefault();
  });

  document.getElementById('btn-quick')?.addEventListener('click', () => setMode('quick'));
  document.getElementById('btn-full')?.addEventListener('click', () => setMode('full'));
  document.getElementById('btn-discard')?.addEventListener('click', handleDiscard);
  document.getElementById('btn-save')?.addEventListener('click', handleSave);

  document.getElementById('junior-row')?.addEventListener('click', toggleJunior);
  document.getElementById('btn-sync-now')?.addEventListener('click', handleSyncNow);
  document.getElementById('btn-refresh-dom')?.addEventListener('click', handleManualRefresh);
  document.getElementById('btn-retry-pending')?.addEventListener('click', handleRetryPending);
  document.getElementById('btn-open-panel')?.addEventListener('click', handleOpenPanel);
  document.getElementById('triage-filter')?.addEventListener('input', handleTriageFilter);
  document.getElementById('btn-copy-resume')?.addEventListener('click', copyResume);
  document.getElementById('btn-copy-essay')?.addEventListener('click', copyEssay);
}

async function handleOpenPanel() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
    if (!res?.ok) {
      showError(res?.error || 'Could not open side panel');
      return;
    }
    showNotification('Opened side panel');
  } catch (err) {
    showError(err?.message || 'Could not open side panel');
  }
}

async function scrapePage() {
  const titleEl = document.getElementById('scraped-title');
  const urlEl = document.getElementById('scraped-url');
  const nameInput = document.getElementById('opp-name');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      titleEl.textContent = 'No active tab';
      return;
    }

    currentUrl = tab.url || '';
    
    // IMMEDIATE UI UPDATE: Show what we know from the tab before scraping
    titleEl.textContent = tab.title || 'Untitled Page';
    urlEl.textContent = currentUrl;
    nameInput.value = tab.title || '';

    const isInternalPage =
      currentUrl.startsWith('chrome://') ||
      currentUrl.startsWith('edge://') ||
      currentUrl.startsWith('about:') ||
      currentUrl.startsWith(chrome.runtime.getURL(''));

    if (isInternalPage) {
      urlEl.textContent = 'Internal page - open a scholarship site to scrape.';
      return;
    }

    // FIRE-AND-FORGET: Duplicate detection shouldn't block the UI
    chrome.runtime.sendMessage({ type: 'CHECK_DUPLICATE', url: currentUrl }, (res) => {
      if (res?.isDuplicate) {
        document.getElementById('dup-warn').classList.remove('hidden');
      }
    });

    // SCRAPING: Try to get deep data from the DOM
    try {
      let response;
      try {
        response = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_PAGE' });
      } catch (err) {
        // If message fails, the script might not be injected. Try injecting it manually.
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/scraper.js']
        });
        // Retry message after short delay
        await new Promise(r => setTimeout(r, 50));
        response = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_PAGE' });
      }

      if (response) {
        if (response.title) {
          titleEl.textContent = response.title;
          nameInput.value = response.title;
        }
        if (response.org) {
          document.getElementById('org').value = response.org;
        }
        if (response.deadline) {
          document.getElementById('final-deadline').value = response.deadline;
          const deadline = new Date(response.deadline);
          deadline.setDate(deadline.getDate() - 7);
          const nextAction = deadline.toISOString().split('T')[0];
          document.getElementById('next-action').value = nextAction;
        }
      }
    } catch (msgErr) {
      // Quietly fall back, avoid polluting extension error logs with warnings
    }


    // AI ENRICHMENT (Optional background step)
    await tryAiEnrichment(tab.id, { title: tab.title, url: currentUrl });

  } catch (err) {
    console.error('[Popup] Critical scrape error:', err);
    titleEl.textContent = 'Direct scrape failed';
  }
}


async function tryAiEnrichment(tabId, fallbackContext) {
  const pulse = document.getElementById('ai-status-pulse');
  const conf = document.getElementById('ai-confidence');
  
  try {
    const { useAiExtraction } = await chrome.storage.local.get(['useAiExtraction']);
    if (!useAiExtraction) return;

    // Show AI is working
    if (pulse) pulse.classList.remove('hidden');

    const context = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTEXT' }).catch(() => null);
    
    const response = await chrome.runtime.sendMessage({
      type: 'AI_EXTRACT_OPPORTUNITY',
      pageContext: context || fallbackContext
    });

    if (response?.ok && response.extracted) {
      const ext = response.extracted;
      const titleEl = document.getElementById('scraped-title');
      
      // AI Confidence Badge
      if (conf && ext.confidence) {
        const providerText = response?.provider ? ` via ${response.provider}` : '';
        conf.textContent = `AI: ${Math.round(ext.confidence * 100)}% Confident${providerText}`;
        conf.classList.remove('hidden');
      }

      // Check if current name is generic or different from AI
      const currentName = document.getElementById('opp-name').value;
      const isGeneric = !currentName || currentName === 'Untitled Page' || currentName.length < 5;

      if (ext.opportunityName && (isGeneric || ext.confidence > 0.8)) {
        document.getElementById('opp-name').value = ext.opportunityName;
        titleEl.textContent = ext.opportunityName;
        flashField('opp-name');
      }
      
      if (ext.organization && (!document.getElementById('org').value || ext.confidence > 0.8)) {
        document.getElementById('org').value = ext.organization;
        flashField('org');
      }
      
      if (ext.finalDeadline && (!document.getElementById('final-deadline').value || ext.confidence > 0.8)) {
        document.getElementById('final-deadline').value = ext.finalDeadline;
        flashField('final-deadline');
      }
    }

    await tryAiDomTranslation();

  } catch (err) {
    console.warn('[Popup] AI insight error:', err);
  } finally {
    if (pulse) pulse.classList.add('hidden');
  }
}

async function tryAiDomTranslation() {
  const nameInput = document.getElementById('opp-name');
  const orgInput = document.getElementById('org');
  const conf = document.getElementById('ai-confidence');
  const payload = {
    title: nameInput?.value || '',
    organization: orgInput?.value || '',
    summary: document.getElementById('scraped-title')?.textContent || '',
  };

  if (!payload.title && !payload.organization && !payload.summary) return;

  const result = await chrome.runtime.sendMessage({
    type: 'AI_TRANSLATE_SCRAPED',
    payload,
  });

  if (!result?.ok || !result?.translated) return;

  const translated = result.translated;
  const currentName = nameInput?.value || '';
  const currentOrg = orgInput?.value || '';

  if (nameInput && translated.title && translated.title !== currentName) {
    nameInput.value = translated.title;
    document.getElementById('scraped-title').textContent = translated.title;
    flashField('opp-name');
  }

  if (orgInput && translated.organization && translated.organization !== currentOrg) {
    orgInput.value = translated.organization;
    flashField('org');
  }

  if (conf && translated.confidence) {
    conf.textContent = `AI Translate: ${Math.round(translated.confidence * 100)}% (${result.targetLanguage}) via ${result.provider}`;
    conf.classList.remove('hidden');
  }
}

function flashField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('ai-highlight');
  setTimeout(() => el.classList.remove('ai-highlight'), 3000);
}


async function loadTriageCache() {
  try {

    const { triageCache } = await chrome.storage.local.get('triageCache');
    triageItems = Array.isArray(triageCache) ? triageCache : [];
    renderTriage(triageItems);
  } catch {
    renderTriage([]);
  }
}

function renderTriage(items) {
  const container = document.getElementById('triage-items');

  if (!items.length) {
    container.innerHTML = '<div class="triage-empty">no upcoming deadlines</div>';
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  container.innerHTML = items.map((item) => {
    const itemDate = new Date(item.nextActionDate || item.deadline);
    itemDate.setHours(0, 0, 0, 0);

    const daysAway = Math.ceil((itemDate - today) / (1000 * 60 * 60 * 24));
    let badgeClass = 'badge-ok';
    let badgeText = `${daysAway} days`;

    if (daysAway <= 0) {
      badgeClass = 'badge-red';
      badgeText = 'today';
    } else if (daysAway === 1) {
      badgeClass = 'badge-red';
      badgeText = 'tomorrow';
    } else if (daysAway <= 4) {
      badgeClass = daysAway <= 2 ? 'badge-red' : 'badge-amber';
      badgeText = `${daysAway} days`;
    }

    return `
      <div class="triage-item">
        <span class="triage-name">${escapeHtml(item.name || 'Untitled')}</span>
        <span class="triage-badge ${badgeClass}">${badgeText}</span>
      </div>
    `;
  }).join('');
}

function handleTriageFilter(event) {
  const query = event.target.value.trim().toLowerCase();
  if (!query) {
    renderTriage(triageItems);
    return;
  }

  const filtered = triageItems.filter((item) => {
    const haystack = [item.name, item.status, item.deadline, item.nextActionDate]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });

  renderTriage(filtered);
}

async function refreshHealth() {
  try {
    const health = await chrome.runtime.sendMessage({ type: 'GET_HEALTH_STATUS' });
    const dot = document.getElementById('health-dot');
    const text = document.getElementById('health-text');

    dot.classList.remove('ok', 'error');
    if (health?.lastSyncOk === true) {
      dot.classList.add('ok');
    } else if (health?.lastSyncOk === false) {
      dot.classList.add('error');
    }

    const pending = Number(health?.pendingCount || 0);
    const syncStamp = health?.lastSyncAt ? new Date(health.lastSyncAt).toLocaleTimeString() : 'never';
    const syncStatus = health?.lastSyncOk === false ? 'sync issue' : 'sync ok';
    text.textContent = `${syncStatus} • pending ${pending} • last ${syncStamp}`;
  } catch {
    // Keep default text if health check fails.
  }
}

async function handleSyncNow() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'SYNC_CACHE' });
    if (res?.ok === false) {
      showError('Sync failed. Check options and network.');
    } else {
      showNotification('Synced from Notion');
    }
    await loadTriageCache();
    await refreshHealth();
  } catch {
    showError('Sync error');
  }
}

async function handleManualRefresh() {
  const refreshBtn = document.getElementById('btn-refresh-dom');
  const originalText = refreshBtn?.textContent || 'refresh DOM';

  if (refreshBtn) {
    refreshBtn.textContent = 'refreshing...';
    refreshBtn.disabled = true;
  }

  try {
    document.getElementById('dup-warn').classList.add('hidden');
    await scrapePage();
    showNotification('DOM refreshed from current tab');
  } catch {
    showError('Refresh failed. Open a scholarship page and try again.');
  } finally {
    if (refreshBtn) {
      refreshBtn.textContent = originalText;
      refreshBtn.disabled = false;
    }
  }
}

async function handleRetryPending() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'RETRY_PENDING' });
    if (res?.ok) {
      showNotification(`Retried ${res.retried || 0}; sent ${res.sent || 0}`);
    } else {
      showError(res?.error || 'Retry failed');
    }
    await loadTriageCache();
    await refreshHealth();
  } catch {
    showError('Retry error');
  }
}

function setMode(mode) {
  fullMode = mode === 'full';
  document.getElementById('btn-quick').classList.toggle('active', !fullMode);
  document.getElementById('btn-full').classList.toggle('active', fullMode);
  document.querySelector('.full-only').classList.toggle('hidden', !fullMode);
}

function toggleJunior() {
  juniorOn = !juniorOn;
  document.getElementById('junior-toggle').classList.toggle('active', juniorOn);
}

async function copyResume() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_ASSET_URLS' });
    if (response?.resumeUrl) {
      await navigator.clipboard.writeText(response.resumeUrl);
      showNotification('Resume URL copied!');
    } else {
      showError('Resume URL not set. Configure in options.');
    }
  } catch {
    showError('Copy failed');
  }
}

async function copyEssay() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_ASSET_URLS' });
    if (response?.essayUrl) {
      await navigator.clipboard.writeText(response.essayUrl);
      showNotification('Essay URL copied!');
    } else {
      showError('Essay URL not set. Configure in options.');
    }
  } catch {
    showError('Copy failed');
  }
}

function getFormData() {
  const name = document.getElementById('opp-name').value?.trim();
  if (!name) {
    showError('Opportunity name is required');
    return null;
  }

  const data = {
    name,
    url: currentUrl,
    status: document.getElementById('status').value,
    shareWithJuniors: juniorOn,
    finalDeadline: document.getElementById('final-deadline').value,
    nextActionDate: document.getElementById('next-action').value,
  };

  if (fullMode) {
    const map = {
      org: 'org',
      oppType: 'opp-type',
      valueAmount: 'value-amount',
      workingDoc: 'working-doc',
      blocker: 'blocker',
      reviewStage: 'review-stage',
      effortLevel: 'effort-level',
      portalUrl: 'portal-url',
      appId: 'app-id',
    };

    Object.entries(map).forEach(([key, id]) => {
      const value = document.getElementById(id).value?.trim?.() ?? document.getElementById(id).value;
      if (value) data[key] = value;
    });
  }

  return data;
}

async function handleSave() {
  const data = getFormData();
  if (!data) return;

  const btn = document.getElementById('btn-save');
  const originalText = btn.textContent;
  btn.textContent = 'saving...';
  btn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_OPPORTUNITY',
      payload: data,
    });

    if (response?.ok) {
      btn.textContent = '✓ saved!';
      setTimeout(() => window.close(), 800);
      return;
    }

    if (response?.queued) {
      showNotification('Queued for auto-retry in background');
      await refreshHealth();
    } else {
      showError(response?.error || 'Failed to save. Check your Notion configuration.');
    }
  } catch {
    showError('Connection error. Make sure Notion is configured in Options.');
  }

  btn.textContent = originalText;
  btn.disabled = false;
}

function handleDiscard() {
  if (confirm('Are you sure? This will close the popup.')) {
    window.close();
  }
}

function showError(message) {
  const errorEl = document.getElementById('error-msg');
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
  setTimeout(() => errorEl.classList.add('hidden'), 4000);
}

function showNotification(message) {
  const errorEl = document.getElementById('error-msg');
  errorEl.textContent = `✓ ${message}`;
  errorEl.classList.remove('hidden');
  setTimeout(() => errorEl.classList.add('hidden'), 2200);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
