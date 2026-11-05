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

### Crear el flujo de Power Automate (una vez)

1. En Power Automate: **Crear → Flujo de nube instantáneo → "Cuando se recibe una solicitud HTTP"**.
2. En "Quién puede desencadenar el flujo", elegir **Cualquiera**. La URL generada es secreta: compártela solo en la configuración de la app.
3. En "Esquema JSON del cuerpo de la solicitud", pegar:

   ```json
   {
     "type": "object",
     "properties": {
       "to": { "type": "string" },
       "subject": { "type": "string" },
       "body": { "type": "string" },
       "attachment": {
         "type": "object",
         "properties": {
           "name": { "type": "string" },
           "contentType": { "type": "string" },
           "contentBytes": { "type": "string" }
         }
       },
       "ticket": { "type": "object" }
     }
   }
   ```

4. Añadir la acción **Office 365 Outlook → Enviar un correo electrónico (V2)**:
   - **Para**: `to` (varias direcciones separadas por `;`)
   - **Asunto**: `subject`
   - **Cuerpo**: `body`
   - **Adjuntos → Nombre**: `attachment.name`
   - **Adjuntos → Contenido**: expresión `base64ToBinary(triggerBody()?['attachment']?['contentBytes'])`
5. Opcional: añadir **Respuesta** con código `200`, o guardar `ticket` en una lista de SharePoint.
6. Guardar, copiar la **URL HTTP POST** y pegarla en la app, en Configuración → URL del flujo.
7. Comprobar con **Enviar correo de prueba**.

El campo `ticket` lleva un resumen estructurado (estado, vuelo, recogidas, no aparecidas, descartadas) **sin nombre ni PNR**.

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
