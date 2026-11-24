export type Metric = { day: string; channel: string; visits: number; starts: number; bookings: number; revenue: number; cost: number };
export type CampaignMetric = Metric & { campaign: string };
export type Kind = "task" | "campaign" | "offer" | "content" | "review" | "agency" | "report" | "check" | "system" | "sitecheck" | "automation" | "import" | "guide" | "solution" | "brand" | "profile";
export type SlideCrop = { zoom: number; x: number; y: number };
export const defaultSlideCrop: SlideCrop = { zoom: 100, x: 50, y: 50 };
export const slidePalettes = {
  bordeaux: { background: "#42041e", text: "#fffdfa", brand: "#f4dbc0" },
  ivory: { background: "#f6ede1", text: "#42041e", brand: "#774962" }
} as const;
export type Slide = {
  id: string; title: string; text: string; image: string; layout: "editorial" | "photo";
  crop?: SlideCrop; palette?: keyof typeof slidePalettes;
};
export type Newsletter = { subject: string; preheader: string; image: string; cta: string; url: string };
export const brandImages = [
  { file: "/brand/schlosshotel.webp", label: "Schlosshotel im Winter" }, { file: "/brand/spa.webp", label: "Außenpool" },
  { file: "/brand/terrasse.webp", label: "Terrasse" }, { file: "/brand/suite.webp", label: "Adlersuite" }
];
export type Data = {
  title: string; status: string; description: string; owner?: string; ownerId?: string; channel?: string;
  channels?: string[]; importReference?: string;
  due?: string; amount?: number; actual?: number; expected?: number; observed?: number;
  stars?: number; url?: string; response?: string; source?: string; related?: string; image?: string;
  format?: "instagram" | "newsletter"; slides?: Slide[]; newsletter?: Newsletter;
  campaign?: string; start?: string; threshold?: number; briefLead?: number;
  room?: string; occupancy?: number; tariff?: string; availability?: boolean; observedAvailability?: boolean;
  benefit?: string; privacy?: string; feasibility?: string; decision?: string;
  address?: string; phone?: string; tone?: string; language?: string;
  report?: ReportSnapshot;
};
export type RecordItem = { id: string; kind: Kind; data: Data; updated_at: string };

export function latestOfferChecks(records: RecordItem[]) {
  const latest = new Map<string, RecordItem>();
  for (const record of records) {
    const offer = record.data.related;
    if (record.kind !== "check" || !offer) continue;
    const previous = latest.get(offer);
    if (!previous || record.updated_at > previous.updated_at) latest.set(offer, record);
  }
  return latest;
}
export type ConnectionMode = "example" | "import" | "live" | "off";
export const connectionCategories = ["Buchungsdaten", "Bewertungen", "Controlling", "E-Mail", "Hotelsystem", "Kampagnen", "Metasuche", "Raten", "SEO", "Social Media", "Website", "Sonstige"];
export const isCustomConnection = (id: string) => id.startsWith("custom-");
export type Connection = { id: string; name: string; category: string; last_sync: string | null; last_result: string | null;
  mode: ConnectionMode; account: string; profile_url: string; liveAvailable: boolean };
export type Schedule = { action: "check" | "report" | "campaign-automation"; hours: number; next_at: string; last_status: string | null };
export type ContentRevision = { record: string; title: string; status: string; created_at: string };
export type MediaImage = { file: string; label: string };
export type ChannelOption = { code: string; label: string; active: boolean };
export type OwnerOption = { id: string; name: string; role: string; active: boolean };
const departmentRoles = ["Direktion", "Digital Marketing", "Marketing", "Content & Redaktion", "Website & Technik", "Reservierung & Direktvertrieb", "Rezeption", "Revenue Management", "Controlling", "Agentur"];
export function ownerRoleOptions(owners: OwnerOption[]) {
  return [...new Set([...departmentRoles, ...owners.map((owner) => owner.role).filter(Boolean)])].sort((a, b) => a.localeCompare(b, "de-AT"));
}
export type WorkspaceIdentity = { role: "guest" } | { role: "admin" | "member"; owner: string; name: string; username: string };
export type AccountSummary = { owner: string; username: string; admin: boolean };
export type Workspace = { records: RecordItem[]; metrics: Metric[]; campaignMetrics: CampaignMetric[]; revisions: ContentRevision[]; connections: Connection[]; schedules: Schedule[]; media: MediaImage[]; channelOptions: ChannelOption[]; owners: OwnerOption[]; connectorTag: string; ai: boolean };
export type WorkspaceResponse = Workspace & { identity: WorkspaceIdentity; accounts: AccountSummary[] };
export const channels = ["Google Ads", "Google Hotel Ads", "Organische Suche", "Metasearch", "Newsletter", "Social Media"];
export const defaultChannelOptions = [...channels, "Website", "Instagram", "Direktvertrieb", "Content", "Controlling"];
export const channelLabel = (code: string, options: ChannelOption[]) => options.find((option) => option.code === code)?.label ?? code;
export function agencyChannels(data?: Data) {
  return data?.channels ?? (data?.channel ? [data.channel] : []);
}
export function channelCode(name: string, options: ChannelOption[]) {
  const lower = name.trim().toLowerCase();
  return options.find((option) => option.code.toLowerCase() === lower || option.label.toLowerCase() === lower)?.code ?? name.trim();
}
export const number = (n: number, digits = 0) => new Intl.NumberFormat("de-AT", { maximumFractionDigits: digits }).format(n);
export const euro = (n: number) => new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const priceFormat = new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" });
export const priceEuro = (n: number) => priceFormat.format(n);
export const availabilityLabel = (value?: boolean) => value === undefined ? "Offen" : value ? "Verfügbar" : "Nicht verfügbar";

export function offerComparison({ expected, observed, availability, observedAvailability }: Data) {
  const hasPrices = expected !== undefined && observed !== undefined;
  const hasAvailability = availability !== undefined && observedAvailability !== undefined;
  const priceDiffers = hasPrices && expected !== observed;
  const availabilityDiffers = hasAvailability && availability !== observedAvailability;
  const incomplete = !hasPrices || (availability === undefined) !== (observedAvailability === undefined);
  return { priceDiffers, availabilityDiffers, incomplete, matches: !incomplete && !priceDiffers && !availabilityDiffers };
}

export function campaignRowsFor(rows: CampaignMetric[], campaign: RecordItem) {
  const { start, due, channel } = campaign.data;
  return rows.filter((row) => row.campaign === campaign.id && row.channel === channel &&
    (!start || row.day >= start) && (!due || row.day <= due));
}

export const sum = (rows: Metric[]) => rows.reduce((a, r) => ({
  visits: a.visits + r.visits, starts: a.starts + r.starts, bookings: a.bookings + r.bookings,
  revenue: a.revenue + r.revenue, cost: a.cost + r.cost
}), { visits: 0, starts: 0, bookings: 0, revenue: 0, cost: 0 });
export const pct = (a: number, b: number) => b ? number(100 * a / b, 1) + " %" : "–";
import type { ReportSnapshot } from "./report";
