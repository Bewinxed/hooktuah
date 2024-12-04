export function mergeHeaders(
  baseHeaders: Record<string, string>,
  additionalHeaders?: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = { ...baseHeaders };
  if (additionalHeaders) {
    Object.assign(result, additionalHeaders);
  }
  return result;
}

export function validateInput<T>(data: unknown): T {
  if (!data) {
    throw new Error('Invalid input data');
  }
  return data as T;
}
