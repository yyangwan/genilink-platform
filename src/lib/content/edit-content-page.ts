export interface PlatformContent {
  id: string;
  platform: string;
  content: string;
  status: string;
}

export function getEditContentProjectError(projectLoading: boolean, currentProjectId: string | null) {
  if (projectLoading) return null;
  if (!currentProjectId) return "请先选择一个项目，再打开内容编辑页";
  return null;
}

export function pickInitialPlatformContent(platformContents: PlatformContent[]) {
  if (platformContents.length === 0) return null;
  return platformContents.find((pc) => (pc.content ?? "").trim().length > 0) ?? platformContents[0] ?? null;
}

export function canLoadEditContent(projectLoading: boolean, currentProjectId: string | null) {
  return !projectLoading && Boolean(currentProjectId);
}
