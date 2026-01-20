const CONNECTIVITY_CHECK_URL = 'https://www.google.com/generate_204';
const CONNECTIVITY_TIMEOUT_MS = 5000;

export async function checkNetworkConnection(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      CONNECTIVITY_TIMEOUT_MS
    );

    const response = await fetch(CONNECTIVITY_CHECK_URL, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}
