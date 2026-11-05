# Lector de Bagtags — control operativo en la salida de equipajes

Aplicación web progresiva (PWA) para el personal de seguridad en la salida de la sala de recogida de equipajes. Comprueba que cada maleta que sale pertenece al pasajero que la lleva: compara el **LPN IATA** de la etiqueta de la maleta (bag tag) con el del **resguardo** (claim tag) pegado en la tarjeta de embarque. Al cerrar el turno genera un **informe CSV y PDF**.

- Funciona en Android (Chrome) e iOS (Safari) y se instala en la pantalla de inicio.
- **Funciona 100 % sin conexión** tras la primera carga. No envía nada a ningún servidor.
- Interfaz en español, botones grandes y alto contraste, tema oscuro y claro.

---

## 1. Arquitectura

```
src/
├── domain/            Lógica pura, sin dependencias del navegador (con tests)
│   ├── lpn.ts         Parseo y validación del LPN (Res. IATA 740) y de "IB 123456"
│   ├── airlines.ts    Tabla editable IATA 2 letras ↔ código de 3 dígitos
│   ├── bcbp.ts        Parser de la tarjeta de embarque BCBP (Res. IATA 792)
│   ├── confirm.ts     Doble lectura idéntica (antilecturas parciales del ITF)
│   ├── matcher.ts     Comparación maleta ↔ resguardos y resultado global
│   ├── classify.ts    ¿La lectura es un LPN, un BCBP o no es válida?
│   ├── report.ts      Resumen del turno y CSV (UTF-8 con BOM, separador ;)
│   ├── retention.ts   Plan de borrado automático (RGPD)
│   ├── config.ts      Configuración por defecto y validación del JSON importado
│   └── types.ts       Modelos persistidos
├── storage/           IndexedDB (idb) y PIN de supervisor (SHA-256 con sal)
├── scanner/
│   ├── camera.ts      Servicio único de cámara: región de interés, linterna, zoom, wake lock
│   ├── decoders.ts    BarcodeDetector nativo o zxing-wasm según el navegador
│   └── decoder.worker.ts  zxing-wasm en un Web Worker (no bloquea la interfaz)
├── app/               Estado global (store.ts) y acciones del flujo (actions.ts)
├── ui/                Pantallas en Preact: turno, control, resultado, incidencia, informe, configuración, demostración
├── report/            PDF (jsPDF, cargado bajo demanda) y compartir (Web Share API)
├── demo/              Escenarios y generación de códigos de prueba
└── sync/              Interfaz SyncAdapter para la futura sincronización (no implementada)
tests/                 Pruebas unitarias (Vitest) y códigos de ejemplo
```

- **Vite + Preact + TypeScript**. Preact pesa unos 4 KB y tiene la misma API que React.
- **Lectura de códigos**: se usa `BarcodeDetector` si el navegador lo tiene y admite ITF (Chrome Android). Si no, se usa **zxing-wasm** (zxing-cpp en WebAssembly) dentro de un Web Worker, que es el caso de iOS Safari, Firefox y los navegadores de escritorio. El `.wasm` se sirve desde la propia app, sin CDN, y el Service Worker lo precachea.
- **Service Worker** (Workbox, generado por `vite-plugin-pwa`): precachea todos los ficheros. Las actualizaciones nunca se aplican en mitad de un control: la app avisa y el vigilante decide cuándo actualizar.
- **IndexedDB** para turnos, controles, incidencias (con fotos) y configuración. Al arrancar se pide almacenamiento persistente para que el navegador no borre los datos.

## 2. Limitaciones conocidas

