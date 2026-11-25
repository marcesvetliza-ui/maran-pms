/** Public booking images are bounded JPEGs (the browser converts PNG/WebP).
 * Inspect JPEG segment structure and dimensions, not the supplied MIME alone.
 * Never serve arbitrary HTML/SVG or a user-provided Content-Type. */
export function readBookingImage(imageData: unknown): Buffer {
  if (typeof imageData !== "string" || imageData.length > 820000 ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(imageData))
    throw new Error("Usá una imagen JPEG de hasta 600 KB");
  const encoded = imageData.slice(imageData.indexOf(",") + 1);
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded || bytes.length < 32 || bytes.length > 614400 ||
      bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9)
    throw new Error("La imagen JPEG no es válida");
  let offset = 2, dimensions = false, scan = false;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) break;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) break;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) break;
      const height = bytes.readUInt16BE(offset + 3), width = bytes.readUInt16BE(offset + 5);
      if (!width || !height || width > 2048 || height > 2048)
        throw new Error("La imagen debe medir como máximo 2048 × 2048 píxeles");
      dimensions = true;
    }
    if (marker === 0xda) { scan = true; break; }
    offset += length;
  }
  if (!dimensions || !scan) throw new Error("No se pudo validar la imagen JPEG");
  return bytes;
}
