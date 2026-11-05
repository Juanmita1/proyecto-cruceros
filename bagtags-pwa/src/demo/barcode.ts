/** Generación de códigos de barras en SVG para la demostración (zxing-wasm writer, bajo demanda). */
let ready: Promise<typeof import('zxing-wasm/writer')> | null = null;

async function writer() {
  if (!ready) {
    ready = (async () => {
      const [mod, wasm] = await Promise.all([import('zxing-wasm/writer'), import('zxing-wasm/writer/zxing_writer.wasm?url')]);
      mod.prepareZXingModule({
        overrides: { locateFile: (p: string, prefix: string) => (p.endsWith('.wasm') ? new URL(wasm.default, location.href).href : prefix + p) },
      });
      return mod;
    })();
  }
  return ready;
}

export async function barcodeSvg(text: string, format: 'ITF' | 'PDF417' | 'QRCode' | 'Aztec'): Promise<string> {
  const w = await writer();
  const r = await w.writeBarcode(text, { format, scale: format === 'ITF' ? 3 : 3, withQuietZones: true });
  if (r.error) throw new Error(r.error);
  return r.svg;
}
