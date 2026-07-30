export const DEFAULT_TIME_ZONE = "Asia/Shanghai";

type DateInput = string | number | Date;

type TimeParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
};

type DateFormatOptions = {
  includeYear?: boolean;
  includeTime?: boolean;
  timeZone?: string;
};

function toDate(value: DateInput): Date | null {
  const normalizedValue =
    typeof value === "string" &&
    /[T ]\d{2}:\d{2}/.test(value) &&
    !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
      ? `${value}Z`
      : value;
  const date = value instanceof Date ? value : new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getParts(date: Date, timeZone = DEFAULT_TIME_ZONE): TimeParts {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value])) as Record<string, string>;

  return {
    year: map.year ?? "",
    month: map.month ?? "",
    day: map.day ?? "",
    hour: map.hour ?? "",
    minute: map.minute ?? "",
  };
}

export function getDatePartsInTimeZone(value: DateInput, timeZone = DEFAULT_TIME_ZONE) {
  const date = toDate(value);
  if (!date) return null;

  const parts = getParts(date, timeZone);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function formatDateInTimeZone(value: DateInput, options: DateFormatOptions = {}) {
  const date = toDate(value);
  if (!date) return "--";

  const includeTime = options.includeTime ?? true;
  const parts = getParts(date, options.timeZone);
  const dateText = options.includeYear
    ? `${parts.year}年${parts.month}月${parts.day}日`
    : `${parts.month}月${parts.day}日`;

  if (!includeTime) {
    return dateText;
  }

  return `${dateText} ${parts.hour}:${parts.minute}`;
}

export function formatShanghaiDateTimeInput(value: DateInput): string {
  const date = toDate(value);
  if (!date) return "";
  const parts = getParts(date, DEFAULT_TIME_ZONE);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function parseShanghaiDateTimeInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
