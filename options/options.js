/* ──────────────────────────────────────────────────────────────
   ScholarScout — Options Page Logic
   ────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', loadConfig);

const NOTION_OAUTH_AUTHORIZE_URL = 'https://www.notion.com/oauth2/v2/authorize';
const NOTION_OAUTH_TOKEN_URL = 'https://api.notion.com/v1/oauth/token';

/**
 * Load saved configuration from storage
 */
async function loadConfig() {
  const {
    notionToken,
    notionDbId,
    resumeUrl,
    essayUrl,
    notionClientId,
    notionClientSecret,
    notionOAuthConnected,
  } = await chrome.storage.local.get([
    'notionToken',
    'notionDbId',
    'resumeUrl',
    'essayUrl',
    'notionClientId',
    'notionClientSecret',
    'notionOAuthConnected',
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
  if (notionClientId) {
    document.getElementById('notion-client-id').value = notionClientId;
  }
  if (notionClientSecret) {
    document.getElementById('notion-client-secret').value = notionClientSecret;
  }

  updateOAuthStatus(Boolean(notionOAuthConnected));
}

/**
 * Save configuration to storage
 */
async function saveConfig() {
  const tokenFromInput = document.getElementById('notion-token').value?.trim();
  const dbId = document.getElementById('notion-db-id').value?.trim();
  const notionClientId = document.getElementById('notion-client-id').value?.trim();
  const notionClientSecret = document.getElementById('notion-client-secret').value?.trim();
  const resumeUrl = document.getElementById('resume-url').value?.trim();
  const essayUrl = document.getElementById('essay-url').value?.trim();
  const errorEl = document.getElementById('error-msg');
  const toastEl = document.getElementById('toast');
  const btn = document.querySelector('.btn-save');

  const { notionToken: existingToken, notionOAuthConnected } = await chrome.storage.local.get([
    'notionToken',
    'notionOAuthConnected',
  ]);
  const token = tokenFromInput || existingToken || '';

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

  if (!notionOAuthConnected && !token.startsWith('secret_')) {
    showError('Token should start with "secret_" (or use OAuth connect above)');
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
      notionClientId: notionClientId || '',
      notionClientSecret: notionClientSecret || '',
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

async function connectNotionOAuth() {
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
