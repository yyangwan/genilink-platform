import { SignJWT } from 'jose';
import { getPrivateKey } from './keys';

const ISSUER = 'https://genilink.cn';
const TOKEN_TTL = '5m';

const SERVICE_AUDIENCES = {
  content: 'content.genilink.cn',
  visibility: 'visibility.genilink.cn',
} as const;

type ServiceIdentity = {
  userId: string;
  email?: string | null;
  name?: string | null;
};

type WorkspaceServiceJWTParams = ServiceIdentity & {
  workspaceId: string;
  role: string;
};

type ProjectServiceJWTParams = WorkspaceServiceJWTParams & {
  projectId: string;
};

async function issueServiceJWT(params: WorkspaceServiceJWTParams & {
  audience: string;
  scope: 'workspace' | 'project';
  projectId?: string;
}): Promise<string> {
  const privateKey = await getPrivateKey();
  return new SignJWT({
    sub: params.userId,
    email: params.email ?? undefined,
    name: params.name ?? undefined,
    wid: params.workspaceId,
    pid: params.projectId,
    role: params.role,
    scope: params.scope,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'genilink-v1' })
    .setIssuer(ISSUER)
    .setAudience(params.audience)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(privateKey);
}

function issueWorkspaceServiceJWT(
  audience: string,
  params: WorkspaceServiceJWTParams,
): Promise<string> {
  return issueServiceJWT({ ...params, audience, scope: 'workspace' });
}

function issueProjectServiceJWT(
  audience: string,
  params: ProjectServiceJWTParams,
): Promise<string> {
  return issueServiceJWT({ ...params, audience, scope: 'project' });
}

export function issueContentWorkspaceJWT(
  params: WorkspaceServiceJWTParams,
): Promise<string> {
  return issueWorkspaceServiceJWT(SERVICE_AUDIENCES.content, params);
}

export function issueContentProjectJWT(
  params: ProjectServiceJWTParams,
): Promise<string> {
  return issueProjectServiceJWT(SERVICE_AUDIENCES.content, params);
}

export function issueVisibilityProjectJWT(
  params: ProjectServiceJWTParams,
): Promise<string> {
  return issueProjectServiceJWT(SERVICE_AUDIENCES.visibility, params);
}

export function issueVisibilityWorkspaceJWT(
  params: WorkspaceServiceJWTParams,
): Promise<string> {
  return issueWorkspaceServiceJWT(SERVICE_AUDIENCES.visibility, params);
}
