import { decodeProtectedHeader, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { getPublicKey } from '@/lib/auth/keys';
import {
  issueContentProjectJWT,
  issueContentWorkspaceJWT,
  issueVisibilityProjectJWT,
  issueVisibilityWorkspaceJWT,
} from '@/lib/auth/service-jwt';

const identity = {
  userId: 'user-123',
  email: 'user@example.com',
  name: 'Test User',
  workspaceId: 'workspace-123',
  role: 'admin',
};

async function verify(token: string, audience: string) {
  return jwtVerify(token, await getPublicKey(), {
    issuer: 'https://app.genilink.cn',
    audience,
  });
}

describe('service JWT issuance', () => {
  it('issues a ContentOS workspace token without a project claim', async () => {
    const token = await issueContentWorkspaceJWT(identity);
    const { payload } = await verify(token, 'content.genilink.cn');

    expect(payload).toMatchObject({
      sub: 'user-123',
      email: 'user@example.com',
      name: 'Test User',
      wid: 'workspace-123',
      role: 'admin',
      scope: 'workspace',
    });
    expect(payload).not.toHaveProperty('pid');
  });

  it('issues a ContentOS project token with the canonical project claim', async () => {
    const token = await issueContentProjectJWT({
      ...identity,
      projectId: 'project-123',
    });
    const { payload } = await verify(token, 'content.genilink.cn');

    expect(payload).toMatchObject({
      sub: 'user-123',
      wid: 'workspace-123',
      pid: 'project-123',
      role: 'admin',
      scope: 'project',
    });
  });

  it('issues a Visibility project token for the Visibility audience', async () => {
    const token = await issueVisibilityProjectJWT({
      ...identity,
      projectId: 'project-123',
    });
    const { payload } = await verify(token, 'visibility.genilink.cn');

    expect(payload).toMatchObject({
      sub: 'user-123',
      wid: 'workspace-123',
      pid: 'project-123',
      role: 'admin',
      scope: 'project',
    });
    expect(decodeProtectedHeader(token)).toEqual({
      alg: 'RS256',
      kid: 'genilink-v1',
    });
  });

  it('issues a Visibility workspace token for non-project routes', async () => {
    const token = await issueVisibilityWorkspaceJWT(identity);
    const { payload } = await verify(token, 'visibility.genilink.cn');

    expect(payload).toMatchObject({
      sub: 'user-123',
      wid: 'workspace-123',
      role: 'admin',
      scope: 'workspace',
    });
    expect(payload).not.toHaveProperty('pid');
  });
});
