import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Pool, type QueryResultRow } from "pg";
import { agencyChannels, availabilityLabel, brandImages, campaignRowsFor, channelCode, channels, connectionCategories, defaultChannelOptions, isCustomConnection, latestOfferChecks, offerComparison, ownerRoleOptions, priceEuro, sum, euro, type CampaignMetric, type ChannelOption, type ContentRevision, type Connection, type Data, type Kind, type MediaImage, type Metric, type OwnerOption, type RecordItem, type Schedule, type SlideCrop, type Workspace } from "./model";
import { connectors, examples, feed } from "./seed";
import { checkWebsite } from "./website-check";
import { createReportSnapshot, reportDescription, reportKinds, type ReportKind } from "./report";
import { importFields, type Dataset } from "./import-fields";
import { connectorTag, importProvider, liveAvailable, validProviderAccount } from "./providers";

type Query = <T extends QueryResultRow>(sql: string, args?: unknown[]) => Promise<{ rows: T[] }>;
type Database = { query: Query; migrate: (sql: string) => Promise<unknown>; transaction: <T>(work: (query: Query) => Promise<T>) => Promise<T> };
const cached = globalThis as typeof globalThis & { hotelDatabase?: Promise<Database>; hotelSchemas?: Map<string, Promise<Database>>; hotelSchemaUpdate?: Promise<Database>; hotelMediaMigration?: Promise<unknown>; hotelChannelMigration?: Promise<unknown>; hotelScheduler?: ReturnType<typeof setInterval> };
const schema = `
  CREATE TABLE IF NOT EXISTS hotel_workspace (id uuid PRIMARY KEY, ready boolean NOT NULL DEFAULT false, created_at timestamptz DEFAULT now());
  CREATE TABLE IF NOT EXISTS hotel_record (
    workspace uuid NOT NULL, id text NOT NULL, kind text NOT NULL, data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (workspace, id)
  );
  CREATE TABLE IF NOT EXISTS hotel_metric (
    workspace uuid NOT NULL, day text NOT NULL, channel text NOT NULL,
    visits int NOT NULL, starts int NOT NULL, bookings int NOT NULL, revenue float8 NOT NULL, cost float8 NOT NULL,
    PRIMARY KEY (workspace, day, channel)
  );
  CREATE TABLE IF NOT EXISTS hotel_connection (
    workspace uuid NOT NULL, id text NOT NULL, name text NOT NULL, category text NOT NULL,
    last_sync timestamptz, PRIMARY KEY (workspace, id)
  );
  ALTER TABLE hotel_connection ADD COLUMN IF NOT EXISTS last_result text;
  ALTER TABLE hotel_connection ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'example';
  ALTER TABLE hotel_connection ADD COLUMN IF NOT EXISTS account text NOT NULL DEFAULT '';
  ALTER TABLE hotel_connection ADD COLUMN IF NOT EXISTS profile_url text NOT NULL DEFAULT '';
  CREATE TABLE IF NOT EXISTS hotel_owner (
    workspace uuid NOT NULL, id text NOT NULL, name text NOT NULL, name_key text NOT NULL, role text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true,
    PRIMARY KEY (workspace,id), UNIQUE (workspace,name_key)
  );
  INSERT INTO hotel_owner (workspace,id,name,name_key,role)
    SELECT hotel_workspace.id, member.id, member.name, lower(member.name), member.role FROM hotel_workspace
      CROSS JOIN (VALUES ('team-marketing','Anna Berger','Digital Marketing'),('team-content','Lena Steiner','Content & Redaktion'),('team-tech','Martin Hofer','Website & Technik')) AS member(id,name,role)
    ON CONFLICT DO NOTHING;
  CREATE TABLE IF NOT EXISTS hotel_account (
    workspace uuid NOT NULL, owner text NOT NULL, username text NOT NULL UNIQUE, password_hash text NOT NULL, admin boolean NOT NULL DEFAULT false,
    PRIMARY KEY (workspace,owner), FOREIGN KEY (workspace,owner) REFERENCES hotel_owner (workspace,id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS hotel_session (
    token_hash text PRIMARY KEY, workspace uuid NOT NULL, owner text NOT NULL, expires_at timestamptz NOT NULL,
    FOREIGN KEY (workspace,owner) REFERENCES hotel_account (workspace,owner) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS hotel_session_account ON hotel_session (workspace,owner);
  CREATE TABLE IF NOT EXISTS hotel_auth_limit (bucket text PRIMARY KEY, expires_at timestamptz NOT NULL, attempts int NOT NULL);
  CREATE TABLE IF NOT EXISTS hotel_schedule (
    workspace uuid NOT NULL, action text NOT NULL, hours int NOT NULL,
    next_at timestamptz NOT NULL, last_status text,
    PRIMARY KEY (workspace, action)
  );
  ALTER TABLE hotel_schedule ADD COLUMN IF NOT EXISTS lease_until timestamptz;
  CREATE TABLE IF NOT EXISTS hotel_media (
    workspace uuid NOT NULL, id uuid NOT NULL, content bytea NOT NULL,
    PRIMARY KEY (workspace, id)
  );
  CREATE TABLE IF NOT EXISTS hotel_campaign_metric (
    workspace uuid NOT NULL, campaign text NOT NULL, day text NOT NULL, channel text NOT NULL,
    visits int NOT NULL, starts int NOT NULL, bookings int NOT NULL, revenue float8 NOT NULL, cost float8 NOT NULL,
    PRIMARY KEY (workspace,campaign,day), FOREIGN KEY (workspace,campaign) REFERENCES hotel_record (workspace,id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS hotel_content_revision (
    id uuid PRIMARY KEY, workspace uuid NOT NULL, record text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (workspace,record) REFERENCES hotel_record (workspace,id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS hotel_deleted_record (
    workspace uuid NOT NULL, id text NOT NULL, PRIMARY KEY (workspace,id)
  );
`;

async function open(): Promise<Database> {
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    return {
      query: (sql, args) => pool.query(sql, args),
      migrate: (sql) => pool.query(sql),
      transaction: async (work) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await work((sql, args) => client.query(sql, args));
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally { client.release(); }
      }
    };
  }
  await mkdir(resolve(".data"), { recursive: true });
  const local = await PGlite.create(resolve(".data/postgres"));
  return {
    query: (sql, args) => local.query(sql, args),
    migrate: (sql) => local.exec(sql),
    transaction: (work) => local.transaction((tx) => work((sql, args) => tx.query(sql, args)))
  };
}
export function database(): Promise<Database> {
  // Next.js keeps the connection alive across development reloads. Apply any new
  // schema before the updated code uses it, without reopening the PGlite files.
  const schemas = cached.hotelSchemas ??= new Map<string, Promise<Database>>();
  const ready = schemas.get(schema);
  if (ready) return ready;

  const previous = cached.hotelSchemaUpdate;
  const migration = (async () => {
    await previous?.catch(() => {});
    cached.hotelDatabase ??= open().catch((error) => { cached.hotelDatabase = undefined; throw error; });
    const db = await cached.hotelDatabase;
    await db.migrate(schema);
    return db;
  })();
  schemas.set(schema, migration);
  cached.hotelSchemaUpdate = migration;
  void migration.catch(() => { schemas.delete(schema); });
  return migration;
}

export function workspaceTransaction<T>(db: Database, workspace: string, work: (query: Query) => Promise<T>) {
  return db.transaction(async (query) => {
    await query("SELECT id FROM hotel_workspace WHERE id=$1 FOR UPDATE", [workspace]);
    return work(query);
  });
}

function ensureMediaMetadata(query: Query) {
  cached.hotelMediaMigration ??= query(`ALTER TABLE hotel_media
    ADD COLUMN IF NOT EXISTS filename text NOT NULL DEFAULT 'Hochgeladenes Bild',
    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()`)
    .catch((error) => { cached.hotelMediaMigration = undefined; throw error; });
  return cached.hotelMediaMigration;
}

function ensureChannelOptions(query: Query) {
  cached.hotelChannelMigration ??= query(`CREATE TABLE IF NOT EXISTS hotel_channel_option (
    workspace uuid NOT NULL, code text NOT NULL, name_key text NOT NULL, label text NOT NULL, active boolean NOT NULL DEFAULT true,
    PRIMARY KEY (workspace,code), UNIQUE (workspace,name_key)
  )`).catch((error) => { cached.hotelChannelMigration = undefined; throw error; });
  return cached.hotelChannelMigration;
}

