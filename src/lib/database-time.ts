const POSTGRES_TIMESTAMP_WITHOUT_TIME_ZONE = 1114;

export function parsePostgresUtcTimestamp(value: string): Date {
  return new Date(`${value.replace(" ", "T")}Z`);
}

export function configurePostgresUtcTimestamps(
  types: { setTypeParser: (oid: number, parser: (value: string) => Date) => void },
): void {
  types.setTypeParser(
    POSTGRES_TIMESTAMP_WITHOUT_TIME_ZONE,
    parsePostgresUtcTimestamp,
  );
}
