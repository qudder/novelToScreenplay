import { studioApi } from "./api";

export type ImageProviderId = "seedream" | "rightcode";

export type ImageProviderConfig = {
  id: ImageProviderId;
  label: string;
  defaultModels: string[];
  defaultModel: string;
  keyName: string;
  supportsModelList: boolean;
  minimumPixels?: number;
  imageSizeOptions: string[];
  getSettings: () => Promise<{ configured: boolean }>;
};

export const seedreamMinimumPixels = 3686400;

export const imageProviders: Record<ImageProviderId, ImageProviderConfig> = {
  seedream: {
    id: "seedream",
    label: "Seedream",
    defaultModels: ["doubao-seedream-5-0-260128", "doubao-seedream-4-0-250828", "doubao-seedream-3-0-t2i-250415"],
    defaultModel: "doubao-seedream-5-0-260128",
    keyName: "Seedance API Key",
    supportsModelList: true,
    minimumPixels: seedreamMinimumPixels,
    imageSizeOptions: ["1920x1920", "2560x1440", "1440x2560", "2048x2048", "2816x1600", "1600x2816"],
    getSettings: () => studioApi.getSeedanceSettings()
  },
  rightcode: {
    id: "rightcode",
    label: "Right Code",
    defaultModels: ["gpt-image-2"],
    defaultModel: "gpt-image-2",
    keyName: "Right Code API Key",
    supportsModelList: false,
    imageSizeOptions: ["1024x1024", "1536x1024", "1024x1536"],
    getSettings: () => studioApi.getRightCodeSettings()
  }
};

export const imageProviderOptions = Object.values(imageProviders);

export function isValidImageSize(size: string, minimumPixels?: number) {
  if (!minimumPixels) return true;
  const [width, height] = size.split("x").map((value) => Number(value));
  return Number.isFinite(width) && Number.isFinite(height) && width * height >= minimumPixels;
}
