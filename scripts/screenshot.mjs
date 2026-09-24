/**
 * Screenshots a running instance.
 *
 *   node scripts/screenshot.mjs                        # dashboard → /tmp
 *   node scripts/screenshot.mjs '/?stream'             # overlay, transparent
 *   node scripts/screenshot.mjs '/?stream' --on-video  # overlay over a mock scene
 *   node scripts/screenshot.mjs --readme               # both, into docs/
 *   node scripts/screenshot.mjs --gallery              # one crop per message kind, into docs/messages/
 *   node scripts/screenshot.mjs --card 1442 [--out x.png]  # one message as a video card, alpha
 *
 * Requires a server running the code you want to shoot. The launchd service on
 * :7637 serves a *built* standalone bundle, so after touching the UI either
 * rebuild it or point APP_URL at a dev server:
 *
 *   npx next dev -p 7638 & APP_URL=http://localhost:7638 npm run shot -- --readme
 *
 * Playwright is a devDependency.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const readme = args.includes('--readme');
const gallery = args.includes('--gallery');
const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const cardId = valueOf('--card');
const outPath = valueOf('--out');
const path = args.find((a, i) => !a.startsWith('--') && !['--card', '--out'].includes(args[i - 1])) ?? '/';

// Stand-in for a stream scene: dark, with a bright band so the overlay has to
// prove it stays readable against both extremes.
// La especificidad tiene que superar a `html:has([data-overlay])` de globals.css,
// que es justo la regla que hace transparente la página.
const MOCK_SCENE = `
  html:has([data-overlay]) {
    background:
      radial-gradient(90% 60% at 20% 15%, #2b3a55 0%, transparent 60%),
      radial-gradient(70% 50% at 85% 70%, #d8d3c8 0%, transparent 55%),
      linear-gradient(160deg, #10131a 0%, #1c2230 55%, #3a3f4b 100%)
      !important;
  }
`;


/**
 * README mode serves a fixed set of real messages instead of whatever happens to
 * be in chat. Screenshots stay reproducible, and they show the app doing what it
 * is for — four platforms, badges, a gift, a follow — rather than a random
 * 20-second slice dominated by likes.
 */
function serveFixture(page, fixture = JSON.parse(readFileSync('docs/fixture.json', 'utf8'))) {

  // Stubbing EventSource rather than intercepting the request, because a
  // fulfilled response closes immediately — the browser reports the stream as
  // dead and the header's live dot goes grey. This stays "open" forever.
  return page.addInitScript((data) => {
    class FixtureEventSource extends EventTarget {
      constructor() {
        super();
        this.readyState = 1;
        queueMicrotask(() => {
          this.dispatchEvent(new Event('open'));
          this.dispatchEvent(
            new MessageEvent('init', { data: JSON.stringify(data) }),
          );
        });
      }
      close() {}
    }
    Object.defineProperty(window, 'EventSource', { value: FixtureEventSource });
  }, { events: fixture.events, stats: fixture.stats, status: fixture.status });
}

const browser = await chromium.launch();

/**
 * The dashboard shot is a column, not a phone. 540px wide puts ~60 characters on
 * a line at 15px, so most messages fit in one line instead of wrapping into two,
 * and the README shows the image at its natural size, so nothing gets rescaled.
 */
const DASHBOARD = { width: 540, height: 720 };
const OVERLAY = { width: 720, height: 405 };   // 16:9, what OBS actually frames

/** View prefs live in localStorage; this seeds them before the app reads them. */
function seedPrefs(page, prefs) {
  return page.addInitScript((p) => {
    window.localStorage.setItem('chat-view-prefs', JSON.stringify(p));
  }, prefs);
}

/**
 * The feed is bottom-anchored: whatever does not fit is cut off *above*, under
 * the header, and the topmost visible row shows up beheaded. Grow the viewport
 * until the scroller has no overflow, so every row in the shot is whole.
 */
async function fitToContent(page, viewport, maxHeight) {
  for (let i = 0; i < 4; i++) {
    const overflow = await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find((d) => getComputedStyle(d).overflowY === 'auto');
      return el ? el.scrollHeight - el.clientHeight : 0;
    });
    if (overflow <= 0) return viewport;
    const height = Math.min(maxHeight, viewport.height + overflow);
    if (height === viewport.height) {
      console.log(`  ⚠ ${overflow}px still cut off at the top — trim docs/fixture.json`);
      return viewport;
    }
    viewport = { ...viewport, height };
    await page.setViewportSize(viewport);
    await page.waitForTimeout(300);
  }
  return viewport;
}

