# Support

## Using the site

The [README](README.md) explains the site, its public Google Sheets data source, GitHub Pages deployment, and local preview steps. The home page lets you search people and bills and filter by Congress. Open a person's name to view their responses; open a bill to see its recorded responses and, when available, a link to the source bill.

The site reflects the spreadsheet's contents and scoring. It is not an official congressional record, and response labels or scores should be interpreted using the spreadsheet's own methodology.

## Troubleshooting

- **The site or data is unavailable:** check the latest `Build and publish website` run in the repository's **Actions** tab. A failed daily run may leave the last successfully deployed site in place.
- **The build cannot download the workbook:** the Google Sheet must allow public, link-based viewing and XLSX export. Check its sharing settings and the workflow run log.
- **A vote, score, or bill link looks wrong or is missing:** compare it with the source [Google Sheet](https://docs.google.com/spreadsheets/d/1gPBdBrqVCbtuy7f1bjOdCDUzEv5RqbbU1yYAr3KoHYE). The site can only display information present in the sheet.

## Reporting a problem or requesting a change

Open a [bug report](../../issues/new?template=bug_report.yml) or [feature request](../../issues/new?template=feature_request.yml). For a bug, include the page URL, steps to reproduce, expected and actual behavior, and your browser/device. For a data discrepancy, identify the person or bill and link the relevant source-sheet entry. Do not include private information.

For code contributions, see [CONTRIBUTING.md](CONTRIBUTING.md). For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