async function getChannelOptions(query: Query, workspace: string): Promise<ChannelOption[]> {
  const list = () => query<ChannelOption>("SELECT code,label,active FROM hotel_channel_option WHERE workspace=$1 ORDER BY label", [workspace]);
  const existing = await list();
  if (existing.rows.length) return existing.rows;
  const prior = await query<{ code: string }>(`SELECT channel AS code FROM hotel_metric WHERE workspace=$1
    UNION SELECT data->>'channel' FROM hotel_record WHERE workspace=$1 AND kind IN ('campaign','task','agency') AND COALESCE(data->>'channel','')<>''`, [workspace]);
  const seen = new Set<string>();
  const seed = [...defaultChannelOptions, ...prior.rows.map((row) => row.code)].flatMap((code) => {
    const name_key = code.trim().toLowerCase();
    if (!name_key || seen.has(name_key)) return [];
    seen.add(name_key);
    return [{ code, name_key }];
  });
  await query(`INSERT INTO hotel_channel_option (workspace,code,name_key,label)
    SELECT $1,code,name_key,code FROM jsonb_to_recordset($2::jsonb) AS row(code text,name_key text) ON CONFLICT DO NOTHING`, [workspace, JSON.stringify(seed)]);
  return (await list()).rows;
}

async function writeMetrics(query: Query, workspace: string, metrics: Metric[], init = false) {
  await query(`
    INSERT INTO hotel_metric SELECT $1, day, channel, visits, starts, bookings, revenue, cost
    FROM jsonb_to_recordset($2::jsonb) AS r(day text, channel text, visits int, starts int, bookings int, revenue float8, cost float8)
    ON CONFLICT (workspace, day, channel) DO ${init ? "NOTHING" : "UPDATE SET visits=excluded.visits, starts=excluded.starts, bookings=excluded.bookings, revenue=excluded.revenue, cost=excluded.cost"}
  `, [workspace, JSON.stringify(metrics)]);
}

async function writeCampaignMetrics(query: Query, workspace: string, campaign: RecordItem, metrics: Metric[]) {
  await query(`INSERT INTO hotel_campaign_metric
    SELECT $1,$2,day,channel,visits,starts,bookings,revenue,cost FROM jsonb_to_recordset($3::jsonb)
    AS r(day text, channel text, visits int, starts int, bookings int, revenue float8, cost float8)
    ON CONFLICT (workspace,campaign,day) DO UPDATE SET channel=excluded.channel,visits=excluded.visits,
      starts=excluded.starts,bookings=excluded.bookings,revenue=excluded.revenue,cost=excluded.cost`,
    [workspace, campaign.id, JSON.stringify(metrics)]);
}

async function initialize(query: Query, workspace: string) {
  const existing = await query<{ ready: boolean }>("SELECT ready FROM hotel_workspace WHERE id=$1", [workspace]);
  if (existing.rows[0]?.ready) return;
  await query("INSERT INTO hotel_workspace (id) VALUES ($1) ON CONFLICT DO NOTHING", [workspace]);
  await Promise.all([
    writeMetrics(query, workspace, channels.flatMap(feed), true),
    query(`INSERT INTO hotel_record (workspace,id,kind,data)
      SELECT $1,id,kind,data FROM jsonb_to_recordset($2::jsonb) AS r(id text, kind text, data jsonb) ON CONFLICT DO NOTHING`,
      [workspace, JSON.stringify(examples.map(([id, kind, data]) => ({ id, kind, data })))]),
    query(`INSERT INTO hotel_connection (workspace,id,name,category)
      SELECT $1,id,name,category FROM jsonb_to_recordset($2::jsonb)
      AS r(id text, name text, category text) ON CONFLICT DO NOTHING`,
      [workspace, JSON.stringify(connectors.map(([id, name, category]) => ({ id, name, category })))]),
    query(`INSERT INTO hotel_owner (workspace,id,name,name_key,role) VALUES
      ($1,'team-marketing','Anna Berger','anna berger','Digital Marketing'),($1,'team-content','Lena Steiner','lena steiner','Content & Redaktion'),($1,'team-tech','Martin Hofer','martin hofer','Website & Technik') ON CONFLICT DO NOTHING`, [workspace])
  ]);
  const seedCampaigns = examples.filter(([, kind, data]) => kind === "campaign" && data.status === "Aktiv" && channels.includes(data.channel ?? ""));
  for (const [campaignId, kind, data] of seedCampaigns) {
    const rows = feed(data.channel!).map(({ day, channel, ...counts }) => ({ day, channel,
      visits: Math.floor(counts.visits * .65), starts: Math.floor(counts.starts * .65), bookings: Math.floor(counts.bookings * .65),
      revenue: Math.floor(counts.revenue * .65), cost: Math.floor(counts.cost * .65) }));
    await writeCampaignMetrics(query, workspace, { id: campaignId, kind, data, updated_at: "" }, rows);
  }
  await query("UPDATE hotel_workspace SET ready=true WHERE id=$1", [workspace]);
}

export async function getWorkspace(id: string): Promise<Workspace> {
  const { query } = await database();
  await prepareWorkspace(query, id);
  return readWorkspace(query, id);
}

async function prepareWorkspace(query: Query, id: string) {
  await initialize(query, id);
  await Promise.all([ensureMediaMetadata(query), ensureChannelOptions(query)]);
}

async function readWorkspace(query: Query, id: string): Promise<Workspace> {
  const [records, metrics, campaignMetrics, revisions, connections, schedules, media, channelOptions, owners] = await Promise.all([
    query<RecordItem>("SELECT id,kind,data,to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_at FROM hotel_record WHERE workspace=$1 ORDER BY hotel_record.updated_at DESC,id", [id]),
    query<Metric>("SELECT day,channel,visits,starts,bookings,revenue,cost FROM hotel_metric WHERE workspace=$1 ORDER BY day,channel", [id]),
    query<CampaignMetric>("SELECT campaign,day,channel,visits,starts,bookings,revenue,cost FROM hotel_campaign_metric WHERE workspace=$1 ORDER BY day,campaign", [id]),
    query<ContentRevision>("SELECT record,data->>'title' AS title,data->>'status' AS status,created_at FROM hotel_content_revision WHERE workspace=$1 ORDER BY created_at DESC", [id]),
    query<Connection>("SELECT id,name,category,last_sync,last_result,mode,account,profile_url FROM hotel_connection WHERE workspace=$1 ORDER BY category,name", [id]),
    query<Schedule>("SELECT action,hours,next_at,last_status FROM hotel_schedule WHERE workspace=$1 ORDER BY action", [id]),
    query<MediaImage>("SELECT '/api/media/' || id::text AS file,filename AS label FROM hotel_media WHERE workspace=$1 ORDER BY created_at,id", [id]),
    getChannelOptions(query, id),
    query<OwnerOption>("SELECT id,name,role,active FROM hotel_owner WHERE workspace=$1 ORDER BY name", [id])
  ]);
  const tag = connectorTag(id);
  return { records: records.rows, metrics: metrics.rows, campaignMetrics: campaignMetrics.rows, revisions: revisions.rows, connections: connections.rows.map((connection) => ({ ...connection, liveAvailable: liveAvailable(tag, connection.id) })), schedules: schedules.rows, media: media.rows, channelOptions, owners: owners.rows, connectorTag: tag, ai: Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) };
}

const statuses: Record<Kind, string[]> = {
  task: ["Offen", "In Arbeit", "Erledigt"], campaign: ["Geplant", "Aktiv", "Pausiert", "Abgeschlossen"],
  offer: ["Zu prüfen", "Geprüft", "Abweichung"], content: ["Entwurf", "Zur Freigabe", "Freigegeben"],
  review: ["Offen", "Entwurf", "Freigegeben"], agency: ["Aktiv", "Abgeschlossen"],
  report: ["Erstellt"], check: ["OK", "Abweichung"], sitecheck: ["OK", "Abweichung"], system: ["Offen", "In Arbeit", "Erledigt"], automation: ["Erstellt"], import: ["Erstellt"],
  guide: ["Entwurf", "Bereit"], solution: ["Zur Prüfung", "Freigegeben", "Verworfen"], brand: ["Aktiv"], profile: ["Zu prüfen", "Geprüft", "Abweichung"]
};
export const editable = ["task", "campaign", "offer", "content", "review", "agency", "system", "guide", "solution", "brand", "profile"];
export class InputError extends Error {}

export async function saveMedia(workspace: string, bytes: Buffer, filename: string): Promise<MediaImage> {
  if (bytes.length > 1_800_000 || bytes.length < 16 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
    throw new InputError("Das aufbereitete Bild ist ungültig oder zu groß.");
  }
  const { query } = await database();
  await ensureMediaMetadata(query);
  const id = randomUUID();
  const label = filename.split(/[\\/]/).at(-1)?.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120) || "Hochgeladenes Bild";
  const result = await query<MediaImage>(`INSERT INTO hotel_media (workspace,id,content,filename)
    SELECT $1,$2,decode($3,'base64'),$4 WHERE EXISTS (SELECT 1 FROM hotel_workspace WHERE id=$1 AND ready)
    RETURNING '/api/media/' || id::text AS file,filename AS label`, [workspace, id, bytes.toString("base64"), label]);
  if (!result.rows.length) throw new InputError("Bitte lade den Arbeitsbereich neu.");
  return result.rows[0];
}

