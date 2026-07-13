import { DevelopmentControlError, type CompletionReportInput } from "./types";

const MAX_ITEMS = 100;
const MAX_TEXT = 2_000;
const MAX_TOTAL = 30_000;
const SENSITIVE_PATTERNS = [
  /(?:password|secret|token|api[_-]?key|database_url)\s*[:=]\s*\S+/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\b(?:sk|rk)-(?:live|test)-[A-Za-z0-9]{12,}\b/,
];

function inspectValue(value: unknown, path: string): void {
  if (typeof value === "string") {
    if (value.length > MAX_TEXT)
      throw new DevelopmentControlError(
        "UNBOUNDED_REPORT",
        `${path} exceeds ${MAX_TEXT} characters`,
      );
    if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(value)))
      throw new DevelopmentControlError(
        "SENSITIVE_DATA_REJECTED",
        `${path} contains prohibited sensitive data`,
      );
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ITEMS)
      throw new DevelopmentControlError(
        "UNBOUNDED_REPORT",
        `${path} exceeds ${MAX_ITEMS} items`,
      );
    value.forEach((item, index) => inspectValue(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    if (
      "tenantId" in value ||
      "clientId" in value ||
      "conversationTranscript" in value ||
      "shellOutput" in value ||
      "environment" in value
    ) {
      throw new DevelopmentControlError(
        "PROHIBITED_REPORT_FIELD",
        `${path} contains a prohibited field`,
      );
    }
    Object.entries(value).forEach(([key, child]) =>
      inspectValue(child, `${path}.${key}`),
    );
  }
}

export function validateCompletionReport(
  report: CompletionReportInput,
): Readonly<CompletionReportInput> {
  const serialized = JSON.stringify(report);
  if (serialized.length > MAX_TOTAL)
    throw new DevelopmentControlError(
      "UNBOUNDED_REPORT",
      `completion report exceeds ${MAX_TOTAL} characters`,
    );
  inspectValue(report, "report");
  return Object.freeze({ ...report });
}
