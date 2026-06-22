export function createPreviewSubmissions() {
  return [
    {
      id: "preview-1",
      name: "Cliente Demo",
      number16: "0012345678901234",
      number4: "0032",
      number3: "007",
      created_at: new Date().toISOString(),
    },
  ];
}

export function neutralizeCsvValue(value: string): string {
  const text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) return `'${text}`;
  return text;
}

export function toCsvRow(values: string[]): string {
  return values
    .map((value) => `"${neutralizeCsvValue(value).replace(/"/g, '""')}"`)
    .join(",");
}
