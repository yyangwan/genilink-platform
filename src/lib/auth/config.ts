import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyLoginCode } from '@/lib/auth/sms-verification';

const isDev = process.env.NODE_ENV === 'development';
const authCookieDomain = isDev ? undefined : '.genilink.cn';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      id: 'phone',
      name: 'phone',
      credentials: {
        phone: { label: 'Phone', type: 'tel' },
        code: { label: 'Code', type: 'text' },
      },
      async authorize(credentials) {
        const user = await verifyLoginCode(credentials?.phone, credentials?.code);
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/auth/login',
    newUser: '/auth/login',
  },
  cookies: {
    sessionToken: {
      name: `${isDev ? '' : '__Secure-'}authjs.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: !isDev,
        domain: authCookieDomain,
      },
    },
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.name = user.name ?? undefined;
        // Don't put workspaceId in JWT — use cookie instead
      }
      // Allow session update for workspace switching
      if (trigger === 'update' && session) {
        token.workspaceId = session.workspaceId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  },
});
