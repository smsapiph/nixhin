import { Resvg } from '@resvg/resvg-js';
import jpeg from 'jpeg-js';
import satori from 'satori';
import type { AnimeDetail, MediaDetail } from '../../../shared/api.js';
import type { AnimeLink, MediaLink } from './pageMeta.js';

/**
 * Branded 1200×630 share card for an anime link: banner background, poster, title and
 * episode badge. Rendered with satori (layout → SVG) and resvg (SVG → pixels), then encoded as JPEG:
 * a PNG of a photo-like banner is ~800 KB, too heavy for Messenger/WhatsApp previews.
 */

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const C = {
  ink: '#1c1b22',
  cream: '#f6f4ef',
  accent: '#b83d62',
  accentLight: '#e0779a',
  soft: 'rgba(246,244,239,0.75)',
  faint: 'rgba(246,244,239,0.6)',
};

export interface CardFonts {
  /** Shippori Mincho 700 (Latin subset): wordmark and title. */
  readonly serif: ArrayBuffer;
  /** Zen Kaku Gothic New 500 (full Japanese): everything else, and fallback glyphs. */
  readonly sans: ArrayBuffer;
  /**
   * Noto Serif 700 / Noto Sans 500, Latin Extended only: letters the Japanese faces lack
   * (ō ū ā in romanised titles like "Shōgun", ł š ő in European ones).
   */
  readonly serifLatin: ArrayBuffer;
  readonly sansLatin: ArrayBuffer;
}

/** The font files in public/og-fonts, by CardFonts key. */
export const CARD_FONT_FILES: Readonly<Record<keyof CardFonts, string>> = {
  serif: 'shippori-mincho-700.ttf',
  sans: 'zen-kaku-gothic-new-500.ttf',
  serifLatin: 'noto-serif-700-latin-ext.ttf',
  sansLatin: 'noto-sans-500-latin-ext.ttf',
};

/** Each family falls back to its Latin Extended companion for missing letters. */
const SERIF = 'Serif, SerifLatin';
const SANS = 'Sans, SansLatin';

export interface CardImages {
  /** data: URIs, already fetched; null when missing or the fetch failed. */
  readonly banner: string | null;
  readonly poster: string | null;
}

export interface CardContent {
  readonly title: string;
  readonly native: string | null;
  /** e.g. "EPISODE 5", or "WATCH NOW" without an episode. */
  readonly badge: string;
  readonly language: string | null;
  readonly details: readonly string[];
}

/** A satori element: plain objects shaped like React elements, so no JSX/React is needed. */
interface Node {
  readonly type: string;
  readonly props: { readonly style?: Record<string, unknown>; readonly src?: string; readonly children?: unknown };
}

function el(style: Record<string, unknown>, ...children: (Node | string | null)[]): Node {
  return { type: 'div', props: { style: { display: 'flex', ...style }, children: children.filter((c) => c !== null) } };
}

function img(src: string, style: Record<string, unknown>): Node {
  return { type: 'img', props: { src, style } };
}

function languageBadge(language: string | null): string | null {
  if (language === 'dub') return 'ENGLISH DUB';
  if (language === 'sub') return 'SUB';
  return language ? language.toUpperCase() : null;
}

/** What the card says. Only episodes that exist get a badge, so made-up links stay generic. */
export function cardContent(anime: AnimeDetail, link: AnimeLink): CardContent {
  const known = anime.airedEpisodes ?? anime.episodes;
  const episode = link.episode !== null && (known === null || link.episode <= known) ? link.episode : null;
  const details = [
    anime.type,
    anime.year !== null ? String(anime.year) : null,
    anime.episodes !== null ? `${anime.episodes} episode${anime.episodes === 1 ? '' : 's'}` : (anime.genres[0] ?? null),
    anime.score !== null ? `★ ${anime.score.toFixed(1)}` : null,
  ].filter((d): d is string => d !== null);
  return {
    title: anime.title,
    // Skip the native title when it only repeats the main one (e.g. "ONE PIECE").
    native: anime.titleJapanese && anime.titleJapanese.toLowerCase() !== anime.title.toLowerCase() ? anime.titleJapanese : null,
    badge: episode !== null ? `EPISODE ${episode}` : 'WATCH NOW',
    language: episode !== null ? languageBadge(link.language) : null,
    details,
  };
}

