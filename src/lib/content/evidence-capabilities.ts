/** Receiver readiness is checked on the server before reserving a paid operation. */
export async function evidenceDraftReady(token: string, channel: string): Promise<boolean> {
  try {
    const response = await fetch(`${process.env.CONTENT_SERVICE_URL || 'http://127.0.0.1:4003'}/api/capabilities/evidence-briefs`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000), cache: 'no-store',
    });
    if (!response.ok) return false;
    const value = await response.json();
    return value?.schemaVersion === 3 && value.enabled === true && value.generateDraft?.enabled === true &&
      Array.isArray(value.generateDraft.channels) && value.generateDraft.channels.includes(channel) && value.publicationAllowed === false;
  } catch { return false; }
}
