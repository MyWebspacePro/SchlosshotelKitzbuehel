import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const base = process.env.WORKFLOW_URL || "http://127.0.0.1:3210";
const unique = randomUUID().slice(0, 12);
const admin = "qa-admin-" + unique;
const member = "qa-team-" + unique;
const adminPassword = "Testpasswort-admin-" + randomUUID();
const memberPassword = "Testpasswort-team-" + randomUUID();
const newPassword = "Neues-Testpasswort-" + randomUUID();

function client() {
  const cookies = new Map();
  return {
    cookies,
    async send(path, { method = "GET", body, headers = {} } = {}, expected = 200) {
      const response = await fetch(new URL(path, base), {
        method, body,
        headers: { Cookie: [...cookies].map(([name,value]) => name + "=" + value).join("; "), ...headers }
      });
      for (const header of response.headers.getSetCookie()) {
        const first = header.split(";", 1)[0];
        const at = first.indexOf("=");
        const key = first.slice(0, at);
        const value = first.slice(at + 1);
        if (value) cookies.set(key, value); else cookies.delete(key);
        assert.match(header, /HttpOnly/i);
        if (new URL(base).protocol === "https:") assert.match(header, /Secure/i);
      }
      const content = response.headers.get("content-type")?.includes("application/json") ? await response.json() : undefined;
      assert.equal(response.status, expected, JSON.stringify(content?.error ?? response.status));
      return content;
    }
  };
}
function post(browser, path, data, expected = 200) {
  return browser.send(path, { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }, expected);
}
const root = client();
const worker = client();
const outsider = client();
const preAuth = client();

const first = await root.send("/api/workspace");
assert.equal(first.identity.role, "guest");
await post(client(), "/api/workspace", { action: "report" }, 401);
const unknownGuest = client();
unknownGuest.cookies.set("schlosshotel_workspace", randomUUID());
await unknownGuest.send("/api/workspace", {}, 401);
preAuth.cookies.set("schlosshotel_workspace", root.cookies.get("schlosshotel_workspace"));
const uniqueTask = "Geschützter Eintrag " + unique;
await post(root, "/api/workspace", { action: "save", kind: "task", data: { title: uniqueTask, status: "Offen" } });
const report = await post(root, "/api/workspace", { action: "report", kind: "overview", title: "Geschützter Bericht " + unique });
const pdf = "/api/reports/" + report.records.find((record) => record.kind === "report").id + "/pdf";
const originHeaders = { Origin: "https://external.example" };
await root.send("/api/workspace", { method: "POST", body: '{"action":"report"}', headers: { ...originHeaders, "Content-Type": "application/json" } }, 403);
await root.send("/api/media", { method: "POST", body: "Ungültig", headers: { "Content-Type": "image/webp" } }, 400);
await root.send("/api/media", { method: "POST", body: Buffer.alloc(1_800_001), headers: { "Content-Type": "image/webp" } }, 413);
await root.send("/api/media", { method: "POST", body: "Ungültig", headers: { ...originHeaders, "Content-Type": "image/webp" } }, 403);
const file = await root.send("/api/media", {
  method: "POST", body: await readFile(new URL("../public/brand/spa.webp", import.meta.url)),
  headers: { "Content-Type": "image/webp", "X-Media-Name": "konto-pruefung.webp" }
}, 201);
await root.send(file.file, { method: "DELETE", headers: originHeaders }, 403);

await post(root, "/api/auth", { action: "account", owner: "team-marketing", username: admin, password: adminPassword });
const protectedData = await root.send("/api/workspace");
assert.equal(protectedData.identity.role, "admin");
assert.ok(protectedData.records.some((record) => record.data.title === uniqueTask));
assert.deepEqual(protectedData.accounts, [{ owner: "team-marketing", username: admin, admin: true }]);
await preAuth.send("/api/workspace", {}, 401);
await preAuth.send(pdf, {}, 404);
await preAuth.send(file.file, {}, 404);
await preAuth.send(file.file, { method: "DELETE" }, 404);
const rootCookie = [...root.cookies].map(([name, value]) => name + "=" + value).join("; ");
const pdfBytes = await fetch(new URL(pdf, base), { headers: { Cookie: rootCookie } });
assert.equal(pdfBytes.status, 200);
assert.match(pdfBytes.headers.get("content-type"), /application\/pdf/);
assert.equal(Buffer.from(await pdfBytes.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
const imageBytes = await fetch(new URL(file.file, base), { headers: { Cookie: rootCookie } });
assert.equal(imageBytes.status, 200);
assert.match(imageBytes.headers.get("content-type"), /image\/webp/);
assert.deepEqual(Buffer.from(await imageBytes.arrayBuffer()), await readFile(new URL("../public/brand/spa.webp", import.meta.url)));

await post(root, "/api/auth", { action: "account", owner: "team-content", username: member, password: memberPassword });
await post(worker, "/api/auth", { action: "login", username: member.toUpperCase(), password: memberPassword });
const shared = await worker.send("/api/workspace");
assert.equal(shared.identity.role, "member");
assert.equal(shared.accounts.length, 0);
assert.ok(shared.records.some((record) => record.data.title === uniqueTask));
await worker.send(pdf);
await worker.send(file.file);
await post(worker, "/api/auth", { action: "account", owner: "team-tech", username: member + "-2", password: memberPassword }, 403);
await post(worker, "/api/workspace", { action: "owner-setting", id: "team-tech", active: false }, 403);
await post(worker, "/api/workspace", { action: "connection-setting", id: "google", mode: "off" }, 403);
await root.send("/api/auth", { method: "POST", body: '{"action":"logout"}', headers: { "Content-Type": "application/json", Origin: "https://external.example" } }, 403);

const isolated = await outsider.send("/api/workspace");
assert.equal(isolated.identity.role, "guest");
assert.ok(!isolated.records.some((record) => record.data.title === uniqueTask));
await outsider.send(pdf, {}, 404);

await post(root, "/api/auth", { action: "account", owner: "team-content", username: member, password: newPassword });
await worker.send("/api/workspace", {}, 401);
await post(worker, "/api/auth", { action: "login", username: member, password: memberPassword }, 401);
await post(worker, "/api/auth", { action: "login", username: member, password: newPassword });
const replay = client();
for (const [name, value] of worker.cookies) replay.cookies.set(name, value);
await post(worker, "/api/auth", { action: "logout" });
await replay.send("/api/workspace", {}, 401);
await post(worker, "/api/auth", { action: "login", username: member, password: newPassword });
await post(root, "/api/workspace", { action: "owner-setting", id: "team-content", active: false });
await worker.send("/api/workspace", {}, 401);
await post(worker, "/api/auth", { action: "login", username: member, password: newPassword }, 401);
await post(root, "/api/workspace", { action: "owner-setting", id: "team-marketing", active: false }, 400);
await post(root, "/api/auth", { action: "logout" });
await root.send("/api/workspace", {}, 401);
await post(root, "/api/auth", { action: "guest" });
assert.equal((await root.send("/api/workspace")).identity.role, "guest");
console.log("Teamkonten, getrennte Rollen, gemeinsamer Bestand, Medien-/PDF-Schutz, Passwortwechsel, Abmelden und Deaktivierung geprüft.");
