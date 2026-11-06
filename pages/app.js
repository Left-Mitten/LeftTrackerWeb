"use strict";

const page = document.body.dataset.page;
const pageSize = 30;
const dataUrl = new URL("data.json", window.location.href);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(href, className, text) {
  const node = element("a", className, text);
  node.href = href;
  return node;
}

function billSourceLink(url, label = "Open original bill ↗") {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const source = link(url, "external-bill-link", label);
  source.target = "_blank";
  source.rel = "noopener noreferrer";
  return source;
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return `${Math.round(number * 100)}%`;
}

function formatDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(parsed);
}

function personUrl(personId) {
  return `person.html?${new URLSearchParams({ id: personId })}`;
}

function billUrl(billId) {
  return `bill.html?${new URLSearchParams({ id: billId })}`;
}

function getScore(person) {
  const entries = Object.entries(person.details || {}).filter(
    ([name, value]) => name.toLocaleLowerCase().includes("score") && Number.isFinite(Number(value))
  );
  const scoreEntry = entries.find(
    ([name]) => name.toLocaleLowerCase().includes("left") && name.toLocaleLowerCase().includes("total")
  ) || entries.find(
    ([name]) => name.toLocaleLowerCase().includes("total")
  );
  return scoreEntry ? { name: scoreEntry[0], value: Number(scoreEntry[1]) } : null;
}

function billDateSortKey(value) {
  const text = String(value ?? "");
  const date = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (date) return `2-${date[1]}-${date[2]}-${date[3]}`;
  const year = text.match(/\b(1\d{3}|20\d{2})\b/);
  return year ? `1-${year[1]}` : "0";
}

function createOrderButtons(container, options, selected, onChange) {
  container.replaceChildren();
  let selectedValue = selected;
  const buttons = [];
  for (const [value, label] of options) {
    const button = element("button", "order-button", label);
    button.type = "button";
    button.setAttribute("aria-pressed", String(value === selectedValue));
    button.addEventListener("click", () => {
      if (value === selectedValue) return;
      selectedValue = value;
      for (const [buttonValue, control] of buttons) {
        control.setAttribute("aria-pressed", String(buttonValue === selectedValue));
      }
      onChange(value);
    });
    container.append(button);
    buttons.push([value, button]);
  }
}

function detailEntries(person) {
  const excluded = new Set(["Rank", "First Name", "Last Name"]);
  return Object.entries(person.details || {}).filter(
    ([name]) => !excluded.has(name) && !name.toLocaleLowerCase().includes("created by")
  );
}

function displayPersonMeta(person) {
  const entries = detailEntries(person);
  const labels = ["CD", "State", "District", "Type"];
  return entries.filter(([name]) => labels.some((label) => name.toLocaleLowerCase() === label.toLocaleLowerCase()))
    .map(([name, value]) => `${name}: ${value}`);
}

function statusClass(value) {
  const status = String(value).toLocaleLowerCase();
  if (status.includes("sponsor")) return "status status-sponsor";
  if (status.startsWith("yes")) return "status status-yes";
  if (status.startsWith("no")) return "status status-no";
  return "status";
}

function createStatus(value) {
  return element("span", statusClass(value), String(value));
}

function createMeta(items) {
  const meta = element("div", "meta-line");
  for (const item of items.filter(Boolean)) {
    meta.append(element("span", "", item));
  }
  return meta;
}

function metricCard(value, label) {
  const card = element("div", "metric-card");
  card.append(element("strong", "", value), element("span", "", label));
  return card;
}

function sectionHeading(title, description) {
  const heading = element("div", "section-heading");
  heading.append(element("h2", "", title), element("p", "", description));
  return heading;
}

function showError(container, message) {
  container.replaceChildren(element("p", "message error", message));
}

