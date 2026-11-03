/**
 * User-facing text from a raw terminal envelope: `errorList`, then `message`,
 * then a nested `ecrResponse`. Returns [fallback] when [raw] is empty or not
 * that envelope. Same reading as Flutter `EcrWireResponse.displayMessageFromRaw`.
 */
export function displayMessageFromRaw(raw: string, fallback = ''): string {
  if (!raw) return fallback;
  try {
    const decoded: unknown = JSON.parse(raw);
    if (!decoded || typeof decoded !== 'object') return fallback;
    const json = decoded as Record<string, unknown>;
    const nested = json.ecrResponse;
    const root =
      'success' in json || 'data' in json
        ? json
        : nested && typeof nested === 'object'
          ? (nested as Record<string, unknown>)
          : json;
    const listed = root.errorList ?? json.errorList;
    if (Array.isArray(listed)) {
      const lines = listed
        .map((entry) => String(entry ?? '').trim())
        .filter((entry) => entry.length > 0);
      if (lines.length > 0) return lines.join('\n');
    }
    const message = String(root.message ?? '').trim();
    if (message) return message;
    const responseMessage = String(json.responseMessage ?? '').trim();
    return responseMessage || fallback;
  } catch {
    return fallback;
  }
}
