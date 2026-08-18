const LABEL_COLORS: Record<string, string> = {
  Person: "#f5b942",
  Application: "#7aa2ff",
  Device: "#c084fc",
  Phone: "#67e8f9",
  Email: "#67e8f9",
  IPAddress: "#94a3b8",
  Address: "#a3e635",
  BankAccount: "#3ee0a0",
  Company: "#fb923c",
  Employer: "#fb923c",
  Broker: "#f472b6",
  Document: "#e2e8f0",
  Evidence: "#fb7185",
  Message: "#f97316",
  Transaction: "#2dd4bf",
};

export function colorForLabels(labels: string[]): string {
  for (const label of labels) {
    const color = LABEL_COLORS[label];
    if (color) return color;
  }
  return "#64748b";
}

export function primaryLabel(labels: string[]): string {
  return labels[0] ?? "Node";
}
