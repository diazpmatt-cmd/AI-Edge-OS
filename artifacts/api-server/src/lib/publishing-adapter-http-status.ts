import { readAdapterResultsEnvelope } from "./publishing-adapter-result.js";

export const INTERNAL_PARTIAL_ADAPTER_STATUS = 207;

export function resolveInternalAdapterResponseStatus(
  currentStatus: number,
  body: unknown,
): number {
  return currentStatus >= 500 && readAdapterResultsEnvelope(body)
    ? INTERNAL_PARTIAL_ADAPTER_STATUS
    : currentStatus;
}
