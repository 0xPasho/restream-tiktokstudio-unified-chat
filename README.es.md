# restream-tiktokstudio-unified-chat

**Un solo chat para TikTok, Twitch, YouTube y Kick.** Los mensajes se guardan en
SQLite, se ven en un dashboard de Next.js, y puedes meterlos en OBS como overlay
transparente.

*[Read this in English →](README.md)*

---

<p align="center">
  <img src="docs/dashboard.png" width="540" alt="Dashboard unificado con mensajes de TikTok, Twitch, YouTube y Kick en un solo feed">
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

Abre <http://localhost:7637>. Esa es toda la instalación: no hay un segundo
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

## Un mensaje como tarjeta para video

Un short de stream suele abrir con la pregunta que el streamer contesta, y esa pregunta es
un mensaje de este chat. `?card=<id>` dibuja un mensaje como tarjeta a tamaño de lienzo
vertical: 1000 px de ancho a escala 1, casi opaca, transparente alrededor, y con el avatar
incrustado para que la imagen viva más que los enlaces caducos de TikTok.

```bash
npm run shot -- --card 1442                 # → /tmp/card-1442.png, con canal alfa
npm run shot -- --card 1442 --out card.png
```

<p align="center">
  <img src="docs/card.png" width="540" alt="Un mensaje del chat dibujado como tarjeta para un video vertical">
</p>

La claqueta que aparece junto a la hora de un mensaje en el panel abre esta misma vista en
una pestaña: así se consigue el id. `?scale=` cambia el tamaño de toda la tarjeta; el id es
el de la fila, así que un editor de video que lea `chat.db` puede pedir el mismo mensaje.

## El dinero

Los super chats, las subs, los bits, las subs regaladas y los regalos de TikTok
llegan al feed y al overlay con su valor puesto.

| Plataforma | Qué llega | Qué se ve |
|---|---|---|
| YouTube | importe y moneda del Super Chat | la cifra de la plataforma, `MX$100.00` |
| Twitch | bits, nivel de sub, meses, regaladas | `2,000 bits`, `Tier 2 · 6 meses` |
| Kick | meses de sub y regaladas | `Sub · ×5 regaladas` |
| TikTok | diamantes del combo entero | `5,000` con un diamante |

**Sólo YouTube expone dinero de verdad.** Una sub de Twitch o de Kick trae un
nivel, no un precio — los dólares detrás de `Tier 2` son el precio de lista de
la plataforma, no algo que haya dicho su API. Los bits y los diamantes se
convierten a su tasa publicada.

La cifra que se muestra es siempre la que mandó la plataforma, nunca una
conversión nuestra. Las tasas sirven para una sola cosa: decidir cuánto resalta
la fila. Cuatro niveles de un mismo color — oro, y aquí el oro es del dinero y
de nada más:

| Nivel | Más o menos | Cómo se pinta |
|---|---|---|
| 0 | menos de 2 USD | la tira compacta de siempre, con una píldora chica |
| 1 | 2–10 USD | tarjeta con aro dorado |
| 2 | 10–50 USD | aro más marcado |
| 3 | 50 USD o más | aro al máximo, píldora sólida |

El nivel 0 no lleva píldora en el overlay. Una rosa de un diamante no merece la
misma etiqueta dorada que un super chat de mil pesos en la pantalla de quien te
ve — en el dashboard sí aparece, que ese es tuyo.

### Galería

Cada tipo de mensaje por separado, como lo ve tu público en el overlay y como
lo ves tú en el panel. Se regenera con `npm run shot -- --gallery`.

