import { useCallback, useEffect, useState } from "react";
import { getCurrentNovel } from "./currentNovel";
import type { Character } from "./types";
import type { VideoTaskTag } from "./videoTasks";

const STORAGE_KEY = "novel-to-screenplay.characterImages";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export type CharacterImageRecord = {
  id: string;
  title: string;
  source: "generated" | "imported";
  status: "completed" | "failed";
  imageUrl: string;
  originalImageUrl?: string;
  localImagePath?: string;
  media?: Record<string, unknown>;
  model?: string;
  prompt?: string;
  negativePrompt?: string;
  errorMessage?: string;
  novel: VideoTaskTag;
  character: VideoTaskTag;
  scene?: VideoTaskTag;
  createdAt: string;
  updatedAt: string;
};

export function getCharacterImages(): CharacterImageRecord[] {
  return filterImagesForCurrentNovel(getAllCharacterImages());
}

export function getCharacterImagesForCharacter(characterId: string): CharacterImageRecord[] {
  return getCharacterImages().filter((image) => image.character.id === characterId);
}

export function saveCharacterImage(image: CharacterImageRecord) {
  const images = getAllCharacterImages().filter((item) => item.id !== image.id);
  writeImages([image, ...images]);
}

export function deleteCharacterImage(imageId: string) {
  writeImages(getAllCharacterImages().filter((item) => item.id !== imageId));
}

export function useCharacterImages() {
  const [images, setImages] = useState<CharacterImageRecord[]>(() => getCharacterImages());

  const refresh = useCallback(() => {
    setImages(getCharacterImages());
  }, []);

  useEffect(() => {
    window.addEventListener("storage", refresh);
    window.addEventListener("current-novel-updated", refresh);
    window.addEventListener("character-images-updated", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("current-novel-updated", refresh);
      window.removeEventListener("character-images-updated", refresh);
    };
  }, [refresh]);

  return images;
}

export function buildCharacterImageRecord(params: {
  character: Character;
  source: "generated" | "imported";
  imageUrl: string;
  title?: string;
  model?: string;
  prompt?: string;
  negativePrompt?: string;
  originalImageUrl?: string;
  localImagePath?: string;
  media?: Record<string, unknown>;
  errorMessage?: string;
  scene?: VideoTaskTag;
}): CharacterImageRecord | null {
  const currentNovel = getCurrentNovel();
  if (!currentNovel?.documentId) return null;
  const now = new Date().toISOString();
  return {
    id: `character-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: params.title || `${params.character.name} 角色图片`,
    source: params.source,
    status: params.errorMessage ? "failed" : "completed",
    imageUrl: params.imageUrl,
    originalImageUrl: params.originalImageUrl,
    localImagePath: params.localImagePath,
    media: params.media,
    model: params.model,
    prompt: params.prompt,
    negativePrompt: params.negativePrompt,
    errorMessage: params.errorMessage,
    novel: {
      id: currentNovel.documentId,
      label: currentNovel.filename,
      route: "/import"
    },
    character: {
      id: params.character.id,
      label: params.character.name,
      route: `/characters?characterId=${encodeURIComponent(params.character.id)}`
    },
    scene: params.scene,
    createdAt: now,
    updatedAt: now
  };
}

export function getPreferredCharacterImageUrl(image: CharacterImageRecord) {
  return getLocalGeneratedMediaUrl(image.localImagePath) || getMediaLocalUrl(image.media) || resolveApiAssetUrl(image.imageUrl);
}

function getAllCharacterImages(): CharacterImageRecord[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    return (JSON.parse(raw) as CharacterImageRecord[]).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

function filterImagesForCurrentNovel(images: CharacterImageRecord[]) {
  const currentNovel = getCurrentNovel();
  if (!currentNovel?.documentId) return [];
  return images.filter((image) => image.novel.id === currentNovel.documentId);
}

function getLocalGeneratedMediaUrl(localImagePath?: string) {
  if (!localImagePath) return "";
  const normalizedPath = localImagePath.replace(/\\/g, "/");
  const marker = "/generated_media/";
  const markerIndex = normalizedPath.lastIndexOf(marker);
  if (markerIndex < 0) return "";
  const relativePath = normalizedPath.slice(markerIndex + marker.length);
  return resolveApiAssetUrl(`/media/generated/${relativePath}`);
}

function getMediaLocalUrl(media?: Record<string, unknown>) {
  const localUrl = typeof media?.local_url === "string" ? media.local_url : "";
  if (localUrl) return resolveApiAssetUrl(localUrl);
  const localPath = typeof media?.local_path === "string" ? media.local_path : "";
  return getLocalGeneratedMediaUrl(localPath);
}

function resolveApiAssetUrl(url: string) {
  if (!url || !url.startsWith("/")) return url;
  return `${API_BASE_URL}${url}`;
}

function writeImages(images: CharacterImageRecord[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
  window.dispatchEvent(new CustomEvent("character-images-updated"));
}
