import { useEffect, useState } from "react";
import { KeyRound, RefreshCw, Save } from "lucide-react";
import { PageHeader } from "../../shared/PageHeader";
import { studioApi } from "../../shared/api";
import { useEntranceAnimation } from "../../shared/useEntranceAnimation";

type ApiKeyConfig = {
  id: "deepseek" | "seedance" | "rightcode";
  title: string;
  description: string;
  placeholder: string;
  loadSettings: () => Promise<{ configured: boolean }>;
  saveApiKey: (apiKey: string) => Promise<{ configured: boolean }>;
};

const apiKeyConfigs: ApiKeyConfig[] = [
  {
    id: "deepseek",
    title: "DeepSeek API Key",
    description: "用于小说分章后的叙事分析、角色抽取、分镜提示词和剧本补全。",
    placeholder: "输入 DeepSeek API Key",
    loadSettings: () => studioApi.getDeepSeekSettings(),
    saveApiKey: (apiKey) => studioApi.saveDeepSeekApiKey(apiKey)
  },
  {
    id: "seedance",
    title: "Seedance API Key",
    description: "用于读取 Seedance/Seedream 模型列表，并创建分镜图片、角色图片和视频生成任务。",
    placeholder: "输入 Seedance API Key",
    loadSettings: () => studioApi.getSeedanceSettings(),
    saveApiKey: (apiKey) => studioApi.saveSeedanceApiKey(apiKey)
  },
  {
    id: "rightcode",
    title: "Right Code API Key",
    description: "用于通过 Right Code 绘图入口创建 OpenAI 兼容图片生成任务，基础地址为 https://www.right.codes/draw。",
    placeholder: "输入 Right Code API Key",
    loadSettings: () => studioApi.getRightCodeSettings(),
    saveApiKey: (apiKey) => studioApi.saveRightCodeApiKey(apiKey)
  }
];

export function SettingsPage() {
  const ref = useEntranceAnimation<HTMLDivElement>();

  return (
    <section ref={ref} className="page">
      <PageHeader
        eyebrow="System Settings"
        title="系统设置"
        description="统一管理本地后端使用的模型 API Key，业务页面只读取配置状态。"
      />
      <div className="settings-page-layout">
        <section className="panel animate-in">
          <div className="section-title">
            <KeyRound size={18} />
            <h2>API Key 配置</h2>
          </div>
          <div className="api-settings-list">
            {apiKeyConfigs.map((config) => (
              <ApiKeySettingCard key={config.id} config={config} />
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function ApiKeySettingCard({ config }: { config: ApiKeyConfig }) {
  const [apiKey, setApiKey] = useState("");
  const [isConfigured, setIsConfigured] = useState(false);
  const [statusMessage, setStatusMessage] = useState(`正在读取 ${config.title} 配置...`);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void refreshSettings();
  }, [config.id]);

  async function refreshSettings() {
    setIsLoading(true);
    setStatusMessage(`正在读取 ${config.title} 配置...`);
    try {
      const settings = await config.loadSettings();
      setIsConfigured(settings.configured);
      setStatusMessage(settings.configured ? `${config.title} 已配置。` : `${config.title} 尚未配置。`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : `无法读取 ${config.title} 配置状态。`);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveApiKey() {
    if (!apiKey.trim()) {
      setStatusMessage(`请输入 ${config.title}。`);
      return;
    }

    setIsSaving(true);
    setStatusMessage(`正在保存 ${config.title}...`);
    try {
      const result = await config.saveApiKey(apiKey);
      setIsConfigured(result.configured);
      setApiKey("");
      setStatusMessage(`${config.title} 已保存到本地后端。`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <article className="api-settings-card">
      <div className="api-settings-card-header">
        <div>
          <strong>{config.title}</strong>
          <p>{config.description}</p>
        </div>
        <span className={isConfigured ? "status-ok" : "status-warn"}>{isConfigured ? "已配置" : "未配置"}</span>
      </div>
      <div className="api-key-row">
        <input
          className="text-input"
          type="password"
          value={apiKey}
          placeholder={isConfigured ? "已配置，可输入新 Key 覆盖" : config.placeholder}
          onChange={(event) => setApiKey(event.target.value)}
        />
        <button className="ghost-button" type="button" disabled={isSaving} onClick={handleSaveApiKey}>
          <Save size={16} />
          {isSaving ? "保存中..." : "保存"}
        </button>
      </div>
      <div className="api-settings-card-footer">
        <small className={isConfigured ? "status-ok" : "status-warn"}>{statusMessage}</small>
        <button className="ghost-button" type="button" disabled={isLoading} onClick={refreshSettings}>
          <RefreshCw size={16} />
          {isLoading ? "刷新中..." : "刷新状态"}
        </button>
      </div>
    </article>
  );
}
