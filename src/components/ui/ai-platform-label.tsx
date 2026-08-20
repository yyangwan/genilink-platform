import type { CSSProperties } from "react";
import { getAiPlatformMeta } from "@/lib/ai-platforms";

interface AiPlatformLabelProps {
  platform: string;
  className?: string;
  iconSize?: number;
  showIcon?: boolean;
  style?: CSSProperties;
}

export function AiPlatformIcon({ platform, size = 18 }: { platform: string; size?: number }) {
  const meta = getAiPlatformMeta(platform);
  const fontSize = meta.glyph.length > 1 ? Math.max(7, Math.round(size * 0.38)) : Math.max(9, Math.round(size * 0.52));

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[5px] font-bold leading-none"
      style={{
        width: size,
        height: size,
        fontSize,
        color: meta.color,
        background: meta.background,
        border: `1px solid color-mix(in srgb, ${meta.color} 22%, transparent)`,
        fontFamily: "var(--font-display)",
      }}
    >
      {meta.iconPath ? (
        <span
          className="block h-full w-full bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${meta.iconPath})` }}
        />
      ) : meta.glyph}
    </span>
  );
}

export function AiPlatformLabel({
  platform,
  className = "",
  iconSize = 18,
  showIcon = true,
  style,
}: AiPlatformLabelProps) {
  const meta = getAiPlatformMeta(platform);

  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap ${className}`.trim()}
      style={style}
      title={meta.label}
    >
      {showIcon && <AiPlatformIcon platform={platform} size={iconSize} />}
      <span className="truncate">{meta.label}</span>
    </span>
  );
}

export function AiPlatformList({ platforms, iconSize = 16 }: { platforms: string[]; iconSize?: number }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {platforms.map((platform) => (
        <AiPlatformLabel key={`${getAiPlatformMeta(platform).key}-${platform}`} platform={platform} iconSize={iconSize} />
      ))}
    </span>
  );
}
