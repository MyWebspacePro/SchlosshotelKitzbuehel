import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = process.env.WORKFLOW_URL || "http://127.0.0.1:3210";
const endpoint = new URL("/api/workspace", base);
let cookie;

async function requestWorkspace(body, expectedStatus = 200) {
  const headers = cookie ? { Cookie: cookie } : {};
  const response = await fetch(endpoint, body
    ? { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : { headers });
  cookie = response.headers.get("set-cookie")?.split(";", 1)[0] ?? cookie;
  const result = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(result.error ?? response.status));
  return result;
}

for (let attempt = 0; attempt < 32; attempt++) {
  try {
    await requestWorkspace();
    break;
  } catch (error) {
    if (attempt === 31) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

let state = await requestWorkspace({ action: "save", kind: "campaign", data: {
  title: "Ablaufprüfung Winter", status: "Aktiv", channel: "Instagram", amount: 100, threshold: 50
} });
const campaign = state.records.find((r) => r.data.title === "Ablaufprüfung Winter");
assert.ok(campaign);
await requestWorkspace({ action: "save", kind: "review", data: {
  title: "Manueller Eintrag", status: "Offen", description: "Test", stars: 4
} }, 400);
state = await requestWorkspace({ action: "save", kind: "review", id: "r2", data: {
  title: "Geänderter Absender", status: "Entwurf", description: "Geänderter Originaltext", channel: "Booking.com", stars: 1, response: "Vielen Dank."
} });
const review = state.records.find((r) => r.id === "r2");
assert.equal(review.data.title, "Michael R.");
assert.equal(review.data.channel, "Google Unternehmensprofil");
assert.equal(review.data.stars, 4);
assert.equal(review.data.response, "Vielen Dank.");
state = await requestWorkspace({ action: "owner-setting", name: "QA Mitarbeiterin", role: "Marketing" });
const owner = state.owners.find((person) => person.name === "QA Mitarbeiterin");
const taskData = { title: "Prüfung Zuständigkeit", status: "Offen", ownerId: owner.id };
await requestWorkspace({ action: "save", kind: "task", data: { ...taskData, ownerId: "falsche-person" } }, 400);
state = await requestWorkspace({ action: "save", kind: "task", data: taskData });
const assigned = state.records.find((r) => r.data.title === taskData.title);
assert.equal(assigned.data.owner, owner.name);
state = await requestWorkspace({ action: "owner-setting", id: owner.id, name: "QA Mitarbeiterin neu", active: false });
assert.equal(state.records.find((r) => r.id === assigned.id).data.owner, "QA Mitarbeiterin neu");
await requestWorkspace({ action: "save", kind: "task", data: taskData }, 400);
await requestWorkspace({ action: "save", kind: "task", id: assigned.id, data: { ...taskData, status: "Erledigt" } });
state = await requestWorkspace({ action: "connection-setting", id: "meta", mode: "import", account: "1234", profileUrl: "https://www.instagram.com/example/" });
assert.equal(state.connections.find((entry) => entry.id === "meta").account, "1234");
await requestWorkspace({ action: "sync", id: "meta" }, 400);
await requestWorkspace({ action: "connection-setting", id: "booking", mode: "live", account: "1234" }, 400);
const metrics = { day: "2026-11-20", channel: "Instagram", visits: 200, starts: 40, bookings: 10, revenue: 1500, cost: 60 };
const unknownChannel = await requestWorkspace({ action: "import", rows: [{ ...metrics, channel: "Gogle Ads" }, metrics] }, 400);
assert.match(unknownChannel.error, /Zeile 2.*Gogle Ads/);
const acceptedMetrics = await requestWorkspace({ action: "import", rows: [{ ...metrics, channel: " instagram " }] });
assert.ok(acceptedMetrics.metrics.some((entry) => entry.day === metrics.day && entry.channel === "Instagram" && entry.revenue === metrics.revenue));
assert.ok(!acceptedMetrics.metrics.some((entry) => entry.channel === "Gogle Ads"));
await requestWorkspace({ action: "import", rows: [{ ...metrics, bookings: 400 }], campaign: campaign.id }, 400);
await requestWorkspace({ action: "import", rows: [metrics], campaign: campaign.id });
state = await requestWorkspace({ action: "import", rows: [metrics], campaign: campaign.id });
assert.equal(state.campaignMetrics.filter((r) => r.campaign === campaign.id).length, 1);
await Promise.all([
  requestWorkspace({ action: "campaign-automation" }),
  requestWorkspace({ action: "campaign-automation" })
]);
state = await requestWorkspace();
assert.equal(state.records.filter((r) => r.kind === "task" && r.data.related === campaign.id).length, 1);
state = await requestWorkspace({ action: "campaign-status", id: campaign.id, status: "Pausiert" });
assert.equal(state.records.find((r) => r.id === campaign.id).data.status, "Pausiert");

const contentData = { title: "Winterzeit", status: "Freigegeben", format: "instagram", campaign: campaign.id,
  slides: [{ id: "1", title: "Winterzeit", text: "", image: "/brand/schlosshotel.webp", layout: "photo" }] };
state = await requestWorkspace({ action: "save", kind: "content", data: contentData, approve: true });
const content = state.records.find((r) => r.kind === "content" && r.data.title === "Winterzeit");
assert.ok(content);
await requestWorkspace({ action: "withdraw-content", id: content.id });
state = await requestWorkspace({ action: "save", kind: "content", id: content.id, data: contentData, approve: true });
assert.deepEqual(state.revisions.filter((r) => r.record === content.id).map((r) => r.status), ["Freigegeben", "Entwurf", "Freigegeben"]);
state = await requestWorkspace({ action: "report", title: "Prüfbericht", from: "2026-11-20", to: "2026-11-20" });
assert.match(state.records.find((r) => r.data.title === "Prüfbericht").data.description, /Ablaufprüfung Winter · Pausiert.*1 freigegebene Inhalte/);
const storedReport = (current, title) => current.records.find((entry) => entry.kind === "report" && entry.data.title === title).data.report;
state = await requestWorkspace({ action: "report", kind: "campaigns", from: "2026-11-20", to: "2026-11-20" });
assert.deepEqual(storedReport(state, "Kampagnenleistung").campaigns.find((r) => r.name === campaign.data.title), {
  name: campaign.data.title, status: "Pausiert", cost: 60, bookings: 10, approved: 1, budget: 100
});
state = await requestWorkspace({ action: "report", kind: "website", from: "2026-11-20", to: "2026-11-20" });
assert.equal(storedReport(state, "Website & Direktbuchungen").daily.length, 1);
assert.equal(storedReport(state, "Website & Direktbuchungen").daily[0].figures.visits, storedReport(state, "Website & Direktbuchungen").totals.visits);
state = await requestWorkspace({ action: "report", kind: "reviews" });
assert.equal(storedReport(state, "Gästebewertungen").reviews.total.count, 3);
assert.equal(storedReport(state, "Gästebewertungen").reviews.total.draft, 1);
assert.equal(storedReport(state, "Gästebewertungen").from, "");
state = await requestWorkspace({ action: "report", kind: "agencies" });
assert.ok(storedReport(state, "Agenturbudgets").agencies.some((row) => row.name === "Performance Marketing" && row.budget === 4800));
const legacyAgency = state.records.find((row) => row.id === "a1");
assert.equal(legacyAgency.data.channel, "Google Ads");
const agencyData = { title: legacyAgency.data.title, status: legacyAgency.data.status, description: legacyAgency.data.description };
state = await requestWorkspace({ action: "save", kind: "agency", id: legacyAgency.id, data: {
  ...agencyData, channels: ["Google Ads", "Newsletter", "Newsletter"]
} });
const updatedAgency = state.records.find((row) => row.id === legacyAgency.id).data;
assert.deepEqual(updatedAgency.channels, ["Google Ads", "Newsletter"]);
assert.equal(updatedAgency.channel, undefined);
assert.equal(updatedAgency.amount, legacyAgency.data.amount);
assert.equal(updatedAgency.actual, legacyAgency.data.actual);
const newAgency = { ...agencyData, title: "Agentur ohne Abrechnung", channels: ["Google Ads"], amount: 1200, actual: "" };
state = await requestWorkspace({ action: "save", kind: "agency", data: newAgency });
const newAgencyId = state.records.find((row) => row.data.title === newAgency.title).id;
assert.equal(state.records.find((row) => row.id === newAgencyId).data.actual, undefined);
state = await requestWorkspace({ action: "save", kind: "agency", id: newAgencyId, data: { ...newAgency, actual: 0 } });
assert.equal(state.records.find((row) => row.id === newAgencyId).data.actual, 0);
await requestWorkspace({ action: "delete", id: newAgencyId });
await requestWorkspace({ action: "save", kind: "agency", id: legacyAgency.id, data: { ...agencyData, channels: ["Unbekannter Kanal"] } }, 400);
await requestWorkspace({ action: "channel-setting", code: "Newsletter", active: false });
await requestWorkspace({ action: "save", kind: "agency", data: { ...agencyData, title: "Neue Agentur", channels: ["Newsletter"] } }, 400);
state = await requestWorkspace({ action: "save", kind: "agency", id: legacyAgency.id, data: { ...agencyData, channels: updatedAgency.channels } });
assert.deepEqual(state.records.find((row) => row.id === legacyAgency.id).data.channels, updatedAgency.channels);
await requestWorkspace({ action: "channel-setting", code: "Newsletter", active: true });
state = await requestWorkspace({ action: "report", kind: "agencies", title: "Budgetprüfung mit mehreren Kanälen" });
assert.deepEqual(storedReport(state, "Budgetprüfung mit mehreren Kanälen").agencies, storedReport(state, "Agenturbudgets").agencies);

const agencyImport = { id: "ag-pruefung", title: "Agentur aus Datei", owner: "Marketing", description: "Test", amount: "1400", actual: "620" };
state = await requestWorkspace({ action: "import", dataset: "agency", rows: [{ ...agencyImport, channel: "Google Ads | Newsletter" }] });
const agencyImportId = state.records.find((row) => row.data.title === agencyImport.title).id;
state = await requestWorkspace({ action: "import", dataset: "agency", rows: [{ ...agencyImport, channel: "Website | Instagram" }] });
assert.deepEqual(state.records.filter((row) => row.data.title === agencyImport.title).map((row) => [row.id, row.data.channels]), [[agencyImportId, ["Website", "Instagram"]]]);
await requestWorkspace({ action: "import", dataset: "agency", rows: [{ ...agencyImport, channel: "Website" }, { ...agencyImport, channel: "Instagram" }] }, 400);
await requestWorkspace({ action: "report", kind: "falsch" }, 400);
await requestWorkspace({ action: "report", kind: "website", from: "2026-11-20", to: "2026-11-19" }, 400);
await requestWorkspace({ action: "save", kind: "campaign", id: campaign.id, data: {
  ...campaign.data, status: "Pausiert", start: "2026-11-21"
} });
state = await requestWorkspace({ action: "report", title: "Zeitraumprüfung", from: "2026-11-20", to: "2026-11-20" });
assert.ok(!state.records.find((r) => r.data.title === "Zeitraumprüfung").data.report.campaigns.some((r) => r.name === campaign.data.title));

const offer = { id: "o1", source: "HNS", title: "Winterauszeit", start: "2026-12-18", due: "2026-12-20",
  room: "Doppelzimmer", occupancy: 2, tariff: "Frühstück", expected: 590, observed: 590, availability: "ja", observedAvailability: "nein" };
const newOffer = { ...offer, id: "aufgaben-pruefung", title: "Angebot für Aufgabenprüfung" };
state = await requestWorkspace({ action: "import", dataset: "offers", rows: [newOffer] });
const taskOfferId = state.records.find((r) => r.kind === "offer" && r.data.title === newOffer.title).id;
const relatedTasks = (workspace) => workspace.records.filter((r) => r.kind === "task" && r.data.related === taskOfferId);
assert.equal(relatedTasks(state).length, 0);
state = await requestWorkspace({ action: "check", id: taskOfferId });
const [checkTask] = relatedTasks(state);
assert.equal(checkTask?.data.status, "Offen");
assert.match(checkTask.data.title, /Angebot für Aufgabenprüfung/);
state = await requestWorkspace({ action: "check", id: taskOfferId });
assert.deepEqual(relatedTasks(state).map((task) => task.id), [checkTask.id]);
await requestWorkspace({ action: "save", kind: "task", id: checkTask.id, data: { ...checkTask.data, status: "Erledigt" } });
state = await requestWorkspace({ action: "check", id: taskOfferId });
assert.deepEqual(relatedTasks(state).map((task) => [task.id, task.data.status]), [[checkTask.id, "Offen"]]);
await requestWorkspace({ action: "delete", id: taskOfferId });
await requestWorkspace({ action: "import", dataset: "offers", rows: [offer] });
state = await requestWorkspace({ action: "check", id: "o1" });
assert.equal(state.records.find((r) => r.id === "o1").data.status, "Abweichung");
const checksForOffer = (workspace) => workspace.records.filter((r) => r.kind === "check" && r.data.related === "o1");
const firstCheck = checksForOffer(state)[0];
const offerTime = state.records.find((r) => r.id === "o1").updated_at;
await new Promise((resolve) => setTimeout(resolve, 20));
await Promise.all([requestWorkspace({ action: "check", id: "o1" }), requestWorkspace({ action: "check", id: "o1" })]);
state = await requestWorkspace();
assert.deepEqual(checksForOffer(state).map((r) => r.id), [firstCheck.id]);
assert.ok(Date.parse(checksForOffer(state)[0].updated_at) > Date.parse(firstCheck.updated_at));
assert.equal(state.records.find((r) => r.id === "o1").updated_at, offerTime);
await requestWorkspace({ action: "import", dataset: "offers", rows: [{ ...offer, observedAvailability: "ja" }] });
state = await requestWorkspace({ action: "check", id: "o1" });
assert.equal(state.records.find((r) => r.id === "o1").data.status, "Geprüft");
assert.deepEqual(checksForOffer(state).map((r) => r.data.status), ["OK", "Abweichung"]);
await requestWorkspace({ action: "save", kind: "offer", id: "o1", data: {
  title: offer.title, status: "Zu prüfen", expected: "590.15", observed: "", availability: "ja", observedAvailability: ""
} });
state = await requestWorkspace({ action: "check", id: "o1" });
assert.equal(state.records.find((r) => r.id === "o1").data.status, "Zu prüfen");
assert.equal(state.records.find((r) => r.id === "o1").data.observed, undefined);
assert.match(state.records.find((r) => r.kind === "check" && r.data.related === "o1").data.description, /590,15.*ohne Preis/);

const uploaded = await fetch(new URL("/api/media", base), {
  method: "POST", headers: { Cookie: cookie, "Content-Type": "image/webp", "X-Media-Name": "Pruefbild.webp" },
  body: await readFile(new URL("../public/brand/spa.webp", import.meta.url))
});
assert.equal(uploaded.status, 201);
const image = await uploaded.json();
const imageUrl = new URL(image.file, base);
const removeImage = () => fetch(imageUrl, { method: "DELETE", headers: { Cookie: cookie } });
assert.equal((await fetch(imageUrl, { method: "DELETE" })).status, 404);
await requestWorkspace({ action: "save", kind: "offer", id: "o1", data: {
  title: offer.title, status: "Zu prüfen", image: image.file
} });
await requestWorkspace({ action: "save", kind: "content", id: content.id, data: {
  ...contentData, related: "o1", slides: contentData.slides.map((slide) => ({ ...slide, image: image.file }))
}, approve: true });
state = await requestWorkspace({ action: "save", kind: "content", data: {
  title: "Prüfung Newsletterbild", status: "Entwurf", description: "Testnachricht", format: "newsletter",
  newsletter: { subject: "Test", preheader: "", cta: "", url: "", image: image.file }
} });
const newsletter = state.records.find((r) => r.data.title === "Prüfung Newsletterbild");
const blocked = await removeImage();
assert.equal(blocked.status, 409);
assert.match((await blocked.json()).error, /Prüfung Newsletterbild.*Winterauszeit.*Winterzeit/);
state = await requestWorkspace({ action: "delete", id: "o1" });
assert.ok(!state.records.some((r) => r.id === "o1"));
assert.equal(state.records.find((r) => r.id === content.id).data.related, undefined);
assert.equal(state.records.find((r) => r.id === "ca1").data.related, undefined);
assert.ok(state.records.some((r) => r.kind === "check" && r.data.title === offer.title));
state = await requestWorkspace({ action: "sync", id: "hns" });
assert.ok(!state.records.some((r) => r.id === "o1"));
await requestWorkspace({ action: "save", kind: "content", id: content.id, data: { ...contentData, related: "o1" }, approve: true }, 400);
await requestWorkspace({ action: "save", kind: "content", id: content.id, data: contentData, approve: true });
assert.equal((await removeImage()).status, 409);
await requestWorkspace({ action: "delete", id: newsletter.id });
assert.equal((await removeImage()).status, 204);
assert.equal((await fetch(imageUrl, { headers: { Cookie: cookie } })).status, 404);
await requestWorkspace({ action: "save", kind: "offer", data: { title: "Gelöschtes Foto", status: "Zu prüfen", image: image.file } }, 400);

await requestWorkspace({ action: "delete", id: campaign.id });
state = await requestWorkspace();
assert.ok(!state.records.some((r) => r.id === campaign.id));
assert.ok(!state.campaignMetrics.some((r) => r.campaign === campaign.id));
assert.equal(state.records.find((r) => r.id === content.id).data.campaign, undefined);
const other = await (await fetch(endpoint)).json();
assert.ok(!other.records.some((r) => r.id === content.id));
console.log("Kampagnen-, Freigabe-, Import-, Prüf-, Lösch- und Isolationsablauf bestanden");
