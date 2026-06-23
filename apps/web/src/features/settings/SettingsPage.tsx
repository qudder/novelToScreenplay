import { useEffect, useMemo, useState } from "react";
import { KeyRound, RefreshCw, Save } from "lucide-react";
import { PageHeader } from "../../shared/PageHeader";
import { studioApi, type ModelProviderModel, type ModelProviderProfile, type ModelProviderProfilePayload } from "../../shared/api";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

type ProviderCardDefinition = {
  id: "deepseek" | "rightcode" | "seedance" | "generic-relay";
  title: string;
  description: string;
  apiKeyLabel: string;
  requiresBaseUrl: boolean;
  allowModelInput: boolean;
  supportsModelList: boolean;
  builtInModels?: string[];
  defaultModel: string;
  defaultBaseUrl: string;
};

const providerCards: ProviderCardDefinition[] = [
  {
    id: "deepseek",
    title: "DeepSeek",
    description: "指定文本厂商，只需要填写 API Key，接口地址使用系统内置配置，模型 ID 可按实际账号权限填写。",
    apiKeyLabel: "DeepSeek API Key",
    requiresBaseUrl: false,
    allowModelInput: true,
    supportsModelList: true,
    defaultModel: "deepseek-chat",
    defaultBaseUrl: "https://api.deepseek.com"
  },
  {
    id: "rightcode",
    title: "RightCode",
    description: "指定第三方中转厂商，只需要填写 API Key，图片生成地址使用系统内置配置，模型 ID 可按实际服务配置填写。",
    apiKeyLabel: "RightCode API Key",
    requiresBaseUrl: false,
    allowModelInput: true,
    supportsModelList: false,
    defaultModel: "gpt-image-2",
    defaultBaseUrl: "https://www.right.codes/draw/v1"
  },
  {
    id: "seedance",
    title: "Seedance",
    description: "指定视频与 Seedream 图片厂商，只需要填写 API Key，接口地址使用系统内置配置，模型可从内置列表下拉选择。",
    apiKeyLabel: "Seedance API Key",
    requiresBaseUrl: false,
    allowModelInput: true,
    supportsModelList: true,
    builtInModels: ["doubao-seedance-1-0-lite-t2v-250428", "doubao-seedream-5-0-260128", "doubao-seedream-4-0-250828", "doubao-seedream-3-0-t2i-250415"],
    defaultModel: "doubao-seedance-1-0-lite-t2v-250428",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3"
  },
  {
    id: "generic-relay",
    title: "其他服务商",
    description: "文本、视觉和多模态通用接口，需要填写接口地址和 API Key。模型 ID 可从 /models 读取，失败时可手动填写。",
    apiKeyLabel: "API Key",
    requiresBaseUrl: true,
    allowModelInput: true,
    supportsModelList: true,
    defaultModel: "",
    defaultBaseUrl: ""
  }
];

export function SettingsPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="System Settings"
        title="系统设置"
        description="按固定四张卡片管理模型接入：指定厂商只填 API Key，其他服务商填写接口地址和 API Key。"
      />
      <div className="settings-page-layout">
        <ModelProviderCardsPanel />
      </div>
    </section>
  );
}

function ModelProviderCardsPanel() {
  const [profiles, setProfiles] = useState<ModelProviderProfile[]>([]);
  const [statusMessage, setStatusMessage] = useState("正在读取模型接入配置...");

  useEffect(() => {
    void refreshProfiles();
  }, []);

  async function refreshProfiles() {
    try {
      const nextProfiles = await studioApi.listModelProviders();
      setProfiles(nextProfiles);
      setStatusMessage(`已读取 ${nextProfiles.length} 个模型接入卡片。`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "读取模型接入配置失败。");
    }
  }

  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);

  return (
    <section className="panel animate-in">
      <div className="section-title">
        <KeyRound size={18} />
        <h2>模型接入卡片</h2>
      </div>
      <p className="muted-line">模型 ID 是实际调用必需字段；支持查询模型的厂商会优先显示下拉框，不支持或查询失败时可以手动填写。</p>

      <div className="api-settings-list">
        {providerCards.map((definition) => (
          <ProviderSettingCard key={definition.id} definition={definition} profile={profileMap.get(definition.id)} onSaved={refreshProfiles} />
        ))}
      </div>
      <small>{statusMessage}</small>
    </section>
  );
}

