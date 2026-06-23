import { useEffect, useState } from "react";
import { studioApi, type ModelProviderDefaults, type ModelProviderProfile, type ModelPurpose } from "./api";

type ModelProfileSelectProps = {
  purpose: ModelPurpose;
  label?: string;
  value: string;
  onChange: (profileId: string) => void;
};

const purposeFallback: Record<ModelPurpose, string> = {
  narrative_analysis: "叙事分析",
  screenplay_completion: "剧本补全",
  storyboard_prompt: "分镜提示词",
  vision_understanding: "多模态理解"
};

export function ModelProfileSelect({ purpose, label, value, onChange }: ModelProfileSelectProps) {
  const [profiles, setProfiles] = useState<ModelProviderProfile[]>([]);
  const [defaults, setDefaults] = useState<Partial<ModelProviderDefaults>>({});
  const [statusMessage, setStatusMessage] = useState("正在读取文本模型档案...");

  useEffect(() => {
    let cancelled = false;
    Promise.all([studioApi.listModelProviders(), studioApi.getModelProviderDefaults()])
      .then(([nextProfiles, nextDefaults]) => {
        if (cancelled) return;
        setProfiles(nextProfiles);
        setDefaults(nextDefaults);
        const selectableProfiles = filterProfilesForPurpose(nextProfiles, purpose);
        const defaultProfileId = nextDefaults[purpose] || selectableProfiles[0]?.id || "";
        if (!value && defaultProfileId) {
          onChange(defaultProfileId);
        }
        setStatusMessage(defaultProfileId ? "可临时选择本次调用使用的模型。" : "请先在系统设置中配置文本模型。");
      })
      .catch((error) => {
        if (cancelled) return;
        setStatusMessage(error instanceof Error ? error.message : "读取文本模型档案失败。");
      });
    return () => {
      cancelled = true;
    };
  }, [purpose]);

  const selectableProfiles = filterProfilesForPurpose(profiles, purpose);
  const defaultProfileId = defaults[purpose] || selectableProfiles[0]?.id || "";
  const activeValue = value || defaultProfileId;

  return (
    <label className="model-profile-select">
      {label ?? `${purposeFallback[purpose]}模型`}
      <select className="text-input" value={activeValue} onChange={(event) => onChange(event.target.value)}>
        <option value="">使用系统默认模型</option>
        {selectableProfiles.map((profile) => (
          <option key={profile.id} value={profile.id} disabled={!profile.enabled || !profile.configured}>
            {profile.name}
          </option>
        ))}
      </select>
      <small>{statusMessage}</small>
    </label>
  );
}

function filterProfilesForPurpose(profiles: ModelProviderProfile[], purpose: ModelPurpose) {
  return profiles.filter((profile) => profile.capabilities.includes("text") || (purpose === "vision_understanding" && profile.capabilities.includes("vision")));
}
