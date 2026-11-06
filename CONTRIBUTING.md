# Contributing

Contributions to the website and its build script are welcome.

## Development

The site has no JavaScript package dependencies. The build script requires Python 3.12 or newer and the packages in [`requirements.txt`](requirements.txt).

```sh
python3 -m pip install -r requirements.txt
curl --fail --location \
  "https://docs.google.com/spreadsheets/d/1gPBdBrqVCbtuy7f1bjOdCDUzEv5RqbbU1yYAr3KoHYE/export?format=xlsx" \
  --output /tmp/tracker.xlsx
python3 scripts/build_data.py /tmp/tracker.xlsx pages/data.json
python3 -m http.server 8000 --directory pages
```

Use the local site to verify your change. For changes to data generation, check that people link to their bills, bills link to people, and workbook-provided bill URLs are preserved. `pages/data.json` is generated locally and should not be committed.

The production workflow reads the live, public Google Sheets export; the checked-in workbook copies under `data/` are not used in deployment. To correct source data, update the spreadsheet rather than editing generated site data.

## Pull requests

- Keep changes focused and describe the user-facing result.
- Include steps to verify UI or data-builder changes.
- Preserve accessible labels, keyboard-operable controls, and safe external links.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- The repository code is licensed under the [Blue Oak Model License](LICENSE). Contributions are submitted under that license; source spreadsheet terms may differ.

## Security

Do not include credentials, private spreadsheet data, or sensitive personal information in code or issues. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
