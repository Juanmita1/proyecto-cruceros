/** Compartir con la hoja nativa del móvil (correo, Teams…) o descargar si no está disponible. */
export function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function canShareFiles(files: File[]): boolean {
  try {
    return !!navigator.canShare?.({ files });
  } catch {
    return false;
  }
}

/** Devuelve 'shared' | 'downloaded' | 'cancelled'. */
export async function shareOrDownload(files: File[], title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (canShareFiles(files)) {
    try {
      await navigator.share({ files, title, text: title });
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
      // Algunos navegadores rechazan ciertos tipos: se descarga.
    }
  }
  files.forEach(download);
  return 'downloaded';
}
