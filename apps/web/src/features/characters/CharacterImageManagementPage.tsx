import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Trash2, Upload } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../shared/PageHeader";
import {
  buildCharacterImageRecord,
  deleteCharacterImage,
  getPreferredCharacterImageUrl,
  saveCharacterImage,
  useCharacterImages
} from "../../shared/characterImages";
import { useCurrentNovel } from "../../shared/currentNovel";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

export function CharacterImageManagementPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const currentNovel = useCurrentNovel();
  const images = useCharacterImages();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState(searchParams.get("characterId") ?? "");
  const selectedCharacter = currentNovel?.characters.find((character) => character.id === selectedCharacterId);
  const filteredImages = selectedCharacterId ? images.filter((image) => image.character.id === selectedCharacterId) : images;
  const groupedCharacters = useMemo(() => {
    const counts = new Map<string, number>();
    images.forEach((image) => counts.set(image.character.id, (counts.get(image.character.id) ?? 0) + 1));
    return currentNovel?.characters.map((character) => ({ character, count: counts.get(character.id) ?? 0 })) ?? [];
  }, [currentNovel?.characters, images]);

  function handleImport(file?: File) {
    if (!file || !selectedCharacter) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imageUrl = typeof reader.result === "string" ? reader.result : "";
      if (!imageUrl) return;
      const record = buildCharacterImageRecord({
        character: selectedCharacter,
        source: "imported",
        imageUrl,
        title: `${selectedCharacter.name} 导入图片`
      });
      if (record) {
        saveCharacterImage(record);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <section ref={ref} className="page">
      <PageHeader eyebrow="Character Images" title="角色图片管理" description="按小说和角色管理生成或导入的角色图片，角色图片会随当前小说自动分离。" />
      <button className="floating-return-button" type="button" onClick={() => navigate("/characters")}>
        <ArrowLeft size={16} />
        返回角色管理
      </button>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="image/*"
        onChange={(event) => {
          handleImport(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {!currentNovel ? (
        <div className="panel animate-in">
          <strong>暂无当前小说</strong>
          <p className="muted-line">请先导入小说，再管理角色图片。</p>
        </div>
      ) : (
        <div className="character-image-management-layout">
          <aside className="panel animate-in">
            <div className="section-title">
              <h2>角色筛选</h2>
              <small>{images.length} 张图片</small>
            </div>
            <div className="character-filter-list">
              <button className={`source-ref-chip${selectedCharacterId ? "" : " active"}`} type="button" onClick={() => setSelectedCharacterId("")}>
                <strong>全部角色</strong>
                <span>{images.length} 张图片</span>
              </button>
              {groupedCharacters.map(({ character, count }) => (
                <button
                  className={`source-ref-chip${selectedCharacterId === character.id ? " active" : ""}`}
                  type="button"
                  key={character.id}
                  onClick={() => setSelectedCharacterId(character.id)}
                >
                  <strong>{character.name}</strong>
                  <span>{count} 张图片</span>
                </button>
              ))}
            </div>
          </aside>
          <section className="panel animate-in">
            {selectedCharacter ? (
              <div className="character-image-profile-header">
                <div>
                  <span>单一角色形象管理</span>
                  <h2>{selectedCharacter.name}</h2>
                  <p>{selectedCharacter.description || "暂无角色描述。"}</p>
                </div>
                <strong>{filteredImages.length} 张图片</strong>
              </div>
            ) : null}
            <div className="section-title management-title">
              <h2>{selectedCharacter ? `${selectedCharacter.name} 的角色图片` : "全部角色图片"}</h2>
              <button className="ghost-button" type="button" disabled={!selectedCharacter} onClick={() => inputRef.current?.click()}>
                <Upload size={16} />
                导入当前角色图片
              </button>
            </div>
            {filteredImages.length ? (
              <div className="character-image-grid">
                {filteredImages.map((image) => {
                  const imageUrl = getPreferredCharacterImageUrl(image);
                  return (
                    <article className="video-management-card character-image-management-card" key={image.id}>
                      <div className="character-image-thumb">
                        {imageUrl ? <img src={imageUrl} alt={image.title} loading="lazy" /> : <span>暂无图片</span>}
                      </div>
                      <div className="video-management-header">
                        <div>
                          <span>{image.source === "generated" ? "生成图片" : "导入图片"}</span>
                          <h3>{image.title}</h3>
                          <small>
                            {image.character.label}
                            {image.scene ? ` · ${image.scene.label}` : ""} · {formatDateTime(image.updatedAt)}
                          </small>
                        </div>
                      </div>
                      {image.prompt ? <p>{image.prompt.slice(0, 180)}</p> : null}
                      <div className="toolbar">
                        {imageUrl ? (
                          <a className="ghost-button" href={imageUrl} target="_blank" rel="noreferrer">
                            <ExternalLink size={16} />
                            打开图片
                          </a>
                        ) : null}
                        <button className="ghost-button danger" type="button" onClick={() => deleteCharacterImage(image.id)}>
                          <Trash2 size={16} />
                          删除
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <article className="compact-card">
                <strong>暂无角色图片</strong>
                <p>{selectedCharacter ? "可以从角色卡片生成，也可以在这里导入当前角色图片。" : "请选择左侧角色后导入图片，或回到角色管理页生成图片。"}</p>
              </article>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function formatDateTime(value: string) {
  if (!value) return "时间未知";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
