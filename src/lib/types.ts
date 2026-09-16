export type Platform = 'tiktok' | 'twitch' | 'youtube' | 'kick' | 'restream';
export type EventType = 'chat' | 'gift' | 'like' | 'follow' | 'share' | 'join' | 'sub' | 'raid';

export type Badge = {
  kind: 'mod' | 'verified' | 'sub' | 'level' | 'fansclub' | 'badge';
  label: string;
  imageUrl?: string;
};

export type ChatEvent = {
  id: number;
  platform: Platform;
  type: EventType;
  ts: number;
  user_id: string | null;
  handle: string | null;
  nickname: string | null;
  avatar: string | null;
  color: string | null;
  text: string | null;
  is_bot: boolean;
  is_moderator: boolean;
  is_subscriber: boolean;
  is_first: boolean;
  badges: Badge[];
  meta: Record<string, unknown> | null;
};

/**
 * `color` identifica la plataforma; `fg` es el color del glifo encima.
 *
 * TikTok va en cian y no en su rojo `#FE2C55`: ese rojo y el de YouTube están
 * ambos en el tono 348° y a 14 píxeles son literalmente el mismo color. Con el
 * cian los cuatro tonos quedan separados 70–115° — cian, verde, púrpura, rojo —
 * y se distinguen de reojo.
 *
 * Es un cian rebajado (brillo 0.38) y no el `#25F4EE` del logo (0.71): ese neón
 * pesaba lo mismo que el verde de Kick mientras Twitch y YouTube rondan 0.20, así
 * que TikTok —la plataforma con más mensajes— dominaba la vista. A 0.38 queda
 * entre medias y los cuatro chips pesan parecido.
 *
 * `fg` existe porque cian y verde son claros: un glifo blanco encima casi no se
 * ve. Sobre esos dos va oscuro, sobre púrpura y rojo va blanco.
 */
/**
 * `glyph` es cuánto del chip ocupa el logo. No puede ser el mismo número para
 * todos: el chip es un círculo y las esquinas del recuadro de un glifo se salen
 * de él, así que un logo que llena su recuadro —la K de Kick— necesita menos
 * escala que uno con mucho aire, como la nota de TikTok.
 */
export const PLATFORM_META: Record<
  Platform,
  { label: string; color: string; fg: string; glyph: number }
> = {
  tiktok:   { label: 'TikTok',   color: '#06B6D4', fg: '#04222b', glyph: 0.84 },
  twitch:   { label: 'Twitch',   color: '#9146FF', fg: '#ffffff', glyph: 0.76 },
  youtube:  { label: 'YouTube',  color: '#FF0033', fg: '#ffffff', glyph: 0.88 },
  kick:     { label: 'Kick',     color: '#53FC18', fg: '#0a1f04', glyph: 0.68 },
  restream: { label: 'Restream', color: '#4353FF', fg: '#ffffff', glyph: 0.76 },
};
