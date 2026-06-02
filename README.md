# tsheets-playwright

Automated daily timesheet filling for [QuickBooks Time (TSheets)](https://tsheets.intuit.com) using [Playwright](https://playwright.dev/) and Microsoft Edge.

Runs as a Windows Scheduled Task. Opens a browser, navigates the TSheets SPA, selects the correct customer/project, fills hours, and clicks Save — no API keys or integrations needed.

## How It Works

1. Launches Edge with a persistent browser profile (`.browser-data/`) so your login session is remembered
2. Navigates to TSheets → Time Entries (weekly manual timecard view)
3. If the customer row already exists (Tue–Fri), fills the hours directly
4. If not (typically Monday), clicks `(no customer)` and navigates the customer tree to assign it
5. Fills the configured hours for today's column and clicks Save
6. On Fridays, fills multiple entries (e.g., 6h project + 2h overhead)

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- Windows with Microsoft Edge installed

### Install

```bash
git clone https://github.com/Samirasimha/tsheets-playwright.git
cd tsheets-playwright
npm install
npx playwright install msedge
```

### Configure

Create a `config.json` in the project root (this file is gitignored):

```json
{
  "url": "https://tsheets.intuit.com/#w_timesheets_v2",
  "skipWeekends": true,
  "entries": {
    "default": [
      {
        "customerPath": ["Parent Customer", "Sub-Customer Name"],
        "hours": 8
      }
    ],
    "friday": [
      {
        "customerPath": ["Parent Customer", "Sub-Customer Name"],
        "hours": 6
      },
      {
        "customerPath": ["Overhead Labor"],
        "hours": 2
      }
    ]
  }
}
```

| Field | Description |
|-------|-------------|
| `url` | TSheets URL with the weekly timecard hash route |
| `skipWeekends` | Skip execution on Saturday/Sunday |
| `entries.default` | Entries to fill Monday–Thursday |
| `entries.friday` | Entries to fill on Fridays |
| `customerPath` | Array of customer tree items to click, in order. Single-item for top-level customers, multi-item for nested (parent → child) |
| `hours` | Hours to fill for that entry |

### First Run — Log In

Run in debug mode to log in and save your session:

```bash
npm run fill:debug
```

The browser opens and you log in manually. Once logged in, the session is saved in `.browser-data/` and reused for future runs. If the session expires, the script will open the browser and wait for you to log in again.

## Usage

### Run Manually

```bash
# Normal run — fills and saves, then closes browser
npm run fill

# Debug mode — fills but does NOT save, browser stays open
npm run fill:debug

# Inspect mode — dumps page DOM structure for debugging
npm run inspect
```

### Scheduled Task (Windows)

Set up a Windows Scheduled Task to run automatically on weekdays:

```powershell
# Run as Administrator
.\setup-schedule.ps1              # Default: 4:45 PM weekdays
.\setup-schedule.ps1 -Time "17:00"  # Custom time
.\setup-schedule.ps1 -Remove        # Remove the task
```

The task runs under your user account with `Interactive` logon so the browser can display if login is needed.

## Schedule Logic

| Day | Behavior |
|-----|----------|
| **Monday** | Selects customer via `(no customer)` dialog → fills hours → saves |
| **Tue–Thu** | Finds existing customer row → fills hours → saves |
| **Friday** | Fills multiple entries from `entries.friday` (e.g., 6h project + 2h overhead) |
| **Sat–Sun** | Skipped (`skipWeekends: true`) |

## Modes

| Flag | Browser | Auto-Save | Stays Open |
|------|---------|-----------|------------|
| *(none)* | Visible | Yes | No |
| `--debug` | Visible | No | Yes |
| `--inspect` | Visible | No | Yes (dumps DOM) |

## Files

| File | Description |
|------|-------------|
| `fill-timesheet.js` | Main automation script |
| `config.json` | Your schedule config (gitignored) |
| `setup-schedule.ps1` | Windows Scheduled Task installer |
| `.browser-data/` | Persistent Edge profile with login session (gitignored) |

## Troubleshooting

**"Login required"** — Your session expired. Run `npm run fill:debug`, log in, then close. Future runs will use the saved session. If the session expires during a scheduled run, the browser will open and wait up to 5 minutes for you to log in.

**Customer not found** — Check that `customerPath` in `config.json` exactly matches the names shown in the TSheets customer selection dialog.

**Wrong column filled** — The script uses `Date.getDay()` for column mapping (Sun=0 through Sat=6). If TSheets shows a different week layout, the column index may be off.