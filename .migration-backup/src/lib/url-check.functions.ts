import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type UrlCheckStatus = "live" | "redirect" | "not_found" | "error";

export type UrlCheckResult = {
  url: string;
  status: UrlCheckStatus;
  statusCode: number | null;
  finalUrl: string | null;
  checkedAt: string;
  error?: string;
};

const Input = z.object({
  url: z.string().url(),
});

function classify(code: number): UrlCheckStatus {
  if (code >= 200 && code < 300) return "live";
  if (code >= 300 && code < 400) return "redirect";
  if (code === 404 || code === 410) return "not_found";
  return "error";
}

async function checkOnce(url: string, method: "HEAD" | "GET"): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, {
      method,
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; AIEdgeSolutions-URLChecker/1.0; +https://lovable.dev)",
        accept: "text/html,*/*;q=0.8",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

export const checkPublishedUrl = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<UrlCheckResult> => {
    const checkedAt = new Date().toISOString();
    try {
      let res: Response;
      try {
        res = await checkOnce(data.url, "HEAD");
        // Some sites disallow HEAD — retry with GET
        if (res.status === 405 || res.status === 501) {
          res = await checkOnce(data.url, "GET");
        }
      } catch {
        res = await checkOnce(data.url, "GET");
      }

      const code = res.status;
      const status = classify(code);
      let finalUrl: string | null = res.url || null;

      // If redirect, follow once to see where it lands
      if (status === "redirect") {
        const location = res.headers.get("location");
        if (location) {
          try {
            const next = new URL(location, data.url).toString();
            finalUrl = next;
            const followed = await checkOnce(next, "GET");
            // Surface the final destination's status
            return {
              url: data.url,
              status: classify(followed.status),
              statusCode: followed.status,
              finalUrl: followed.url || next,
              checkedAt,
            };
          } catch {
            /* keep original redirect result */
          }
        }
      }

      return { url: data.url, status, statusCode: code, finalUrl, checkedAt };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        url: data.url,
        status: "error",
        statusCode: null,
        finalUrl: null,
        checkedAt,
        error: msg,
      };
    }
  });
