// Client-safe, documented image-model rules. Only models listed here are marked image-capable.

export interface ImageCapabilities {
  image_generation: true;
  supported_sizes?: string[];
  supported_aspect_ratios?: string[];
  supported_qualities?: string[];
  supported_styles?: string[];
  supports_style?: boolean;
  supports_negative_prompt?: boolean;
}

const OPENAI_IMAGE: Record<string, ImageCapabilities> = {
  "gpt-image-1": { image_generation: true, supported_sizes: ["1024x1024", "1536x1024", "1024x1536"], supported_qualities: ["low", "medium", "high"] },
  "gpt-image-1-mini": { image_generation: true, supported_sizes: ["1024x1024", "1536x1024", "1024x1536"], supported_qualities: ["low", "medium", "high"] },
  "dall-e-3": { image_generation: true, supported_sizes: ["1024x1024", "1792x1024", "1024x1792"], supported_qualities: ["standard", "hd"], supported_styles: ["vivid", "natural"], supports_style: true },
  "dall-e-2": { image_generation: true, supported_sizes: ["256x256", "512x512", "1024x1024"] },
};

/** OpenAI Images API models, matched by exact id (dated snapshots like gpt-image-1-2025-… are excluded on purpose). */
export function openAiImageCaps(id: string): ImageCapabilities | null {
  return OPENAI_IMAGE[id] ?? null;
}

const STABILITY_RATIOS = ["1:1", "16:9", "9:16", "21:9", "9:21", "2:3", "3:2", "4:5", "5:4"];
const STABILITY_STYLES = ["3d-model", "analog-film", "anime", "cinematic", "comic-book", "digital-art", "enhance", "fantasy-art", "isometric", "line-art", "low-poly", "modeling-compound", "neon-punk", "origami", "photographic", "pixel-art", "tile-texture"];

export const STABILITY_MODELS: { id: string; name: string; caps: ImageCapabilities }[] = [
  { id: "stable-image-ultra", name: "Stable Image Ultra", caps: { image_generation: true, supported_aspect_ratios: STABILITY_RATIOS, supports_negative_prompt: true, supported_styles: STABILITY_STYLES, supports_style: true } },
  { id: "stable-image-core", name: "Stable Image Core", caps: { image_generation: true, supported_aspect_ratios: STABILITY_RATIOS, supports_negative_prompt: true, supported_styles: STABILITY_STYLES, supports_style: true } },
  { id: "sd3.5-large", name: "Stable Diffusion 3.5 Large", caps: { image_generation: true, supported_aspect_ratios: STABILITY_RATIOS, supports_negative_prompt: true, supported_styles: STABILITY_STYLES, supports_style: true } },
  { id: "sd3.5-large-turbo", name: "Stable Diffusion 3.5 Large Turbo", caps: { image_generation: true, supported_aspect_ratios: STABILITY_RATIOS, supports_negative_prompt: true, supported_styles: STABILITY_STYLES, supports_style: true } },
  { id: "sd3.5-medium", name: "Stable Diffusion 3.5 Medium", caps: { image_generation: true, supported_aspect_ratios: STABILITY_RATIOS, supports_negative_prompt: true, supported_styles: STABILITY_STYLES, supports_style: true } },
];

const FLUX_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9", "9:21"];
export const FLUX_MODELS: { id: string; name: string; caps: ImageCapabilities }[] = [
  { id: "flux-pro-1.1-ultra", name: "FLUX1.1 [pro] Ultra", caps: { image_generation: true, supported_aspect_ratios: FLUX_RATIOS } },
  { id: "flux-pro-1.1", name: "FLUX1.1 [pro]", caps: { image_generation: true, supported_aspect_ratios: FLUX_RATIOS } },
  { id: "flux-kontext-pro", name: "FLUX.1 Kontext [pro]", caps: { image_generation: true, supported_aspect_ratios: FLUX_RATIOS } },
  { id: "flux-kontext-max", name: "FLUX.1 Kontext [max]", caps: { image_generation: true, supported_aspect_ratios: FLUX_RATIOS } },
];

export function isImageCaps(v: unknown): v is ImageCapabilities {
  return typeof v === "object" && v !== null && (v as { image_generation?: unknown }).image_generation === true;
}
