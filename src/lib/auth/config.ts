import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyEmailPassword } from '@/lib/auth/email-password';
import { verifyLoginCode } from '@/lib/auth/sms-verification';
import { prisma } from '@/lib/db';

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
    Credentials({
      id: 'email-password',
      name: 'email-password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        const clientIp = request.headers.get('x-real-ip')
          || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          || 'unknown';
        return verifyEmailPassword(credentials?.email, credentials?.password, clientIp);
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
        token.email = user.email ?? undefined;
        // Don't put workspaceId in JWT — use cookie instead
      }
      // Allow session update for workspace switching
      if (trigger === 'update' && session) {
        token.workspaceId = session.workspaceId;
        if (typeof token.id === 'string') {
          const currentUser = await prisma.user.findUnique({
            where: { id: token.id },
            select: { name: true, email: true },
          });
          if (currentUser) {
            token.name = currentUser.name;
            token.email = currentUser.email ?? undefined;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name as string;
        if (typeof token.email === 'string') session.user.email = token.email;
      }
      return session;
    },
  },
});