function initHome(data) {
  const peopleTab = document.querySelector("#people-tab");
  const billsTab = document.querySelector("#bills-tab");
  const search = document.querySelector("#directory-search");
  const congressFilter = document.querySelector("#congress-filter");
  const summary = document.querySelector("#directory-summary");
  const orderControls = document.querySelector("#directory-order");
  const list = document.querySelector("#directory-list");
  const navigation = document.querySelector("#directory-navigation");
  let activeKind = "people";
  let activeSort = "score";
  let currentPage = 0;

  const congresses = [...new Set(data.bills.map((bill) => bill.congress))]
    .sort((a, b) => congressSortValue(b) - congressSortValue(a));
  const latestCongress = congresses[0] || "";
  for (const congress of congresses) {
    const option = element("option", "", congress);
    option.value = congress;
    congressFilter.append(option);
  }
  const allOption = element("option", "", "All Congresses");
  allOption.value = "all";
  congressFilter.append(allOption);
  congressFilter.value = latestCongress;

  document.querySelector("#member-total").textContent = data.people.length.toLocaleString();
  document.querySelector("#bill-total").textContent = data.bills.length.toLocaleString();
  document.querySelector("#vote-total").textContent = data.bills
    .reduce((total, bill) => total + bill.responseCount, 0).toLocaleString();

  const updated = new Date(data.updatedAt);
  if (!Number.isNaN(updated.getTime())) {
    document.querySelector("#updated-at").textContent = `Updated ${formatDate(data.updatedAt)}`;
  }

  function filteredRecords() {
    const query = search.value.trim().toLocaleLowerCase();
    const selectedCongress = congressFilter.value;
    if (activeKind === "people") {
      const people = data.people.filter((person) => {
        const inCongress = selectedCongress === "all" || person.congresses.includes(selectedCongress);
        const matches = !query ||
          person.name.toLocaleLowerCase().includes(query) ||
          detailEntries(person).some(([key, value]) => `${key} ${value}`.toLocaleLowerCase().includes(query));
        return inCongress && matches;
      });
      return people.sort((a, b) => activeSort === "name"
        ? a.name.localeCompare(b.name)
        : (getScore(b)?.value ?? -1) - (getScore(a)?.value ?? -1) || a.name.localeCompare(b.name));
    }
    const bills = data.bills.filter((bill) => {
      const inCongress = selectedCongress === "all" || bill.congress === selectedCongress;
      const matches = !query ||
        `${bill.title} ${bill.chamber} ${bill.type} ${bill.congress}`
          .toLocaleLowerCase().includes(query);
      return inCongress && matches;
    });
    return bills.sort((a, b) => {
      if (activeSort === "title") return a.title.localeCompare(b.title);
      if (activeSort === "responses") return b.responseCount - a.responseCount || a.title.localeCompare(b.title);
      return billDateSortKey(b.date).localeCompare(billDateSortKey(a.date)) ||
        congressSortValue(b.congress) - congressSortValue(a.congress) ||
        a.title.localeCompare(b.title);
    });
  }

  function createPersonCard(person) {
    const card = element("article", "record-card");
    const main = element("div", "record-main");
    main.append(link(personUrl(person.id), "record-title", person.name));
    main.append(createMeta(displayPersonMeta(person)));
    const score = getScore(person);
    const metric = element("div", "record-metric");
    if (score) {
      metric.append(element("strong", "", formatPercent(score.value)));
      metric.append(element("span", "", "left score"));
    } else {
      metric.append(element("strong", "", person.voteCount.toLocaleString()));
      metric.append(element("span", "", "recorded responses"));
    }
    card.append(main, metric);
    return card;
  }

  function createBillCard(bill) {
    const card = element("article", "record-card");
    const main = element("div", "record-main");
    main.append(link(billUrl(bill.id), "record-title", bill.title));
    main.append(createMeta([
      bill.congress,
      bill.chamber,
      bill.type,
      formatDate(bill.date),
    ]));
    const metric = element("div", "record-metric");
    metric.append(element("strong", "", bill.responseCount.toLocaleString()));
    metric.append(element("span", "", "responses"));
    const actions = element("div", "record-actions");
    const sourceLink = billSourceLink(bill.url, "Source ↗");
    if (sourceLink) actions.append(sourceLink);
    actions.append(metric);
    card.append(main, actions);
    return card;
  }

  function render() {
    createOrderButtons(
      orderControls,
      activeKind === "people"
        ? [["score", "Left score ↓"], ["name", "Name A–Z"]]
        : [["newest", "Newest"], ["responses", "Most responses"], ["title", "Title A–Z"]],
      activeSort,
      (sort) => {
        activeSort = sort;
        currentPage = 0;
        render();
      }
    );
    const records = filteredRecords();
    const pageCount = Math.max(1, Math.ceil(records.length / pageSize));
    currentPage = Math.min(currentPage, pageCount - 1);
    const start = currentPage * pageSize;
    const visible = records.slice(start, start + pageSize);
    summary.textContent = `${records.length.toLocaleString()} ${activeKind === "people" ? "people" : "bills and resolutions"}`;

    if (visible.length === 0) {
      list.replaceChildren(element("p", "message", "No records match those filters."));
    } else {
      list.replaceChildren(...visible.map(activeKind === "people" ? createPersonCard : createBillCard));
    }

    navigation.hidden = pageCount <= 1;
    if (pageCount > 1) {
      const previous = element("button", "", "Previous");
      previous.type = "button";
      previous.disabled = currentPage === 0;
      previous.addEventListener("click", () => {
        currentPage -= 1;
        render();
      });
      const label = element("span", "", `Page ${currentPage + 1} of ${pageCount}`);
      const next = element("button", "", "Next");
      next.type = "button";
      next.disabled = currentPage === pageCount - 1;
      next.addEventListener("click", () => {
        currentPage += 1;
        render();
      });
      navigation.replaceChildren(previous, label, next);
    } else {
      navigation.replaceChildren();
    }
  }

  function switchKind(kind) {
    activeKind = kind;
    activeSort = kind === "people" ? "score" : "newest";
    currentPage = 0;
    const isPeople = kind === "people";
    peopleTab.setAttribute("aria-selected", String(isPeople));
    billsTab.setAttribute("aria-selected", String(!isPeople));
    list.setAttribute("aria-labelledby", isPeople ? "people-tab" : "bills-tab");
    search.placeholder = isPeople ? "Search by name, district, or state…" : "Search by bill, issue, or type…";
    render();
  }

  peopleTab.addEventListener("click", () => switchKind("people"));
  billsTab.addEventListener("click", () => switchKind("bills"));
  search.addEventListener("input", () => {
    currentPage = 0;
    render();
  });
  congressFilter.addEventListener("change", () => {
    currentPage = 0;
    render();
  });
  search.disabled = false;
  congressFilter.disabled = false;
  render();
}

