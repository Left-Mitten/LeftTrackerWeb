# Congressional Democrat Left Tracker

A static information site for the Congressional Democrat Left Tracker. Browse lawmakers and bills, open a lawmaker’s profile to see their recorded responses, and open a bill to see how lawmakers responded. GitHub Actions downloads the current Google Sheets workbook, builds a normalized set of linked records, and publishes the site to GitHub Pages.

## Publishing

The workflow at `.github/workflows/publish-pages.yml` runs when changes are pushed, can be started manually, and runs daily at 07:13 UTC. The Google Sheets ID is configured in the workflow. The spreadsheet must allow the GitHub Actions runner to download its XLSX export without signing in (for example, share it as **Anyone with the link — Viewer**).

In the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source. The home page defaults to the latest Congress, with people ordered by left score from highest to lowest, and supports browsing or searching people and bills. Sort buttons also let visitors reorder directory and detail-page lists. Person and bill records link to each other. When a bill title has a source hyperlink in the workbook, the generated record keeps it and the site provides a link to open the original bill. Duplicate bill columns across historical sheets are combined using the vote date, chamber, and title.

## Build locally

```sh
python3 -m pip install -r requirements.txt
curl --fail --location \
  "https://docs.google.com/spreadsheets/d/1gPBdBrqVCbtuy7f1bjOdCDUzEv5RqbbU1yYAr3KoHYE/export?format=xlsx" \
  --output /tmp/tracker.xlsx
python3 scripts/build_data.py /tmp/tracker.xlsx pages/data.json
```

Serve the `pages` directory with a local HTTP server to preview the site; opening `index.html` directly does not load its generated JSON.