export async function getReportRecord(workspace: string, id: string) {
  const { query } = await database();
  const result = await query<RecordItem>("SELECT id,kind,data,updated_at FROM hotel_record WHERE workspace=$1 AND id=$2 AND kind='report'", [workspace, id]);
  return result.rows[0];
}

export async function getMedia(workspace: string, id: string) {
  const { query } = await database();
  const result = await query<{ content: string }>("SELECT encode(content,'base64') AS content FROM hotel_media WHERE workspace=$1 AND id=$2", [workspace, id]);
  return result.rows[0]?.content;
}

export async function deleteMedia(workspace: string, id: string) {
  const db = await database();
  return workspaceTransaction(db, workspace, async (query) => {
    const file = "/api/media/" + id;
    const references = await query<{ title: string }>(`SELECT data->>'title' AS title FROM hotel_record
      WHERE workspace=$1 AND (data->>'image'=$2 OR data#>>'{newsletter,image}'=$2 OR data#>>'{websiteCard,image}'=$2
        OR data->'slides' @> jsonb_build_array(jsonb_build_object('image',$2::text)))
      ORDER BY title LIMIT 4`, [workspace, file]);
    if (references.rows.length) return { usedBy: references.rows.map((row) => row.title) };
    const removed = await query("DELETE FROM hotel_media WHERE workspace=$1 AND id=$2 RETURNING id", [workspace, id]);
    return removed.rows.length ? "deleted" : "missing";
  });
}

function text(value: unknown, label: string, maximum = 2400) {
  if (typeof value !== "string" || value.trim().length > maximum) throw new InputError(label + " ist ungültig.");
  return value.trim();
}
function amount(value: unknown, label: string, integer = false) {
  if (value === "" || value === null || value === undefined) throw new InputError(label + " fehlt.");
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 1e9 || (integer && !Number.isInteger(result))) throw new InputError(label + " ist ungültig.");
  return result;
}

function slideCrop(crop: SlideCrop | undefined) {
  if (crop === undefined) return undefined;
  const zoom = amount(crop?.zoom, "Zoom", true);
  const x = amount(crop?.x, "Horizontale Bildposition", true);
  const y = amount(crop?.y, "Vertikale Bildposition", true);
  if (zoom < 100 || zoom > 250 || x > 100 || y > 100) throw new InputError("Der Bildausschnitt liegt außerhalb des gültigen Bereichs.");
  return { zoom, x, y };
}
function date(value: unknown) {
  const day = text(value, "Datum", 10);
  const parsed = new Date(day + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) throw new InputError("Das Datum ist ungültig.");
  return day;
}
async function imagePath(query: Query, workspace: string, value: unknown) {
  const path = text(value ?? "", "Bild", 100);
  if (!path || brandImages.some((image) => image.file === path)) return path;
  const match = /^\/api\/media\/([a-f0-9-]{36})$/.exec(path);
  if (!match || !(await query("SELECT 1 FROM hotel_media WHERE workspace=$1 AND id::text=$2", [workspace, match[1]])).rows.length) throw new InputError("Dieses Bild ist im Arbeitsbereich nicht verfügbar.");
  return path;
}
async function save(query: Query, id: string, record: string, kind: Kind, data: Data) {
  const updated = await query<{ id: string }>(`INSERT INTO hotel_record (workspace,id,kind,data) VALUES ($1,$2,$3,$4::jsonb)
    ON CONFLICT (workspace,id) DO UPDATE SET data=excluded.data, updated_at=now() WHERE hotel_record.kind=excluded.kind RETURNING id`,
    [id, record, kind, JSON.stringify(data)]);
  if (!updated.rows.length) throw new InputError("Dieser Eintrag gehört zu einem anderen Arbeitsbereich.");
}

async function revise(query: Query, workspace: string, item: RecordItem, data: Data) {
  const result = await query<{ id: string }>(`WITH updated AS (
    UPDATE hotel_record SET data=$3::jsonb,updated_at=now() WHERE workspace=$1 AND id=$2 AND data=$5::jsonb RETURNING id,kind,data
  ), revision AS (
    INSERT INTO hotel_content_revision (id,workspace,record,data) SELECT $4,$1,id,data FROM updated WHERE kind='content'
  ) SELECT id FROM updated`, [workspace, item.id, JSON.stringify(data), randomUUID(), JSON.stringify(item.data)]);
  if (!result.rows.length) throw new InputError("Der Eintrag hat sich inzwischen geändert. Lade den Arbeitsbereich neu.");
}

async function runCampaignRules(query: Query, workspace: string, state: Workspace, runId?: string) {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna", dateStyle: "short" }).format(new Date());
  const notes: string[] = [];
  for (const campaign of state.records.filter((r) => r.kind === "campaign")) {
    const { title, status, start, amount: budget, threshold, briefLead, owner, ownerId } = campaign.data;
    const metrics = campaignRowsFor(state.campaignMetrics, campaign);
    const cost = sum(metrics).cost;
    const lead = start ? Math.ceil((Date.parse(start) - Date.parse(today)) / 86_400_000) : -1;
    const budgetAlert = status === "Aktiv" && Boolean(budget && threshold && metrics.length && cost >= budget * threshold / 100);
    const brief = status === "Geplant" && Boolean(briefLead && lead >= 0 && lead <= briefLead);
    if (!budgetAlert && !brief) continue;
    const label = budgetAlert ? "Budget prüfen" : "Content-Briefing vorbereiten";
    const detail = budgetAlert ? euro(cost) + " Ist-Kosten bei " + euro(budget!) + " Budget · Meldeschwelle " + threshold + " %" : "Geplanter Start am " + start;
    const data: Data = { title: label + " · " + title, status: "Offen", description: detail, channel: "Kampagnen", owner, ownerId, related: campaign.id };
    const result = await query<{ id: string }>(`INSERT INTO hotel_record (workspace,id,kind,data)
      SELECT $1,$2,'task',$3::jsonb FROM hotel_record WHERE workspace=$1 AND id=$4 AND data->>'status'=$5
      ON CONFLICT DO NOTHING RETURNING id`, [workspace, (budgetAlert ? "budget-" : "brief-") + campaign.id, JSON.stringify(data), campaign.id, status]);
    notes.push(title + " · " + detail + (result.rows.length ? " · Aufgabe erstellt" : " · Kein neuer Auftrag"));
  }
  await save(query, workspace, runId ?? randomUUID(), "automation", { title: "Kampagnenregeln geprüft", status: "Erstellt", description: notes.join("\n") || "Keine Kampagne löste eine Regel aus." });
}

function available(value: unknown) {
  const choice = text(value, "Verfügbarkeit", 5).toLowerCase();
  if (choice === "ja" || choice === "true" || choice === "1") return true;
  if (choice === "nein" || choice === "false" || choice === "0") return false;
  throw new InputError("Für Verfügbarkeit bitte Ja oder Nein verwenden.");
}

function agencyChannelCodes(values: unknown, options: ChannelOption[]) {
  if (!Array.isArray(values)) throw new InputError("Die Kanäle müssen als Liste angegeben werden.");
  const codes = values.map((value) => {
    const code = channelCode(text(value, "Kanal", 100), options);
    if (!code) throw new InputError("Ein Kanalname fehlt.");
    return code;
  });
  return [...new Set(codes)];
}

const importRecordId = (...parts: string[]) => "import-" + createHash("sha256").update(JSON.stringify(parts)).digest("hex");

