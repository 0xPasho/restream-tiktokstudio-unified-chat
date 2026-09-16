/**
 * Color estable por usuario, como hace Twitch.
 *
 * Pintar cada nombre con el color de su plataforma deja el feed monocromático
 * (tu chat es casi todo TikTok → todo rojo) y además duplica información que el
 * chip del avatar y la franja lateral ya dan. Un tono por usuario hace que
 * reconozcas a los habituales de reojo.
 *
 * Twitch sí manda el color elegido por el usuario; ese gana y este es el fallback.
 */
const HUES = [188, 205, 160, 265, 320, 25, 45, 135, 280, 340, 95, 220];

export function userColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const hue = HUES[Math.abs(h) % HUES.length];
  // Luminosidad alta y saturación media: legible sobre fondo oscuro sin vibrar.
  return `oklch(0.82 0.13 ${hue})`;
}
