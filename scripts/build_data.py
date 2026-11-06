#!/usr/bin/env python3
"""Build normalized lawmaker and bill records from a Google Sheets XLSX export."""

import argparse
import hashlib
import json
import math
import re
import unicodedata
from datetime import date, datetime
from pathlib import Path

from openpyxl import load_workbook


def json_value(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def clean_text(value):
    if value is None:
        return ""
    return " ".join(str(value).split())


def safe_http_url(value):
    if not value:
        return None
    url = str(value).strip()
    if url.startswith(("https://", "http://")):
        return url
    return None


def slug(value):
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "-", ascii_value).strip("-") or "record"


def congress_from_period(value, sheet_name):
    source_match = re.search(r"\b(1\d{2})(?:st|nd|rd|th)\b", sheet_name, re.IGNORECASE)
    if source_match:
        return f"{source_match.group(1)}th Congress"

    text = clean_text(value)
    year_match = re.search(r"\b(17\d{2}|18\d{2}|19\d{2}|20\d{2})\b", text)
    if year_match:
        year = int(year_match.group(1))
        number = (year - 1789) // 2 + 1
        return f"{number}th Congress"
    return sheet_name


def canonical_date(value):
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return clean_text(value).replace("–", "-").replace("—", "-")


def find_labeled_cell(rows, label, max_rows=8):
    for row_index, row in enumerate(rows[:max_rows]):
        for column_index, value in enumerate(row):
            if isinstance(value, str) and value.strip().casefold() == label.casefold():
                return row_index, column_index
    return None


def sheet_records(sheet):
    rows = [
        [json_value(value) for value in row]
        for row in sheet.iter_rows(values_only=True)
    ]
    while rows and not any(value is not None and value != "" for value in rows[-1]):
        rows.pop()
    if not rows:
        return None

    headers = [clean_text(value) for value in rows[0]]
    first_name_column = next(
        (index for index, value in enumerate(headers) if value.casefold() == "first name"),
        None,
    )
    last_name_column = next(
        (index for index, value in enumerate(headers) if value.casefold() == "last name"),
        None,
    )
    date_label = find_labeled_cell(rows, "Date:")
    if first_name_column is None or last_name_column is None or date_label is None:
        return None

    date_row_index, date_label_column = date_label
    first_bill_column = date_label_column + 1
    date_row = rows[date_row_index]
    type_label = find_labeled_cell(rows, "Type:")
    type_row = rows[type_label[0]] if type_label else []
    correct_label = next(
        (
            (row_index, column_index)
            for row_index, row in enumerate(rows[:8])
            for column_index, value in enumerate(row)
            if isinstance(value, str) and value.strip().casefold() == "% correct:"
        ),
        None,
    )
    correct_row = rows[correct_label[0]] if correct_label else []
    chamber = (
        "Senate"
        if any(header.casefold() == "state" for header in headers[:first_bill_column])
        and not any(header.casefold() == "cd" for header in headers[:first_bill_column])
        else "House"
    )

    bills = []
    for column_index in range(first_bill_column, len(headers)):
        title = headers[column_index]
        period = date_row[column_index] if column_index < len(date_row) else None
        if not title or period is None or period == "":
            continue
        bill_type = (
            clean_text(type_row[column_index])
            if column_index < len(type_row) and type_row[column_index] not in (None, "")
            else ""
        )
        correct = (
            correct_row[column_index]
            if column_index < len(correct_row)
            else None
        )
        header_cell = sheet.cell(row=1, column=column_index + 1)
        bills.append(
            {
                "column": column_index,
                "title": title,
                "date": period,
                "period": clean_text(period),
                "congress": congress_from_period(period, sheet.title),
                "chamber": chamber,
                "type": bill_type,
                "correctPercent": correct,
                "url": safe_http_url(header_cell.hyperlink.target if header_cell.hyperlink else None),
            }
        )

    members = []
    for row in rows[date_row_index + 1 :]:
        if (
            first_name_column >= len(row)
            or last_name_column >= len(row)
            or row[first_name_column] in (None, "")
            or row[last_name_column] in (None, "")
        ):
            continue

        first_name = clean_text(row[first_name_column])
        last_name = clean_text(row[last_name_column])
        full_name = f"{first_name} {last_name}"
        normalized_name = " ".join(full_name.casefold().split())
        person_id = slug(full_name)
        details = {}
        for column_index, header in enumerate(headers[:first_bill_column]):
            if not header or header.casefold() in {"rank", "first name", "last name"}:
                continue
            value = row[column_index] if column_index < len(row) else None
            if value is not None and value != "":
                details[header] = value
        members.append(
            {
                "normalizedName": normalized_name,
                "id": person_id,
                "firstName": first_name,
                "lastName": last_name,
                "name": full_name,
                "details": details,
                "values": row,
            }
        )
    return {"name": sheet.title, "chamber": chamber, "bills": bills, "members": members}


