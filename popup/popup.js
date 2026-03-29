/* ──────────────────────────────────────────────────────────────
   ScholarScout — Popup Logic
   ────────────────────────────────────────────────────────────── */

let juniorOn = false;
let fullMode = false;
let currentUrl = '';
let triageItems = [];

// ── Initialization ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await scrapePage();
  await loadTriageCache();
  await refreshHealth();
  setupEventListeners();
});

function setupEventListeners() {
  document.getElementById('junior-row').addEventListener('click', toggleJunior);
  document.getElementById('btn-sync-now').addEventListener('click', handleSyncNow);
  document.getElementById('btn-retry-pending').addEventListener('click', handleRetryPending);
  document.getElementById('triage-filter').addEventListener('input', handleTriageFilter);
  
  // Asset quick-link buttons
  const resumeBtn = document.getElementById('btn-copy-resume');
  const essayBtn = document.getElementById('btn-copy-essay');
  if (resumeBtn) resumeBtn.addEventListener('click', copyResume);
  if (essayBtn) essayBtn.addEventListener('click', copyEssay);
}

// ── Scrape current tab ─────────────────────────────────────────
async function scrapePage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      document.getElementById('scraped-title').textContent = 'No active tab';
      return;
    }

    currentUrl = tab.url || '';

    // Send message to content script for DOM scraping
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_PAGE' });
      
      // Update UI with scraped data
      document.getElementById('scraped-title').textContent = response.title || tab.title || 'Unknown page';
      document.getElementById('scraped-url').textContent = currentUrl;
      document.getElementById('opp-name').value = response.title || tab.title || '';
      
      if (response.deadline) {
        document.getElementById('final-deadline').value = response.deadline;
        // Set next action date to 7 days before deadline if deadline exists
        const deadline = new Date(response.deadline);
        const nextAction = new Date(deadline);
        nextAction.setDate(nextAction.getDate() - 7);
        if (nextAction > new Date()) {
          document.getElementById('next-action').value = nextAction.toISOString().split('T')[0];
        }
      }
      
      if (response.org) {
        document.getElementById('org').value = response.org;
      }
    } catch (err) {
      console.log('Content script not ready, tab may be system page:', err);
      document.getElementById('scraped-title').textContent = 'Could not scrape page';
    }

    // Check for duplicates
    if (currentUrl) {
      chrome.runtime.sendMessage({ type: 'CHECK_DUPLICATE', url: currentUrl }, (res) => {
        if (res?.isDuplicate) {
          document.getElementById('dup-warn').classList.remove('hidden');
        }
      });
    }
  } catch (e) {
    console.error('Scrape error:', e);
    document.getElementById('scraped-title').textContent = 'Could not scrape page';
  }
}

// ── Load triage cache ──────────────────────────────────────────
async function loadTriageCache() {
  try {
    const { triageCache } = await chrome.storage.local.get('triageCache');
    triageItems = Array.isArray(triageCache) ? triageCache : [];
    renderTriage(triageItems);
  } catch (err) {
    console.error('Error loading triage cache:', err);
  }
}