async function importRecords(query: Query, workspace: string, dataset: Exclude<Dataset, "metrics">, rows: unknown[], state: Workspace) {
  const kind = ({ offers: "offer", reviews: "review", agency: "agency" } as const)[dataset];
  const records = state.records.filter((entry) => entry.kind === kind);
  const byId = new Map(records.map((entry) => [entry.id, entry]));
  const importSources = new Map(state.connections.filter((entry) => !isCustomConnection(entry.id) || entry.mode === "import")
    .map((entry) => [entry.name, entry.category]));
  const legacyOrigins = dataset === "agency" ? [...new Set(["", ...state.channelOptions.flatMap(({ code, label }) => [code, label]),
    ...records.flatMap((entry) => entry.data.channel ? [entry.data.channel] : [])])] : [];
  const seen = new Set<string>();
  const prepared = rows.map((value, index) => {
    if (!value || typeof value !== "object") throw new InputError("Ungültige Zeile " + (index + 2) + ".");
    const row = value as Record<string, unknown>;
    try {
      const reference = text(row.id, "Referenz", 100);
      const title = text(row.title, "Titel", 120);
      if (!reference || !title) throw new InputError("Referenz und Titel sind Pflichtfelder.");
      const origin = text(row.source ?? row.channel ?? "", dataset === "agency" ? "Kanäle" : "Quelle", dataset === "agency" ? 8000 : 100);
      let existing = byId.get(reference);
      const derivedId = dataset === "agency" ? importRecordId(dataset, reference) : importRecordId(dataset, origin, reference);
      existing ??= byId.get(derivedId);
      if (!existing && dataset === "agency") {
        existing = records.find((entry) => entry.data.importReference === reference);
        if (!existing) {
          // Older agency imports included the channel in their identifier.
          const matches = [...new Set([origin, ...legacyOrigins])].flatMap((previousOrigin) => {
            const match = byId.get(importRecordId(dataset, previousOrigin, reference));
            return match && !match.data.importReference ? [match] : [];
          });
          if (matches.length > 1) throw new InputError("Mehrere bestehende Agentureinträge verwenden diese Referenz. Verwende eine eindeutige Referenz pro Agentur.");
          existing = matches[0];
        }
      }
      const id = existing?.id ?? derivedId;
      if (seen.has(id) || dataset === "agency" && seen.has("ref:" + reference)) throw new InputError("Diese Referenz erscheint mehrfach.");
      seen.add(id);
      if (dataset === "agency") seen.add("ref:" + reference);
      const base = existing?.data;
      const data: Data = { ...base, title, description: base?.description ?? "", status: base?.status ?? "Offen" };
      if (dataset === "offers") {
        if (!["Hotelsystem", "Buchungsdaten", "Raten", "Website"].includes(importSources.get(origin) ?? "")) throw new InputError("Wähle eine für den Angebotsimport verfügbare Quelle.");
        const start = date(row.start);
        const due = date(row.due);
        const occupancy = amount(row.occupancy, "Belegung", true);
        const room = text(row.room, "Zimmer", 100);
        const tariff = text(row.tariff, "Tarif", 100);
        if (start >= due || !occupancy || !room || !tariff) throw new InputError("Prüfe Reisezeitraum, Zimmer, Belegung und Tarif.");
        const fields = { source: origin, start, due, occupancy, room, tariff, expected: amount(row.expected, "Websitepreis"), observed: amount(row.observed, "Quellpreis"), availability: available(row.availability), observedAvailability: available(row.observedAvailability) };
        Object.assign(data, fields);
        if (!base || Object.entries(fields).some(([key, field]) => base[key as keyof Data] !== field)) data.status = "Zu prüfen";
      } else if (dataset === "reviews") {
        if (importSources.get(origin) !== "Bewertungen") throw new InputError("Wähle ein für den Import verfügbares Bewertungsportal.");
        data.channel = origin;
        data.source = "Dateiimport";
        data.description = text(row.description, "Bewertung");
        data.stars = amount(row.stars, "Sterne", true);
        if (data.stars < 1 || data.stars > 5 || !data.description) throw new InputError("Bewertungstext und 1 bis 5 Sterne sind erforderlich.");
        if (base && (base.description !== data.description || base.stars !== data.stars)) data.status = base.response ? "Entwurf" : "Offen";
      } else {
        const singleCode = channelCode(origin, state.channelOptions);
        const exact = state.channelOptions.some((option) => option.code === singleCode);
        const values = row.channels !== undefined ? row.channels : exact ? [origin] : origin.split("|").map((part) => part.trim()).filter(Boolean);
        data.channels = agencyChannelCodes(values, state.channelOptions);
        delete data.channel;
        data.importReference = base?.importReference ?? (reference === existing?.id ? undefined : reference);
        data.owner = text(row.owner, "Zuständigkeit", 120);
        data.amount = amount(row.amount, "Soll-Kosten");
        if (row.actual === "") delete data.actual;
        else if (row.actual !== undefined) data.actual = amount(row.actual, "Ist-Kosten");
        data.description = text(row.description, "Leistungsbeschreibung");
        data.status = base?.status ?? "Aktiv";
      }
      return { id, kind, data };
    } catch (error) {
      if (error instanceof InputError) throw new InputError("Zeile " + (index + 2) + " · " + error.message);
      throw error;
    }
  });
  await query(`INSERT INTO hotel_record (workspace,id,kind,data)
    SELECT $1,id,kind,data FROM jsonb_to_recordset($2::jsonb) AS row(id text,kind text,data jsonb)
    ON CONFLICT (workspace,id) DO UPDATE SET data=excluded.data,updated_at=now()
    WHERE hotel_record.kind=excluded.kind AND hotel_record.data IS DISTINCT FROM excluded.data`, [workspace, JSON.stringify(prepared)]);
}

async function generateText(instructions: string, input: unknown) {
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { Authorization: "Bearer " + process.env.OPENAI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL, messages: [
          { role: "system", content: instructions }, { role: "user", content: JSON.stringify(input) }
        ]
      }), signal: AbortSignal.timeout(25000)
    });
  } catch { throw new InputError("Der KI-Dienst ist momentan nicht erreichbar. Bitte erneut versuchen."); }
  if (!response.ok) throw new InputError("Der KI-Dienst konnte die Anfrage nicht verarbeiten. Prüfe die Modellkonfiguration oder versuche es erneut.");
  const result = await response.json();
  const body = result.choices?.[0]?.message?.content;
  if (typeof body !== "string" || !body.trim()) throw new InputError("Der KI-Dienst hat keinen Text geliefert.");
  return body.trim().slice(0, 2400);
}

async function generateCopy(state: Workspace, item: RecordItem): Promise<{ body: string; source: string }> {
  const offer = state.records.find((r) => r.kind === "offer" && r.id === item.data.related);
  const brand = state.records.find((r) => r.kind === "brand")?.data;
  const facts = offer ? { title: offer.data.title, description: offer.data.description, price: offer.data.expected } : null;
  if (state.ai) {
    const body = await generateText("Erstelle einen kurzen Entwurf für das Schlosshotel Kitzbühel in der angegebenen Sprache, standardmäßig Deutsch. Höflich, zurückhaltend, klar. Nutze nur bereitgestellte Fakten. Bei Bewertungen danke und greife das Feedback auf. Keine Preise oder Leistungen erfinden. Gib nur den Entwurf aus.",
      { format: item.kind === "review" ? "Bewertungsantwort" : item.data.channel, title: item.kind === "review" ? undefined : item.data.title, notes: item.data.description, offer: facts,
        brand: brand ? { name: brand.title, tone: brand.tone, facts: brand.description, language: brand.language } : undefined });
    return { body, source: "OpenAI" };
  }
  if (item.kind === "review") return { body: item.data.stars && item.data.stars < 5
    ? "Herzlichen Dank für Ihre Rückmeldung zu Ihrem Aufenthalt im Schlosshotel Kitzbühel. Wir schätzen Ihren Hinweis und geben ihn an das zuständige Team weiter. Wir freuen uns, wenn wir Sie wieder begrüßen dürfen."
    : "Vielen Dank für Ihre schöne Rückmeldung. Es freut uns sehr, dass Sie Ihre Auszeit im Schlosshotel Kitzbühel genossen haben. Wir freuen uns auf ein Wiedersehen in Kitzbühel.",
    source: "Textvorlage" };
  return { body: [item.data.title, facts?.description || item.data.description,
    facts?.price === undefined ? "" : "Angebotspreis " + euro(facts.price) + ".",
    "Entdecken Sie Ihre Auszeit im Schlosshotel Kitzbühel."].filter(Boolean).join("\n\n"), source: "Textvorlage" };
}

export async function perform(id: string, body: Record<string, unknown>, runId?: string) {
  const db = await database();
  await prepareWorkspace(db.query, id);
  // Serialize edits that can create or remove references to records or uploads.
  if (["save", "delete", "import", "sync", "check", "campaign-automation", "profile-check", "owner-setting", "connection-setting", "channel-setting"].includes(String(body.action))) {
    await workspaceTransaction(db, id, (query) => performAction(query, id, body, runId));
  } else await performAction(db.query, id, body, runId);
  return readWorkspace(db.query, id);
}

