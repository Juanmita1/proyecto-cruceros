# Lector de Bagtags — ticket de control de equipaje en cinta

Aplicación web progresiva (PWA) para el personal de seguridad de la sala de recogida de equipajes. El vigilante escanea los **resguardos** de un pasajero (los claim tags pegados en la tarjeta de embarque) y luego vigila la **cinta**. Cada maleta que escanea da un aviso inmediato:

- 🔴 **NO ES SUYA**: no pertenece al pasajero. Es un aviso corto y se sigue escaneando.
- 🟢 **¡ES SUYA! RECOGER**: coincide con uno de sus resguardos.

El ticket se cierra solo con **TODO OK** cuando han salido todas sus maletas. Si la cinta termina antes, se cierra a mano y queda como **FALTAN N MALETAS**. En los dos casos se genera un **PDF** que se envía por email a las direcciones predefinidas.

- Funciona en Android (Chrome) e iOS (Safari) y se instala en la pantalla de inicio.
- **Funciona sin conexión**: si no hay red al cerrar, el envío queda en cola y sale solo al recuperarla.
- Interfaz en español, botones grandes y alto contraste, tema oscuro y claro.

---

## 1. Uso

1. **Vigilante**: TIP, aeropuerto, terminal y puesto o cinta. Se piden la primera vez y se confirman una vez al día.
2. **Resguardos**: escanear los resguardos del pasajero. Se pueden leer varios seguidos.
   - Opcional: escanear el PDF417, QR o Aztec de la tarjeta de embarque (BCBP). Añade el vuelo y los datos del pasajero y, si los trae, los LPN de equipaje.
3. **VIGILAR CINTA →**: escanear cada maleta que pase. No hay que tocar nada entre una maleta y otra; la cámara sigue leyendo mientras se muestra el aviso.

   | Aviso | Significado |
   | --- | --- |
   | 🔴 NO ES SUYA | Maleta de otro pasajero (se cuenta como "descartada") |
   | 🟢 ¡ES SUYA! RECOGER | Coincide con un resguardo; se marca como recogida |
   | ⚪ YA RECOGIDA | Esa maleta ya se escaneó antes en este ticket |
   | 🟡 ¿ES SUYA? | Coinciden aerolínea y serie pero no el código completo (etiqueta dañada o de reserva): el vigilante compara y confirma |
   | 🟢 TODAS | Han salido todas: el ticket se cierra solo |

4. **Cierre**:
   - Aparece **TODO OK** o **FALTAN N MALETAS**, con la lista de recogidas y de no aparecidas.
   - Se pueden añadir **observaciones** y **fotos**, y decidir si se incluyen los datos del pasajero en el PDF.
   - Para enviar, pulsar **ENVIAR PDF POR EMAIL**.
   - Si aparece después la maleta que faltaba, usar **Volver a la cinta**.
5. **SIGUIENTE PASAJERO** abre un ticket nuevo.

Otras formas de introducir códigos:
- **Entrada manual** (teclado grande): 10 dígitos, o la aerolínea y 6 dígitos (`IB` + `123456`).
- **Lector Bluetooth o USB** en modo teclado: la lectura terminada en Enter entra directamente.

**Historial**: en Menú → *Tickets enviados y pendientes* se ve el estado de envío de cada ticket, y desde ahí se pueden reenviar, compartir o borrar.

## 2. Envío por email

Un navegador no puede mandar por sí solo un correo con adjunto a direcciones fijas, así que hay dos vías. Se configuran en **Configuración → Envío por email**.

| | Power Automate (automático) | Compartir desde el móvil |
| --- | --- | --- |
| Cuándo | Hay URL del flujo y destinatarios configurados | No hay URL, o como alternativa en cualquier momento |
| Qué hace | La app envía el PDF al flujo, y el flujo manda el correo a los destinatarios | Se abre el menú de compartir con el PDF adjunto (Outlook, Gmail, Teams…) |
| Sin red | Queda **en cola**; se envía al recuperar la conexión, al abrir la app y cada 5 min | Depende de la app de correo |
| Destinatarios | Automáticos | Se **copian al portapapeles** para pegarlos en "Para"; el navegador no puede rellenarlos |

### Crear el flujo de Power Automate (una vez, unos 10 minutos)

#### Antes de empezar
- **Licencia:** el disparador "Cuando se recibe una solicitud HTTP" es **premium**. La cuenta que crea el flujo necesita Power Automate Premium (o Per-flow). Con la licencia básica de Microsoft 365 no aparece o no se puede guardar.
- **Correo:** el email se envía desde el buzón de Outlook de esa cuenta. Lo ideal es una cuenta de servicio (por ejemplo, `bagtags@empresa.es`), no la personal de nadie.

#### 1. Crear el flujo
1. Entrar en **make.powerautomate.com** con esa cuenta.
2. Ir a **Crear → Flujo de nube instantáneo**.
3. Poner de nombre "Bagtags – envío de tickets".
4. Elegir el desencadenador **"Cuando se recibe una solicitud HTTP"** y pulsar **Crear**.

