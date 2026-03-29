/* ──────────────────────────────────────────────────────────────
   ScholarScout — Content Scraper
   ────────────────────────────────────────────────────────────── */

(() => {
  // Deadline patterns to match various date formats
  const DATE_PATTERNS = [
    // MM/DD/YYYY or MM-DD-YYYY
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/,
    // Month DD, YYYY
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i,
    // DD Month YYYY
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i,
    // Labeled deadline patterns
    /deadline[:\s]+([^\n<]{5,40})/i,
    /closes?[:\s]+([^\n<]{5,40})/i,
    /due[:\s]+([^\n<]{5,40})/i,
    /apply by[:\s]+([^\n<]{5,40})/i,
    /submission deadline[:\s]+([^\n<]{5,40})/i,
  ];

  /**
   * Find deadline from page text using regex patterns
   */
  function findDeadline() {
    const text = document.body.innerText || '';
    
    for (const pattern of DATE_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        try {
          const raw = match[0];
          // Clean up the matched text
          const cleaned = raw
            .replace(/deadline[:\s]+|closes?[:\s]+|due[:\s]+|apply by[:\s]+|submission deadline[:\s]+/i, '')
            .trim();
          
          // Parse the date
          const parsed = new Date(cleaned);
          
          // Validate: must be a valid date in the future
          if (!isNaN(parsed.getTime()) && parsed > new Date()) {
            return parsed.toISOString().split('T')[0];
          }
        } catch (err) {
          // Continue to next pattern
        }
      }
    }
    
    return null;
  }

  /**
   * Extract organization name from meta tags or domain
   */
  function getOrgName() {
    // Try meta tags first
    const metaTags = ['og:site_name', 'application-name', 'author', 'company'];
    for (const name of metaTags) {
      const el = document.querySelector(
        `meta[property="${name}"], meta[name="${name}"]`
      );
      if (el?.content) {
        return el.getAttribute('content').trim();
      }
    }

    // Fallback: extract from domain
    try {
      const hostname = new URL(window.location.href).hostname;
      return hostname
        .replace('www.', '')
        .split('.')[0]
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    } catch {
      return '';
    }
  }

  /**
   * Listen for SCRAPE_PAGE messages from popup
   */
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'SCRAPE_PAGE') {
      sendResponse({
        title: document.title || '',
        url: window.location.href,
        deadline: findDeadline(),
        org: getOrgName(),
      });
    }
    return true;
  });
})();
