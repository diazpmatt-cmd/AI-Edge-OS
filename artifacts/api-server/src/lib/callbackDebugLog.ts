export type CallbackDebugEntry = {
  ts: string;
  provider: string;
  callbackReached: true;
  codeReceived: boolean;
  stateValid: boolean | null;
  tokenExchangeStatus: string;
  connectionSaved: boolean;
  finalRedirectUrl: string;
  error?: string;
};

const MAX = 20;
const entries: CallbackDebugEntry[] = [];

export function logCallback(entry: CallbackDebugEntry) {
  entries.unshift(entry);
  if (entries.length > MAX) entries.pop();
}

export function getCallbackLog(): CallbackDebugEntry[] {
  return [...entries];
}