/** "2h 46m" / "58m". */
function runtimeLabel(minutes: number | null): string | null {
  if (minutes === null) return null;
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/** The card for a movie or TV link. A TV episode badge appears only for episodes that exist. */
export function mediaCardContent(detail: MediaDetail, link: MediaLink): CardContent {
  const regular = detail.seasons.filter((season) => season.number > 0);
  const season = link.season === null ? undefined : detail.seasons.find((entry) => entry.number === link.season);
  const episode = season && link.episode !== null && link.episode <= season.episodeCount ? link.episode : null;
  const details =
    detail.kind === 'movie'
      ? ['Movie', detail.year !== null ? String(detail.year) : null, runtimeLabel(detail.runtime)]
      : [
          'TV show',
          detail.year !== null ? String(detail.year) : null,
          regular.length > 0 ? `${regular.length} season${regular.length === 1 ? '' : 's'}` : (detail.genres[0] ?? null),
        ];
  if (detail.score !== null) details.push(`★ ${detail.score.toFixed(1)}`);
  return {
    title: detail.title,
    native: detail.originalTitle,
    badge: season && episode !== null ? `S${season.number} · EPISODE ${episode}` : 'WATCH NOW',
    language: null,
    details: details.filter((d): d is string => d !== null),
  };
}

function titleSize(title: string, narrow: boolean): number {
  const n = title.length + (narrow ? 0 : -8);
  if (n > 60) return 46;
  if (n > 34) return 56;
  if (n > 22) return 66;
  return 78;
}

function dotted(items: readonly string[]): Node[] {
  return items.flatMap((item, i) => [
    ...(i ? [el({ margin: '0 14px', color: C.accentLight }, '·')] : []),
    el({}, item),
  ]);
}

export function cardTree(content: CardContent, images: CardImages): Node {
  const hasPoster = images.poster !== null;
  const background = images.banner ?? images.poster;
  const pill = (text: string, bg: string, color: string) =>
    el({ padding: '8px 18px', borderRadius: 999, background: bg, color, fontSize: 22, letterSpacing: 2 }, text);
  const title = content.title.length > 90 ? `${content.title.slice(0, 88).trimEnd()}…` : content.title;

  return el(
    { width: CARD_WIDTH, height: CARD_HEIGHT, position: 'relative', background: C.ink, fontFamily: SANS, color: C.cream },
    background ? img(background, { position: 'absolute', left: 0, top: 0, width: CARD_WIDTH, height: CARD_HEIGHT, objectFit: 'cover' }) : null,
    el({
      position: 'absolute',
      left: 0,
      top: 0,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      backgroundImage:
        'linear-gradient(90deg, rgba(28,27,34,0.97) 0%, rgba(28,27,34,0.92) 45%, rgba(28,27,34,0.55) 75%, rgba(28,27,34,0.35) 100%)',
    }),
    el(
      { position: 'absolute', left: 72, top: 60, bottom: 60, width: hasPoster ? 720 : 1056, flexDirection: 'column', justifyContent: 'space-between' },
      el(
        { alignItems: 'center' },
        el({ fontFamily: SERIF, fontSize: 38, letterSpacing: 2 }, 'nixhin'),
        el({ width: 11, height: 11, borderRadius: 999, background: C.accentLight, marginLeft: 10, marginTop: 10 }),
        el({ fontSize: 16, letterSpacing: 6, color: C.faint, marginLeft: 18, marginTop: 4 }, 'ニクシン'),
      ),
      el(
        { flexDirection: 'column' },
        el(
          { gap: 12, marginBottom: 26 },
          pill(content.badge, C.accent, '#ffffff'),
          content.language ? pill(content.language, 'rgba(246,244,239,0.14)', C.cream) : null,
        ),
        el({ fontFamily: SERIF, fontSize: titleSize(title, hasPoster), lineHeight: 1.08, letterSpacing: 0.5 }, title),
        content.native ? el({ fontSize: 24, color: C.faint, marginTop: 14, letterSpacing: 2 }, content.native) : null,
        content.details.length
          ? el({ fontSize: 22, color: C.soft, marginTop: 22, alignItems: 'center' }, ...dotted(content.details))
          : null,
      ),
      el(
        { alignItems: 'center', fontSize: 22, color: 'rgba(246,244,239,0.8)' },
        el({ width: 36, height: 2, background: C.accentLight, marginRight: 16 }),
        ...dotted(['Watch free', 'No account needed']),
      ),
    ),
    images.poster
      ? el(
          {
            position: 'absolute',
            right: 72,
            top: 85,
            width: 300,
            height: 460,
            borderRadius: 18,
            overflow: 'hidden',
            boxShadow: '0 30px 60px rgba(0,0,0,0.55)',
            border: '2px solid rgba(246,244,239,0.18)',
          },
          img(images.poster, { width: 300, height: 460, objectFit: 'cover' }),
        )
      : null,
  );
}

const JPEG_QUALITY = 82;

export async function renderCard(content: CardContent, images: CardImages, fonts: CardFonts): Promise<Uint8Array> {
  // Satori takes React-element-shaped objects; ours match that shape without depending on React.
  const svg = await satori(cardTree(content, images) as unknown as Parameters<typeof satori>[0], {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: [
      { name: 'Serif', data: fonts.serif, weight: 700, style: 'normal' },
      { name: 'Sans', data: fonts.sans, weight: 500, style: 'normal' },
      { name: 'SerifLatin', data: fonts.serifLatin, weight: 700, style: 'normal' },
      { name: 'SansLatin', data: fonts.sansLatin, weight: 500, style: 'normal' },
    ],
  });
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: CARD_WIDTH }, background: C.ink }).render();
  return jpeg.encode({ data: image.pixels, width: image.width, height: image.height }, JPEG_QUALITY).data;
}
