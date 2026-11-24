import { channels, type Data, type Kind, type Metric } from "./model";

export const connectors = [
  ["ads", "Google Ads", "Kampagnen"], ["hotel-ads", "Google Hotel Ads", "Metasuche"],
  ["analytics", "Google Analytics 4", "Website"], ["search", "Google Search Console", "SEO"],
  ["booking", "Booking.com", "Bewertungen"], ["google", "Google Unternehmensprofil", "Bewertungen"],
  ["meta", "Meta Business", "Social Media"], ["newsletter", "Newsletter", "E-Mail"],
  ["casablanca", "Casablanca", "Hotelsystem"], ["hns", "HNS", "Buchungsdaten"],
  ["rateboard", "RateBoard", "Raten"], ["fairmas", "Fairmas", "Controlling"]
];

export function feed(channel: string): Metric[] {
  const index = channels.indexOf(channel);
  return Array.from({ length: 30 }, (_, i) => {
    const day = new Date(Date.UTC(2026, 9, 22 + i)).toISOString().slice(0, 10);
    const visits = 38 + (5 - index) * 22 + ((i * 31 + index * 13) % 53) + i * 2;
    const starts = Math.round(visits * (0.12 + index * 0.01));
    const bookings = Math.max(1, Math.round(starts * (i > 24 ? 0.23 : 0.36) + (i % 3)));
    return { day, channel, visits, starts, bookings, revenue: bookings * (264 + index * 17 + (i % 4) * 25),
      cost: [0, 1, 3, 5].includes(index) ? Math.round(visits * (0.55 + index * 0.16)) : 0 };
  });
}

export const examples: Array<[string, Kind, Data]> = [
  ["t1", "task", { title: "Winterangebot in der Buchungsstrecke prüfen", status: "Offen", description: "Die in HNS importierte Rate weicht vom veröffentlichten Angebot ab. Nach der Korrektur den Angebotscheck erneut ausführen.", owner: "Digital Marketing", channel: "Direktvertrieb", related: "o1" }],
  ["t2", "task", { title: "November-Newsletter freigeben", status: "In Arbeit", description: "Angebotsdaten, Markenstil und Linkziel für den Versand prüfen.", owner: "Marketing", channel: "Content", related: "c1" }],
  ["t3", "task", { title: "Monatsbericht mit Agentur abstimmen", status: "Offen", description: "Google Ads und Hotel Ads nach Kosten pro Buchung vergleichen.", owner: "Digital Marketing", channel: "Controlling" }],
  ["ca1", "campaign", { title: "Winterauszeit in Kitzbühel", status: "Aktiv", description: "Direktbuchungen für Aufenthalte im Dezember stärken.", channel: "Google Ads", amount: 4800, owner: "Marketing", due: "2026-12-20", related: "o1" }],
  ["ca2", "campaign", { title: "Advent im Schlosshotel", status: "Geplant", description: "Newsletter mit Adventangebot und Verlinkung der Hotelseite.", channel: "Newsletter", amount: 350, owner: "Marketing", due: "2026-11-27", related: "o2" }],
  ["ca3", "campaign", { title: "Winter-Direktbuchungen", status: "Aktiv", description: "Leistung des Metasuchkanals auswerten.", channel: "Google Hotel Ads", amount: 2900, owner: "Digital Marketing", due: "2026-12-22" }],
  ["o1", "offer", { title: "Winterauszeit", status: "Zu prüfen", description: "Zwei Nächte für zwei Personen inklusive Frühstück. Beispielangebot für Dezember.", image: "/brand/schlosshotel.webp", expected: 590, observed: 650, source: "HNS", due: "2026-12-18" }],
  ["o2", "offer", { title: "Advent im Schlosshotel", status: "Geprüft", description: "Zwei Übernachtungen inklusive Frühstück und Spa-Zugang.", image: "/brand/spa.webp", expected: 480, observed: 480, source: "HNS", due: "2026-12-13" }],
  ["o3", "offer", { title: "Spa-Auszeit im Jänner", status: "Zu prüfen", description: "Zwei Nächte inklusive Frühstück und Spa-Zugang.", image: "/brand/suite.webp", expected: 520, observed: 520, source: "RateBoard", start: "2027-01-12", due: "2027-01-14", room: "Doppelzimmer", occupancy: 2, tariff: "Frühstück", availability: true, observedAvailability: true }],
  ["c0", "content", { title: "Winterauszeit in Kitzbühel", status: "Entwurf", description: "Wintertage im Schlosshotel Kitzbühel. Zwei Nächte für zwei Personen inklusive Frühstück. Entdecken Sie unser Winterangebot.", channel: "Social Media", related: "o1", source: "Redaktion" }],
  ["c1", "content", { title: "November-Newsletter", status: "Entwurf", description: "Winterauszeit in Kitzbühel. Zwei Nächte für zwei Personen inklusive Frühstück ab 590 €.", channel: "Newsletter", related: "o1", source: "Redaktion" }],
  ["c-website", "content", { title: "Winterauszeit im Schlosshotel", status: "Entwurf", description: "Genießen Sie zwei Nächte zu zweit im Schlosshotel Kitzbühel – inklusive Frühstück und Zeit für unvergessliche Wintermomente.", channel: "Website", related: "o1", campaign: "ca1", format: "website", websiteCard: { image: "/brand/schlosshotel.webp", price: "ab 590 € für zwei Personen", cta: "Aufenthalt entdecken", url: "https://www.schlosshotel-kitzbuehel.com/" } }],
  ["r1", "review", { title: "Theresa M.", status: "Offen", description: "Der Spa und die Aussicht auf die Berge waren wunderschön. Beim Frühstück war das Team ausgesprochen aufmerksam.", stars: 5, channel: "Booking.com" }],
  ["r2", "review", { title: "Michael R.", status: "Offen", description: "Schönes Zimmer und ein sehr angenehmer Aufenthalt. Der Check-in hat an unserem Anreisetag etwas länger gedauert.", stars: 4, channel: "Google Unternehmensprofil" }],
  ["r3", "review", { title: "Julia K.", status: "Offen", description: "Wir haben das Wochenende sehr genossen. Die Lage ist ideal für einen Spaziergang nach Kitzbühel.", stars: 5, channel: "Google Unternehmensprofil" }],
  ["a1", "agency", { title: "Performance Marketing", status: "Aktiv", description: "Kampagnenmanagement, monatliche Auswertung, Betreuung der Suchanzeigen.", channel: "Google Ads", amount: 4800, actual: 3190, owner: "Agenturteam" }],
  ["a2", "agency", { title: "Website und Tracking", status: "Aktiv", description: "Website-Pflege, Prüfung von Buchungslinks und Tracking-Ereignissen.", channel: "Website", amount: 2200, actual: 1640, owner: "Technikpartner" }],
  ["s1", "system", { title: "Buchungsereignisse abgleichen", status: "Offen", description: "Anbieterabstimmung für die Zuordnung abgeschlossener Buchungen zu Kampagnen.", source: "HNS", owner: "Digital Marketing" }]
];
