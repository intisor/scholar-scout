# ScholarScout — Quick Start Guide

Welcome! You've got a complete Chrome extension ready to use. Here's how to get started.

## ⚡ 5-Minute Setup

### Step 1: Load the Extension
1. Open Chrome and go to **chrome://extensions**
2. Toggle **Developer mode** (top right) → **ON**
3. Click **Load unpacked**
4. Navigate to `scholar-scout` folder → Open
5. You should see ScholarScout in your extensions list
6. **Pin it** to your toolbar (click the pin icon)

### Step 2: Configure Notion (2 minutes)
1. Click the ScholarScout icon in your toolbar
2. You'll see a prompt to configure — click **Settings** or go to:
   - **chrome://extensions** → ScholarScout Details → **Extension options**
3. Follow the step-by-step guide in the Settings page
4. Get your Notion token from: **https://www.notion.so/my-integrations**
5. Create your Notion database with the required fields (guide shows exactly which ones)
6. Paste your token and database ID into Settings
7. Click **Save Settings**

### Step 3: Test It!
1. Go to any scholarship/opportunity page (e.g., Google Scholarship, Scholarship.com)
2. Click the ScholarScout icon
3. It should auto-fill the opportunity name and deadline from the page
4. Click **Save to Notion**
5. Check your Notion database — it should be there!

---

## 🎯 Key Features at a Glance

### Quick Save Mode (Default)
- ✅ Auto-scrapes page title, URL, deadline
- ✅ 2-click capture (click extension → save)
- ✅ Sees upcoming deadlines in the popup

### Full Edit Mode
- Click **"Full edit"** to access:
  - Opportunity type (Scholarship/Fellowship/etc)
  - Award value
  - Working document link
  - Current blocker
  - Review stage
  - Effort estimate
  - And more...

### Triage Dashboard
- See all opportunities due in the next 7 days
- Color-coded:
  - 🔴 Red = Due tomorrow or within 2 days
  - 🟡 Amber = Due in 3-7 days
  - 🟢 Teal = Further out

### Share with Juniors
- Toggle the "Share with Juniors" button
- Opportunities you bless get added to a shared portal
- Your network stays in sync!

---

## 📋 Notion Database Setup

You need to create a Notion database with these properties. The options page will guide you, but here's the checklist:

**Must Have (for quick save):**
- [ ] Name (title)
- [ ] URL (url)
- [ ] Status (select: To Review, Drafting, Needs Review, Applied, Interview, Rejected, Secured)
- [ ] Final Deadline (date)
- [ ] Next Action Date (date)
- [ ] Organization (text)
- [ ] Share with Juniors (checkbox)
- [ ] Date Clipped (date)

**Nice to Have (for full edit mode):**
- [ ] Opportunity Type (select)
- [ ] Value Amount (text)
- [ ] Working Doc (url)
- [ ] Current Blocker (text)
- [ ] Review Stage (select)
- [ ] Effort Level (select)
- [ ] Portal Login URL (url)
- [ ] Application ID (text)

---

## 🚀 Workflow Example

Let's say you find a scholarship:

1. **You're on** → scholarships.example.com/google-2026
2. **Click** ScholarScout icon
3. **Auto-filled:**
   - Name: "Google Scholarship 2026"
   - URL: scholarships.example.com/...
   - Deadline: 05/15/2026 (detected)
4. **Edit if needed:**
   - Change status to "To Review"
   - Set next action date to 05/08/2026 (7 days before)
5. **Toggle** "Share with Juniors" if your mentees should know this
6. **Click** "Save to Notion"
7. **Done!** Your Notion database is updated

Next time you open ScholarScout, you'll see this opportunity in your "Next 7 Days" triage list.

---

## ❓ Troubleshooting

### "Could not scrape page"
- Some pages block content scripts (security)
- Try refreshing the page, then try again
- Or fill in the form manually (full edit mode)

### "Not configured. Open Options..."
- You haven't saved your Notion token yet
- Go to Settings and follow the setup guide
- Make sure to **paste BOTH** your token AND database ID

### Notion API error (401, 403, 404)
- **401** = Token is invalid/expired. Get a new one from notion.so/my-integrations
- **403** = You didn't share the database with your integration in Notion
- **404** = Wrong database ID. Copy it again from your Notion URL

### Deadline not auto-detected
- The regex looks for common formats (05/15/2026, May 15 2026, etc)
- If the site uses unusual formatting, fill it in manually
- Or suggest adding a pattern in the code!

### Triage strip is empty
- No opportunities have a "Next Action Date" within 7 days
- Add more opportunities or edit existing ones with dates

---

## 💡 Tips & Tricks

### Tip 1: Set Next Action Date Smart
Typically set it to **7 days before** the final deadline. This gives you a week to complete the application.

### Tip 2: Use Current Blocker
Write what's preventing you: "Waiting on LOR from Dr. Smith" — next time you open ScholarScout, you'll see it.

### Tip 3: Review Stage Pipeline
Track progress: Brainstorming → Rough Draft → Needs Roasting → Final Polish → Ready to Send

### Tip 4: Share with Juniors
When you find a great opportunity that's below your level, toggle "Share with Juniors" so your mentees benefit.

### Tip 5: Portal Login URL
Some scholarships have unique portals. Store the login URL here for quick access.

---

## 🔧 Customization

### Change the Triage Sync Interval
The extension syncs your Notion database every 6 hours by default.
Edit `background/service-worker.js`:
```javascript
const SYNC_INTERVAL_MINUTES = 360; // Change to 60 for hourly, etc
```

### Add a New Field
1. Add HTML input in `popup/popup.html`
2. Add styling in `popup/popup.css`
3. Extract value in `popup.js` → `getFormData()`
4. Add to Notion mapping in `service-worker.js` → `buildNotionPage()`
5. Create property in your Notion database

### Improve Deadline Detection
Edit the regex patterns in `content/scraper.js` → `DATE_PATTERNS`

---

## 📖 Full Documentation

See **README.md** for:
- Complete feature list
- Architecture details
- Notion schema reference
- Development guide

---

## 🎓 Built for Ambitious Builders

This extension was created to eliminate the friction in your scholarship hunt. It's designed for students who:
- Browse dozens of opportunities per week
- Need to stay on top of deadlines
- Mentor juniors and want to share discoveries
- Value speed and simplicity

Got ideas for improvements? Add them to the code and ship it! 🚀

---

**Questions? Check the README or the Options page setup guide.**
