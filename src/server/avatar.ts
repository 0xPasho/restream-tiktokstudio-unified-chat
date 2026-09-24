/**
 * El avatar como data URL, descargado ahora.
 *
 * TikTok firma los enlaces de avatar y caducan en días. La tarjeta para video
 * se captura una vez y se guarda como imagen, pero si el enlace ya murió al
 * capturar saldría un cuadro roto en el clip. Sin red o con enlace muerto
 * devolvemos `null` y la tarjeta dibuja las iniciales, igual que el chat.
 */
export async function inlineAvatar(url: string | null): Promise<string | null> {
  if (!url || !/^https?:\/\//.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return `data:${type.split(';')[0]};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}
