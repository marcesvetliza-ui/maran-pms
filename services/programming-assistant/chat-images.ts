import type { z } from "zod";
import { supportImageSchema } from "../../shared/support-chat";

/** Validate binary signature and dimensions. Never fetch a user-provided URL. */
export function validateSupportImage(
  image: z.infer<typeof supportImageSchema>,
) {
  const parsed = supportImageSchema.parse(image);
  const raw = Buffer.from(parsed.dataUrl.split(",")[1], "base64");
  if (
    raw.length < 24 ||
    raw.length > 500000 ||
    raw.toString("base64") !== parsed.dataUrl.split(",")[1]
  )
    throw Error("La captura debe ocupar hasta 500 KB.");
  let width = 0,
    height = 0;
  if (
    parsed.dataUrl.startsWith("data:image/png;") &&
    raw.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    raw.toString("ascii", 12, 16) === "IHDR"
  ) {
    width = raw.readUInt32BE(16);
    height = raw.readUInt32BE(20);
  } else if (
    parsed.dataUrl.startsWith("data:image/jpeg;") &&
    raw[0] === 255 &&
    raw[1] === 216
  ) {
    let offset = 2;
    while (offset + 4 <= raw.length) {
      if (raw[offset] !== 255) break;
      const marker = raw[offset + 1];
      offset += 2;
      if (marker === 217 || marker === 218) break;
      const size = raw.readUInt16BE(offset);
      if (size < 2 || offset + size > raw.length) break;
      if ([192, 193, 194].includes(marker) && size >= 8) {
        height = raw.readUInt16BE(offset + 3);
        width = raw.readUInt16BE(offset + 5);
        break;
      }
      offset += size;
    }
  }
  if (!width || !height || width > 1600 || height > 1600)
    throw Error("Usá una captura PNG o JPEG de hasta 1600 × 1600 píxeles.");
  return parsed;
}
