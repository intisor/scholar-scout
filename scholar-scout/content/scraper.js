/* ──────────────────────────────────────────────────────────────
   ScholarScout — Content Scraper
   ────────────────────────────────────────────────────────────── */

(() => {
  // Deadline patterns to match various date formats
  const DATE_PATTERNS = [
    // Labeled deadline patterns (Highest Priority)
    /deadline[:\s]+([^\n<]{5,40})/i,
    /closes?[:\s]+([^\n<]{5,40})/i,
    /due[:\s]+([^\n<]{5,40})/i,
    /apply by[:\s]+([^\n<]{5,40})/i,
    /submission deadline[:\s]+([^\n<]{5,40})/i,
    // Month DD, YYYY
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i,
    // DD Month YYYY
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i,
    // MM/DD/YYYY or MM-DD-YYYY or DD-MM-YYYY (Ambiguous, but fallback)
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/,
  ];

  /**
   * Find deadline from page text using regex patterns
   */
  function findDeadline() {
    const text = document.body.innerText || '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (const pattern of DATE_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        try {
          const raw = match[0];
          // Clean up the matched text
          const cleaned = raw
            .replace(/deadline[:\s]+|closes?[:\s]+|due[:\s]+|apply by[:\s]+|submission deadline[:\s]+/i, '')
            .trim()
            .replace(/(\n|\r)/g, ' ');
          
          // Parse the date
          const parsed = new Date(cleaned);
          
          // Validate: must be a valid date today or in the future
          if (!isNaN(parsed.getTime())) {
            const checkDate = new Date(parsed);
            checkDate.setHours(0, 0, 0, 0);
            
            if (checkDate >= today) {
              return parsed.toISOString().split('T')[0];
            }
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

  function getPageContext() {
    const title = document.title || '';
    const url = window.location.href;
    const metaDescription =
      document.querySelector('meta[name="description"]')?.getAttribute('content') ||
      document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      '';

    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .map(el => (el.textContent || '').trim())
      .filter(Boolean)
      .slice(0, 15)
      .join('\n');

    const text = (document.body?.innerText || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 12000);

    return {
      title,
      url,
      org: getOrgName(),
      deadline: findDeadline(),
      metaDescription,
      headings,
      text,
    };
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
    if (msg.type === 'GET_PAGE_CONTEXT') {
      sendResponse(getPageContext());
    }
    return true;
  });

})();
