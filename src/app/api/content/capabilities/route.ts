/**
 * GET /api/content/capabilities（评审 R6）
 *
 * 手工新建内容（无 briefId）时前端需要初始化平台选择：
 * 返回 ContentOS 平台生成能力（enabled/原因），未实现生成的平台置灰。
 */

import { NextResponse } from 'next/server';
import { withContentAuth } from '@/lib/auth/content-auth';
import { getGenerationCapabilities } from '@/lib/content/capabilities';

export const GET = withContentAuth(async () => {
  const caps = await getGenerationCapabilities();
  return NextResponse.json({ data: caps.platforms });
}, { action: 'read' });
