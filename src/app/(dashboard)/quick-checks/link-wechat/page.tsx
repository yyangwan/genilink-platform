import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth/config';
import { isWechatLoginServerEnabled } from '@/lib/auth/wechat-login-server';
import { WebPairForm } from './web-pair-form';

export default async function LinkWechatPage() {
  if (process.env.MINI_PROGRAM_BINDING_ENABLED !== 'true') notFound();
  const session = await auth();
  if (!session?.user?.id) redirect('/auth/login?callbackUrl=%2Fquick-checks%2Flink-wechat');
  return (
    <section className="quick-checks__page quick-checks__page--narrow">
      <header className="quick-checks__header">
        <Link href="/quick-checks" className="quick-checks__link quick-checks__back">← 返回官网快检</Link>
        <h1>关联微信小程序</h1>
        <p className="quick-checks__muted">验证当前智链账号后，用智链小程序内的扫码入口扫配对码。</p>
      </header>
      <WebPairForm officialAvailable={Boolean(isWechatLoginServerEnabled()
        && process.env.WECHAT_MP_APPID && process.env.WECHAT_MP_SECRET && process.env.WECHAT_MP_TOKEN)} />
      <p className="quick-checks__muted">原账号无法验证时，请 <Link href="/support" className="quick-checks__link">联系智链支持</Link> 核实账号。</p>
    </section>
  );
}
