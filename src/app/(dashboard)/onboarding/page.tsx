"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

const INDUSTRIES = [
  { value: "保险", label: "保险" },
  { value: "金融", label: "金融" },
  { value: "教育", label: "教育" },
  { value: "医疗", label: "医疗" },
  { value: "电商", label: "电商" },
  { value: "科技", label: "科技" },
  { value: "其他", label: "其他" },
];

const STEPS = [
  { index: 0, label: "工作区" },
  { index: 1, label: "行业" },
  { index: 2, label: "首个项目" },
  { index: 3, label: "产品信息" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 0: workspace name
  const [workspaceName, setWorkspaceName] = useState("");
  // Step 1: industry
  const [industry, setIndustry] = useState("");
  // Step 2: first project
  const [projectName, setProjectName] = useState("");
  const [projectUrl, setProjectUrl] = useState("");
  // Step 3: product info
  const [productName, setProductName] = useState("");
  const [productKeywords, setProductKeywords] = useState<string[]>([]);
  const [productDescription, setProductDescription] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [keywordInput, setKeywordInput] = useState("");

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceName,
          industry,
          projectName: projectName || workspaceName,
          projectUrl,
          productName: productName.trim() || undefined,
          productKeywords: productKeywords.length > 0 ? productKeywords : undefined,
          productDescription: productDescription.trim() || undefined,
          productUrl: productUrl.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "设置失败，请重试");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (step === 0 && !workspaceName.trim()) return;
    if (step === 1 && !industry) return;
    if (step === 3) {
      handleSubmit();
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const canProceed = () => {
    if (step === 0) return workspaceName.trim().length > 0;
    if (step === 1) return industry.length > 0;
    return true; // project URL is optional
  };

  const addKeyword = () => {
    const trimmed = keywordInput.trim();
    if (trimmed && !productKeywords.includes(trimmed)) {
      setProductKeywords([...productKeywords, trimmed]);
    }
    setKeywordInput("");
  };

  const removeKeyword = (kw: string) => {
    setProductKeywords(productKeywords.filter((k) => k !== kw));
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: "14px",
    outline: "none",
    transition: "border-color 0.15s",
  };

  return (
    <div className="max-w-lg mx-auto">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {STEPS.map((s) => (
          <React.Fragment key={s.index}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors"
                style={{
                  background:
                    step >= s.index
                      ? "var(--color-primary)"
                      : "var(--bg-hover)",
                  color:
                    step >= s.index ? "#0b0d14" : "var(--text-muted)",
                  fontFamily: "var(--font-display)",
                }}
              >
                {s.index + 1}
              </div>
              <span
                className="text-xs"
                style={{
                  color:
                    step >= s.index
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                  fontFamily: "var(--font-body)",
                }}
              >
                {s.label}
              </span>
            </div>
            {s.index < STEPS.length - 1 && (
              <div
                className="w-8 h-px mt-[-16px]"
                style={{
                  background:
                    step > s.index
                      ? "var(--color-primary)"
                      : "var(--border)",
                }}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Card */}
      <div
        className="rounded-xl p-6"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Step 0: Workspace name */}
        {step === 0 && (
          <div>
            <h2
              className="text-lg font-semibold tracking-tight mb-1"
              style={{
                color: "var(--text-primary)",
                fontFamily: "var(--font-display)",
              }}
            >
              为你的工作区命名
            </h2>
            <p
              className="text-sm mb-5"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-body)",
              }}
            >
              工作区是你管理项目和团队的空间
            </p>
            <label
              htmlFor="workspaceName"
              className="block text-sm font-medium mb-1.5"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-body)",
              }}
            >
              工作区名称
            </label>
            <input
              id="workspaceName"
              type="text"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="例如：我的品牌"
              required
              style={inputStyle}
              autoFocus
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = "var(--color-primary)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "var(--border)")
              }
            />
          </div>
        )}

        {/* Step 1: Industry */}
        {step === 1 && (
          <div>
            <h2
              className="text-lg font-semibold tracking-tight mb-1"
              style={{
                color: "var(--text-primary)",
                fontFamily: "var(--font-display)",
              }}
            >
              选择你的行业
            </h2>
            <p
              className="text-sm mb-5"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-body)",
              }}
            >
              帮助我们为你提供更精准的分析建议
            </p>
            <div className="grid grid-cols-2 gap-2">
              {INDUSTRIES.map((ind) => (
                <button
                  key={ind.value}
                  type="button"
                  onClick={() => setIndustry(ind.value)}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    background:
                      industry === ind.value
                        ? "var(--color-primary-dim)"
                        : "var(--bg-elevated)",
                    color:
                      industry === ind.value
                        ? "var(--color-primary)"
                        : "var(--text-secondary)",
                    border:
                      industry === ind.value
                        ? "1px solid var(--color-primary)"
                        : "1px solid var(--border)",
                    fontFamily: "var(--font-body)",
                    cursor: "pointer",
                  }}
                >
                  {ind.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: First project */}
        {step === 2 && (
          <div>
            <h2
              className="text-lg font-semibold tracking-tight mb-1"
              style={{
                color: "var(--text-primary)",
                fontFamily: "var(--font-display)",
              }}
            >
              创建你的第一个项目
            </h2>
            <p
              className="text-sm mb-5"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-body)",
              }}
            >
              输入你要追踪的网站信息
            </p>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="projectName"
                  className="block text-sm font-medium mb-1.5"
                  style={{
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  项目名称
                </label>
                <input
                  id="projectName"
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder={workspaceName}
                  style={inputStyle}
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor =
                      "var(--color-primary)")
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = "var(--border)")
                  }
                />
              </div>
              <div>
                <label
                  htmlFor="projectUrl"
                  className="block text-sm font-medium mb-1.5"
                  style={{
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  网站URL
                </label>
                <input
                  id="projectUrl"
                  type="url"
                  value={projectUrl}
                  onChange={(e) => setProjectUrl(e.target.value)}
                  placeholder="https://example.com"
                  style={inputStyle}
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor =
                      "var(--color-primary)")
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = "var(--border)")
                  }
                />
                <p
                  className="mt-1 text-xs"
                  style={{
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  可选 — 之后也可以添加
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Product information */}
        {step === 3 && (
          <div>
            <h2
              className="text-lg font-semibold tracking-tight mb-1"
              style={{
                color: "var(--text-primary)",
                fontFamily: "var(--font-display)",
              }}
            >
              产品信息
            </h2>
            <p
              className="text-sm mb-5"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-body)",
              }}
            >
              可选 — 帮助我们提供更精准的分析
            </p>
            <div className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
                >
                  产品名称
                </label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="产品或服务名称"
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
                >
                  产品关键词
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addKeyword();
                      }
                    }}
                    placeholder="输入关键词后按回车"
                    style={{ ...inputStyle, flex: 1 }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                  />
                  <button
                    type="button"
                    onClick={addKeyword}
                    className="px-3 py-2 rounded-lg"
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      color: "var(--color-primary)",
                      cursor: "pointer",
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {productKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {productKeywords.map((kw) => (
                      <span
                        key={kw}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          background: "var(--color-primary-dim)",
                          color: "var(--color-primary)",
                        }}
                      >
                        {kw}
                        <button
                          type="button"
                          onClick={() => removeKeyword(kw)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-primary)", padding: 0 }}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
                >
                  产品描述
                </label>
                <textarea
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  placeholder="简要描述产品特点"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
                >
                  产品 URL
                </label>
                <input
                  type="url"
                  value={productUrl}
                  onChange={(e) => setProductUrl(e.target.value)}
                  placeholder="https://product.example.com"
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                />
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="mt-4 px-3 py-2 rounded-lg text-sm"
            style={{
              background: "var(--color-error)15",
              color: "var(--color-error)",
              border: "1px solid var(--color-error)30",
              fontFamily: "var(--font-body)",
            }}
          >
            {error}
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between mt-6">
          {step > 0 ? (
            <button
              type="button"
              onClick={handleBack}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: "transparent",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                fontFamily: "var(--font-body)",
                cursor: "pointer",
              }}
            >
              上一步
            </button>
          ) : (
            <div />
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={!canProceed() || loading}
            className="px-6 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{
              background:
                !canProceed() || loading
                  ? "var(--bg-hover)"
                  : "var(--color-primary)",
              color:
                !canProceed() || loading
                  ? "var(--text-muted)"
                  : "#0b0d14",
              border: "none",
              fontFamily: "var(--font-display)",
              cursor: !canProceed() || loading ? "not-allowed" : "pointer",
            }}
          >
            {loading
              ? "设置中..."
              : step === 3
                ? "完成设置"
                : "下一步"}
          </button>
        </div>
      </div>
    </div>
  );
}