async function shoot({ url, out, overlay, scene, fixture, prefs }) {
  let viewport = overlay ? OVERLAY : DASHBOARD;
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  if (fixture) await serveFixture(page);   // debe registrarse antes del goto
  if (prefs) await seedPrefs(page, prefs);

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(fixture ? 2500 : 6000);

  if (!overlay) {
    viewport = await fitToContent(page, viewport, 960);
    console.log(`  viewport: ${viewport.width}×${viewport.height}`);
  }

  if (scene) {
    await page.addStyleTag({ content: MOCK_SCENE });
    await page.waitForTimeout(400);
  }

  if (overlay) {
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const clear = bg.endsWith(', 0)');
    console.log(`  body background: ${bg} ${clear ? '✓ transparent' : '✗ NOT transparent'}`);
  }

  // omitBackground captures the alpha channel, the way OBS composites it.
  await page.screenshot({ path: out, omitBackground: overlay && !scene });
  console.log(`  console errors: ${errors.length ? errors.slice(0, 3).join(' | ') : 'none'}`);
  console.log(`  saved: ${out}`);
  await page.close();
}

const base = process.env.APP_URL ?? 'http://localhost:7637';

/**
 * One message as the card a short opens on: 1000px wide at scale 1, transparent,
 * cropped to the card and its shadow. Reads the real database, so the id is one
 * from the dashboard (the clapperboard next to a message's time opens the same
 * view in a tab).
 */
async function shootCard(id, out) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1400 }, deviceScaleFactor: 2 });
  await page.goto(`${base}/?card=${encodeURIComponent(id)}`, { waitUntil: 'networkidle' });
  const card = page.locator('[data-card]');
  if (!(await card.count())) throw new Error(`no card for message ${id}: ${await page.locator('main').innerText()}`);
  await settleImages(page);
  await card.screenshot({ path: out, omitBackground: true });
  const box = await card.boundingBox();
  console.log(`  saved: ${out} (${Math.round(box.width * 2)}×${Math.round(box.height * 2)} px, alpha)`);
  await page.close();
}

/**
 * One message, alone, cropped to its row. `docs/gallery.json` holds an example
 * per kind — chat, follow, gift, each money level — and each one is shot twice:
 * as an overlay pill over the mock scene, and as a dashboard row. The README's
 * money table points at these instead of describing "a gold ring" in words.
 */
/** Avatars and badges load lazily; a crop taken mid-load shows initials instead. */
async function settleImages(page) {
  await page
    .waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 4000 })
    .catch(() => console.log('  ⚠ some images never loaded (expired CDN URL?)'));
  await page.waitForTimeout(200);
}

async function shootGallery() {
  const fixture = JSON.parse(readFileSync('docs/fixture.json', 'utf8'));
  const { examples } = JSON.parse(readFileSync('docs/gallery.json', 'utf8'));
  mkdirSync('docs/messages', { recursive: true });

  for (const { name, event } of examples) {
    const data = { events: [event], stats: fixture.stats, status: fixture.status };

    for (const overlay of [true, false]) {
      const page = await browser.newPage({
        viewport: overlay ? { width: OVERLAY.width, height: 200 } : { width: DASHBOARD.width, height: 320 },
        deviceScaleFactor: 2,
      });
      await serveFixture(page, data);
      if (!overlay) await seedPrefs(page, { textSize: 15 });
      await page.goto(overlay ? `${base}/?stream&max=1&scale=1` : base, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      await settleImages(page);
      if (overlay) {
        await page.addStyleTag({ content: MOCK_SCENE });
        await page.waitForTimeout(300);
      }

      // The message is the last <li>: the feed may put a history spacer above it.
      const row = page.locator('li').last();
      const box = await row.boundingBox();
      if (!box) throw new Error(`${name}: no row rendered`);
      const pad = overlay ? 14 : 6;
      const clip = {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: Math.min(box.width + pad * 2, (overlay ? OVERLAY : DASHBOARD).width - Math.max(0, box.x - pad)),
        height: box.height + pad * 2,
      };
      const out = `docs/messages/${overlay ? 'overlay' : 'feed'}-${name}.png`;
      await page.screenshot({ path: out, clip });
      console.log(`  saved: ${out} (${Math.round(clip.width)}×${Math.round(clip.height)})`);
      await page.close();
    }
  }
}

if (cardId) {
  await shootCard(cardId, outPath ?? `/tmp/card-${cardId}.png`);
} else if (gallery) {
  await shootGallery();
} else if (readme) {
  console.log('dashboard:');
  await shoot({
    url: base,
    out: 'docs/dashboard.png',
    overlay: false,
    fixture: true,
    prefs: { textSize: 15 },
  });
  console.log('overlay:');
  await shoot({
    url: `${base}/?stream&max=8&scale=1`,
    out: 'docs/overlay.png',
    overlay: true,
    scene: true,
    fixture: true,
  });
} else {
  const overlay = path.includes('stream');
  await shoot({
    url: new URL(path, base).href,
    out: `/tmp/chat-${overlay ? 'overlay' : 'dashboard'}.png`,
    overlay,
    scene: args.includes('--on-video'),
  });
}

await browser.close();