#### 2. Configurar el desencadenador
1. En **"Quién puede desencadenar el flujo"**, elegir **Cualquiera**. La app no inicia sesión en Microsoft, así que con las otras opciones el envío falla.
2. Pulsar **"Usar una carga de ejemplo para generar el esquema"** y pegar este ejemplo, que tiene el mismo formato que envía la app:

   ```json
   {
     "to": "supervisor@empresa.es;jefe.turno@empresa.es",
     "subject": "[Bagtags] TODO OK · IB3167 · MAD T4S · 05/11/2026 10:32",
     "body": "Resultado: TODO OK\nVigilante: TIP12345",
     "attachment": {
       "name": "ticket_MAD_20261105_1032_OK.pdf",
       "contentType": "application/pdf",
       "contentBytes": "JVBERi0xLjMK"
     },
     "ticket": {
       "id": "abc", "status": "ok", "openedAt": "2026-11-05T10:20:00.000Z",
       "closedAt": "2026-11-05T10:32:00.000Z", "guardId": "TIP12345",
       "airport": "MAD", "terminal": "T4S", "post": "Cinta 7", "flight": "IB3167",
       "claims": 2, "found": 2, "missing": [], "negatives": 3, "photos": 0
     }
   }
   ```

3. Pulsar **Listo**. Con esto ya se pueden elegir `to`, `subject` y el resto de campos en los pasos siguientes.

#### 3. Añadir el envío del correo
1. Pulsar **+ Nuevo paso** y elegir **Office 365 Outlook → "Enviar un correo electrónico (V2)"**.
2. Rellenar los campos:

   | Campo | Valor |
   | --- | --- |
   | **Para** | Contenido dinámico `to`, o mejor direcciones fijas (ver "Seguridad" más abajo) |
   | **Asunto** | `subject` |
   | **Cuerpo** | Expresión: `replace(triggerBody()?['body'], decodeUriComponent('%0A'), '<br>')` |
   | **Adjuntos → Nombre** | `attachment` → `name` |
   | **Adjuntos → Contenido** | Expresión: `base64ToBinary(triggerBody()?['attachment']?['contentBytes'])` |

- **Por qué esa expresión en el Cuerpo:** la app envía el texto con saltos de línea normales, que el cuerpo HTML de Outlook ignora. La expresión los convierte en `<br>`. Con solo `body`, el correo llega en un único párrafo.
- **Dónde escribir las expresiones:** en la pestaña **Expresión** del panel de contenido dinámico.
- **Adjuntos:** si no se ven los campos, pulsar **Mostrar opciones avanzadas**.

#### 4. Añadir la respuesta (recomendado)
1. Pulsar **+ Nuevo paso** y elegir **"Respuesta"**.
2. Poner el código de estado **200**.
3. Dejarla como **último paso**, después del correo.

Sin este paso, Power Automate contesta "recibido" antes de enviar el correo, y la app marca el ticket como enviado aunque luego el envío falle. Con la Respuesta al final, si el correo falla la app recibe un error, deja el ticket **en cola** y lo reintenta.

#### 5. Guardar y copiar la URL
1. Pulsar **Guardar**.
2. Abrir de nuevo el desencadenador: ahora muestra la **URL HTTP POST**. Copiarla.
3. Es una URL larga que contiene la clave de acceso (`sig=…` o similar). **Hay que tratarla como una contraseña.**

#### 6. Configurarlo en la app
1. Abrir **⚙ Configuración → Envío por email**.
2. Poner los destinatarios y pegar la URL.
3. Pulsar **Guardar cambios** y después **Enviar correo de prueba**.
4. Si la app muestra "✔ Correo de prueba enviado" y el correo llega con el PDF adjunto, ya está.
5. Para el resto de móviles: **Exportar JSON** en este y **Importar JSON** en los demás.

#### Si falla la prueba
- **Revisar el historial del flujo:** en Power Automate, abrir el flujo → **Historial de ejecuciones (28 días)**. Ahí se ve qué paso falló.
- **"No se pudo conectar con Power Automate"**:
  - Revisar que la URL esté completa.
  - Revisar que el desencadenador esté en **Cualquiera**.
  - Si la organización aplica directivas que bloquean llamadas HTTP anónimas o llamadas desde el navegador, hablar con el administrador de Power Platform.
- **"El servidor respondió 4xx/5xx"**: casi siempre es un campo mal puesto en el correo. Lo habitual es la expresión del adjunto; comprobar que diga exactamente `base64ToBinary(...)`.

#### Seguridad
Cualquiera que tenga la URL puede lanzar el flujo. Si en **Para** se usa el campo `to` que manda la app, esa persona podría enviar correos a cualquier dirección desde vuestra cuenta. Lo más seguro es **escribir las direcciones fijas directamente en "Para"** dentro del flujo. Así la lista de destinatarios de la app solo sirve para la opción de compartir desde el móvil, y una URL filtrada solo permite mandar correos a vuestros supervisores.

#### Opcional: guardar cada ticket en SharePoint
Añadir un paso **SharePoint → "Crear elemento"** con los campos de `ticket` (`status`, `flight`, `found`, `missing`, `negatives`…). Esos campos no incluyen el nombre ni el PNR del pasajero.