function congressSortValue(value) {
  const match = String(value).match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function renderPagination(container, currentPage, pageCount, onChange) {
  container.hidden = pageCount <= 1;
  if (pageCount <= 1) {
    container.replaceChildren();
    return;
  }
  const previous = element("button", "", "Previous");
  previous.type = "button";
  previous.disabled = currentPage === 0;
  previous.addEventListener("click", () => onChange(currentPage - 1));
  const label = element("span", "", `Page ${currentPage + 1} of ${pageCount}`);
  const next = element("button", "", "Next");
  next.type = "button";
  next.disabled = currentPage === pageCount - 1;
  next.addEventListener("click", () => onChange(currentPage + 1));
  container.replaceChildren(previous, label, next);
}

function initPerson(data) {
  const container = document.querySelector("#detail-view");
  const personId = new URLSearchParams(window.location.search).get("id");
  const person = data.people.find((record) => record.id === personId);
  if (!person) {
    showError(container, "We couldn’t find that lawmaker. They may no longer be in the latest spreadsheet.");
    return;
  }

  document.title = `${person.name} | Congressional Democrat Left Tracker`;
  const bills = data.bills.filter((bill) => Object.hasOwn(bill.responses, person.id));
  const heading = element("section", "detail-heading");
  heading.append(element("p", "eyebrow", "Lawmaker record"));
  heading.append(element("h1", "detail-title", person.name));
  heading.append(createMeta([
    ...displayPersonMeta(person),
    ...person.chambers,
    ...person.congresses,
  ]));

  const scores = detailEntries(person).filter(
    ([name, value]) => name.toLocaleLowerCase().includes("score") && Number.isFinite(Number(value))
  );
  const summary = element("section", "detail-summary");
  summary.append(metricCard(bills.length.toLocaleString(), "recorded responses"));
  summary.append(metricCard(person.congresses.length.toLocaleString(), "Congresses"));
  for (const [name, value] of scores.slice(0, 4)) {
    const number = Number(value);
    summary.append(metricCard(
      number >= 0 && number <= 1 ? formatPercent(number) : String(value),
      name
    ));
  }

  const history = element("section", "detail-section");
  history.append(sectionHeading("Bill and vote history", "Every recorded vote and sponsorship response for this lawmaker, with links to each bill."));
  if (bills.length === 0) {
    history.append(element("p", "message", "No bill responses are recorded for this lawmaker."));
  } else {
    let currentPage = 0;
    const controls = element("div", "detail-controls");
    const orderControls = element("div", "order-controls");
    const search = element("input", "detail-search");
    search.type = "search";
    search.placeholder = "Search bills and issues…";
    search.setAttribute("aria-label", "Search this lawmaker’s voting history");
    const count = element("p", "directory-summary");
    controls.append(orderControls, search, count);
    const rows = element("div", "detail-list");
    const navigation = element("div", "table-navigation");
    history.append(controls, rows, navigation);
    let activeSort = "newest";
    createOrderButtons(orderControls, [["newest", "Newest"], ["title", "Bill A–Z"]], activeSort, (sort) => {
      activeSort = sort;
      currentPage = 0;
      renderHistory();
    });

    function renderHistory() {
      const query = search.value.trim().toLocaleLowerCase();
      const filtered = bills.filter((bill) =>
        `${bill.title} ${bill.congress} ${bill.chamber} ${bill.type} ${bill.responses[person.id]}`
          .toLocaleLowerCase().includes(query)
      );
      filtered.sort((a, b) => activeSort === "title"
        ? a.title.localeCompare(b.title)
        : billDateSortKey(b.date).localeCompare(billDateSortKey(a.date)) ||
          congressSortValue(b.congress) - congressSortValue(a.congress) ||
          a.title.localeCompare(b.title));
      const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
      currentPage = Math.min(currentPage, pageCount - 1);
      const start = currentPage * pageSize;
      const visible = filtered.slice(start, start + pageSize);
      count.textContent = filtered.length === 0
        ? "0 recorded responses"
        : `${(start + 1).toLocaleString()}–${(start + visible.length).toLocaleString()} of ${filtered.length.toLocaleString()} recorded responses`;
      if (visible.length === 0) {
        rows.replaceChildren(element("p", "message", "No bills match that search."));
      } else {
        rows.replaceChildren(...visible.map((bill) => {
          const row = element("article", "detail-row");
          const main = element("div", "record-main");
          main.append(link(billUrl(bill.id), "record-title", bill.title));
          main.append(createMeta([bill.congress, bill.chamber, bill.type, formatDate(bill.date)]));
          const actions = element("div", "record-actions");
          const sourceLink = billSourceLink(bill.url, "Source ↗");
          if (sourceLink) actions.append(sourceLink);
          actions.append(createStatus(bill.responses[person.id]));
          row.append(main, actions);
          return row;
        }));
      }
      renderPagination(navigation, currentPage, pageCount, (nextPage) => {
        currentPage = nextPage;
        renderHistory();
      });
    }
    search.addEventListener("input", () => {
      currentPage = 0;
      renderHistory();
    });
    renderHistory();
  }

  container.replaceChildren(heading, summary, history);
}

function initBill(data) {
  const container = document.querySelector("#detail-view");
  const billId = new URLSearchParams(window.location.search).get("id");
  const bill = data.bills.find((record) => record.id === billId);
  if (!bill) {
    showError(container, "We couldn’t find that bill in the latest spreadsheet.");
    return;
  }

  document.title = `${bill.title} | Congressional Democrat Left Tracker`;
  const responses = Object.entries(bill.responses)
    .map(([personId, value]) => ({ person: data.people.find((record) => record.id === personId), value }))
    .filter((record) => record.person)
    .sort((a, b) => a.person.name.localeCompare(b.person.name));

  const heading = element("section", "detail-heading");
  heading.append(element("p", "eyebrow", `${bill.chamber} · ${bill.congress}`));
  heading.append(element("h1", "detail-title", bill.title));
  const billDate = /^\d{4}-\d{2}-\d{2}/.test(String(bill.date)) ? formatDate(bill.date) : "";
  heading.append(createMeta([bill.type, billDate, bill.period && `Period: ${bill.period}`]));
  const sourceLink = billSourceLink(bill.url);
  if (sourceLink) heading.append(sourceLink);
  if (typeof bill.correctPercent === "number") {
    heading.append(element("p", "data-note", `${formatPercent(bill.correctPercent)} of recorded responses matched the spreadsheet’s “correct” label.`));
  }

  const responseTally = new Map();
  for (const value of Object.values(bill.responses)) {
    const status = String(value).trim();
    const lowerStatus = status.toLocaleLowerCase();
    const category = lowerStatus.startsWith("yes")
      ? "Yes"
      : lowerStatus.startsWith("no")
        ? "No"
        : lowerStatus.includes("sponsor")
          ? lowerStatus.startsWith("not") ? "Not sponsoring" : "Sponsor"
          : status;
    responseTally.set(category, (responseTally.get(category) || 0) + 1);
  }
  const summary = element("section", "detail-summary");
  for (const [status, count] of [...responseTally].sort(([a], [b]) => a.localeCompare(b))) {
    summary.append(metricCard(count.toLocaleString(), status));
  }

  const searchSection = element("section", "detail-section");
  searchSection.append(sectionHeading("Who responded", "Select a lawmaker to see their full record."));
  const controls = element("div", "detail-controls");
  const search = element("input", "detail-search");
  search.type = "search";
  search.placeholder = "Find a lawmaker…";
  search.setAttribute("aria-label", "Find a lawmaker");
  const count = element("p", "directory-summary");
  const orderControls = element("div", "order-controls");
  controls.append(orderControls, search, count);
  const list = element("div", "detail-list");
  const navigation = element("div", "table-navigation");
  searchSection.append(controls, list, navigation);
  let currentPage = 0;
  let activeSort = "name";
  createOrderButtons(orderControls, [["name", "Name A–Z"], ["score", "Left score ↓"]], activeSort, (sort) => {
    activeSort = sort;
    currentPage = 0;
    renderResponses();
  });

  function renderResponses() {
    const query = search.value.trim().toLocaleLowerCase();
    const filtered = responses.filter(({ person }) => person.name.toLocaleLowerCase().includes(query));
    filtered.sort((a, b) => activeSort === "score"
      ? (getScore(b.person)?.value ?? -1) - (getScore(a.person)?.value ?? -1) ||
        a.person.name.localeCompare(b.person.name)
      : a.person.name.localeCompare(b.person.name));
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    currentPage = Math.min(currentPage, pageCount - 1);
    const start = currentPage * pageSize;
    const visible = filtered.slice(start, start + pageSize);
    count.textContent = filtered.length === 0
      ? "0 recorded responses"
      : `${(start + 1).toLocaleString()}–${(start + visible.length).toLocaleString()} of ${filtered.length.toLocaleString()} recorded responses`;
    if (visible.length === 0) {
      list.replaceChildren(element("p", "message", "No lawmakers match that search."));
    } else {
      list.replaceChildren(...visible.map(({ person, value }) => {
        const row = element("article", "detail-row");
        const main = element("div", "record-main");
        main.append(link(personUrl(person.id), "record-title", person.name));
        main.append(createMeta(displayPersonMeta(person)));
        const actions = element("div", "record-actions");
        const sourceLink = billSourceLink(bill.url, "Source ↗");
        if (sourceLink) actions.append(sourceLink);
        actions.append(createStatus(value));
        row.append(main, actions);
        return row;
      }));
    }
    renderPagination(navigation, currentPage, pageCount, (nextPage) => {
      currentPage = nextPage;
      renderResponses();
    });
  }
  search.addEventListener("input", () => {
    currentPage = 0;
    renderResponses();
  });
  renderResponses();
  container.replaceChildren(heading, summary, searchSection);
}

fetch(dataUrl)
  .then((response) => {
    if (!response.ok) throw new Error(`Could not load the latest records (HTTP ${response.status}).`);
    return response.json();
  })
  .then((data) => {
    if (!Array.isArray(data.people) || !Array.isArray(data.bills)) {
      throw new Error("The generated data is missing people or bill records.");
    }
    if (page === "person") initPerson(data);
    else if (page === "bill") initBill(data);
    else initHome(data);
  })
  .catch((error) => {
    const container = page === "home"
      ? document.querySelector("#directory-list")
      : document.querySelector("#detail-view");
    showError(container, `${error.message} Please try again later.`);
  });
