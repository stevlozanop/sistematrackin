/** Símbolo de System Trackin: la S es la ruta, del punto de origen al anillo de destino. Toma el color del texto. */
export function TrackinMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 256 256" className={className} fill="currentColor" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <g transform="translate(3.59 0)"><path d="M176.5 58 A56 56 0 1 0 128 142 A24 24 0 1 1 107.22 178 L79.5 194 A56 56 0 1 0 128 110 A24 24 0 1 1 148.78 74 Z"/><path d="M184.64 66 A22 22 0 1 1 140.64 66 A22 22 0 1 1 184.64 66 Z"/><path fillRule="evenodd" d="M114.19 175.68 A25 25 0 1 1 64.19 175.68 A25 25 0 1 1 114.19 175.68 Z M98.19 175.68 A9 9 0 1 1 80.19 175.68 A9 9 0 1 1 98.19 175.68 Z"/></g>
    </svg>
  );
}
