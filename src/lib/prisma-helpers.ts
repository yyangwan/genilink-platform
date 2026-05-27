/**
 * Check if a Prisma error is a unique constraint violation (P2002).
 * Used across route handlers to return 409 responses.
 */
export function isUniqueViolation(err: unknown): boolean {
  return (
    err !== null &&
    err !== undefined &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  );
}