def build_records(workbook):
    people_by_name = {}
    bills_by_key = {}
    used_person_ids = {}
    used_bill_ids = {}
    sheet_data = [sheet_records(sheet) for sheet in workbook.worksheets]
    sheet_data = [sheet for sheet in sheet_data if sheet]

    for sheet in sheet_data:
        member_lookup = {}
        for member in sheet["members"]:
            normalized_name = member["normalizedName"]
            person = people_by_name.get(normalized_name)
            if person is None:
                person_id = member["id"]
                if person_id in used_person_ids and used_person_ids[person_id] != normalized_name:
                    suffix = hashlib.sha1(normalized_name.encode("utf-8")).hexdigest()[:8]
                    person_id = f"{person_id}-{suffix}"
                used_person_ids[person_id] = normalized_name
                person = {
                    "id": person_id,
                    "name": member["name"],
                    "firstName": member["firstName"],
                    "lastName": member["lastName"],
                    "details": {},
                    "congresses": [],
                    "chambers": [],
                    "voteCount": 0,
                    "_sourcePriority": -1,
                    "_normalizedName": normalized_name,
                }
                people_by_name[normalized_name] = person

            source_match = re.search(r"\b(1\d{2})(?:st|nd|rd|th)\b", sheet["name"], re.IGNORECASE)
            source_priority = int(source_match.group(1)) if source_match else 0
            if source_priority >= person["_sourcePriority"]:
                person["details"] = member["details"]
                person["_sourcePriority"] = source_priority
            if sheet["chamber"] not in person["chambers"]:
                person["chambers"].append(sheet["chamber"])
            member_lookup[normalized_name] = (
                person,
                member["values"],
                source_priority,
            )

        for source_bill in sheet["bills"]:
            date_value = source_bill["date"]
            date_text = canonical_date(date_value)
            canonical_key = (
                sheet["chamber"],
                date_text,
                clean_text(source_bill["title"]).casefold(),
            )
            bill = bills_by_key.get(canonical_key)
            if bill is None:
                bill_id = slug(
                    f"{sheet['chamber']}-{date_text}-{source_bill['title']}"
                )
                if bill_id in used_bill_ids and used_bill_ids[bill_id] != canonical_key:
                    suffix = hashlib.sha1(repr(canonical_key).encode("utf-8")).hexdigest()[:8]
                    bill_id = f"{bill_id}-{suffix}"
                used_bill_ids[bill_id] = canonical_key
                bill = {
                    "id": bill_id,
                    "title": clean_text(source_bill["title"]),
                    "date": date_value,
                    "period": source_bill["period"],
                    "congress": source_bill["congress"],
                    "chamber": sheet["chamber"],
                    "type": source_bill["type"],
                    "correctPercent": source_bill["correctPercent"],
                    "url": source_bill["url"],
                    "sourceSheets": [],
                    "responses": {},
                    "_responsePriority": {},
                }
                bills_by_key[canonical_key] = bill
            if sheet["name"] not in bill["sourceSheets"]:
                bill["sourceSheets"].append(sheet["name"])
            if not bill["type"] and source_bill["type"]:
                bill["type"] = source_bill["type"]
            if bill["correctPercent"] is None and source_bill["correctPercent"] is not None:
                bill["correctPercent"] = source_bill["correctPercent"]
            if bill["url"] is None and source_bill["url"]:
                bill["url"] = source_bill["url"]
            if source_bill["congress"] != sheet["name"] and source_bill["congress"].endswith("Congress"):
                bill["congress"] = source_bill["congress"]

            column_index = source_bill["column"]
            for normalized_name, (person, values, source_priority) in member_lookup.items():
                value = values[column_index] if column_index < len(values) else None
                if value in (None, "") or str(value).strip().casefold() == "not elected":
                    continue
                previous_priority = bill["_responsePriority"].get(person["id"], -1)
                if source_priority >= previous_priority:
                    bill["responses"][person["id"]] = value
                    bill["_responsePriority"][person["id"]] = source_priority
                if bill["congress"] not in person["congresses"]:
                    person["congresses"].append(bill["congress"])

    people = []
    for person in people_by_name.values():
        person["voteCount"] = sum(person["id"] in bill["responses"] for bill in bills_by_key.values())
        person["congresses"].sort(key=congress_sort_key, reverse=True)
        person["chambers"].sort()
        person.pop("_sourcePriority")
        person.pop("_normalizedName")
        people.append(person)

    bills = list(bills_by_key.values())
    for bill in bills:
        bill.pop("_responsePriority")
        bill["responseCount"] = len(bill["responses"])
        bill["sourceSheets"].sort()

    people.sort(key=lambda person: (person["name"].casefold(), person["id"]))
    bills.sort(key=bill_sort_key, reverse=True)
    return people, bills


def congress_sort_key(value):
    match = re.search(r"\d+", value)
    return int(match.group()) if match else 0


def bill_sort_key(bill):
    return (
        congress_sort_key(bill["congress"]),
        clean_text(bill["date"]),
        bill["title"].casefold(),
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path, help="Downloaded Google Sheets XLSX export")
    parser.add_argument("output", type=Path, help="Path for generated JSON")
    args = parser.parse_args()

    if not args.workbook.is_file():
        parser.error(f"workbook does not exist: {args.workbook}")

    workbook = load_workbook(args.workbook, data_only=True)
    people, bills = build_records(workbook)
    workbook.close()
    if not people or not bills:
        raise ValueError("The workbook did not contain any lawmaker records or dated bills.")

    data = {
        "updatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "people": people,
        "bills": bills,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n",
        encoding="utf-8",
    )
    response_count = sum(bill["responseCount"] for bill in bills)
    print(f"Wrote {len(people)} lawmakers and {len(bills)} bills ({response_count} responses) to {args.output}")


if __name__ == "__main__":
    main()
