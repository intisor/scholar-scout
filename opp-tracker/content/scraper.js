(() => {
  const DATE_PATTERNS = [
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i,
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i,
    /deadline[:\s]+([^\n<]{5,40})/i,
    /closes?[:\s]+([^\n<]{5,40})/i,
    /due[:\s]+([^\n<]{5,40})/i,
    /apply by[:\s]+([^\n<]{5,40})/i,
  ];

  function findDeadline() {
    const text = document.body.innerText || '';
    for (const pattern of DATE_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        const raw = match[0];
        const parsed = new Date(raw.replace(/deadline[:\s]+|closes?[:\s]+|due[:\s]+|apply by[:\s]+/i, '').trim());
        if (!isNaN(parsed.getTime()) && parsed > new Date()) {
          return parsed.toISOString().split('T')[0];
        }
      }
    }
    return null;
  }

  function getOrgName() {
    const metas = ['og:site_name', 'application-name', 'author'];
    for (const name of metas) {
      const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
      if (el) return el.getAttribute('content');
    }
    try {
      const hostname = new URL(window.location.href).hostname;
      return hostname.replace('www.', '').split('.')[0];
    } catch {
      return '';
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'SCRAPE_PAGE') {
      sendResponse({
        title: document.title,
        url: window.location.href,
        deadline: findDeadline(),
        org: getOrgName(),
      });
    }
    return true;
  });
})();
