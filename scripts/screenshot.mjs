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

const browser = await chromium.launch();

async function shoot({ url, out, overlay, scene }) {
  const page = await browser.newPage({
    viewport: overlay ? { width: 620, height: 360 } : { width: 460, height: 780 },
    deviceScaleFactor: 2,
  });

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: HIDE_DEV_BADGE });
  await page.waitForTimeout(6000);

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
  await shoot({ url: base, out: 'docs/dashboard.png', overlay: false });
  console.log('overlay:');
  await shoot({ url: `${base}/?stream&max=6`, out: 'docs/overlay.png', overlay: true, scene: true });
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