## 3. Privacidad

- Los tickets se guardan **solo en el dispositivo** (IndexedDB) hasta su envío y se borran automáticamente **N días después de enviarse** (por defecto 30; configurable). Los pendientes de envío no se borran solos.
- Los datos del pasajero (nombre, PNR, ruta, asiento) solo existen si se escanea la tarjeta de embarque. Van **únicamente en el PDF**, y se pueden excluir con la casilla de la pantalla de cierre. El cuerpo del correo y el resumen `ticket` no los incluyen.
- La app solo hace una petición de red: el envío al flujo configurado. No hay analítica ni CDN.

## 4. Configuración

Desde **⚙ Configuración** se puede:
- Editar los destinatarios, la URL de Power Automate y el envío de prueba.
- Ajustar sonidos, vibración, doble lectura, motor de lectura, tema y días de conservación.
- Editar la tabla de aerolíneas (IATA ↔ código de 3 dígitos) que se usa en la entrada manual.
- **Exportar o importar en JSON** para desplegar la misma configuración en todos los móviles. Los datos del vigilante no se exportan.

Si se abre con datos de la versión anterior (control en salida), los datos antiguos se descartan al actualizar.

## 5. Arquitectura

```
src/
├── domain/            Lógica pura con pruebas
│   ├── lpn.ts         LPN IATA (Res. 740) y formato "IB 123456"
│   ├── bcbp.ts        Tarjeta de embarque BCBP (Res. 792), incluidos los LPN de equipaje
│   ├── confirm.ts     Doble lectura idéntica (antilecturas parciales del ITF)
│   ├── ticket.ts      Ticket: comparación en cinta, cierre OK/FALTAN, retención
│   ├── format.ts      Asunto, cuerpo del correo y nombre del PDF
│   ├── config.ts      Configuración (destinatarios, endpoint, etc.) y validación
│   └── airlines.ts / classify.ts / types.ts
├── send/              Payload para Power Automate, envío con cola y compartir
├── report/pdf.ts      PDF del ticket (jsPDF, cargado bajo demanda)
├── scanner/           Cámara + BarcodeDetector nativo o zxing-wasm en Web Worker
├── storage/db.ts      IndexedDB (tickets, configuración, preferencias)
├── app/               Estado global y acciones del flujo
└── ui/                Vigilante, ticket (resguardos y cinta), cierre, historial, configuración, demo
```

- **Vite + Preact + TypeScript**. Service Worker de Workbox con precache completo, incluido el `.wasm` del lector.
- **Lectura**: `BarcodeDetector` en Chrome Android; **zxing-wasm** en un Web Worker en iOS y en el resto de navegadores. Formatos: ITF, Code 128, PDF417, QR y Aztec.

## 6. Limitaciones conocidas

- **iOS**: lee con zxing-wasm, que es más lento que el lector nativo. No hay vibración y normalmente tampoco linterna ni zoom desde la web. El aviso es sonoro y visual.
- **ITF sin dígito de control**: para evitar falsos positivos se exige una longitud exacta de 10 dígitos y dos lecturas idénticas. Si coinciden aerolínea y serie pero no el código completo, se pide confirmación manual.
- **Etiquetas arrugadas o con reflejos**: hay que inclinar la etiqueta o el móvil y usar el zoom. Si no se lee, queda la entrada manual.
- **Maletas rápidas en la cinta**: la cámara analiza unos 10 fotogramas por segundo. En móviles de gama baja puede bajar a 4-5, así que conviene escanear cerca del inicio de la cinta.
- **CORS de Power Automate**: los disparadores HTTP admiten llamadas desde el navegador. Si la organización restringe el flujo (autenticación obligatoria), el envío fallará y quedará en cola; se puede compartir desde el móvil mientras tanto.

## 7. Desarrollo

```bash
cd bagtags-pwa
npm install
npm run dev        # http://localhost:5173
npm test           # pruebas unitarias
npm run build      # dist/ con Service Worker
npm run preview
```

## 8. Modo demostración

Se abre desde **🧪 Demostración**:
- Muestra en pantalla resguardos, tarjeta de embarque y las maletas de la cinta en orden, todo con códigos ficticios, para escanearlos con otro móvil o imprimirlos.
- El **simulador** inyecta las lecturas sin cámara.

Escenarios incluidos:
- 2 maletas → TODO OK.
- Una no aparece → FALTA 1.
- Etiqueta de reserva → confirmación manual.
- Tarjeta de embarque con LPN.

## 9. Despliegue e instalación

- **GitHub Pages**:
  1. En el repositorio, *Settings → Pages → Source: GitHub Actions*.
  2. Cada push a `main` que toque `bagtags-pwa/` publica en `https://<usuario>.github.io/<repositorio>/`.
- **Netlify / Vercel**: ya configurados con `netlify.toml` y `vercel.json` (directorio base `bagtags-pwa`).
- **Instalar en el móvil**:
  - Android (Chrome): menú ⋮ → *Instalar aplicación*.
  - iPhone (Safari): Compartir → *Añadir a pantalla de inicio*.
  - Hay que abrirla una vez con conexión.
