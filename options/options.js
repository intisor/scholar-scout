/* ──────────────────────────────────────────────────────────────
   ScholarScout — Options Page Logic
   ────────────────────────────────────────────────────────────── */

console.log('[ScholarScout Options] Script loaded');

document.addEventListener('DOMContentLoaded', initOptionsPage);

const NOTION_OAUTH_AUTHORIZE_URL = 'https://www.notion.com/oauth2/v2/authorize';
const NOTION_OAUTH_TOKEN_URL = 'https://api.notion.com/v1/oauth/token';

async function initOptionsPage() {
  console.log('[Options] initOptionsPage started');
  setupEventListeners();
  await loadConfig();
  console.log('[Options] initOptionsPage completed');
}

function setupEventListeners() {
  const saveBtn = document.getElementById('btn-save-settings');
  const connectBtn = document.getElementById('btn-connect-oauth');
  const disconnectBtn = document.getElementById('btn-disconnect-oauth');

  if (saveBtn) saveBtn.addEventListener('click', saveConfig);
  if (connectBtn) connectBtn.addEventListener('click', connectNotionOAuth);
  if (disconnectBtn) disconnectBtn.addEventListener('click', disconnectNotionOAuth);
}

/**
 * Load saved configuration from storage
 */
async function loadConfig() {
  console.log('[Options] loadConfig started');
  const {
    notionToken,
    notionDbId,
    resumeUrl,
    essayUrl,
    notionClientId,
    notionClientSecret,
    notionOAuthConnected,
    geminiApiKey,
    useAiExtraction,
  } = await chrome.storage.local.get([
    'notionToken',
    'notionDbId',
    'resumeUrl',
    'essayUrl',
    'notionClientId',
    'notionClientSecret',
    'notionOAuthConnected',
    'geminiApiKey',
    'useAiExtraction',
  ]);

  console.log('[Options] Loaded config:', {
    hasToken: !!notionToken,
    hasDbId: !!notionDbId,
    hasClientId: !!notionClientId,
    hasClientSecret: !!notionClientSecret,
    hasGeminiKey: !!geminiApiKey,
    useAiExtraction,
    oauthConnected: notionOAuthConnected,
  });

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
  if (notionClientId) {
    document.getElementById('notion-client-id').value = notionClientId;
  }
  if (notionClientSecret) {
    document.getElementById('notion-client-secret').value = notionClientSecret;
  }
  if (geminiApiKey) {
    document.getElementById('gemini-api-key').value = geminiApiKey;
  }
  document.getElementById('use-ai-extraction').checked = Boolean(useAiExtraction);

  updateOAuthStatus(Boolean(notionOAuthConnected));
}

/**
 * Save configuration to storage
 */