| | Overlay | Panel |
|---|---|---|
| Chat | ![](docs/messages/overlay-chat.png) | ![](docs/messages/feed-chat.png) |
| Chat con insignias | ![](docs/messages/overlay-chat-badges.png) | ![](docs/messages/feed-chat-badges.png) |
| Follow | ![](docs/messages/overlay-follow.png) | ![](docs/messages/feed-follow.png) |
| Raid | ![](docs/messages/overlay-raid.png) | ![](docs/messages/feed-raid.png) |
| Regalo · nivel 0 | ![](docs/messages/overlay-gift.png) | ![](docs/messages/feed-gift.png) |
| Super Chat · nivel 1 | ![](docs/messages/overlay-superchat.png) | ![](docs/messages/feed-superchat.png) |
| Sub · nivel 1 | ![](docs/messages/overlay-sub.png) | ![](docs/messages/feed-sub.png) |
| Bits · nivel 2 | ![](docs/messages/overlay-bits.png) | ![](docs/messages/feed-bits.png) |
| Subs regaladas · nivel 2 | ![](docs/messages/overlay-gifted-subs.png) | ![](docs/messages/feed-gifted-subs.png) |
| Diamantes · nivel 2 | ![](docs/messages/overlay-diamonds.png) | ![](docs/messages/feed-diamonds.png) |
| Super Chat · nivel 3 | ![](docs/messages/overlay-superchat-big.png) | ![](docs/messages/feed-superchat-big.png) |

### Cuando un importe no aparece

El WebSocket del embed de Restream no está documentado, así que el colector
busca los *nombres* de los campos de dinero (`amount`, `amountMicros`,
`formattedAmount`, `bits`, `tier`…) por todo el payload en vez de leer rutas
fijas. Cuando no encuentra nada, el evento se guarda igual con su payload crudo
en `meta.raw`, y cualquier `eventTypeId` sin mapear queda registrado una vez con
una muestra. Nada se pierde en silencio:

```bash
# tipos de evento que llegaron sin mapear
sqlite3 data/chat.db "SELECT json_extract(meta,'\$.rawType'), COUNT(*) FROM events
  WHERE meta LIKE '%rawType%' GROUP BY 1"

# los payloads crudos, para ver cómo se llama el campo del importe
sqlite3 data/chat.db "SELECT platform, json_extract(meta,'\$.raw') FROM events
  WHERE meta LIKE '%raw%' ORDER BY id DESC LIMIT 20"
```

`CHAT_RAW=1` guarda el payload crudo de *todos* los eventos, chat incluido. Sirve
para un directo mientras cazas un campo; como ajuste permanente es desperdicio.

## Overlay para OBS

Agrega `?stream` a la URL y la página se vuelve un overlay transparente, sin
cabecera ni controles, anclado abajo:

```
http://localhost:7637/?stream
```

<p align="center">
  <img src="docs/overlay.png" width="720" alt="Overlay de chat transparente compuesto sobre una escena de video">
</p>

En **OBS**: agrega una fuente de tipo *Navegador*, pega esa URL y marca *Apagar
la fuente cuando no esté visible*. No hace falta CSS personalizado — la página
ya entrega canal alfa. En TikTok Studio funciona igual con su fuente de
navegador.

Cada mensaje va sobre una píldora casi opaca y con las letras contorneadas.
Ninguna de las dos cosas es decoración. Un negro *translúcido* no separa nada
cuando lo que hay detrás ya es oscuro — compartir pantalla de un editor o de una
página de documentación es justo ese caso, y el chat acaba compitiendo con el
texto de abajo. El contorno de las letras es el respaldo: aunque una escena
derrote a la píldora, los glifos conservan su propio borde.

Si aun así el chat se te pierde contra tu escena, sube la opacidad:

```
http://localhost:7637/?stream&opacity=0.95
```

### Parámetros

| Parámetro | Por defecto | Qué hace |
|---|---|---|
| `ttl` | `0` | Segundos antes de que un mensaje desaparezca. `0` los deja |
| `max` | `12` | Cuántos mensajes se ven a la vez (1–60) |
| `scale` | `1.1` | Escala del texto (0.5–3), para ajustar a tu escena |
| `opacity` | `0.82` | Opacidad del fondo de cada mensaje (0–1) |
| `outline` | on | Contorno oscuro alrededor de las letras |
| `events` | on | Regalos, follows, subs, raids y compartidos |
| `likes` | **off** | Likes |
| `bots` | **off** | Streamlabs y similares |

Los booleanos aceptan `?likes`, `?likes=1` o `?likes=true` para activar; `=0`,
`=false` o `=no` para apagar. Las entradas al live nunca aparecen en el overlay.

