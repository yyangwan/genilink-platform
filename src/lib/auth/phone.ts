const MAINLAND_PHONE = /^1[3-9]\d{9}$/;

/** Normalize mainland China numbers to the E.164 form used in the database. */
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const compact = value.trim().replace(/[\s-]/g, '');
  const national = compact.startsWith('+86')
    ? compact.slice(3)
    : compact.startsWith('0086')
      ? compact.slice(4)
      : compact.startsWith('86') && compact.length === 13
        ? compact.slice(2)
        : compact;

  return MAINLAND_PHONE.test(national) ? `+86${national}` : null;
}

export function displayPhone(phone: string): string {
  return phone.startsWith('+86') ? phone.slice(3) : phone;
}

export function maskPhone(phone: string): string {
  const national = displayPhone(phone);
  return national.length === 11
    ? `${national.slice(0, 3)}****${national.slice(-4)}`
    : '未绑定';
}
