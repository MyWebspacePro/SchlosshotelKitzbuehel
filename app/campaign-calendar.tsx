"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { RecordItem } from "../lib/model";

const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const monthFormat = new Intl.DateTimeFormat("de-AT", { month: "long", year: "numeric", timeZone: "UTC" });

export default function CampaignCalendar({ campaigns, select }: { campaigns: RecordItem[]; select: (item: RecordItem) => void }) {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna", dateStyle: "short" }).format(new Date());
  const [month, setMonth] = useState(() => new Date(today.slice(0, 7) + "-01T00:00:00Z"));
  const year = month.getUTCFullYear();
  const index = month.getUTCMonth();
  const offset = (month.getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  const days = Array.from({ length: Math.ceil((offset + length) / 7) * 7 }, (_, n) => new Date(Date.UTC(year, index, 1 - offset + n)));
  const navigate = (delta: number) => setMonth(new Date(Date.UTC(year, index + delta, 1)));

  return <details className="card campaign-calendar panel">
    <summary>Kampagnenkalender</summary>
    <div className="calendar-toolbar"><h3>{monthFormat.format(month)}</h3><div className="inline-actions">
      <button type="button" className="icon-button" onClick={() => navigate(-1)} aria-label="Vorheriger Monat"><ChevronLeft size={18} /></button>
      <button type="button" className="button" onClick={() => setMonth(new Date(today.slice(0, 7) + "-01T00:00:00Z"))}>Heute</button>
      <button type="button" className="icon-button" onClick={() => navigate(1)} aria-label="Nächster Monat"><ChevronRight size={18} /></button>
    </div></div>
    <div className="calendar-scroll"><div className="calendar-grid">
      {weekdays.map((label) => <strong className="calendar-weekday" key={label}>{label}</strong>)}
      {days.map((day) => {
        const key = dateKey(day);
        const events = campaigns.flatMap((item) => {
          const markers = [];
          if (item.data.start === key) markers.push("Start");
          if (item.data.due === key) markers.push("Ende");
          return markers.map((marker) => ({ item, marker }));
        });
        return <div key={key} className={"calendar-cell" + (day.getUTCMonth() === index ? "" : " outside-month")}>
          <time dateTime={key} className={key === today ? "calendar-today" : undefined}>{day.getUTCDate()}</time>
          {events.map(({ item, marker }) => <button type="button" key={item.id + marker} onClick={() => select(item)} className="calendar-event"><small>{marker} · {item.data.status}</small>{item.data.title}</button>)}
        </div>;
      })}
    </div></div>
  </details>;
}
