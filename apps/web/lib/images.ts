import {
  AllowedImageMediaTypeSchema,
  MAX_IMAGE_BYTES,
  type ImageBlock,
} from "@repo/contracts";

export const MAX_IMAGES_PER_MESSAGE = 4;

export type ImageReadResult = { ok: true; image: ImageBlock } | { ok: false; error: string };

export function imageDataUrl(image: Pick<ImageBlock, "mediaType" | "base64">): string {
  return `data:${image.mediaType};base64,${image.base64}`;
}

export async function readImageFile(file: File): Promise<ImageReadResult> {
  const type = AllowedImageMediaTypeSchema.safeParse(file.type);
  if (!type.success) {
    return { ok: false, error: `${file.name || "File"}: only PNG, JPEG, WebP and GIF images are supported.` };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));
    return { ok: false, error: `${file.name || "Image"} is larger than ${mb} MB.` };
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return { ok: true, image: { type: "image", mediaType: type.data, base64 } };
}
