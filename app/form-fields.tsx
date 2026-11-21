"use client";

export function Choice({ label, name, value, options, required = false, onChange }: { label: string; name: string; value?: string; options: (string | { value: string; label: string })[]; required?: boolean; onChange?: (value: string) => void }) {
  const choices = new Map(options.map((option) => typeof option === "string" ? [option, option] : [option.value, option.label]));
  if (value && !choices.has(value)) choices.set(value, value);
  return <label className="form-field">{label}<select name={name} defaultValue={value || ""} required={required} onChange={(event) => onChange?.(event.target.value)}>
    <option value="">{label} auswählen</option>{[...choices].map(([code, text]) => <option key={code} value={code}>{text}</option>)}
  </select></label>;
}
export function MoneyField({ name, label, value, required = true }: { name: string; label: string; value?: number; required?: boolean }) {
  return <label className="form-field">{label}<input name={name} type="number" min="0" step="0.01" defaultValue={value ?? (required ? 0 : "")} required={required} /></label>;
}
