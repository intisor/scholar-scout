# Opp Tracker — Chrome Extension

Zero-friction scholarship & opportunity capture → Notion.

## Loading in Chrome (Developer Mode)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select this `opp-tracker` folder
5. The extension appears in your toolbar. Pin it.

## First-time setup

Click the extension icon → a setup prompt will guide you. Or go to:
`chrome://extensions` → Opp Tracker → Details → Extension options

You'll need:
- A Notion Integration Token (from notion.so/my-integrations)
- Your target database ID

The Options page walks you through the full Notion setup step by step.

## Icons

The `icons/` folder needs PNG icons at 16×16, 48×48, and 128×128 px.
Add your own or generate a simple green dot icon.
Without them, Chrome uses a default puzzle piece — the extension still works fine.

## Notion Database Properties Required

| Property Name       | Type     |
|---------------------|----------|
| Name                | Title    |
| URL                 | URL      |
| Status              | Select   |
| Final Deadline      | Date     |
| Next Action Date    | Date     |
| Organization        | Text     |
| Share with Juniors  | Checkbox |
| Date Clipped        | Date     |

Optional (for full edit mode):
| Working Doc         | URL      |
| Current Blocker     | Text     |
| Value Amount        | Text     |

## File structure

```
opp-tracker/
├── manifest.json
├── background/
│   └── service-worker.js   ← Notion API calls, duplicate check, cache sync
├── content/
│   └── scraper.js          ← DOM scraping (title, URL, deadline regex)
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js            ← UI logic
├── options/
│   └── options.html        ← Notion token + DB ID setup
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```
