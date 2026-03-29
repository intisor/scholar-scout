/* ──────────────────────────────────────────────────────────────
   ScholarScout — Options Page Logic
   ────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', loadConfig);

/**
 * Load saved configuration from storage
 */
async function loadConfig() {
  const { notionToken, notionDbId, resumeUrl, essayUrl } = await chrome.storage.local.get([
    'notionToken',
    'notionDbId',
    'resumeUrl',
    'essayUrl',
  ]);

  if (notionToken) {
    document.getElementById('notion-token').value = notionToken;
  }
  if (notionDbId) {
    document.getElementById('notion-db-id').value = notionDbId;
  }
  if (resumeUrl) {
    document.getElementById('resume-url').value = resumeUrl;
  }
  if (essayUrl) {
    document.getElementById('essay-url').value = essayUrl;
  }
}

/**
 * Save configuration to storage
 */
async function saveConfig() {
  const token = document.getElementById('notion-token').value?.trim();
  const dbId = document.getElementById('notion-db-id').value?.trim();
  const resumeUrl = document.getElementById('resume-url').value?.trim();
  const essayUrl = document.getElementById('essay-url').value?.trim();
  const errorEl = document.getElementById('error-msg');
  const toastEl = document.getElementById('toast');
  const btn = document.querySelector('.btn-save');

  errorEl.classList.remove('show');
  toastEl.classList.remove('show');

  if (!token) {
    showError('Notion Integration Token is required');
    return;
  }

  if (!dbId) {
    showError('Database ID is required');
    return;
  }

  if (!token.startsWith('secret_')) {
    showError('Token should start with "secret_"');
    return;
  }

  if (dbId.length < 20) {
    showError('Database ID looks too short (should be 32 characters)');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'saving...';

  try {
    await chrome.storage.local.set({
      notionToken: token,
      notionDbId: dbId,
      resumeUrl: resumeUrl || '',
      essayUrl: essayUrl || '',
    });

    toastEl.classList.add('show');
    btn.textContent = '✓ saved!';

    setTimeout(() => {
      btn.textContent = 'save settings';
      btn.disabled = false;
      toastEl.classList.remove('show');
    }, 2000);

    chrome.runtime.sendMessage({ type: 'SYNC_CACHE' });
  } catch (err) {
    showError('Failed to save: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'save settings';
  }
}

/**
 * Show error message
 */
function showError(message) {
  const errorEl = document.getElementById('error-msg');
  errorEl.textContent = message;
  errorEl.classList.add('show');
}
