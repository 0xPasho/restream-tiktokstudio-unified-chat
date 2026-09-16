# restream-tiktokstudio-unified-chat

**Un solo chat para TikTok, Twitch, YouTube y Kick.** Los mensajes se guardan en
SQLite, se ven en un dashboard de Next.js, y puedes meterlos en OBS como overlay
transparente.

*[Read this in English →](README.md)*

---

<p align="center">
  <img src="docs/dashboard.png" width="440" alt="Dashboard unificado con mensajes de TikTok, Twitch, YouTube y Kick en un solo feed">
</p>

<p align="center">
  <em>El dashboard. Cada mensaje lleva el avatar de su autor con el logo de la plataforma incrustado.</em>
</p>

---

Transmitir a varias plataformas a la vez significa vigilar varios chats a la
vez. Esto los junta en un solo feed donde cada mensaje lleva el avatar de su
autor con el logo de la plataforma incrustado, así sabes de dónde viene sin
tener que leer ninguna etiqueta.

- **Sin screenshots, sin OCR, sin navegador headless.** Las dos fuentes
  entregan JSON estructurado con un ID único por mensaje.
- **No hace falta TikTok Studio.** El nombre alude a dónde vive normalmente tu
  chat — el embed de Restream y el panel de TikTok Studio. Esto lee el WebSocket
  del LIVE de TikTok directamente, así que la app de escritorio no necesita estar
  abierta ni instalada.
- **Sin credenciales de TikTok.** Solo tu `@usuario`.
- **Un solo proceso.** Los colectores arrancan con el servidor de Next.js.
- **No se pierde nada al reconectar.** La deduplicación es un índice único en
  SQLite, no una heurística.

## Requisitos