export async function saveOwner(query: Query, id: string, body: Record<string, unknown>, existingOwners?: OwnerOption[]) {
  const owners = existingOwners ?? (await query<OwnerOption>("SELECT id,name,role,active FROM hotel_owner WHERE workspace=$1", [id])).rows;
  const owner = owners.find((person) => person.id === body.id);
  if (body.id !== undefined && !owner) throw new InputError("Diese Person wurde nicht gefunden.");
  const name = text(body.name ?? owner?.name, "Name", 120).replace(/\s+/g, " ");
  const role = text(body.role ?? owner?.role ?? "", "Rolle", 100);
  if (!name) throw new InputError("Gib den Namen der Person ein.");
  if (role && !ownerRoleOptions(owners).includes(role)) throw new InputError("Wähle eine Rolle aus der Liste.");
  if (owners.some((person) => person.id !== owner?.id && person.name.toLowerCase() === name.toLowerCase())) throw new InputError("Diese Person ist bereits eingetragen.");
  if (body.active !== undefined && typeof body.active !== "boolean") throw new InputError("Der Personenstatus ist ungültig.");
  if (owner) {
    if (body.active === false) {
      const admin = await query("SELECT 1 FROM hotel_account WHERE workspace=$1 AND owner=$2 AND admin", [id, owner.id]);
      if (admin.rows.length) throw new InputError("Das Administratorkonto kann hier nicht deaktiviert werden.");
      await query("DELETE FROM hotel_session WHERE workspace=$1 AND owner=$2", [id, owner.id]);
    }
    await query("UPDATE hotel_owner SET name=$3,name_key=lower($3),role=$4,active=$5 WHERE workspace=$1 AND id=$2", [id, owner.id, name, role, body.active ?? owner.active]);
    if (name !== owner.name) await query(`UPDATE hotel_record SET data=jsonb_set(data,'{owner}',to_jsonb($3::text)),updated_at=now()
      WHERE workspace=$1 AND data->>'ownerId'=$2`, [id, owner.id, name]);
    return owner.id;
  }
  const ownerId = randomUUID();
  await query("INSERT INTO hotel_owner (workspace,id,name,name_key,role) VALUES ($1,$2,$3,lower($3),$4)", [id, ownerId, name, role]);
  return ownerId;
}

