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