```
# se limpia solo tras un minuto de silencio, texto más grande
http://localhost:7637/?stream&ttl=60&scale=1.3

# mensajes y nada más
http://localhost:7637/?stream&events=0
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
| `CHAT_RAW` | no | apagado — `1` guarda todos los payloads crudos |

El `.env` da los valores iniciales. Lo que guardes desde la tuerquita se
persiste en SQLite y tiene prioridad — el archivo nunca se reescribe, porque
Next.js lo observa en desarrollo y reiniciaría el servidor justo a medio
reconfigurar.

## Correrlo en producción

```bash
npm run build
npm start
```

`next start` sirve en el **puerto 7637**, el mismo que `npm run dev`. Los
colectores también arrancan aquí — `instrumentation.ts` corre con `next start`, no
sólo en desarrollo — así que producción se comporta igual que desarrollo: un solo
proceso y nada más que levantar.

Para usar otro puerto, pásalo de largo:

```bash
npm run dev -- -p 3000
npm start -- -p 3000
```

Ten en cuenta que esto es un **servidor con estado y de larga vida**, no una app
de petición y respuesta. Mantiene WebSockets abiertos y escribe en un archivo
SQLite local, así que no encaja en plataformas serverless. Córrelo en una máquina
que se quede encendida: la tuya, un VPS, o un contenedor con un volumen
persistente montado en `data/`.

Como SQLite es un archivo local, `data/chat.db` es toda la base de datos. Para
respaldarla basta con copiarla — pero copia también `chat.db-wal`, o usa
`sqlite3 data/chat.db ".backup respaldo.db"` para obtener una instantánea
consistente mientras los colectores escriben.

### Como servicio en segundo plano (macOS)

`scripts/service.sh` instala el chat como agente de launchd: un proceso de
`node` normal que arranca al iniciar sesión, se relanza solo si algo lo mata y
sobrevive a cerrar la terminal.

```bash
./scripts/service.sh install    # construye, copia y carga el agente
./scripts/service.sh update     # reconstruye tras cambiar código
./scripts/service.sh status     # estado, pid y chequeo HTTP
./scripts/service.sh logs       # sigue stdout y stderr
./scripts/service.sh stop       # lo detiene y no se relanza
./scripts/service.sh uninstall  # quita el agente
```

Construye con `output: 'standalone'` y copia el resultado fuera del repo, a
`~/.local/share/unified-live-chat`, así que el proceso que corre es
`node .../start.js` y no la CLI de Next. Eso importa más de lo que parece: el
proceso además se renombra a `unified-live-chat`, lo que lo deja fuera del
alcance de las herramientas que barren servidores de desarrollo con
`pkill -f next` o matando lo que ocupe un puerto. Los ajustes viven en SQLite,
así que en el plist no queda ningún secreto.

Usa el servicio **o** `npm run dev`, nunca los dos: se atan al mismo puerto por
interfaces distintas y acabas con dos juegos de colectores sobre una sola base,
abriendo conexiones duplicadas a TikTok. `install` y `start` se niegan a correr
si el puerto ya está ocupado; `update` no, porque reinicia el servicio en su
sitio.

Un detalle que conviene saber si tocas el build: el bundle de standalone no
incluye `.next/server/instrumentation.js`, y Next carga ese archivo dentro de un
`try/catch` que se traga el `MODULE_NOT_FOUND`. Si falta, la app sirve las
páginas perfecto, sin colectores y sin un solo error en ningún lado.
`service.sh` copia el hook y sus dependencias trazadas después de cada build
justamente por eso.

## Desarrollo

```bash
npm run dev        # servidor + colectores en http://localhost:7637
npm test           # node --test tests/
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run build      # build de producción

npm run shot -- '/?stream' --on-video   # captura el overlay sobre una escena simulada
npm run shot -- --readme                # regenera las dos imágenes de docs/
npm run shot -- --gallery               # un recorte por tipo de mensaje, en docs/messages/
npm run shot -- --card 1442 --out docs/card.png   # un mensaje como tarjeta para video
```

Las imágenes del README se renderizan desde `docs/fixture.json` —un conjunto fijo
de mensajes reales— y no desde lo que haya en el chat en ese momento, así son
reproducibles y muestran la app haciendo su trabajo en vez de una rebanada
aleatoria de veinte segundos llena de likes. El script captura lo que esté
escuchando en `:7637`; si es el servicio de launchd, sirve el bundle *compilado*,
así que después de tocar la UI hay que recompilar o apuntar el script a un dev
server:

```bash
APP_URL=http://localhost:7638 npm run shot -- --readme
```

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