async function performAction(query: Query, id: string, body: Record<string, unknown>, runId?: string) {
  const state = await readWorkspace(query, id);
  const item = state.records.find((r) => r.id === body.id);
  if (body.action === "owner-setting") {
    if (body.id === undefined) throw new InputError("Neue Personen benötigen ein Benutzerkonto.");
    await saveOwner(query, id, body, state.owners);
  } else if (body.action === "connection-setting") {
    const connection = state.connections.find((entry) => entry.id === body.id);
    if (body.id !== undefined && !connection) throw new InputError("Diese Verbindung wurde nicht gefunden.");
    const mode = body.mode;
    if (mode !== "example" && mode !== "import" && mode !== "live" && mode !== "off") throw new InputError("Wähle eine gültige Datenquelle.");
    const account = text(body.account ?? "", "Konto-ID", 180);
    const url = text(body.profileUrl ?? "", "Profiladresse", 500);
    if (url && (!URL.canParse(url) || new URL(url).protocol !== "https:")) throw new InputError("Die Profiladresse muss HTTPS verwenden.");
    if ((!connection || isCustomConnection(connection.id)) && mode !== "import" && mode !== "off") {
      throw new InputError("Eigene Dienste unterstützen Dateiimport oder können deaktiviert werden.");
    }
    if (!connection) {
      const name = text(body.name, "Dienstname", 100).replace(/\s+/g, " ");
      const category = text(body.category, "Kategorie", 80);
      if (!name || !connectionCategories.includes(category)) throw new InputError("Gib einen Dienstnamen ein und wähle eine Kategorie.");
      if (state.connections.some((entry) => entry.name.toLowerCase() === name.toLowerCase())) throw new InputError("Ein Dienst mit diesem Namen ist bereits vorhanden.");
      await query("INSERT INTO hotel_connection (workspace,id,name,category,mode,account,profile_url) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [id, "custom-" + randomUUID(), name, category, mode, account, url]);
      return;
    }
    if (mode === "live" && (!connection.liveAvailable || !validProviderAccount(connection.id, account))) throw new InputError("Für den Live-Modus sind eine API-Freigabe und eine gültige Konto-ID erforderlich.");
    const reset = mode !== connection.mode || account !== connection.account;
    await query(`UPDATE hotel_connection SET mode=$3,account=$4,profile_url=$5,
      last_sync=CASE WHEN $6::boolean THEN NULL ELSE last_sync END,last_result=CASE WHEN $6::boolean THEN NULL ELSE last_result END WHERE workspace=$1 AND id=$2`,
      [id, connection.id, mode, account, url, reset]);
  } else if (body.action === "channel-setting") {
    const code = body.code === undefined ? undefined : text(body.code, "Kanal", 80);
    const current = state.channelOptions.find((option) => option.code === code);
    if (code !== undefined && !current) throw new InputError("Dieser Kanal wurde nicht gefunden.");
    const label = body.label === undefined && current ? current.label : text(body.label, "Kanalname", 80).replace(/\s+/g, " ");
    const nameKey = label.toLowerCase();
    if (!label) throw new InputError("Gib dem Kanal einen Namen.");
    if (state.channelOptions.some((option) => option.code !== code && [option.code.toLowerCase(), option.label.toLowerCase()].includes(nameKey))) throw new InputError("Diesen Kanalnamen gibt es bereits.");
    if (body.active !== undefined && typeof body.active !== "boolean") throw new InputError("Die Sichtbarkeit des Kanals ist ungültig.");
    try {
      if (!current) await query(`INSERT INTO hotel_channel_option (workspace,code,name_key,label) VALUES ($1,$2,$3,$2)`, [id, label, nameKey]);
      else await query(`UPDATE hotel_channel_option SET label=$3,name_key=$4,active=COALESCE($5::boolean,active)
        WHERE workspace=$1 AND code=$2`, [id, current.code, label, nameKey, body.active ?? null]);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") throw new InputError("Diesen Kanalnamen gibt es bereits.");
      throw error;
    }
  } else if (body.action === "save") {
    if (typeof body.kind !== "string" || !editable.includes(body.kind)) throw new InputError("Der Arbeitsbereich ist ungültig.");
    const kind = body.kind as Kind;
    if (body.id && (!item || item.kind !== kind)) throw new InputError("Der Eintrag wurde nicht gefunden.");
    const raw = body.data as Partial<Data> | null;
    if (!raw || typeof raw !== "object") throw new InputError("Die Eingaben fehlen.");
    if (kind === "review" && !item) throw new InputError("Übernimm Bewertungen per Synchronisierung oder Dateiimport.");
    const title = kind === "review" ? item!.data.title : text(raw.title, "Titel", 120);
    if (!title) throw new InputError("Ein Titel ist erforderlich.");
    if (!raw.status || !statuses[kind].includes(raw.status)) throw new InputError("Der Status ist ungültig.");
    const data: Data = { ...item?.data, title, status: raw.status, description: kind === "review" ? item!.data.description : text(raw.description ?? "", "Beschreibung") };
    for (const key of ["owner", "channel", "source", "related", "response", "campaign", "benefit", "privacy", "feasibility", "decision", "address", "phone", "tone", "language"] as const) {
      if (raw[key] !== undefined && (kind !== "review" || key === "response")) data[key] = text(raw[key], key, ["response", "benefit", "privacy", "feasibility", "decision", "tone"].includes(key) ? 2400 : 180);
    }
    if (raw.ownerId !== undefined && kind !== "review") {
      const key = text(raw.ownerId, "Zuständigkeit", 120);
      const person = state.owners.find((entry) => entry.id === key);
      if (key && !person && !(key === "legacy" && item?.data.owner && !item.data.ownerId)) throw new InputError("Wähle eine Person aus den Einstellungen.");
      if (person && !person.active && person.id !== item?.data.ownerId) throw new InputError("Diese Person ist nicht mehr aktiv.");
      if (key !== "legacy") { data.ownerId = person?.id; data.owner = person?.name; }
    } else if (kind === "task" && raw.owner !== undefined) {
      const person = state.owners.find((entry) => entry.active && entry.name === data.owner);
      if (data.owner && !person) throw new InputError("Wähle eine Person aus den Einstellungen.");
      data.ownerId = person?.id;
    }
    if (kind === "agency") {
      const previous = agencyChannels(item?.data);
      const submitted = data.channel ? [data.channel] : [];
      const values = raw.channels !== undefined ? raw.channels : raw.channel === undefined ? previous :
        item?.data.channels ? [...previous, ...submitted] : submitted;
      const next = agencyChannelCodes(values, state.channelOptions);
      if (next.some((code) => !previous.includes(code) && !state.channelOptions.some((option) => option.active && option.code === code))) {
        throw new InputError("Wähle aktive Kanäle aus der Liste.");
      }
      data.channels = next;
      delete data.channel;
    } else if (["campaign", "task"].includes(kind) && data.channel && data.channel !== item?.data.channel) {
      data.channel = channelCode(data.channel, state.channelOptions);
      if (!state.channelOptions.some((option) => option.active && option.code === data.channel)) throw new InputError("Wähle einen aktiven Kanal aus der Liste.");
    }
    if ((kind === "offer" || kind === "system") && data.source && !state.connections.some((connection) => connection.name === data.source) && data.source !== item?.data.source) throw new InputError("Wähle eine vorhandene Quelle aus.");
    if ((kind === "campaign" || kind === "profile") && raw.url !== undefined) {
      const url = text(raw.url, "Zieladresse", 600);
      if (url && (!URL.canParse(url) || new URL(url).protocol !== "https:")) throw new InputError("Die Zieladresse muss HTTPS verwenden.");
      data.url = url;
    }
    if (kind === "content" && raw.format !== undefined) {
      if (raw.format !== "instagram" && raw.format !== "newsletter" && raw.format !== "website") throw new InputError("Das Format ist ungültig.");
      data.format = raw.format;
      data.channel = raw.format === "instagram" ? "Instagram" : raw.format === "website" ? "Website" : "Newsletter";
      if (raw.format === "instagram") {
        if (!Array.isArray(raw.slides) || raw.slides.length < 1 || raw.slides.length > 20) throw new InputError("Ein Carousel braucht 1 bis 20 Slides.");
        data.slides = await Promise.all(raw.slides.map(async (slide) => ({
          id: text(slide?.id, "Slide-ID", 64), title: text(slide?.title, "Slide-Titel", 88), text: text(slide?.text, "Slide-Text", 200),
          image: await imagePath(query, id, slide?.image), layout: slide?.layout === "photo" ? "photo" : "editorial",
          crop: slideCrop(slide?.crop), palette: slide?.palette === "ivory" ? "ivory" : undefined
        })));
        if (new Set(data.slides.map((slide) => slide.id)).size !== data.slides.length) throw new InputError("Die Slide-Reihenfolge ist ungültig.");
        if (data.status === "Freigegeben" && data.slides.some((slide) => !slide.image)) throw new InputError("Wähle vor der Freigabe für jeden Slide ein Bild.");
      } else if (raw.format === "website") {
        const card = raw.websiteCard;
        if (!card) throw new InputError("Die Angebotskachel fehlt.");
        const cta = text(card.cta, "Button-Text", 45);
        const url = text(card.url, "Zieladresse", 500);
        if (url && (!URL.canParse(url) || new URL(url).protocol !== "https:")) throw new InputError("Gib für den Website-Link eine HTTPS-Adresse ein.");
        const image = await imagePath(query, id, card.image);
        if (data.status === "Freigegeben" && (!image || !cta || !url)) throw new InputError("Für die Freigabe braucht die Angebotskachel ein Bild, einen Button-Text und eine Zieladresse.");
        data.websiteCard = { image, price: text(card.price, "Preisangabe", 80), cta, url };
      } else {
        const mail = raw.newsletter;
        if (!mail) throw new InputError("Die Newsletterdaten fehlen.");
        const subject = text(mail.subject, "Betreff", 100);
        const cta = text(mail.cta, "Button-Text", 45);
        const url = text(mail.url, "Zieladresse", 500);
        if (url && (!URL.canParse(url) || new URL(url).protocol !== "https:")) throw new InputError("Gib für den Newsletter-Link eine HTTPS-Adresse ein.");
        if (data.status === "Freigegeben" && (!subject || Boolean(cta) !== Boolean(url))) throw new InputError("Prüfe Betreff sowie Button-Text und Zieladresse.");
        data.newsletter = { subject, preheader: text(mail.preheader, "Vorschautext", 160), image: await imagePath(query, id, mail.image), cta, url };
      }
    }
    if (raw.due !== undefined) data.due = raw.due ? date(raw.due) : "";
    if (kind === "offer") {
      if (raw.image !== undefined) data.image = await imagePath(query, id, raw.image);
      if (raw.start !== undefined) data.start = raw.start ? date(raw.start) : "";
      if (Boolean(data.start) !== Boolean(data.due) && raw.start) throw new InputError("Gib zur Anreise auch die Abreise ein.");
      if (data.start && data.due && data.start >= data.due) throw new InputError("Die Abreise muss nach der Anreise liegen.");
      if (raw.room !== undefined) data.room = text(raw.room, "Zimmer", 100);
      if (raw.tariff !== undefined) data.tariff = text(raw.tariff, "Tarif", 100);
      if (raw.occupancy !== undefined) data.occupancy = Number(raw.occupancy) ? amount(raw.occupancy, "Belegung", true) : undefined;
      if (raw.availability !== undefined) data.availability = String(raw.availability) === "" ? undefined : available(String(raw.availability));
      if (raw.observedAvailability !== undefined) data.observedAvailability = String(raw.observedAvailability) === "" ? undefined : available(String(raw.observedAvailability));
    }
    if (kind === "profile") {
      if (!data.source || !data.url || !state.connections.some((connection) => connection.name === data.source)) throw new InputError("Wähle ein vorhandenes Portal und gib die Profil-URL an.");
      data.status = "Zu prüfen";
    }
    if (kind === "solution" && data.status !== "Zur Prüfung" && (!data.benefit || !data.privacy || !data.feasibility || !data.decision)) throw new InputError("Für eine Entscheidung müssen Nutzen, Datenschutz, Umsetzbarkeit und Begründung erfasst sein.");
    if (kind === "campaign") {
      if (raw.start !== undefined) data.start = raw.start ? date(raw.start) : "";
      if (data.start && data.due && data.start > data.due) throw new InputError("Das Kampagnenende muss am oder nach dem Start liegen.");
      if (raw.threshold !== undefined) data.threshold = amount(raw.threshold, "Budgetsatz", true);
      if (raw.briefLead !== undefined) data.briefLead = amount(raw.briefLead, "Vorlauf", true);
      if ((data.threshold ?? 0) > 100 || (data.briefLead ?? 0) > 30) throw new InputError("Wähle 0 bis 100 Prozent oder 0 bis 30 Tage Vorlauf.");
    }
    if (kind === "content" && data.campaign && !state.records.some((r) => r.kind === "campaign" && r.id === data.campaign)) throw new InputError("Die verknüpfte Kampagne ist nicht verfügbar.");
    if ((kind === "content" || kind === "campaign") && data.related && !state.records.some((r) => r.kind === "offer" && r.id === data.related)) throw new InputError("Das verknüpfte Angebot ist nicht verfügbar.");
    for (const key of ["amount", "actual", "expected", "observed", "stars"] as const) {
      const value: unknown = raw[key];
      if (value === undefined || key === "stars" && kind === "review") continue;
      const optionalPrice = (kind === "offer" && (key === "expected" || key === "observed")) || (kind === "agency" && key === "actual");
      data[key] = optionalPrice && value === "" ? undefined : amount(value, key, key === "stars");
    }
    if (kind === "offer") {
      const fields = ["title", "expected", "observed", "availability", "observedAvailability", "start", "due", "room", "tariff", "occupancy", "source"] as const;
      data.status = item && fields.every((field) => (item.data[field] ?? "") === (data[field] ?? "")) ? item.data.status : "Zu prüfen";
    }
    if (kind === "review" && data.status === "Freigegeben" && !data.response) throw new InputError("Vor der Freigabe fehlt die Antwort.");
    if (kind === "content" && data.status === "Freigegeben" && data.format !== "instagram" && !data.description) throw new InputError("Vor der Freigabe fehlt der Beitragstext.");
    if (item?.data.status === "Freigegeben" && ((kind === "content" && body.approve !== true && (data.title !== item.data.title || data.description !== item.data.description)) || (kind === "review" && data.response !== item.data.response))) data.status = "Entwurf";
    if (item) await revise(query, id, item, data);
    else if (kind === "content") {
      await query(`WITH inserted AS (
        INSERT INTO hotel_record (workspace,id,kind,data) VALUES ($1,$2,'content',$3::jsonb) RETURNING id,data
      ) INSERT INTO hotel_content_revision (id,workspace,record,data) SELECT $4,$1,id,data FROM inserted`, [id, randomUUID(), JSON.stringify(data), randomUUID()]);
    } else await save(query, id, kind === "brand" ? "brand" : randomUUID(), kind, data);
  } else if (body.action === "campaign-status" || body.action === "withdraw-content") {
    const campaign = body.action === "campaign-status";
    const kind = campaign ? "campaign" : "content";
    if (!item || item.kind !== kind) throw new InputError("Der Eintrag wurde nicht gefunden.");
    const next = campaign ? body.status : "Entwurf";
    if (campaign ? next !== "Pausiert" && next !== "Aktiv" : item.data.status !== "Freigegeben" && item.data.status !== "Entwurf") {
      throw new InputError("Dieser Statuswechsel ist nicht möglich.");
    }
    if (item.data.status !== next) {
      const expected = campaign ? next === "Pausiert" ? "Aktiv" : "Pausiert" : "Freigegeben";
      const result = await query<{ id: string }>(`WITH updated AS (UPDATE hotel_record
        SET data=jsonb_set(data,'{status}',to_jsonb($3::text)),updated_at=now()
        WHERE workspace=$1 AND id=$2 AND kind=$4 AND data->>'status'=$5 RETURNING id,data
      ), revision AS (INSERT INTO hotel_content_revision (id,workspace,record,data) SELECT $6,$1,id,data FROM updated WHERE $4='content')
      SELECT id FROM updated`, [id, item.id, next, kind, expected, randomUUID()]);
      if (!result.rows.length) throw new InputError("Der Status hat sich geändert. Lade den Eintrag neu.");
    }
  } else if (body.action === "delete") {
    if (!item || (!editable.includes(item.kind) && item.kind !== "report")) throw new InputError("Dieser Eintrag kann nicht gelöscht werden.");
    await query(`WITH removed AS (
        DELETE FROM hotel_record WHERE workspace=$1 AND id=$2 AND kind=$3 RETURNING id
      ), remember AS (
        INSERT INTO hotel_deleted_record (workspace,id) SELECT $1,id FROM removed ON CONFLICT DO NOTHING
      ) UPDATE hotel_record SET data=data - array_remove(ARRAY[
          CASE WHEN data->>'related'=$2 THEN 'related' END, CASE WHEN data->>'campaign'=$2 THEN 'campaign' END
        ],NULL),updated_at=now()
        WHERE workspace=$1 AND id<>$2 AND EXISTS (SELECT 1 FROM removed)
          AND (data->>'related'=$2 OR data->>'campaign'=$2)`, [id, item.id, item.kind]);
  } else if (body.action === "import") {
    if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > 3000) throw new InputError("Die Datei muss 1 bis 3.000 Datenzeilen enthalten.");
    const dataset = body.dataset ?? "metrics";
    const filename = text(body.filename ?? "Dateiimport", "Dateiname", 160);
    if (dataset === "offers" || dataset === "reviews" || dataset === "agency") {
      await importRecords(query, id, dataset, body.rows, state);
      await save(query, id, randomUUID(), "import", { title: importFields[dataset].label, status: "Erstellt", description: body.rows.length + " Zeilen verarbeitet · " + filename });
      return;
    }
    if (dataset !== "metrics") throw new InputError("Die Dateiart ist ungültig.");
    const seen = new Set<string>();
    const rows = body.rows.map((r, i) => {
      if (!r || typeof r !== "object") throw new InputError("Ungültige Zeile " + (i + 2));
      const channelName = text(r.channel, "Kanal", 80);
      const channel = channelCode(channelName, state.channelOptions);
      if (!state.channelOptions.some((option) => option.code === channel)) {
        throw new InputError("Zeile " + (i + 2) + " · Unbekannter Kanal „" + channelName + "“. Korrigiere den Namen oder lege den Kanal in den Einstellungen an.");
      }
      const row = { day: date(r.day), channel,
        visits: amount(r.visits, "Besuche", true), starts: amount(r.starts, "Buchungsstarts", true),
        bookings: amount(r.bookings, "Buchungen", true), revenue: amount(r.revenue, "Umsatz"), cost: amount(r.cost, "Kosten") };
      const key = row.day + "|" + row.channel;
      if (seen.has(key) || row.starts > row.visits || row.bookings > row.starts) throw new InputError("Zeile " + (i + 2) + " enthält doppelte oder widersprüchliche Kennzahlen.");
      seen.add(key);
      return row;
    });
    if (body.campaign) {
      const campaign = state.records.find((r) => r.id === body.campaign && r.kind === "campaign");
      if (!campaign || !campaign.data.channel) throw new InputError("Wähle eine Kampagne mit festgelegtem Kanal.");
      if (rows.some((r) => r.channel !== campaign.data.channel)) throw new InputError("Der Kanal jeder CSV-Zeile muss mit der Kampagne übereinstimmen.");
      await writeCampaignMetrics(query, id, campaign, rows);
    } else await writeMetrics(query, id, rows);
    await save(query, id, randomUUID(), "import", { title: body.campaign ? "Kampagnenkennzahlen" : "Kanalbericht", status: "Erstellt", description: rows.length + " Zeilen verarbeitet · " + filename });
  } else if (body.action === "sync") {
    const connection = state.connections.find((c) => c.id === body.id);
    if (!connection) throw new InputError("Die Verbindung wurde nicht gefunden.");
    if (connection.mode === "off" || connection.mode === "import") throw new InputError("Für diese Quelle ist die Synchronisierung ausgeschaltet.");
    if (connection.mode === "live") {
      let result;
      try { result = await importProvider(state.connectorTag, connection); }
      catch (error) { throw new InputError(error instanceof Error ? error.message : "Der Abruf ist fehlgeschlagen."); }
      const rows = result.reviews.map((row) => {
        const reference = createHash("sha256").update(JSON.stringify([connection.id, connection.account, row.id])).digest("hex");
        const recordId = "review-" + reference;
        const prior = state.records.find((entry) => entry.id === recordId)?.data;
        const description = row.comment.trim().slice(0, 2400);
        const status = prior?.status === "Freigegeben" && (prior.description !== description || prior.stars !== row.score) ? "Entwurf" : prior?.status ?? "Offen";
        return { id: recordId, data: { ...prior, title: row.name.slice(0, 120), description, stars: row.score, status,
          channel: connection.name, source: "API", response: prior?.response ?? row.replied?.slice(0, 2400) } };
      });
      if (rows.length) await query(`INSERT INTO hotel_record (workspace,id,kind,data)
        SELECT $1,row.id,'review',row.data FROM jsonb_to_recordset($2::jsonb) AS row(id text,data jsonb)
        WHERE NOT EXISTS (SELECT 1 FROM hotel_deleted_record WHERE workspace=$1 AND id=row.id)
        ON CONFLICT (workspace,id) DO UPDATE SET data=excluded.data,updated_at=now() WHERE hotel_record.data IS DISTINCT FROM excluded.data`,
        [id, JSON.stringify([...new Map(rows.map((row) => [row.id, row])).values()])]);
      await query("UPDATE hotel_connection SET last_sync=now(),last_result=$3 WHERE workspace=$1 AND id=$2", [id, connection.id, result.summary]);
      return;
    }
    const map: Record<string, string> = { ads: channels[0], "hotel-ads": channels[1], search: channels[2], newsletter: channels[4], meta: channels[5] };
    const channel = map[connection.id];
    const metricRows = channel ? feed(channel) : ["analytics", "casablanca"].includes(connection.id) ? channels.flatMap(feed) : [];
    if (metricRows.length) await writeMetrics(query, id, metricRows, true);
    const kindBySource: Record<string, Kind> = { booking: "review", google: "review", tripadvisor: "review", hns: "offer", rateboard: "offer", fairmas: "agency" };
    const kind = kindBySource[connection.id];
    const records = kind ? examples.filter(([, type, d]) => type === kind && (type !== "review" || d.channel === connection.name) &&
      (type !== "offer" || d.source === connection.name)) : [];
    if (records.length) {
      await query(`INSERT INTO hotel_record (workspace,id,kind,data)
        SELECT $1,r.id,r.kind,r.data FROM jsonb_to_recordset($2::jsonb) AS r(id text, kind text, data jsonb)
        WHERE NOT EXISTS (SELECT 1 FROM hotel_deleted_record WHERE workspace=$1 AND id=r.id) ON CONFLICT DO NOTHING`,
        [id, JSON.stringify(records.map(([record, type, data]) => ({ id: record, kind: type, data })))]);
    }
    const result = (metricRows.length || records.length) + (metricRows.length ? " Kennzahlenzeilen abgeglichen" : kind === "review" ? " Bewertungen abgeglichen" : kind === "offer" ? " Angebote abgeglichen" : " Budgetpositionen abgeglichen");
    await query("UPDATE hotel_connection SET last_sync=now(),last_result=$3 WHERE workspace=$1 AND id=$2", [id, connection.id, result]);
  } else if (body.action === "schedule") {
    const hours = amount(body.hours, "Intervall", true);
    const target = body.target;
    if (![0, 1, 6, 24, 168].includes(hours) || (target !== "check" && target !== "report" && target !== "campaign-automation")) throw new InputError("Der Zeitplan ist ungültig.");
    if (hours === 0) await query("DELETE FROM hotel_schedule WHERE workspace=$1 AND action=$2", [id, target]);
    else await query(`INSERT INTO hotel_schedule (workspace,action,hours,next_at) VALUES ($1,$2,$3,now())
      ON CONFLICT (workspace,action) DO UPDATE SET hours=excluded.hours,next_at=now(),lease_until=NULL,last_status=NULL`, [id, target, hours]);
  } else if (body.action === "campaign-automation") {
    await runCampaignRules(query, id, state, runId);
  } else if (body.action === "profile-check") {
    const brand = state.records.find((r) => r.kind === "brand");
    if (!item || item.kind !== "profile" || !brand) throw new InputError("Für den Abgleich werden ein eingetragenes Portalprofil und zentrale Markenangaben benötigt.");
    const differences = ([["title", "Name"], ["address", "Adresse"], ["phone", "Telefon"]] as const).flatMap(([key, label]) => {
      const wanted = brand.data[key]?.trim();
      const current = item.data[key]?.trim();
      const normalize = (value: string) => key === "phone" ? value.replace(/[^\d+]/g, "") : value.toLocaleLowerCase("de-AT").replace(/\s+/g, " ");
      return wanted && normalize(wanted) !== normalize(current ?? "") ? [label + " · Portal: " + (current || "fehlt") + " · Vorgabe: " + wanted] : [];
    });
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna", dateStyle: "short" }).format(new Date());
    await revise(query, id, item, { ...item.data, status: differences.length ? "Abweichung" : "Geprüft", due: today });
    if (differences.length) {
      const task: Data = { title: "Portalprofil korrigieren · " + item.data.source, status: "Offen", description: differences.join("\n"), owner: item.data.owner, ownerId: item.data.ownerId, channel: "Portale", related: item.id };
      await query(`INSERT INTO hotel_record (workspace,id,kind,data) VALUES ($1,$2,'task',$3::jsonb)
        ON CONFLICT (workspace,id) DO UPDATE SET data=excluded.data,updated_at=now() WHERE hotel_record.data->>'description' IS DISTINCT FROM excluded.data->>'description'`, [id, "profile-" + item.id, JSON.stringify(task)]);
    }
  } else if (body.action === "sitecheck") {
    const target = text(body.url, "Zieladresse", 250);
    const result = checkWebsite(target);
    if (!result) throw new InputError("Wähle eine öffentliche Hotelseite aus der Liste.");
    await save(query, id, randomUUID(), "sitecheck", await result);
  } else if (body.action === "check") {
    const offers = state.records.filter((r) => r.kind === "offer" && (!body.id || r.id === body.id));
    if (!offers.length) throw new InputError("Für diesen Prüflauf fehlen die Angebote.");
    const latest = latestOfferChecks(state.records);
    for (const offer of offers) {
      const { expected, observed, title, availability, observedAvailability, start, due, room, occupancy, tariff, source } = offer.data;
      const comparison = offerComparison(offer.data);
      const differs = comparison.priceDiffers || comparison.availabilityDiffers;
      const status = differs ? "Abweichung" : comparison.matches ? "Geprüft" : "Zu prüfen";
      const occupancyText = occupancy ? occupancy + " Personen" : "";
      const context = [start && due ? start + " bis " + due : "", room, occupancyText, tariff, source].filter(Boolean).join(" · ");
      const description = [context, "Website " + (expected === undefined ? "ohne Preis" : priceEuro(expected)) + " · Buchungsdaten " + (observed === undefined ? "ohne Preis" : priceEuro(observed)),
        availability !== undefined || observedAvailability !== undefined ? "Verfügbarkeit Website " + availabilityLabel(availability).toLowerCase() + " · Quelle " + availabilityLabel(observedAvailability).toLowerCase() : "",
        comparison.incomplete ? "Vergleichsdaten fehlen." : ""].filter(Boolean).join("\n");
      const audit = { title, description, status: comparison.matches ? "OK" : status, related: offer.id };
      const previous = latest.get(offer.id);
      const sameResult = previous && previous.data.title === audit.title && previous.data.description === audit.description && previous.data.status === audit.status;
      if (status !== offer.data.status) {
        await query("UPDATE hotel_record SET data=jsonb_set(data,'{status}',to_jsonb($3::text)) WHERE workspace=$1 AND id=$2", [id, offer.id, status]);
      }
      await query(`INSERT INTO hotel_record (workspace,id,kind,data) VALUES ($1,$2,'check',$3::jsonb)
        ON CONFLICT (workspace,id) DO UPDATE SET updated_at=now() WHERE hotel_record.kind='check'`,
        [id, sameResult ? previous.id : randomUUID(), JSON.stringify(audit)]);
      if (differs && !state.records.some((r) => r.kind === "task" && r.data.related === offer.id && r.data.status !== "Erledigt")) {
        await query(`INSERT INTO hotel_record (workspace,id,kind,data) VALUES ($1,$2,'task',$3::jsonb)
          ON CONFLICT (workspace,id) DO UPDATE SET data=excluded.data,updated_at=now() WHERE hotel_record.data->>'status'='Erledigt'`,
          [id, "check-task-" + offer.id, JSON.stringify({ title: "Angebot abgleichen: " + title, description, status: "Offen", channel: "Direktvertrieb", related: offer.id })]);
      }
    }
  } else if (body.action === "draft") {
    if (!item || !["content", "review"].includes(item.kind)) throw new InputError("Für diesen Eintrag gibt es keinen Entwurf.");
    const generation = await generateCopy(state, item);
    await revise(query, id, item, { ...item.data, status: "Entwurf",
      ...(item.kind === "review" ? { response: generation.body } : { description: generation.body, source: generation.source }) });
  } else if (body.action === "report-analysis") {
    if (!state.ai || !item || item.kind !== "report") throw new InputError("Die KI-Analyse für diesen Bericht ist nicht verfügbar.");
    const facts = item.data.description.split("\nOffene Aufgaben", 1)[0];
    const response = await generateText("Fasse die vorliegenden Kennzahlen auf Deutsch knapp für die Direktion zusammen. Übernimm Beträge, Buchungszahlen und Zeitraum unverändert. Unterscheide Beobachtung und Hypothese ausdrücklich. Nenne die wichtigste Prüfmaßnahme. Erfinde keine Vergleichswerte, Ursachen, Prognosen oder Kennzahlen.", { report: facts });
    await revise(query, id, item, { ...item.data, response, source: "OpenAI" });
  } else if (body.action === "report") {
    const requestedKind = body.kind ?? "overview";
    if (typeof requestedKind !== "string" || !Object.hasOwn(reportKinds, requestedKind)) throw new InputError("Wähle einen gültigen Berichtstyp.");
    const kind = requestedKind as ReportKind;
    const definition = reportKinds[kind];
    const label = text(body.title ?? "", "Titel", 120) || definition.label;
    const dates = kind === "campaigns" && state.campaignMetrics.length ? state.campaignMetrics : state.metrics;
    const from = definition.period ? (body.from ? date(body.from) : dates[0]?.day) : "";
    const to = definition.period ? (body.to ? date(body.to) : dates.at(-1)?.day) : "";
    if (definition.period && (!from || !to || from > to)) throw new InputError("Wähle einen gültigen Zeitraum.");
    const rows = definition.period && kind !== "campaigns" ? state.metrics.filter((m) => m.day >= from! && m.day <= to!) : [];
    if ((kind === "overview" || kind === "website") && !rows.length) throw new InputError("Der Zeitraum enthält keine Kennzahlen.");
    const snapshot = createReportSnapshot(state, rows, from ?? "", to ?? "", kind);
    const report: Data = { title: label, description: reportDescription(snapshot), status: "Erstellt", report: snapshot };
    if (runId) await query(`INSERT INTO hotel_record (workspace,id,kind,data) VALUES ($1,$2,'report',$3::jsonb) ON CONFLICT DO NOTHING`, [id, runId, JSON.stringify(report)]);
    else await save(query, id, randomUUID(), "report", report);
  } else {
    throw new InputError("Die Aktion ist ungültig.");
  }
}