- Node.js 22 o superior — el colector de Restream usa el `WebSocket` nativo
- Una cuenta de [Restream](https://restream.io) para Twitch, YouTube y Kick
- Una cuenta de TikTok que transmita en vivo

TikTok y Restream son independientes. Configura una, las dos, o ninguna: lo que
falte simplemente se desactiva, y la cabecera te dice cuál.

## Instalación

```bash
git clone https://github.com/<tu-usuario>/restream-tiktokstudio-unified-chat
cd restream-tiktokstudio-unified-chat
npm install
cp .env.example .env
```

Llena el `.env`:

```ini
# De https://chat.restream.io — la URL del embed es
#   https://chat.restream.io/embed?token=TU-TOKEN-AQUI
RESTREAM_CHAT_TOKEN=tu-token-aqui

# Tu usuario de TikTok, sin la arroba
TIKTOK_USERNAME=tuusuario
```

Y luego:

```bash
npm run dev
```

Abre <http://localhost:3000>. Esa es toda la instalación: no hay un segundo
proceso que arrancar.

Una vez corriendo puedes cambiar ambos valores desde la **tuerquita** en la
cabecera, sin tocar el `.env` ni reiniciar nada.

## El dashboard

Cada fila es el avatar del autor con el logo de su plataforma incrustado en la
esquina, su nombre, sus badges y el mensaje. Los nombres reciben un color
estable derivado de su ID, así los habituales se vuelven reconocibles de un
vistazo. Los usuarios de Twitch que eligieron color propio lo conservan.

Los botones de plataforma en la cabecera sirven de filtro y de indicador de
conexión a la vez: punto verde es conectado, ámbar reconectando, rojo algo se
rompió. Haz clic en uno para ocultar esa plataforma.

Los likes y las entradas de una misma persona se colapsan en una sola fila
dentro de una ventana de 30 segundos. TikTok manda los likes en ráfagas, y sin
esto entierran la conversación.

### Filtros de vista

Dentro de la tuerquita:

| Interruptor | Por defecto | Qué hace |
|---|---|---|
| Sólo mensajes | off | Oculta likes, regalos, follows, shares y entradas |
| Entradas al live | off | Avisa cuando alguien entra |
| Mensajes de bots | on | Streamlabs, Nightbot y similares |

Se guardan en `localStorage`. Son preferencias de presentación de este navegador
y se aplican al instante, a diferencia del token y el usuario, que cambian los
sockets del colector y viven en SQLite.

## Overlay para OBS

Agrega `?stream` a la URL y la página se vuelve un overlay transparente, sin
cabecera ni controles, anclado abajo:

```
http://localhost:3000/?stream
```

<p align="center">
  <img src="docs/overlay.png" width="620" alt="Overlay de chat transparente compuesto sobre una escena de video">
</p>

En **OBS**: agrega una fuente de tipo *Navegador*, pega esa URL y marca *Apagar
la fuente cuando no esté visible*. No hace falta CSS personalizado — la página
ya entrega canal alfa. En TikTok Studio funciona igual con su fuente de
navegador.

Cada mensaje va sobre una píldora semitransparente con blur detrás. Eso no es
decoración: sin ella el texto desaparece sobre escenas claras.

### Parámetros

| Parámetro | Por defecto | Qué hace |
|---|---|---|
| `ttl` | `0` | Segundos antes de que un mensaje desaparezca. `0` los deja |
| `max` | `12` | Cuántos mensajes se ven a la vez (1–60) |
| `scale` | `1` | Escala del texto (0.5–3), para ajustar a tu escena |
| `events` | on | Regalos, follows, subs, raids y compartidos |
| `likes` | **off** | Likes |
| `bots` | **off** | Streamlabs y similares |

Los booleanos aceptan `?likes`, `?likes=1` o `?likes=true` para activar; `=0`,
`=false` o `=no` para apagar. Las entradas al live nunca aparecen en el overlay.

```
# se limpia solo tras un minuto de silencio, texto más grande
http://localhost:3000/?stream&ttl=60&scale=1.3

# mensajes y nada más
http://localhost:3000/?stream&events=0
```

Los likes vienen apagados por una razón: en un live activo llegan cada segundo y
tus espectadores no verían más que "mandó 15 likes".

## Cómo entran los datos

| Fuente | Mecanismo | Credenciales |
|---|---|---|
| TikTok | WebSocket del LIVE vía [`tiktok-live-connector`](https://github.com/isaackogan/TikTokLive) | ninguna — sólo el `@usuario` |
| Twitch · YouTube · Kick | `wss://backend.chat.restream.io/ws/embed` | el token del embed |

El embed de Restream es una página web, pero la URL de su WebSocket se arma con
el mismo token que usa el embed, así que no hay ningún navegador de por medio.

El WebSocket de TikTok requiere un handshake firmado, que
[`tiktok-live-connector`](https://github.com/isaackogan/TikTokLive) obtiene del
tier gratuito de Euler Stream. Es una firma por conexión, no por mensaje, así
que un stream de varias horas cuesta una sola petición. El colector usa backoff
exponencial justamente para que un bucle de reconexión no se coma esa cuota.

**Esto es ingeniería inversa, no una API oficial.** TikTok puede romperlo en
cualquier momento. Para un dashboard personal es un trade razonable; para algo
de lo que dependas, no.

## Arquitectura

```
instrumentation.ts        arranca los colectores al levantar el servidor
src/server/
  collector.ts            orquesta, valida la config y reinicia en caliente
  tiktok.ts               chat, regalos, likes, follows, shares, entradas, viewers
  restream.ts             las otras tres plataformas
  db.ts                   esquema, escritura y deduplicación
  settings.ts             token y usuario, con el .env como valor inicial
  status.ts               estado de conexión que lee la UI
src/app/api/stream/       SSE — historial al conectar, después sólo lo nuevo
src/app/api/settings/     lee y guarda los ajustes; al guardar, reconecta
src/app/api/status/       estado de conexión en JSON
src/components/chat/      fila de mensaje, avatar con chip, badges, overlay
src/lib/                  tipos, lectura readonly, color por usuario, colapso, prefs
```

Tres decisiones que conviene conocer antes de cambiar nada:

**La deduplicación es de la base de datos.** El índice único sobre
`(platform, external_id)` hace que un colector pueda caerse, reconectar y
repetir sin duplicar una sola fila. La clave de Restream es
`payload.eventIdentifier` — **no** `payload.eventId`, que parece un UUID por
mensaje pero es constante durante toda la sesión y hasta se repite entre
plataformas. Usar el equivocado descarta en silencio todo mensaje después del
primero.

**Los colectores tienen que arrancar exactamente una vez.** El guard en
`collector.ts` vive en `globalThis` y no en el scope del módulo, porque el
hot-reload de desarrollo reevalúa los módulos y abriría un socket nuevo en cada
guardado — lo que en TikTok además gasta una firma cada vez.

**Un socket muerto no siempre se cierra.** Un TCP medio abierto sigue
"conectado" sin entregar nada. Restream manda un heartbeat cada pocos segundos,
así que el colector interpreta 45 segundos de silencio total como muerte y
reconecta.

## Referencia de configuración

| Variable | Obligatoria | Por defecto |
|---|---|---|
| `RESTREAM_CHAT_TOKEN` | para Twitch/YouTube/Kick | — |
| `TIKTOK_USERNAME` | para TikTok | — |
| `CHAT_DB_PATH` | no | `./data/chat.db` |

El `.env` da los valores iniciales. Lo que guardes desde la tuerquita se
persiste en SQLite y tiene prioridad — el archivo nunca se reescribe, porque
Next.js lo observa en desarrollo y reiniciaría el servidor justo a medio
reconfigurar.

## Desarrollo

```bash
npm run dev        # servidor + colectores
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run build      # build de producción

npm run shot -- '/?stream' --on-video   # captura el overlay sobre una escena simulada
npm run shot -- --readme                # regenera las dos imágenes de docs/
```

Las imágenes del README se renderizan desde `docs/fixture.json` —un conjunto fijo
de mensajes reales— y no desde lo que haya en el chat en ese momento, así son
reproducibles y muestran la app haciendo su trabajo en vez de una rebanada
aleatoria de veinte segundos llena de likes.

La base es un archivo SQLite normal, así que puedes consultarla directo:

```bash
sqlite3 data/chat.db "SELECT platform, type, COUNT(*) FROM events GROUP BY 1, 2"
```

## Pendiente

- Inferencia con Claude: resumen del chat, preguntas sin responder, momentos clipeables
- Despliegue remoto
- Acciones de moderación desde el dashboard

## Licencia

MIT — ver [LICENSE](LICENSE).

Este proyecto no está afiliado a TikTok, Twitch, YouTube, Kick ni Restream. La
integración con TikTok depende de una librería no oficial de ingeniería inversa;
revisa los términos de servicio de cada plataforma antes de desplegar esto en
algún lugar público.
