/**
 * Screenshots a running instance.
 *
 *   node scripts/screenshot.mjs                        # dashboard → /tmp
 *   node scripts/screenshot.mjs '/?stream'             # overlay, transparent
 *   node scripts/screenshot.mjs '/?stream' --on-video  # overlay over a mock scene
 *   node scripts/screenshot.mjs --readme               # both, into docs/
 *
 * Requires the dev server to be running. Playwright is a devDependency.
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const readme = args.includes('--readme');
const path = args.find((a) => !a.startsWith('--')) ?? '/';

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

/** El indicador de dev de Next no debe salir en las capturas del README. */
const HIDE_DEV_BADGE = `nextjs-portal { display: none !important; }`;

/**
 * README mode serves a fixed set of real messages instead of whatever happens to
 * be in chat. Screenshots stay reproducible, and they show the app doing what it
 * is for — four platforms, badges, a gift, a follow — rather than a random
 * 20-second slice dominated by likes.
 */
function serveFixture(page) {
  const fixture = JSON.parse(readFileSync('docs/fixture.json', 'utf8'));

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

async function shoot({ url, out, overlay, scene, fixture }) {
  const page = await browser.newPage({
    viewport: overlay ? { width: 620, height: 360 } : { width: 460, height: 840 },
    deviceScaleFactor: 2,
  });

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  if (fixture) await serveFixture(page);   // debe registrarse antes del goto

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: HIDE_DEV_BADGE });
  await page.waitForTimeout(fixture ? 2500 : 6000);

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

const base = 'http://localhost:3000';

if (readme) {
  console.log('dashboard:');
  await shoot({ url: base, out: 'docs/dashboard.png', overlay: false, fixture: true });
  console.log('overlay:');
  await shoot({
    url: `${base}/?stream&max=6`,
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