function renderTriage(items) {
  const container = document.getElementById('triage-items');

  if (!items || items.length === 0) {
    container.innerHTML = '<div class="triage-empty">no upcoming deadlines</div>';
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  container.innerHTML = items.map(item => {
    const itemDate = new Date(item.nextActionDate || item.deadline);
    itemDate.setHours(0, 0, 0, 0);
    
    const daysAway = Math.ceil((itemDate - today) / (1000 * 60 * 60 * 24));
    let badgeClass = 'badge-ok';
    let badgeText = `${daysAway}d`;

    if (daysAway <= 0) {
      badgeClass = 'badge-red';
      badgeText = 'today';
    } else if (daysAway === 1) {
      badgeClass = 'badge-red';
      badgeText = 'tomorrow';
    } else if (daysAway <= 2) {
      badgeClass = 'badge-red';
      badgeText = `${daysAway} days`;
    } else if (daysAway <= 4) {
      badgeClass = 'badge-amber';
      badgeText = `${daysAway} days`;
    } else {
      badgeText = `${daysAway} days`;
    }

    return `
      <div class="triage-item">
        <span class="triage-name">${escapeHtml(item.name)}</span>
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

  const filtered = triageItems.filter(item => {
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
  } catch (err) {
    console.error('Failed to load health status:', err);
  }
}

async function handleSyncNow() {
  const res = await chrome.runtime.sendMessage({ type: 'SYNC_CACHE' });
  if (res?.ok === false) {
    showError('Sync failed. Check options and network.');
  } else {
    showNotification('Synced from Notion');
  }
  await loadTriageCache();
  await refreshHealth();
}

async function handleRetryPending() {
  const res = await chrome.runtime.sendMessage({ type: 'RETRY_PENDING' });
  if (res?.ok) {
    showNotification(`Retried ${res.retried || 0}; sent ${res.sent || 0}`);
  } else {
    showError(res?.error || 'Retry failed');
  }
  await loadTriageCache();
  await refreshHealth();
}

// ── Mode toggle ────────────────────────────────────────────────
function setMode(mode) {
  fullMode = mode === 'full';
  document.getElementById('btn-quick').classList.toggle('active', !fullMode);
  document.getElementById('btn-full').classList.toggle('active', fullMode);
  document.querySelector('.full-only').classList.toggle('hidden', !fullMode);
}

// ── Junior toggle ──────────────────────────────────────────────
function toggleJunior() {
  juniorOn = !juniorOn;
  const toggle = document.getElementById('junior-toggle');
  toggle.classList.toggle('active', juniorOn);
}

// ── Asset quick-links ──────────────────────────────────────────
async function copyResume() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_ASSET_URLS' });
  if (response.resumeUrl) {
    navigator.clipboard.writeText(response.resumeUrl).then(() => {
      showNotification('Resume URL copied to clipboard!');
    });
  } else {
    showError('Resume URL not set. Configure in options.');
  }
}

async function copyEssay() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_ASSET_URLS' });
  if (response.essayUrl) {
    navigator.clipboard.writeText(response.essayUrl).then(() => {
      showNotification('Essay URL copied to clipboard!');
    });
  } else {
    showError('Essay URL not set. Configure in options.');
  }
}

// ── Get form data ──────────────────────────────────────────────
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

  // Full mode fields
  if (fullMode) {
    const org = document.getElementById('org').value?.trim();
    const oppType = document.getElementById('opp-type').value;
    const valueAmount = document.getElementById('value-amount').value?.trim();
    const workingDoc = document.getElementById('working-doc').value?.trim();
    const blocker = document.getElementById('blocker').value?.trim();
    const reviewStage = document.getElementById('review-stage').value;
    const effortLevel = document.getElementById('effort-level').value;
    const portalUrl = document.getElementById('portal-url').value?.trim();
    const appId = document.getElementById('app-id').value?.trim();

    if (org) data.org = org;
    if (oppType) data.oppType = oppType;
    if (valueAmount) data.valueAmount = valueAmount;
    if (workingDoc) data.workingDoc = workingDoc;
    if (blocker) data.blocker = blocker;
    if (reviewStage) data.reviewStage = reviewStage;
    if (effortLevel) data.effortLevel = effortLevel;
    if (portalUrl) data.portalUrl = portalUrl;
    if (appId) data.appId = appId;
  }

  return data;
}

// ── Save to Notion ─────────────────────────────────────────────
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
      setTimeout(() => {
        window.close();
      }, 800);
    } else if (response?.queued) {
      showNotification('Queued for auto-retry in background');
      btn.textContent = originalText;
      btn.disabled = false;
      await refreshHealth();
    } else {
      showError(response?.error || 'Failed to save. Check your Notion configuration.');
      btn.textContent = originalText;
      btn.disabled = false;
    }
  } catch (err) {
    console.error('Save error:', err);
    showError('Connection error. Make sure Notion is configured in Options.');
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// ── Discard ────────────────────────────────────────────────────
function handleDiscard() {
  if (confirm('Are you sure? This will close the popup.')) {
    window.close();
  }
}

// ── Show error message ─────────────────────────────────────────
function showError(message) {
  const errorEl = document.getElementById('error-msg');
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
  setTimeout(() => {
    errorEl.classList.add('hidden');
  }, 4000);
}

function showNotification(message) {
  const errorEl = document.getElementById('error-msg');
  errorEl.textContent = '✓ ' + message;
  errorEl.classList.remove('hidden');
  setTimeout(() => {
    errorEl.classList.add('hidden');
  }, 2000);
}

// ── Utility: Escape HTML ───────────────────────────────────────
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
