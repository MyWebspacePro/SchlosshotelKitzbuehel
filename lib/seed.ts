import { channels, type Data, type Kind, type Metric } from "./model";

export const connectors = [
  ["ads", "Google Ads", "Kampagnen"], ["hotel-ads", "Google Hotel Ads", "Metasuche"],
  ["analytics", "Google Analytics 4", "Website"], ["search", "Google Search Console", "SEO"],
  ["booking", "Booking.com", "Bewertungen"], ["google", "Google Unternehmensprofil", "Bewertungen"], ["tripadvisor", "Tripadvisor", "Bewertungen"],
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

const reviewDate = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);

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
  ["r1", "review", { receivedAt: reviewDate(2), title: "Theresa M.", status: "Offen", description: "Der Spa und die Aussicht auf die Berge waren wunderschön. Beim Frühstück war das Team ausgesprochen aufmerksam.", stars: 5, channel: "Booking.com" }],
  ["r2", "review", { receivedAt: reviewDate(8), title: "Michael R.", status: "Offen", description: "Schönes Zimmer und ein sehr angenehmer Aufenthalt. Der Check-in hat an unserem Anreisetag etwas länger gedauert.", stars: 4, channel: "Google Unternehmensprofil" }],
  ["r3", "review", { receivedAt: reviewDate(15), title: "Julia K.", status: "Offen", description: "Wir haben das Wochenende sehr genossen. Die Lage ist ideal für einen Spaziergang nach Kitzbühel.", stars: 5, channel: "Google Unternehmensprofil" }],
  ["r4", "review", { receivedAt: reviewDate(1),"title": "Claudia W.", "status": "Offen", "description": "Ein wunderbarer Aufenthalt. Besonders gefallen haben uns die ruhige Lage, der herzliche Empfang und der Blick auf die Berge.", "stars": 5, "channel": "Booking.com"}],
  ["r5", "review", { receivedAt: reviewDate(11),"title": "Andreas S.", "status": "Offen", "description": "Das Zimmer war sehr gepflegt und das Frühstück abwechslungsreich. Am Abend hätten wir uns etwas mehr Zeit beim Service gewünscht.", "stars": 4, "channel": "Booking.com"}],
  ["r6", "review", { receivedAt: reviewDate(22),"title": "Sophie L.", "status": "Offen", "description": "Wir haben uns von der Anreise bis zur Abreise wohlgefühlt. Der Spa-Bereich war nach einem Tag draußen genau das Richtige.", "stars": 5, "channel": "Booking.com"}],
  ["r7", "review", { receivedAt: reviewDate(34),"title": "Daniel B.", "status": "Offen", "description": "Schöne Umgebung und freundliches Team. Unser Zimmer war bei der Ankunft noch nicht ganz fertig, das wurde aber rasch gelöst.", "stars": 3, "channel": "Booking.com"}],
  ["r8", "review", { receivedAt: reviewDate(5),"title": "Petra H.", "status": "Offen", "description": "Sehr freundliche Gastgeber und ein wunderschönes Ambiente. Das Frühstück und die Aussicht bleiben uns besonders in Erinnerung.", "stars": 5, "channel": "Google Unternehmensprofil"}],
  ["r9", "review", { receivedAt: reviewDate(19),"title": "Markus F.", "status": "Offen", "description": "Ein entspanntes Wochenende in Kitzbühel. Das Team war aufmerksam; beim Frühstück war es zeitweise etwas voll.", "stars": 4, "channel": "Google Unternehmensprofil"}],
  ["r10", "review", { receivedAt: reviewDate(29),"title": "Elena P.", "status": "Offen", "description": "Tolle Lage, stilvolle Zimmer und eine sehr angenehme Atmosphäre. Wir kommen gerne wieder.", "stars": 5, "channel": "Google Unternehmensprofil"}],
  ["r11", "review", { receivedAt: reviewDate(40),"title": "Thomas G.", "status": "Offen", "description": "Insgesamt ein schöner Aufenthalt. Die Wartezeit beim Check-in war länger als erwartet, das Personal blieb dabei freundlich.", "stars": 3, "channel": "Google Unternehmensprofil"}],
  ["r12", "review", { receivedAt: reviewDate(3),"title": "Sabine K.", "status": "Offen", "description": "Ein besonderer Ort für eine kleine Auszeit. Die Kombination aus Bergblick, freundlichem Service und Ruhe hat uns begeistert.", "stars": 5, "channel": "Tripadvisor"}],
  ["r13", "review", { receivedAt: reviewDate(13),"title": "Robert N.", "status": "Offen", "description": "Das Hotel ist ein guter Ausgangspunkt für Ausflüge. Unser Zimmer war komfortabel und das Frühstück hat uns gut gefallen.", "stars": 4, "channel": "Tripadvisor"}],
  ["r14", "review", { receivedAt: reviewDate(25),"title": "Nina D.", "status": "Offen", "description": "Von der Begrüßung bis zum Abschied haben wir uns sehr willkommen gefühlt. Besonders schön war der entspannte Nachmittag im Spa.", "stars": 5, "channel": "Tripadvisor"}],
  ["r15", "review", { receivedAt: reviewDate(37),"title": "Martin E.", "status": "Offen", "description": "Das Ambiente ist sehr schön. Beim Abendservice gab es eine längere Wartezeit; das Team hat sich danach aufmerksam um uns gekümmert.", "stars": 3, "channel": "Tripadvisor"}],
  ["brand", "brand", {"title": "Schlosshotel Kitzbühel", "status": "Aktiv", "description": "Gastfreundschaft, Entspannung und alpine Erlebnisse in Kitzbühel.", "tone": "Herzlich, persönlich und stilvoll. Klar und einladend formulieren.", "language": "Deutsch"}],
  ["profile-google", "profile", {"title": "Schlosshotel Kitzbühel", "status": "Zu prüfen", "description": "Google-Unternehmensprofil", "source": "Google Unternehmensprofil", "url": "https://www.google.com/search?q=Schlosshotel+Kitzb%C3%BChel"}],
  ["profile-booking", "profile", {"title": "Schlosshotel Kitzbühel", "status": "Zu prüfen", "description": "Unterkunftsprofil bei Booking.com", "source": "Booking.com", "url": "https://www.booking.com/searchresults.html?ss=Schlosshotel+Kitzb%C3%BChel"}],
  ["profile-tripadvisor", "profile", {"title": "Schlosshotel Kitzbühel & Spa", "status": "Zu prüfen", "description": "Hotelprofil bei Tripadvisor", "source": "Tripadvisor", "url": "https://www.tripadvisor.com/Search?q=Schlosshotel%20Kitzb%C3%BChel"}],
  ["a1", "agency", { title: "Performance Marketing", status: "Aktiv", description: "Kampagnenmanagement, monatliche Auswertung, Betreuung der Suchanzeigen.", channel: "Google Ads", amount: 4800, actual: 3190, owner: "Agenturteam" }],
  ["a2", "agency", { title: "Website und Tracking", status: "Aktiv", description: "Website-Pflege, Prüfung von Buchungslinks und Tracking-Ereignissen.", channel: "Website", amount: 2200, actual: 1640, owner: "Technikpartner" }],
  ["s1", "system", { title: "Buchungsereignisse abgleichen", status: "Offen", description: "Anbieterabstimmung für die Zuordnung abgeschlossener Buchungen zu Kampagnen.", source: "HNS", owner: "Digital Marketing" }]
];
