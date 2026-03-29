# ScholarScout — Chrome Extension

**Intelligent scholarship pipeline: discover, track, and share vetted opportunities.**

A zero-friction scholarship & opportunity capture extension for ambitious builders. Seamlessly extract opportunity details from any webpage and save them to your Notion database in under 10 seconds.

## Features

### Core (Quick Save Mode)
- **One-click DOM scraper** — Auto-extracts opportunity name, URL, and deadline
- **Dual deadline tracking** — Final deadline + Next Action date for precise planning
- **7-day triage dashboard** — Color-coded countdown alerts (red ≤2 days, amber ≤7 days)
- **Status pipeline** — Track progress: To Review → Drafting → Applied → Secured
- **Junior sharing toggle** — "Share with Juniors" flag for pre-vetted opportunities
- **Duplicate detection** — Warns if you've already clipped this opportunity
- **Notion sync** — All data flows to your Notion database automatically

### Extended (Full Edit Mode)
- **Organization tagging** — Track which institution/company is offering
- **Opportunity type** — Scholarship, Fellowship, Grant, Internship, etc.
- **Value metrics** — Award amount ($5K, Full Ride, etc.)
- **Working document links** — Direct URL to your essay/application draft
- **Current blockers** — Note what's preventing progress (e.g., "Waiting on LOR")
- **Review stage tracking** — Brainstorming → Rough Draft → Needs Roasting → Final Polish → Ready
- **Effort estimation** — Low/Medium/High complexity for ROI calculation
- **Portal credentials** — Authenticated dashboard login URL
- **Application ID** — Portal-assigned reference number for tracking

## Installation (Developer Mode)

1. Clone or download this folder
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `scholar-scout` folder
6. Pin the extension to your toolbar

## First-Time Setup

1. Click the ScholarScout icon → **Settings** or go to `chrome://extensions` → ScholarScout → **Details** → **Extension options**
2. You'll see a step-by-step guide to set up your Notion integration
3. Get your **Notion Integration Token** from [notion.so/my-integrations](https://www.notion.so/my-integrations)
4. Create a Notion database with the required properties (see guide)
5. Share the database with your integration
6. Paste your token and database ID into Settings and save

## How to Use

### Quick Save (Default)
1. Navigate to a scholarship/opportunity page
2. Click the ScholarScout icon
3. The form auto-fills from the page content:
   - Opportunity name
   - Final deadline (regex-detected)
   - Organization name
4. Edit any fields as needed
5. Toggle **"Share with Juniors"** if this is vetted for your network
6. Click **Save to Notion**
7. Check your triage strip for upcoming deadlines

### Full Edit Mode
1. Click the **"Full edit"** button in the popup
2. Access additional fields:
   - Opportunity type (Scholarship, Fellowship, etc.)
   - Award value/amount
   - Working document link (Google Docs/Overleaf)
   - Current blocker/blocker status
   - Review stage (Brainstorming → Ready)
   - Effort level (Low/Medium/High)
   - Portal login URL
   - Application ID
3. Save to Notion with all extended metadata

### Monitor Deadlines
The triage strip displays items with **Next Action Date ≤ 7 days**:
- **Red badge** = Tomorrow or within 2 days (urgent)
- **Amber badge** = 3–7 days away
- **Teal badge** = 4–6 days away

Click on any item to view full details in Notion.

## Notion Database Schema

### Required Properties
| Property | Type | Description |
|----------|------|-------------|
| **Name** | Title | Opportunity title |
| **URL** | URL | Landing page URL |
| **Status** | Select | To Review, Drafting, Needs Review, Applied, Interview, Rejected, Secured |
| **Final Deadline** | Date | Application closing date |
| **Next Action Date** | Date | When you need to act (e.g., 7 days before deadline) |
| **Organization** | Text | Institution/company name |
| **Share with Juniors** | Checkbox | Flag for shared portal visibility |
| **Date Clipped** | Date | When the opportunity was captured |

### Optional Properties (Full Mode)
| Property | Type |
|----------|------|
| **Opportunity Type** | Select (Scholarship, Fellowship, Grant, Internship, Hackathon, Award, Other) |
| **Value Amount** | Text |
| **Working Doc** | URL |
| **Current Blocker** | Text |
| **Review Stage** | Select (Brainstorming, Rough Draft, Needs Roasting, Final Polish, Ready to Send) |
| **Effort Level** | Select (Low, Medium, High) |
| **Portal Login URL** | URL |
| **Application ID** | Text |

## File Structure

```
scholar-scout/
├── manifest.json              ← Manifest V3 config
├── popup/
│   ├── popup.html           ← Popup UI
│   ├── popup.css            ← Styles (dark theme)
│   └── popup.js             ← Popup logic & scraping
├── background/
│   └── service-worker.js    ← Notion API, duplicate detection, triage sync
├── content/
│   └── scraper.js           ← DOM scraping (title, deadline, org)
├── options/
│   ├── options.html         ← Settings & Notion setup guide
│   └── options.js           ← Save/load config
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md                ← This file
```

## How It Works

### Data Flow
1. **User clicks extension** on a scholarship page
2. **Content script** (`scraper.js`) extracts:
   - Page title
   - Page URL
   - Deadline via regex matching
   - Organization from meta tags or domain
3. **Popup** (`popup.js`) renders form with prefilled data
4. **User edits/confirms** and clicks "Save to Notion"
5. **Service worker** (`service-worker.js`) POSTs to Notion API
6. **Notion database** updated with new opportunity
7. **Triage cache** syncs every 6 hours to populate deadline strip
8. **Background alarms** trigger syncs automatically

### Duplicate Detection
When you save, the extension queries your Notion database:
- If the URL already exists → warning banner
- Prevents accidental duplicates

### Triage Sync
Every 6 hours (configurable in `service-worker.js`):
- Fetches all items with **Next Action Date ≤ 7 days**
- Stores locally in Chrome storage
- Displayed in the popup for quick reference

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **"Could not scrape page"** | Some sites don't allow content scripts. Try opening the page again. |
| **"Not configured. Open Options..."** | Go to Extension options and paste your Notion token + DB ID. |
| **Notion API error 401** | Your token is invalid or expired. Generate a new one at notion.so/my-integrations. |
| **Notion API error 404** | Database ID is wrong. Check your Notion URL again. |
| **Deadline not detected** | The extension uses regex to find dates. If format is unusual, fill it manually. |
| **Duplicate warning but not a duplicate** | Check your Notion — it searches by exact URL. Edit the URL slightly if needed. |
| **Triage strip empty** | No items have **Next Action Date** within 7 days. Add more opportunities! |

## Development

### Technologies
- **Manifest V3** — Chrome extension standard
- **Chrome Storage API** — Local config storage
- **Chrome Alarms API** — Recurring sync tasks
- **Notion API** — Database reads/writes
- **Vanilla JS** — No frameworks (lightweight)

### Extending the Extension

**Add a new field to the popup:**
1. Add HTML input in `popup.html`
2. Add CSS styling in `popup.css`
3. Extract value in `getFormData()` in `popup.js`
4. Add to `buildNotionPage()` in `service-worker.js`
5. Add property to your Notion database

**Customize the deadline regex:**
Edit the `DATE_PATTERNS` array in `content/scraper.js`

**Change the triage sync interval:**
Edit `SYNC_INTERVAL_MINUTES` in `background/service-worker.js`

## License

MIT — Build, improve, and share!

## Support

Found a bug or have a feature request? Submit an issue or reach out to the developers.

---

**Built for ambitious builders. Ship scholarships fast. 🚀**
