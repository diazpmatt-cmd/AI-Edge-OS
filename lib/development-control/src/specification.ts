import {
  DevelopmentControlError,
  type DevelopmentReference,
  type TaskSpecification,
  type TaskSpecificationInput,
} from "./types";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const MAX_ITEM_LENGTH = 1_000;
const MAX_ITEMS = 100;

function fail(code: string, message: string): never {
  throw new DevelopmentControlError(code, message);
}

function bounded(value: string, field: string, max = MAX_ITEM_LENGTH): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    fail("INVALID_SPECIFICATION", `${field} must contain 1-${max} characters`);
  return normalized;
}

function normalizedSet(
  values: readonly string[],
  field: string,
): readonly string[] {
  if (values.length > MAX_ITEMS)
    fail("INVALID_SPECIFICATION", `${field} exceeds ${MAX_ITEMS} items`);
  return Object.freeze(
    [...new Set(values.map((value) => bounded(value, field)))].sort(),
  );
}

function normalizedReferences(
  values: readonly DevelopmentReference[],
): readonly DevelopmentReference[] {
  if (values.length > MAX_ITEMS)
    fail("INVALID_SPECIFICATION", `references exceeds ${MAX_ITEMS} items`);
  const normalized = values.map((reference) => ({
    kind: reference.kind,
    value: bounded(reference.value, "reference"),
  }));
  const unique = new Map(
    normalized.map((reference) => [
      `${reference.kind}:${reference.value}`,
      reference,
    ]),
  );
  return Object.freeze(
    [...unique.values()].sort((a, b) =>
      `${a.kind}:${a.value}`.localeCompare(`${b.kind}:${b.value}`),
    ),
  );
}

export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(canonicalStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`)
    .join(",")}}`;
}

const SHA256_INITIAL = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
] as const;

const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function utf8Bytes(input: string): number[] {
  const bytes: number[] = [];
  for (const character of input) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint <= 0x7f) bytes.push(codePoint);
    else if (codePoint <= 0x7ff)
      bytes.push(0xc0 | (codePoint >>> 6), 0x80 | (codePoint & 0x3f));
    else if (codePoint <= 0xffff)
      bytes.push(
        0xe0 | (codePoint >>> 12),
        0x80 | ((codePoint >>> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    else
      bytes.push(
        0xf0 | (codePoint >>> 18),
        0x80 | ((codePoint >>> 12) & 0x3f),
        0x80 | ((codePoint >>> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
  }
  return bytes;
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256(input: string): string {
  const bytes = utf8Bytes(input);
  const bitLength = BigInt(bytes.length) * 8n;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let shift = 56n; shift >= 0n; shift -= 8n)
    bytes.push(Number((bitLength >> shift) & 0xffn));

  const hash: number[] = [...SHA256_INITIAL];
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Array<number>(64).fill(0);
    for (let index = 0; index < 16; index += 1) {
      const position = offset + index * 4;
      words[index] =
        ((bytes[position] << 24) |
          (bytes[position + 1] << 16) |
          (bytes[position + 2] << 8) |
          bytes[position + 3]) >>>
        0;
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 =
        rotateRight(words[index - 15], 7) ^
        rotateRight(words[index - 15], 18) ^
        (words[index - 15] >>> 3);
      const s1 =
        rotateRight(words[index - 2], 17) ^
        rotateRight(words[index - 2], 19) ^
        (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 =
        (h + sum1 + choice + SHA256_CONSTANTS[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return hash.map((value) => value.toString(16).padStart(8, "0")).join("");
}

export function deterministicHash(value: unknown, prefix = "hash"): string {
  return `${prefix}_${sha256(canonicalStringify(value))}`;
}

function rejectTenantIdentity(input: object): void {
  if ("tenantId" in input || "clientId" in input) {
    fail(
      "CUSTOMER_IDENTITY_FORBIDDEN",
      "development-control specifications cannot contain customer tenant identity",
    );
  }
}

export function createTaskSpecification(
  input: TaskSpecificationInput,
): TaskSpecification {
  rejectTenantIdentity(input);
  if (!Number.isInteger(input.revision) || input.revision < 1)
    fail("INVALID_SPECIFICATION", "revision must be a positive integer");
  const expectedOriginMainSha = input.expectedOriginMainSha.toLowerCase();
  if (!SHA_PATTERN.test(expectedOriginMainSha))
    fail(
      "INVALID_GIT_SHA",
      "expected origin/main SHA must be 40 lowercase hex characters",
    );
  if (input.branchMode === "dedicated_branch" && !input.intendedBranch?.trim())
    fail(
      "INVALID_BRANCH_MODE",
      "dedicated-branch tasks require an intended branch",
    );
  if (input.branchMode === "no_branch" && input.intendedBranch !== null)
    fail(
      "INVALID_BRANCH_MODE",
      "no-branch tasks cannot define an intended branch",
    );

  const normalized: TaskSpecificationInput = {
    taskId: bounded(input.taskId, "taskId", 100),
    title: bounded(input.title, "title", 300),
    taskType: input.taskType,
    revision: input.revision,
    expectedOriginMainSha,
    branchMode: input.branchMode,
    intendedBranch:
      input.intendedBranch === null
        ? null
        : bounded(input.intendedBranch, "intendedBranch", 300),
    priority: input.priority,
    dependencies: normalizedSet(input.dependencies, "dependencies"),
    origin: bounded(input.origin, "origin", 500),
    proposedAgent: bounded(input.proposedAgent, "proposedAgent", 200),
    authorizedScope: normalizedSet(input.authorizedScope, "authorizedScope"),
    authorizedFiles: normalizedSet(input.authorizedFiles, "authorizedFiles"),
    explicitExclusions: normalizedSet(
      input.explicitExclusions,
      "explicitExclusions",
    ),
    acceptanceCriteria: normalizedSet(
      input.acceptanceCriteria,
      "acceptanceCriteria",
    ),
    verificationRequirements: normalizedSet(
      input.verificationRequirements,
      "verificationRequirements",
    ),
    documentationRequirements: normalizedSet(
      input.documentationRequirements,
      "documentationRequirements",
    ),
    references: normalizedReferences(input.references),
  };
  return Object.freeze({
    ...normalized,
    specificationHash: deterministicHash(normalized, "spec"),
  });
}

export function reviseTaskSpecification(
  current: TaskSpecification,
  next: TaskSpecificationInput,
): TaskSpecification {
  if (next.taskId !== current.taskId)
    fail("TASK_ID_IMMUTABLE", "taskId cannot change across revisions");
  if (next.revision !== current.revision + 1)
    fail(
      "REVISION_MISMATCH",
      "a changed specification must increment revision exactly once",
    );
  const revised = createTaskSpecification(next);
  if (revised.specificationHash === current.specificationHash)
    fail(
      "SPECIFICATION_UNCHANGED",
      "a new revision must produce a distinct specification hash",
    );
  return revised;
}