async function saveConfig() {
  console.log('[Options] saveConfig started');
  const tokenFromInput = document.getElementById('notion-token').value?.trim();
  const dbInput = document.getElementById('notion-db-id').value?.trim();
  const notionClientId = document.getElementById('notion-client-id').value?.trim();
  const notionClientSecret = document.getElementById('notion-client-secret').value?.trim();
  const geminiApiKey = document.getElementById('gemini-api-key').value?.trim();
  const useAiExtraction = document.getElementById('use-ai-extraction').checked;
  const resumeUrl = document.getElementById('resume-url').value?.trim();
  const essayUrl = document.getElementById('essay-url').value?.trim();
  const errorEl = document.getElementById('error-msg');
  const toastEl = document.getElementById('toast');
  const btn = document.getElementById('btn-save-settings');

  const { notionToken: existingToken, notionOAuthConnected } = await chrome.storage.local.get([
    'notionToken',
    'notionOAuthConnected',
  ]);
  const token = tokenFromInput || existingToken || '';
  const dbId = normalizeNotionDatabaseId(dbInput || '');

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

  if (!notionOAuthConnected && !isLikelyNotionToken(token)) {
    showError('Token format looks invalid. Use OAuth connect or paste a valid Notion integration token.');
    return;
  }

  if (!isLikelyNotionId(dbId)) {
    showError('Database ID looks invalid. Paste the 32-char ID or the full database URL.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'saving...';

  try {
    console.log('[Options] Saving to chrome.storage.local...');
    await chrome.storage.local.set({
      notionToken: token,
      notionDbId: dbId,
      notionClientId: notionClientId || '',
      notionClientSecret: notionClientSecret || '',
      geminiApiKey: geminiApiKey || '',
      useAiExtraction,
      resumeUrl: resumeUrl || '',
      essayUrl: essayUrl || '',
    });
    console.log('[Options] Config saved successfully');

    toastEl.classList.add('show');
    btn.textContent = '✓ saved!';

    setTimeout(() => {
      btn.textContent = 'save settings';
      btn.disabled = false;
      toastEl.classList.remove('show');
    }, 2000);

    // Notify the service worker to sync cache
    console.log('[Options] Sending SYNC_CACHE message to service worker...');
    chrome.runtime.sendMessage({ type: 'SYNC_CACHE' }, response => {
      const err = chrome.runtime.lastError;
      if (err) {
        console.error('[Options] SYNC_CACHE message failed:', err);
      } else {
        console.log('[Options] SYNC_CACHE acknowledged by service worker:', response);
      }
    });
  } catch (err) {
    console.error('[Options] Save failed:', err);
    showError('Failed to save: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'save settings';
  }
}

async function connectNotionOAuth() {
  console.log('[Options] OAuth flow initiated');
  const clientId = document.getElementById('notion-client-id').value?.trim();
  const clientSecret = document.getElementById('notion-client-secret').value?.trim();

  if (!clientId || !clientSecret) {
    showError('OAuth Client ID and Client Secret are required');
    return;
  }

  const state = self.crypto.randomUUID();
  const redirectUri = chrome.identity.getRedirectURL('notion');
  const authUrl = new URL(NOTION_OAUTH_AUTHORIZE_URL);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('owner', 'user');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);

  try {
    console.log('[Options] Launching web auth flow...');
    const redirectResponseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true,
    });

    if (!redirectResponseUrl) {
      throw new Error('No redirect response returned from Notion');
    }

    const callbackUrl = new URL(redirectResponseUrl);
    const returnedState = callbackUrl.searchParams.get('state');
    const authCode = callbackUrl.searchParams.get('code');
    const oauthError = callbackUrl.searchParams.get('error');

    if (oauthError) {
      throw new Error(`Notion OAuth error: ${oauthError}`);
    }
    if (!authCode) {
      throw new Error('Authorization code missing in callback');
    }
    if (returnedState !== state) {
      throw new Error('State mismatch detected. Try again.');
    }

    console.log('[Options] Exchanging auth code for token...');
    const basic = btoa(`${clientId}:${clientSecret}`);
    const tokenResponse = await fetch(NOTION_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${basic}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: redirectUri,
      }),
    });

    const tokenPayload = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenPayload.access_token) {
      throw new Error(tokenPayload.message || `Token exchange failed (${tokenResponse.status})`);
    }

    console.log('[Options] OAuth successful, saving token...');
    await chrome.storage.local.set({
      notionToken: tokenPayload.access_token,
      notionOAuthConnected: true,
      notionOAuthWorkspaceName: tokenPayload.workspace_name || '',
      notionOAuthOwnerType: tokenPayload.owner?.type || '',
      notionOAuthBotId: tokenPayload.bot_id || '',
      notionClientId: clientId,
      notionClientSecret: clientSecret,
    });

    document.getElementById('notion-token').value = tokenPayload.access_token;

    updateOAuthStatus(true, tokenPayload.workspace_name);
    const toastEl = document.getElementById('toast');
    toastEl.textContent = '✓ Notion OAuth connected successfully!';
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2500);
  } catch (err) {
    console.error('[Options] OAuth failed:', err);
    showError(`OAuth failed: ${err.message}`);
  }
}

async function disconnectNotionOAuth() {
  await chrome.storage.local.set({
    notionOAuthConnected: false,
    notionOAuthWorkspaceName: '',
    notionOAuthOwnerType: '',
    notionOAuthBotId: '',
  });
  updateOAuthStatus(false);
}

function updateOAuthStatus(connected, workspaceName) {
  const statusEl = document.getElementById('oauth-status');
  if (!statusEl) return;

  if (connected) {
    statusEl.classList.add('connected');
    statusEl.textContent = workspaceName
      ? `connected • ${workspaceName}`
      : 'connected';
  } else {
    statusEl.classList.remove('connected');
    statusEl.textContent = 'not connected';
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

function normalizeNotionDatabaseId(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const directId = trimmed.replace(/-/g, '');
  if (/^[a-f0-9]{32}$/i.test(directId)) {
    return directId;
  }

  try {
    const url = new URL(trimmed);
    const idMatch = url.pathname.match(/[a-f0-9]{32}/i);
    return idMatch ? idMatch[0] : trimmed;
  } catch {
    const fallback = trimmed.match(/[a-f0-9]{32}/i);
    return fallback ? fallback[0] : trimmed;
  }
}

function isLikelyNotionId(value) {
  return /^[a-f0-9]{32}$/i.test(value);
}

function isLikelyNotionToken(value) {
  if (!value) return false;
  return /^secret_/i.test(value) || /^ntn_/i.test(value) || value.length >= 30;
}
