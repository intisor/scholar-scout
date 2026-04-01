let juniorOn = false;
let fullMode = false;
let currentUrl = '';

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await scrapePage();
  await loadTriageCache();
});

// ── Scrape current tab ─────────────────────────────────
async function scrapePage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    currentUrl = tab.url || '';

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_PAGE' });

    document.getElementById('scraped-title').textContent = response.title || tab.title || 'Unknown page';
    document.getElementById('scraped-url').textContent = currentUrl;
    document.getElementById('opp-name').value = response.title || tab.title || '';
    if (response.deadline) document.getElementById('deadline').value = response.deadline;
    if (response.org) {
    }

    // check for duplicate
    if (currentUrl) {
      chrome.runtime.sendMessage({ type: 'CHECK_DUPLICATE', url: currentUrl }, (res) => {
        if (res?.isDuplicate) {
          document.getElementById('dup-warn').classList.remove('hidden');
        }
      });
    }
  } catch (e) {
    document.getElementById('scraped-title').textContent = 'Could not scrape page';
    document.getElementById('scraped-url').textContent = 'Try reloading the tab';
  }
}

// ── Load triage cache ──────────────────────────────────
async function loadTriageCache() {
  const { triageCache } = await chrome.storage.local.get('triageCache');
  const container = document.getElementById('triage-items');

  if (!triageCache || triageCache.length === 0) {
    container.innerHTML = '<div class="triage-empty">no upcoming deadlines</div>';
    return;
  }

  const today = new Date();
  container.innerHTML = triageCache.map(item => {
    const date = new Date(item.date);
    const daysAway = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
    let badgeClass = 'badge-ok';
    let badgeText = `${daysAway}d`;
    if (daysAway <= 0) { badgeClass = 'badge-red'; badgeText = 'today'; }
    else if (daysAway === 1) { badgeClass = 'badge-red'; badgeText = 'tomorrow'; }
    else if (daysAway <= 2) { badgeClass = 'badge-red'; badgeText = `${daysAway} days`; }
    else if (daysAway <= 4) { badgeClass = 'badge-amber'; badgeText = `${daysAway} days`; }
    else { badgeText = `${daysAway} days`; }

    return `
      <div class="triage-item">
        <span class="triage-name">${escHtml(item.name)}</span>
        <span class="triage-badge ${badgeClass}">${badgeText}</span>
      </div>`;
  }).join('');
}

// ── Mode toggle ────────────────────────────────────────
function setMode(mode) {
  fullMode = mode === 'full';
  document.getElementById('btn-quick').classList.toggle('active', !fullMode);
  document.getElementById('btn-full').classList.toggle('active', fullMode);
  document.querySelector('.full-only').classList.toggle('hidden', !fullMode);
}

// ── Junior toggle ──────────────────────────────────────
function toggleJunior() {
  juniorOn = !juniorOn;
  const t = document.getElementById('junior-toggle');
  t.classList.toggle('on', juniorOn);
}

// ── Save ───────────────────────────────────────────────
async function handleSave() {
  const name = document.getElementById('opp-name').value.trim();
  if (!name) {
    showError('Opportunity name is required.');
    return;
  }

  const payload = {
    name,
    url: currentUrl,
    deadline: document.getElementById('deadline').value || null,
    nextActionDate: document.getElementById('next-action').value || null,
    status: document.getElementById('status').value,
    shareWithJuniors: juniorOn,
  };

  if (fullMode) {
    payload.workingDoc = document.getElementById('working-doc').value || null;
    payload.blocker = document.getElementById('blocker').value || null;
    payload.valueAmount = document.getElementById('value-amount').value || null;
  }

  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = 'saving...';
  clearError();

  chrome.runtime.sendMessage({ type: 'SAVE_OPPORTUNITY', payload }, (res) => {
    if (res?.ok) {
      btn.textContent = 'saved ✓';
      btn.style.background = '#085041';
      setTimeout(() => resetForm(), 1800);
    } else {
      btn.disabled = false;
      btn.textContent = 'save to notion';
      showError(res?.error || 'Something went wrong. Check your Notion settings.');
    }
  });
}

// ── Discard ────────────────────────────────────────────
function handleDiscard() {
  resetForm();
}

function resetForm() {
  document.getElementById('opp-name').value = '';
  document.getElementById('deadline').value = '';
  document.getElementById('next-action').value = '';
  document.getElementById('status').value = 'To Review';
  if (fullMode) {
    document.getElementById('working-doc').value = '';
    document.getElementById('blocker').value = '';
    document.getElementById('value-amount').value = '';
  }
  if (juniorOn) toggleJunior();
  const btn = document.getElementById('btn-save');
  btn.disabled = false;
  btn.textContent = 'save to notion';
  btn.style.background = '';
  clearError();
  document.getElementById('dup-warn').classList.add('hidden');
}

// ── Helpers ────────────────────────────────────────────
function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function clearError() {
  document.getElementById('error-msg').classList.add('hidden');
}
function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
