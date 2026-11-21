export const importFields = {
  metrics: {
    label: "Web- und Kampagnenkennzahlen",
    fields: ["day", "channel", "visits", "starts", "bookings", "revenue", "cost"],
    titles: ["Datum", "Kanal", "Besuche", "Buchungsstarts", "Buchungen", "Umsatz", "Kosten"],
    example: ["2026-11-20", "Newsletter", "200", "42", "13", "4290", "142"]
  },
  offers: {
    label: "Angebote und Ratenabgleich",
    fields: ["id", "source", "title", "start", "due", "room", "occupancy", "tariff", "expected", "observed", "availability", "observedAvailability"],
    titles: ["Referenz", "Quelle", "Titel", "Anreise", "Abreise", "Zimmer", "Belegung", "Tarif", "Websitepreis", "Quellpreis", "Website verfügbar", "Quelle verfügbar"],
    example: ["o1", "HNS", "Winterauszeit", "2026-12-18", "2026-12-20", "Doppelzimmer", "2", "Frühstück", "590", "590", "ja", "ja"]
  },
  reviews: {
    label: "Bewertungen",
    fields: ["id", "channel", "title", "stars", "description"],
    titles: ["Referenz", "Portal", "Absender", "Sterne", "Bewertung"],
    example: ["bespiel-103", "Booking.com", "A. Gast", "5", "Wir hatten eine schöne Winterauszeit."]
  },
  agency: {
    label: "Agenturleistungen und Budgets",
    fields: ["id", "title", "channel", "owner", "amount", "actual", "description"],
    titles: ["Referenz", "Agentur", "Kanäle", "Zuständig", "Soll", "Ist", "Beschreibung"],
    example: ["a1", "Performance Marketing", "Google Ads | Google Hotel Ads", "Agenturteam", "4800", "3670", "Kampagnensteuerung und Auswertung"]
  }
} as const;

export type Dataset = keyof typeof importFields;
