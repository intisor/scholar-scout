/* ──────────────────────────────────────────────────────────────
   ScholarScout — Opportunities Local Store
   
   Extraction layer: All opportunities are saved locally first,
   regardless of Notion connectivity.
   ────────────────────────────────────────────────────────────── */

const OPPORTUNITIES_STORE = 'opportunities';
const NOTION_SYNC_QUEUE = 'notion-sync-queue';
const LOCAL_SYNC_STATUS = 'local-sync-status';

/**
 * Save an opportunity to local store.
 * Returns immediately with local ID, regardless of Notion status.
 */
export async function saveOpportunityLocally(opportunity) {
  console.log('[OpportunitiesStore] Saving locally:', opportunity.name);

  // Validate required fields
  if (!opportunity.name || !opportunity.name.trim()) {
    throw new Error('Opportunity name is required');
  }

  // Generate ID and timestamps
  const id = generateId();
  const now = Date.now();
  
  const localOpportunity = {
    id,
    createdAt: now,
    updatedAt: now,
    syncedToNotionAt: null,
    notionPageId: null,
    syncStatus: 'pending', // pending, synced, error
    syncError: null,
    
    // Extracted fields
    name: opportunity.name?.trim() || '',
    url: opportunity.url || '',
    deadline: opportunity.deadline || '',
    nextActionDate: opportunity.nextActionDate || '',
    organization: opportunity.org || opportunity.organization || '',
    opportunityType: opportunity.oppType || opportunity.opportunityType || '',
    status: opportunity.status || 'To Review',
    value: opportunity.valueAmount || opportunity.value || '',
    blockers: opportunity.blocker || opportunity.blockers || '',
    reviewStage: opportunity.reviewStage || '',
    effort: opportunity.effortLevel || opportunity.effort || '',
    portalUrl: opportunity.portalUrl || '',
    appId: opportunity.appId || '',
    shared: opportunity.shareWithJuniors === true || opportunity.shared === true,
    notes: opportunity.notes || '',
  };

  // Read existing opportunities
  const { [OPPORTUNITIES_STORE]: existing = [] } = await chrome.storage.local.get(OPPORTUNITIES_STORE);
  const opportunities = Array.isArray(existing) ? existing : [];

  // Add the new one
  opportunities.push(localOpportunity);

  // Save to storage
  await chrome.storage.local.set({ [OPPORTUNITIES_STORE]: opportunities });
  console.log('[OpportunitiesStore] Saved locally:', id);

  return {
    ok: true,
    id,
    queued: true,
    message: 'Saved locally. Will sync to Notion when available.',
  };
}

/**
 * Check if a URL already exists in local store.
 */
export async function isDuplicateLocally(url) {
  if (!url || !url.trim()) return false;

  const { [OPPORTUNITIES_STORE]: opportunities = [] } = await chrome.storage.local.get(OPPORTUNITIES_STORE);
  const array = Array.isArray(opportunities) ? opportunities : [];
  
  return array.some(opp => opp.url === url.trim());
}

/**
 * Get all local opportunities.
 */
export async function getLocalOpportunities() {
  const { [OPPORTUNITIES_STORE]: opportunities = [] } = await chrome.storage.local.get(OPPORTUNITIES_STORE);
  return Array.isArray(opportunities) ? opportunities : [];
}

/**
 * Get opportunities pending Notion sync.
 */
export async function getPendingSyncOpportunities() {
  const opportunities = await getLocalOpportunities();
  return opportunities.filter(opp => opp.syncStatus === 'pending');
}

/**
 * Update sync status for a local opportunity.
 */
export async function updateSyncStatus(opportunityId, status, notionPageId = null, error = null) {
  console.log('[OpportunitiesStore] Updating sync status:', opportunityId, status);

  const opportunities = await getLocalOpportunities();
  const updated = opportunities.map(opp => {
    if (opp.id === opportunityId) {
      return {
        ...opp,
        syncStatus: status,
        syncedToNotionAt: status === 'synced' ? Date.now() : opp.syncedToNotionAt,
        notionPageId: notionPageId || opp.notionPageId,
        syncError: error,
        updatedAt: Date.now(),
      };
    }
    return opp;
  });

  await chrome.storage.local.set({ [OPPORTUNITIES_STORE]: updated });
  console.log('[OpportunitiesStore] Sync status updated:', opportunityId, status);
}