function ProviderSettingCard({
  definition,
  profile,
  onSaved
}: {
  definition: ProviderCardDefinition;
  profile?: ModelProviderProfile;
  onSaved: () => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [availableModels, setAvailableModels] = useState<ModelProviderModel[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [statusMessage, setStatusMessage] = useState("正在读取配置...");

  useEffect(() => {
    setApiKey("");
    setBaseUrl(profile?.baseUrl || definition.defaultBaseUrl);
    setModel(profile?.model || definition.defaultModel);
    setAvailableModels((definition.builtInModels ?? []).map((id) => ({ id, name: id, ownedBy: definition.title })));
    setStatusMessage(profile?.configured ? `${definition.title} 已配置。` : `${definition.title} 尚未配置。`);
  }, [definition.id, profile?.baseUrl, profile?.configured, profile?.model]);

  async function saveSettings() {
    if (!apiKey.trim() && !profile?.configured) {
      setStatusMessage(`请填写${definition.apiKeyLabel}。`);
      return;
    }
    if (definition.requiresBaseUrl && !baseUrl.trim()) {
      setStatusMessage("请填写接口地址。");
      return;
    }
    if (definition.allowModelInput && !model.trim()) {
      setStatusMessage("请填写模型 ID。");
      return;
    }

    setIsSaving(true);
    setStatusMessage(`正在保存 ${definition.title} 配置...`);
    try {
      const payload: ModelProviderProfilePayload = {
        name: definition.title,
        apiKey,
        baseUrl,
        chatCompletionsUrl: baseUrl,
        modelsUrl: "",
        model,
        capabilities: profile?.capabilities ?? [],
        timeoutSeconds: profile?.timeoutSeconds ?? 60,
        maxRetries: profile?.maxRetries ?? 2,
        enabled: true
      };

      if (definition.id === "rightcode") {
        await studioApi.saveRightCodeApiKey(apiKey, "", model);
      } else if (definition.id === "seedance") {
        await studioApi.saveSeedanceApiKey(apiKey, model);
      } else {
        await studioApi.updateModelProvider(definition.id, payload);
      }

      setApiKey("");
      await onSaved();
      setStatusMessage(`${definition.title} 配置已保存。`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "保存模型配置失败。");
    } finally {
      setIsSaving(false);
    }
  }

  async function refreshModels() {
    if (!definition.supportsModelList) {
      setStatusMessage(`${definition.title} 不支持查询模型，请手动填写模型 ID。`);
      return;
    }
    if (!profile?.configured && !apiKey.trim()) {
      setStatusMessage(`请先保存${definition.apiKeyLabel}后再查询模型。`);
      return;
    }
    setIsLoadingModels(true);
    setStatusMessage(`正在查询 ${definition.title} 可用模型...`);
    try {
      if (definition.builtInModels?.length) {
        const models = definition.builtInModels.map((id) => ({ id, name: id, ownedBy: definition.title }));
        setAvailableModels(models);
        if (!models.some((item) => item.id === model)) {
          setModel(models[0].id);
        }
        setStatusMessage(`已读取 ${models.length} 个内置模型。`);
        return;
      }
      if (definition.requiresBaseUrl && baseUrl.trim()) {
        await studioApi.updateModelProvider(definition.id, {
          name: definition.title,
          apiKey,
          baseUrl,
          chatCompletionsUrl: baseUrl,
          modelsUrl: "",
          model: model || definition.defaultModel,
          capabilities: profile?.capabilities ?? [],
          timeoutSeconds: profile?.timeoutSeconds ?? 60,
          maxRetries: profile?.maxRetries ?? 2,
          enabled: true
        });
      }
      const models = await studioApi.listModelProviderModels(definition.id);
      setAvailableModels(models);
      if (models.length && !models.some((item) => item.id === model)) {
        setModel(models[0].id);
      }
      setStatusMessage(models.length ? `已读取 ${models.length} 个可用模型。` : "接口未返回模型列表，请手动填写模型 ID。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? `${error.message} 可手动填写模型 ID。` : "读取可用模型失败，可手动填写模型 ID。");
    } finally {
      setIsLoadingModels(false);
    }
  }

  return (
    <article className="api-settings-card">
      <div className="api-settings-card-header">
        <div>
          <strong>{definition.title}</strong>
          <p>{definition.description}</p>
        </div>
        <span className={profile?.configured ? "status-ok" : "status-warn"}>{profile?.configured ? "已配置" : "未配置"}</span>
      </div>

      <div className="api-settings-grid">
        {definition.requiresBaseUrl ? (
          <label className="api-settings-grid-wide">
            接口地址
            <input className="text-input" value={baseUrl} placeholder="https://api.example.com/v1" onChange={(event) => setBaseUrl(event.target.value)} />
          </label>
        ) : (
          <label className="api-settings-grid-wide">
            内置接口地址
            <input className="text-input" value={profile?.baseUrl || definition.defaultBaseUrl} disabled readOnly />
          </label>
        )}

        {definition.allowModelInput ? (
          <>
            {availableModels.length ? (
              <label>
                {definition.builtInModels?.length ? "内置模型" : "模型下拉框"}
                <select className="text-input" value={model} onChange={(event) => setModel(event.target.value)}>
                  {availableModels.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || item.id}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              模型 ID
              <input className="text-input" value={model} placeholder="请输入模型 ID" onChange={(event) => setModel(event.target.value)} />
            </label>
          </>
        ) : (
          <label>
            内置模型
            <input className="text-input" value={profile?.model || definition.defaultModel} disabled readOnly />
          </label>
        )}

        <label className={definition.allowModelInput ? "" : "api-settings-grid-wide"}>
          {definition.apiKeyLabel}
          <input
            className="text-input"
            type="password"
            value={apiKey}
            placeholder={profile?.configured ? `已配置${profile.keyHint ? `（${profile.keyHint}）` : ""}，可输入新 Key 覆盖` : `请输入${definition.apiKeyLabel}`}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>
      </div>

      <div className="model-provider-tags">
        {(profile?.capabilities ?? []).map((capability) => (
          <span key={capability}>{capability}</span>
        ))}
      </div>

      <div className="api-settings-card-footer">
        <small>{statusMessage}</small>
        <div className="api-settings-actions">
          {definition.allowModelInput ? (
            <button className="ghost-button" type="button" disabled={isLoadingModels} onClick={refreshModels}>
              <RefreshCw size={16} />
              {isLoadingModels ? "查询中..." : "查询模型"}
            </button>
          ) : null}
          <button className="ghost-button" type="button" disabled={isSaving} onClick={saveSettings}>
            <Save size={16} />
            {isSaving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </article>
  );
}
