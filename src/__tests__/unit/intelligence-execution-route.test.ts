import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/proxy/route-guard', () => ({ resolveGuard: vi.fn(), fetchUpstream: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { workspaceMember: { findFirst: vi.fn(), findMany: vi.fn() } } }));
vi.mock('@/lib/auth/service-jwt', () => ({ issueContentProjectJWT: vi.fn().mockResolvedValue('content-token'), issueVisibilityExecutionJWT: vi.fn().mockResolvedValue('execution-token') }));
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';
import { issueVisibilityExecutionJWT } from '@/lib/auth/service-jwt';
import { requestHash } from '@/lib/billing/idempotency';
import { GET, POST } from '@/app/api/integration/intelligence/execution/route';
const actionId = 'a'.repeat(32), revisionId = 'b'.repeat(32);
const ctx = { projectId: 'trusted-project', workspaceId: 'trusted-workspace', role:'owner', session:{user:{id:'actor'}} };
const state = { action_id: actionId, revision: 2, revision_id: revisionId, is_current: true, version: 3, snapshot:{ owner:{id:'owner'} } };
const body = { projectId:'attacker', actionId, expectedRevision:2, expectedVersion:3, operation:'assign', ownerId:'owner', dueAt:null, reason:'安排内容负责人执行本次交付', idempotencyKey:'execution-request-123' };
const post = (data: unknown = body) => new NextRequest('http://localhost/api/integration/intelligence/execution',{method:'POST',body:JSON.stringify(data)});
beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(resolveGuard).mockResolvedValue({ok:true,ctx} as never);
  vi.mocked(fetchUpstream).mockResolvedValue({data:state});
  vi.mocked(prisma.workspaceMember.findFirst).mockResolvedValue({userId:'owner',role:'editor',user:{name:'内容负责人'}} as never);
  vi.mocked(issueVisibilityExecutionJWT).mockResolvedValue('execution-token');
});
it('derives assignee identity from verified workspace membership and signs the exact forwarded body',async()=>{
  expect((await POST(post())).status).toBe(202);
  const {projectId:_project,actionId:_action,...forwarded}=body;
  expect(prisma.workspaceMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({workspaceId:ctx.workspaceId,userId:'owner'})}));
  expect(issueVisibilityExecutionJWT).toHaveBeenCalledWith(expect.objectContaining({userId:'actor',projectId:ctx.projectId,executionAuthority:{action_id:actionId,revision:2,request_hash:requestHash(forwarded),owner:{id:'owner',name:'内容负责人',role:'editor'}}}));
  expect(fetchUpstream).toHaveBeenLastCalledWith(expect.anything(),`/api/intelligence/actions/${actionId}/execution`,expect.objectContaining({method:'POST',body:forwarded,headers:{Authorization:'Bearer execution-token'}}));
});
it('rejects untrusted identities and foreign workspace assignments before mutation',async()=>{
  expect((await POST(post({...body,actorId:'attacker'}))).status).toBe(400);
  expect((await POST(post({...body,execution_authority:{owner:{id:'attacker'}}}))).status).toBe(400);
  vi.mocked(prisma.workspaceMember.findFirst).mockResolvedValue(null);
  expect((await POST(post())).status).toBe(403); expect(issueVisibilityExecutionJWT).not.toHaveBeenCalled();
});
it('forwards an advanced version for exact receipt replay without repeating external work',async()=>{
  vi.mocked(fetchUpstream).mockResolvedValue({data:{...state,version:4}});
  expect((await POST(post({...body,operation:'deliver',ownerId:undefined,dueAt:undefined,artifacts:[{kind:'content_workflow',referenceId:'workflow',title:'实施说明草稿任务'}]}))).status).toBe(202);
  expect(prisma.workspaceMember.findFirst).not.toHaveBeenCalled();
  expect(vi.mocked(issueVisibilityExecutionJWT).mock.calls[0][0].executionAuthority.artifacts).toBeUndefined();
});
it('rejects service artifacts from a different revision and does not mint mutation authority',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({data:{project_id:ctx.projectId,action_id:actionId,revision_id:'other',reference_id:'workflow',kind:'content_workflow',status:'succeeded'}}))));
  try {
    const {ownerId:_owner,dueAt:_due,...deliver}=body;
    expect((await POST(post({...deliver,operation:'deliver',artifacts:[{kind:'content_workflow',referenceId:'workflow',title:'实施说明草稿任务'}]}))).status).toBe(409);
    expect(issueVisibilityExecutionJWT).not.toHaveBeenCalled();
  } finally {vi.unstubAllGlobals();}
});
it('lists only current workspace execution members without leaking contact details',async()=>{
  vi.mocked(prisma.workspaceMember.findMany).mockResolvedValue([{userId:'owner',role:'editor',user:{name:'内容负责人'}}] as never);
  const response=await GET(new NextRequest('http://localhost/api/integration/intelligence/execution?projectId=attacker&op=members'));
  expect(await response.json()).toEqual({members:[{id:'owner',name:'内容负责人',role:'editor'}]});
  expect(prisma.workspaceMember.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({workspaceId:ctx.workspaceId})}));
});