/**
 * Get triage cache (deadlines within 7 days).
 */
export async function getTriageCacheFromLocal() {
  const opportunities = await getLocalOpportunities();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = opportunities
    .filter(opp => opp.deadline)
    .map(opp => {
      const deadlineDate = new Date(opp.deadline);
      const nextActionDateStr = opp.nextActionDate || (() => {
        const d = new Date(deadlineDate);
        d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
      })();
      
      return {
        ...opp,
        nextActionDate: nextActionDateStr,
      };
    })
    .filter(opp => {
      const actionDate = new Date(opp.nextActionDate);
      actionDate.setHours(0, 0, 0, 0);
      return actionDate <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    })
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  return upcoming;
}

/**
 * Get local sync status.
 */
export async function getLocalSyncStatus() {
  const { [LOCAL_SYNC_STATUS]: status = {} } = await chrome.storage.local.get(LOCAL_SYNC_STATUS);
  const opps = await getLocalOpportunities();
  const pending = opps.filter(o => o.syncStatus === 'pending').length;

  return {
    lastLocalSaveAt: status.lastLocalSaveAt || null,
    totalLocalOpportunities: opps.length,
    pendingSync: pending,
    ...status,
  };
}

/**
 * Update local sync status.
 */
export async function updateLocalSyncStatus(update) {
  const current = await getLocalSyncStatus();
  const merged = {
    ...current,
    ...update,
    lastLocalSaveAt: update.lastLocalSaveAt || current.lastLocalSaveAt || Date.now(),
  };
  await chrome.storage.local.set({ [LOCAL_SYNC_STATUS]: merged });
}

/**
 * Build Notion page payload from local opportunity.
 * Aligned with PRD and manual scraper schema.
 */
export function buildNotionPageFromLocal(opportunity, dbId) {
  const props = {
    Name: {
      title: [{ text: { content: opportunity.name || 'Untitled' } }],
    },
    URL: {
      url: opportunity.url || null,
    },
    'Organization': {
      rich_text: [{ text: { content: opportunity.organization || '' } }],
    },
    Status: {
      select: { name: opportunity.status || 'To Review' },
    },
    'Share with Juniors': {
      checkbox: !!opportunity.shared,
    },
    'Date Clipped': {
      date: { start: new Date(opportunity.createdAt || Date.now()).toISOString().split('T')[0] },
    },
  };

  // Optional dates
  if (opportunity.deadline) {
    props['Final Deadline'] = { date: { start: opportunity.deadline } };
  }
  
  if (opportunity.nextActionDate) {
    props['Next Action Date'] = { date: { start: opportunity.nextActionDate } };
  }

  // Full mode fields
  if (opportunity.opportunityType) {
    props['Opportunity Type'] = { select: { name: opportunity.opportunityType } };
  }
  
  if (opportunity.value) {
    props['Value Amount'] = {
      rich_text: [{ text: { content: opportunity.value } }],
    };
  }
  
  if (opportunity.workingDoc) {
    props['Working Doc'] = { url: opportunity.workingDoc };
  }
  
  if (opportunity.blockers) {
    props['Current Blocker'] = {
      rich_text: [{ text: { content: opportunity.blockers } }],
    };
  }
  
  if (opportunity.reviewStage) {
    props['Review Stage'] = { select: { name: opportunity.reviewStage } };
  }
  
  if (opportunity.effort) {
    props['Effort Level'] = { select: { name: opportunity.effort } };
  }
  
  if (opportunity.portalUrl) {
    props['Portal Login URL'] = { url: opportunity.portalUrl };
  }
  
  if (opportunity.appId) {
    props['Application ID'] = {
      rich_text: [{ text: { content: String(opportunity.appId) } }],
    };
  }

  return {
    parent: { database_id: dbId },
    properties: props,
  };
}

/**
 * Generate unique ID for local opportunities.
 */
function generateId() {
  return `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

console.log('[OpportunitiesStore] Module loaded');

