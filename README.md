# Congressional Democrat Left Tracker

A searchable information site for congressional bill sponsorship and voting records. Browse lawmakers by left score, open a lawmaker profile to see their responses, or open a bill to see who sponsored or voted on it. Where the spreadsheet provides a source link, the site links to the original bill.

The site is static and is published with GitHub Pages. GitHub Actions fetches the latest workbook from [Google Sheets](https://docs.google.com/spreadsheets/d/1gPBdBrqVCbtuy7f1bjOdCDUzEv5RqbbU1yYAr3KoHYE), builds linked people and bill records, and publishes them every day at 07:13 UTC (and on pushes or manual runs).

## Data source and deployment

The workflow downloads the workbook's XLSX export without authentication. The Google Sheet must therefore be shared so that anyone with the link can view and download it. Do not add credentials or private data to the site.

To enable deployment, open the repository's **Settings → Pages** and select **GitHub Actions** as the source. Check the `Build and publish website` workflow under **Actions** to see build and deployment status.

The generated `pages/data.json` is intentionally ignored by Git: it is built from the live workbook during each workflow run. Spreadsheet source exports in `data/` are local reference copies and are not used by the production build.

## Build and preview locally

Requirements: Python 3.12 or newer and access to the public Google Sheets XLSX export.

```sh
python3 -m pip install -r requirements.txt
curl --fail --location \
  "https://docs.google.com/spreadsheets/d/1gPBdBrqVCbtuy7f1bjOdCDUzEv5RqbbU1yYAr3KoHYE/export?format=xlsx" \
  --output /tmp/tracker.xlsx
python3 scripts/build_data.py /tmp/tracker.xlsx pages/data.json
python3 -m http.server 8000 --directory pages
```

Open [http://localhost:8000](http://localhost:8000). The site uses `fetch()` to load its generated data, so it must be served over HTTP rather than opened directly as a file.

The data builder carries bill-title hyperlinks through to bill records, combines matching records across sheets using chamber, date, and title, and records vote/sponsorship responses for each lawmaker.

## Contributing and support

See [CONTRIBUTING.md](CONTRIBUTING.md) for local development and pull request guidance. For help or known limitations, see [SUPPORT.md](SUPPORT.md). Report security concerns privately as described in [SECURITY.md](SECURITY.md).

## License and data attribution

The code in this repository is licensed under the [Blue Oak Model License 1.0.0](LICENSE). The upstream spreadsheet and its contents are maintained by their respective authors; check the source sheet for attribution and reuse terms.
