export class ContractSchemaError extends Error {
  constructor(field: string, value: unknown) {
    super(`Contract returned an unsupported ${field}: ${String(value) || "<empty>"}`);
    this.name = "ContractSchemaError";
  }
}

export function requireEnum<T extends string>(
  field: string,
  value: unknown,
  allowed: readonly T[],
): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw new ContractSchemaError(field, value);
}

export function optionalFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function requireRecord(field: string, value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new ContractSchemaError(field, value);
}

export function requireString(field: string, value: unknown, allowEmpty = false): string {
  if (typeof value === "string" && (allowEmpty || value.length > 0)) return value;
  throw new ContractSchemaError(field, value);
}

export function requireDecimalString(field: string, value: unknown): string {
  const rendered = typeof value === "bigint" || typeof value === "number" ? String(value) : value;
  if (typeof rendered === "string" && /^\d+$/.test(rendered)) return rendered;
  throw new ContractSchemaError(field, value);
}

export function requireNonNegativeInteger(field: string, value: unknown): number {
  const parsed = optionalFiniteNumber(value);
  if (parsed !== undefined && Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
  throw new ContractSchemaError(field, value);
}

const TRANSACTION_STAGES = [
  "UNINITIALIZED", "PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED",
  "UNDETERMINED", "FINALIZED", "CANCELED", "APPEAL_REVEALING", "APPEAL_COMMITTING",
  "READY_TO_FINALIZE", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT",
] as const;

export type CoercedTransactionStage = (typeof TRANSACTION_STAGES)[number];

export function coerceTransactionStage(value: unknown): CoercedTransactionStage {
  return requireEnum("transaction status", value, TRANSACTION_STAGES);
}
