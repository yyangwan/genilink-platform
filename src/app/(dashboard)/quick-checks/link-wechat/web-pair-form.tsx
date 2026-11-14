'use client';

import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';

export function WebPairForm({ officialAvailable }: { officialAvailable: boolean }) {
  const [method, setMethod] = useState('phone');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [qr, setQr] = useState('');
  const [official, setOfficial] = useState<{ url: string; scene: string; expiresAt: number }>();

  useEffect(() => {
    if (!official || method !== 'official') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (cancelled) return;
      if (Date.now() >= official.expiresAt) {
        setOfficial(undefined);
        setMessage('公众号验证码已过期，请重新生成。');
        return;
      }
      try {
        const status = await fetch(`/api/auth/wechat/status?scene=${encodeURIComponent(official.scene)}`, { cache: 'no-store' });
        const data = await status.json();
        if (cancelled) return;
        if (data.status === 'confirmed') {
          const response = await fetch('/api/mini-program/v1/web-pair', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method: 'official', proof: data.token }),
          });
          const result = await response.json();
          if (cancelled) return;
          setOfficial(undefined);
          if (response.ok) setQr(await QRCode.toDataURL(result.pairToken, { width: 224 }));
          else setMessage(result.error || '当前公众号账号验证失败。');
          return;
        }
      } catch {
        if (cancelled) return;
      }
      timer = setTimeout(poll, 2000);
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [method, official]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    setPending(true);
    setMessage('');
    setQr('');
    try {
      const response = await fetch('/api/mini-program/v1/web-pair', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, method }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || '账号验证失败，请重试。');
        return;
      }
      setQr(await QRCode.toDataURL(result.pairToken, { width: 224 }));
      form.reset();
    } catch {
      setMessage('暂时无法生成配对码。');
    } finally {
      setPending(false);
    }
  }

  async function sendSms(form: HTMLFormElement | null) {
    const phone = form && new FormData(form).get('phone');
    if (typeof phone !== 'string' || !phone.trim()) {
      setMessage('请输入当前账号的手机号。');
      return;
    }
    setPending(true);
    try {
      const response = await fetch('/api/auth/sms/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }),
      });
      const result = await response.json();
      setMessage(response.ok ? '验证码已发送。' : result.error || '验证码发送失败。');
    } catch {
      setMessage('验证码发送失败，请稍后重试。');
    } finally {
      setPending(false);
    }
  }

  async function startOfficialVerification() {
    setQr('');
    setOfficial(undefined);
    setMessage('');
    setPending(true);
    try {
      const response = await fetch('/api/auth/wechat/qrcode', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || result.devMode || typeof result.expiresAt !== 'number'
        || typeof result.scene !== 'string' || typeof result.url !== 'string'
        || !result.url.startsWith('https://mp.weixin.qq.com/cgi-bin/showqrcode?')) throw new Error();
      setOfficial(result);
    } catch {
      setMessage('暂时无法开启公众号验证。');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="quick-checks__panel" aria-labelledby="verify-account">
      <h2 className="quick-checks__panel-title" id="verify-account">验证智链账号</h2>
      <form onSubmit={submit} className="quick-checks__form">
        <div className="quick-checks__field">
          <label htmlFor="verification-method">验证方式</label>
          <select id="verification-method" value={method} onChange={(event) => { setMethod(event.target.value); setQr(''); setOfficial(undefined); setMessage(''); }}>
            <option value="phone">手机号</option>
            <option value="email">邮箱和密码</option>
            {officialAvailable && <option value="official">微信公众号</option>}
          </select>
        </div>
        {method === 'phone' && (
          <div className="quick-checks__fields quick-checks__fields--two">
            <label className="quick-checks__field">原账号手机号<input name="phone" type="tel" autoComplete="tel" required /></label>
            <label className="quick-checks__field">验证码<input name="code" inputMode="numeric" autoComplete="one-time-code" required /></label>
          </div>
        )}
        {method === 'email' && (
          <div className="quick-checks__fields quick-checks__fields--two">
            <label className="quick-checks__field">邮箱<input name="email" type="email" autoComplete="username" required /></label>
            <label className="quick-checks__field">密码<input name="password" type="password" autoComplete="current-password" required /></label>
          </div>
        )}
        <div className="quick-checks__actions">
          {method === 'phone' && (
            <button type="button" className="dashboard-button dashboard-button--secondary" disabled={pending} onClick={(event) => void sendSms(event.currentTarget.form)}>发送验证码</button>
          )}
          {method === 'official' ? (
            <button type="button" className="dashboard-button dashboard-button--primary" disabled={pending} onClick={() => void startOfficialVerification()}>生成公众号验证码</button>
          ) : (
            <button type="submit" className="dashboard-button dashboard-button--primary" disabled={pending}>{pending ? '处理中…' : '验证并生成配对码'}</button>
          )}
        </div>
        {method === 'official' && official && (
          <div className="quick-checks__qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={official.url} width={224} height={224} alt="公众号账号验证码" />
            <p>先用原账号对应的微信扫一扫验证。生成配对码后，再打开智链小程序扫码关联。</p>
          </div>
        )}
        {message && <p role="status" className="quick-checks__feedback">{message}</p>}
        {qr && (
          <div className="quick-checks__qr">
            {/* The QR image is generated from a short-lived credential in this browser. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} width={224} height={224} alt="微信小程序账号配对码" />
            <p>配对码 3 分钟内有效，仅供你本人扫码。</p>
          </div>
        )}
      </form>
    </section>
  );
}