export function startScheduler() {
  if (cached.hotelScheduler) return;
  let busy = false;
  cached.hotelScheduler = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const { query } = await database();
      const due = await query<{ workspace: string; action: Schedule["action"]; slot: string }>(`
        UPDATE hotel_schedule AS schedule SET lease_until=now()+interval '3 minutes',last_status='Läuft'
        FROM (SELECT workspace,action FROM hotel_schedule WHERE next_at<=now() AND (lease_until IS NULL OR lease_until<=now())
          ORDER BY next_at LIMIT 4 FOR UPDATE SKIP LOCKED) AS ready
        WHERE schedule.workspace=ready.workspace AND schedule.action=ready.action
        RETURNING schedule.workspace,schedule.action,schedule.next_at::text AS slot
      `);
      for (const job of due.rows) {
        let status = "Abgeschlossen";
        try {
          const runId = "run-" + createHash("sha256").update(JSON.stringify([job.workspace, job.action, job.slot])).digest("hex");
          if (job.action !== "report") await perform(job.workspace, { action: job.action }, runId);
          else await perform(job.workspace, { action: "report", title: "Automatische Leistungsübersicht" }, runId);
        } catch (error) {
          console.error(error);
          status = "Fehlgeschlagen";
        }
        await query(`UPDATE hotel_schedule SET next_at=now()+hours*interval '1 hour',lease_until=NULL,last_status=$3
          WHERE workspace=$1 AND action=$2 AND next_at=$4::timestamptz`, [job.workspace, job.action, status, job.slot]);
      }
    } catch (error) { console.error(error); }
    finally { busy = false; }
  }, 8000);
  cached.hotelScheduler.unref();
}