| Problema | Impacto | Mitigación |
| --- | --- | --- |
| **ITF en iOS** | Safari no tiene `BarcodeDetector`, así que se decodifica con zxing-wasm, que es más lento que la lectura nativa (unos 80-200 ms por fotograma en un iPhone medio). iOS tampoco permite vibración y normalmente no permite linterna ni zoom desde la web. | Se analiza solo la franja del marco guía y se reduce a 1280 px de ancho. La decodificación va en un Worker. El aviso al usuario es sonoro y visual. |
| **ITF sin dígito de control** | Una etiqueta mal impresa o una lectura de 6 u 8 dígitos se puede tomar por un código válido. | Se exige una **longitud exacta de 10 dígitos** y **dos lecturas idénticas consecutivas** (configurable). Si coinciden la aerolínea y la serie pero no el código completo, se pide **validación manual**. |
| **Etiquetas arrugadas o dobladas** | El código sale parcial o no se lee. | Estirar la etiqueta. Si aun así falla, usar **⌨ Manual** (10 dígitos, aerolínea + 6 dígitos, o 9 dígitos). Queda marcado como "validación manual". |
| **Reflejos del plástico** (fundas, film y luz fluorescente) | Se pierden barras. | Inclinar la etiqueta 10-20°, apagar la linterna y usar el zoom en vez de acercar el móvil. Para mucha luz, tema claro de alto contraste. |
| **Móviles de gama baja** | Pocas lecturas por segundo y calentamiento. | Región de interés reducida, cadencia adaptativa (≤10 análisis/s), pausa de la decodificación mientras se muestra un resultado y liberación de la cámara cuando la app pasa a segundo plano. |
| **Mismo código en resguardo y maleta** | La app no distingue físicamente un resguardo de una etiqueta: si se escanea dos veces el resguardo, cuenta como maleta. | El flujo tiene dos pasos explícitos (botón **MALETAS →**). El paso automático al volver a leer el mismo código está **desactivado por defecto**. |
| **Tabla de aerolíneas** | Algunas filiales o handlings emiten etiquetas con el código de 3 dígitos de otra compañía. | La tabla es editable y se distribuye con el JSON de configuración. Los valores por defecto son orientativos. |
| **Fecha del BCBP** | El BCBP trae el día juliano sin año. | Se elige el año más cercano a la fecha actual. |

## 3. Uso

1. **Inicio de turno**: vigilante (TIP), aeropuerto, terminal, puesto, fecha y hora, y opcionalmente los vuelos controlados (con selección rápida de los últimos usados).
2. **Control**:
   1. Escanear el resguardo o los resguardos ("N resguardos leídos"). Opcionalmente, el PDF417, QR o Aztec de la tarjeta de embarque, para asociar el vuelo. Si el BCBP trae LPN de equipaje, se añaden como resguardos.
   2. Pulsar **MALETAS →** y escanear cada etiqueta.
   3. Resultado a pantalla completa:
      - 🟢 **CORRECTO**: se reinicia solo a los 3 s (configurable).
      - 🔴 **NO COINCIDE**: indica qué maleta y abre la ficha de incidencia.
      - 🟠 **INCOMPLETO**: el vigilante puede *Confirmar correcto* (se guarda como validación manual), escanear otra maleta o abrir una incidencia.
      - ⚪ **YA CONTROLADA**: muestra la hora del control anterior.
      - 🟡 **COMPROBAR**: coincidencia parcial (misma aerolínea y serie, distinto código completo). Hay que confirmarla visualmente.
3. **Incidencias**: tipo y acción (listas editables), observaciones, fotos con la cámara y datos del pasajero leídos del BCBP (solo aquí y solo si se marca la casilla).
4. **Cierre de turno**: resumen, CSV, PDF con fotos, compartir con la hoja nativa del móvil (correo, Teams…) y, después, opción de borrar los datos del turno con el PIN.

**Lector Bluetooth o USB**: emparejarlo en modo teclado (HID). La pantalla de control tiene un campo con foco permanente que no abre el teclado virtual (`inputmode="none"`) y recibe la lectura terminada en Enter. Se ignoran los prefijos AIM (`]I0`).

**Entrada manual** (teclado numérico grande):

| Entrada | Resultado |
| --- | --- |
| `0075123456` | LPN completo |
| `IB` + `123456` o `IB 123456` | `0075123456` (se supone el tipo 0) |
| `075123456` (9 dígitos) | Aerolínea + serie sin tipo. La coincidencia pedirá validación manual. |

## 4. Privacidad (RGPD)

- **Controles**: solo se guardan los LPN, la hora, el resultado, el vuelo y la duración. Nunca nombres, PNR ni asiento.
- **Incidencias**: son el único registro que puede contener datos del pasajero (nombre, PNR, vuelo, ruta y fecha del BCBP), y solo si el vigilante lo marca.
- Los datos del BCBP de un control correcto solo existen en memoria y se descartan al pasar al siguiente pasajero.
- Todo se queda en el dispositivo. No hay analítica, ni CDN, ni peticiones de red.
- Borrado automático: controles **72 h** e incidencias **30 días** por defecto (configurable). Se comprueba al arrancar y cada 15 minutos.
- Borrado manual del turno o de todos los datos con el **PIN de supervisor**.

## 5. Configuración (PIN de supervisor)

El PIN por defecto es **`1234`** y la app avisa hasta que se cambia. Desde Configuración se puede:

