/** Shared Telnyx SMS utility — used by reviews, scheduler, and other server routes. Never throws. */
export async function sendSms(
  to: string,
  text: string,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.TELNYX_API_KEY;
  const from   = process.env.TELNYX_FROM_NUMBER ?? "+12512863200";
  if (!apiKey) return { ok: false, error: "TELNYX_API_KEY not set" };
  try {
    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body:    JSON.stringify({ from, to, text }),
    });
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) {
      const errs   = json.errors as Array<{ detail?: string }> | undefined;
      const detail = errs?.[0]?.detail ?? res.statusText;
      return { ok: false, error: `Telnyx ${res.status}: ${detail}` };
    }
    const data = json.data as Record<string, unknown> | undefined;
    return { ok: true, messageId: data?.id as string | undefined };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}
