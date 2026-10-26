/**
 * JSON comprimido con gzip para mandar muchas filas al servidor.
 * Vercel limita cada envío a 4,5 MB; comprimido, un bloque de miles de filas pesa unos cientos de KB.
 */
export const GZIP_JSON = "application/x-trackin-json-gzip";

/** Navegador: arma el cuerpo comprimido. */
export async function gzipJson(data: unknown): Promise<Blob> {
  const stream = new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}

/** Servidor: lee el cuerpo (comprimido o JSON normal). */
export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    if (req.headers.get("content-type")?.startsWith(GZIP_JSON) && req.body) {
      return JSON.parse(await new Response(req.body.pipeThrough(new DecompressionStream("gzip"))).text()) as T;
    }
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