- Editar las listas de tipos de incidencia, acciones y puestos, y la tabla de aerolíneas.
- Ajustar el reinicio automático, los sonidos, la vibración, la doble lectura, el motor de lectura y el tema.
- Elegir el formato de los LPN en el CSV:
  - **Excel**: `="0075123456"`, para conservar los ceros iniciales al abrir el fichero con doble clic.
  - **Plano**: para Power Automate o SharePoint.
- Ajustar los plazos de borrado automático.
- **Exportar o importar la configuración en JSON** para desplegar la misma en todos los dispositivos. Incluye el hash del PIN, nunca el PIN en claro. Las preferencias propias del dispositivo, como el último vigilante o los vuelos recientes, no se exportan.

## 6. CSV del informe

UTF-8 con BOM, separador `;` y fin de línea CRLF. Una fila por control (`registro=CONTROL`) y otra por incidencia (`registro=INCIDENCIA`). Las columnas `pasajero_*` solo se rellenan en las filas de incidencia. Incluye `fecha_hora_iso` con la zona horaria, útil para Power Automate. En el texto libre se neutraliza la inyección de fórmulas.

## 7. Desarrollo

```bash
cd bagtags-pwa
npm install
npm run dev        # http://localhost:5173 (la cámara funciona en localhost)
npm test           # pruebas unitarias (LPN, BCBP, comparación, doble lectura, CSV, retención)
npm run build      # genera dist/ con el Service Worker
npm run preview    # sirve dist/ en local
npm run icons      # regenera los PNG desde public/icons/icon.svg (necesita Playwright)
```

Para probar desde el móvil en la red local hace falta HTTPS. Lo más sencillo es desplegar (sección 9) o usar un túnel HTTPS.

## 8. Modo demostración

En el menú o en el inicio, **🧪 Demostración**:

- Muestra en pantalla resguardos y etiquetas ITF y una tarjeta de embarque (PDF417, QR o Aztec) **ficticios**, para escanearlos con otro móvil o imprimirlos. Hay cinco escenarios: correcto con 2 maletas, no coincide, incompleto, etiqueta fallback (validación manual) y BCBP con LPN.
- **Simulador**: inyecta las lecturas en la pantalla de control sin cámara.

Los mismos códigos de ejemplo están en `tests/samples.ts` y `src/demo/scenarios.ts`.

## 9. Despliegue gratuito (HTTPS)

La cámara exige HTTPS, y los tres servicios lo dan de serie.

### GitHub Pages (incluido)

1. En el repositorio: **Settings → Pages → Source: GitHub Actions**.
2. Cada `push` a `main` que toque `bagtags-pwa/` ejecuta `.github/workflows/deploy-bagtags.yml`. El workflow pasa los tests, compila con `BASE_PATH=/<repositorio>/` y publica.
3. La URL será `https://<usuario>.github.io/<repositorio>/`.

### Netlify

*Add new site → Import an existing project →* elegir el repositorio. `bagtags-pwa/netlify.toml` ya define el directorio base, el comando y la carpeta de publicación.

### Vercel

*Add New → Project →* importar el repositorio con **Root Directory = `bagtags-pwa`**. `vercel.json` ya define la compilación.

## 10. Instalación en los móviles

- **Android (Chrome)**: abrir la URL → menú ⋮ → **Instalar aplicación** (o "Añadir a pantalla de inicio") → aceptar el permiso de cámara la primera vez.
- **iPhone/iPad (Safari, iOS 16.4 o posterior recomendado)**: abrir la URL en **Safari** → botón Compartir → **Añadir a pantalla de inicio**. En iOS la app instalada tiene su propio almacenamiento, distinto del de Safari.
- Abrir la app una vez **con conexión**. Desde ese momento funciona sin red.
- Si se deniega la cámara:
  - Android: candado de la barra de direcciones → Permisos → Cámara.
  - iOS: Ajustes → Safari → Cámara, o "aA" → Ajustes del sitio web.
  - La entrada manual y el lector Bluetooth siguen funcionando.

## 11. Sincronización futura (SharePoint / Power Automate)

`src/sync/sync.ts` define la interfaz `SyncAdapter` y un `NoopSync` que no hace nada. Para implementarla:

1. Crear un flujo de Power Automate con el disparador "Cuando se recibe una solicitud HTTP".
2. Implementar un `HttpSync` que haga un POST del `SyncPayload` (los mismos datos que el CSV, en JSON) con una cola de reintentos en IndexedDB.
3. Activarlo con `cfg.sync.enabled` y `cfg.sync.endpoint`.

Hoy el campo aparece desactivado en Configuración y la app no hace ninguna petición de red.
