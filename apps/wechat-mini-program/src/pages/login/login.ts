/**
 * 手机号验证登录 / 绑定 / 注册。
 *
 * 流程（三步）：
 * 1. 输入手机号 → POST /auth/binding/sms/send（X-Binding-Token），
 *    按钮按 retryAfterSeconds 倒计时防重发。
 * 2. 输入验证码 → POST /sms/verify，返回 link_existing（已有账号，
 *    直接绑定）或 register（新用户，需显式同意条款）。
 * 3. 确认：
 *    - register：必须先勾选「同意服务条款与隐私政策」才能点确认，
 *      提交时回传 acceptTerms/termsVersion/privacyVersion。
 *    - link_existing：直接确认完成绑定。
 *    - 若带有 pairToken（网页扫码配对），改为 POST /auth/binding/pair/confirm。
 *
 * 登录成功后自动认领匿名期报告，并按来源返回原页面。
 */

import { clearBindingToken, ensureBindingToken, registerWithWechatPhone, sendSmsCode, verifySmsCode, confirmBinding, confirmPairBinding, claimPendingChecks, SmsVerifyResponse } from '../../utils/auth';
import { claimQuickCheck } from '../../utils/api';
import { ApiError, StaleGuard, errorMessage } from '../../utils/request';
import { isValidPhone, isValidSmsCode } from '../../utils/format';

interface LoginData {
  step: 'wechat' | 'phone' | 'code' | 'confirm';
  phone: string;
  code: string;
  sending: boolean;
  verifying: boolean;
  confirming: boolean;
  countdown: number;
  verifyStatus: '' | 'register' | 'link_existing';
  maskedPhone: string;
  termsVersion: string;
  privacyVersion: string;
  needTerms: boolean;
  pairing: boolean;
  agreeTerms: boolean;
  agreePrivacy: boolean;
  errorText: string;
  wechatPhoneEnabled: boolean;
}

const guard = new StaleGuard();

Page<LoginData>({
  data: {
    step: 'wechat',
    phone: '',
    code: '',
    sending: false,
    verifying: false,
    confirming: false,
    countdown: 0,
    verifyStatus: '',
    maskedPhone: '',
    termsVersion: '',
    privacyVersion: '',
    needTerms: false,
    pairing: false,
    agreeTerms: false,
    agreePrivacy: false,
    errorText: '',
    wechatPhoneEnabled: false,
  },

  // 来自哪个入口（save/brand/history）与待保存的检测 id。
  from: '',
  checkId: '',
  // 网页扫码配对令牌（由 pair 页透传，验证通过后用它完成配对确认）。
  pairToken: '',

  onLoad(query) {
    this.from = (query.from as string) || '';
    this.checkId = query.checkId ? decodeURIComponent(query.checkId) : '';
    this.pairToken = query.pairToken ? decodeURIComponent(query.pairToken) : '';
    if (this.pairToken) {
      this.setData({ pairing: true });
    }
    const token = guard.next();
    this.setData({ sending: true });
    ensureBindingToken().then(async (flow) => {
      if (!guard.isCurrent(token)) return;
      if (flow.status === 'signed_in') {
        await claimPendingChecks();
        if (guard.isCurrent(token)) this.finishAndBack();
      } else {
        const enabled = !this.pairToken && Boolean(flow.wechatPhoneEnabled && flow.termsVersion && flow.privacyVersion)
          && wx.canIUse('button.open-type.getPhoneNumber');
        this.setData({
          sending: false, step: enabled ? 'wechat' : 'phone', wechatPhoneEnabled: enabled,
          termsVersion: flow.termsVersion || '', privacyVersion: flow.privacyVersion || '',
        });
      }
    }).catch((error) => {
      if (guard.isCurrent(token)) this.setData({ sending: false, step: 'phone', errorText: errorMessage(error) });
    });
  },

  onUnload() {
    guard.invalidate();
  },

  onPhoneInput(e: { detail: { value: string } }) {
    this.setData({ phone: e.detail.value });
  },

  onCodeInput(e: { detail: { value: string } }) {
    this.setData({ code: e.detail.value });
  },

  onToggleTerms() {
    this.setData({ agreeTerms: !this.data.agreeTerms });
  },

  onTogglePrivacy() {
    this.setData({ agreePrivacy: !this.data.agreePrivacy });
  },

  onOpenWechatPrivacy() {
    if (!wx.openPrivacyContract) {
      this.setData({ errorText: '可在微信小程序右上角查看隐私保护指引' });
      return;
    }
    wx.openPrivacyContract({
      fail: () => this.setData({ errorText: '暂时无法打开微信隐私保护指引' }),
    });
  },

  onWechatAgreement(event: { detail: { value: string[] } }) {
    const agreed = event.detail.value.includes('accepted');
    this.setData({ agreeTerms: agreed, agreePrivacy: agreed });
  },

  onUseSms() {
    if (!this.data.confirming && !this.data.sending) this.setData({ step: 'phone', errorText: '' });
  },

  onUseWechat() {
    this.setData({ step: 'wechat', errorText: '' });
  },

  async onWechatPhone(event: { detail: { code?: string } }) {
    if (this.data.step !== 'wechat' || !this.data.wechatPhoneEnabled || this.data.sending
      || this.data.confirming || !this.data.agreeTerms || !this.data.agreePrivacy) return;
    const code = event.detail.code;
    if (!code) {
      this.setData({ errorText: '尚未授权手机号。你可以重新授权、改用短信，或返回报告。' });
      return;
    }
    const token = guard.next();
    this.setData({ confirming: true, errorText: '' });
    try {
      const flow = await ensureBindingToken();
      if (!guard.isCurrent(token)) return;
      if (flow.status === 'verification_required') {
        await registerWithWechatPhone(code, this.data.termsVersion, this.data.privacyVersion, this.checkId || undefined);
      }
      if (!guard.isCurrent(token)) return;
      await claimPendingChecks();
      if (!guard.isCurrent(token)) return;
      wx.showToast({ title: '登录成功', icon: 'success' });
      this.finishAndBack();
    } catch (error) {
      if (!guard.isCurrent(token)) return;
      const existing = error instanceof ApiError && error.code === 'EXISTING_ACCOUNT_VERIFICATION_REQUIRED';
      if (error instanceof ApiError && (error.code === 'BINDING_EXPIRED' || error.httpStatus === 0)) {
        clearBindingToken();
        const recovered = await ensureBindingToken().catch(() => null);
        if (!guard.isCurrent(token)) return;
        if (recovered?.status === 'signed_in') {
          await claimPendingChecks();
          if (guard.isCurrent(token)) this.finishAndBack();
          return;
        }
      }
      this.setData({
        confirming: false,
        step: existing ? 'phone' : 'wechat',
        errorText: existing ? '这个手机号已有智链账号，请用原账号的手机号验证，或扫码配对。' : errorMessage(error),
      });
    }
  },

  onGoPair() {
    const params = 'from=' + encodeURIComponent(this.from) + '&checkId=' + encodeURIComponent(this.checkId);
    wx.navigateTo({ url: '/pages/pair/pair?' + params });
  },

  onResend() {
    if (this.data.countdown > 0 || this.data.sending) return;
    this.setData({ step: 'phone' });
  },

  /** 第 1 步：发送验证码。 */
  onSend() {
    if (this.data.sending) return;
    const phone = (this.data.phone || '').trim();
    if (!isValidPhone(phone)) {
      this.setData({ errorText: '请输入正确的 11 位手机号' });
      return;
    }
    this.setData({ sending: true, errorText: '' });
    const token = guard.next();
    ensureBindingToken()
      .then(async (flow) => {
        if (flow.status === 'verification_required') return sendSmsCode(phone);
        await claimPendingChecks();
        return null;
      })
      .then((retryAfter) => {
        if (!guard.isCurrent(token)) return;
        if (retryAfter === null) {
          this.finishAndBack();
          return;
        }
        this.setData({ sending: false, step: 'code', countdown: retryAfter > 0 ? retryAfter : 60 });
        this.tickCountdown();
      })
      .catch((err) => {
        if (!guard.isCurrent(token)) return;
        this.setData({ sending: false, errorText: errorMessage(err) });
      });
  },

  tickCountdown() {
    const tick = () => {
      if (this.data.countdown <= 0) return;
      this.setData({ countdown: this.data.countdown - 1 });
      if (this.data.countdown > 0) setTimeout(tick, 1000);
    };
    setTimeout(tick, 1000);
  },

  /** 第 2 步：校验验证码，进入确认页。 */
  onVerify() {
    if (this.data.verifying) return;
    const phone = (this.data.phone || '').trim();
    const code = (this.data.code || '').trim();
    if (!isValidSmsCode(code)) {
      this.setData({ errorText: '请输入收到的短信验证码' });
      return;
    }
    this.setData({ verifying: true, errorText: '' });
    const token = guard.next();
    verifySmsCode(phone, code)
      .then((res) => {
        if (!guard.isCurrent(token)) return;
        this.rememberVerify(res);
        this.setData({ verifying: false, step: 'confirm' });
      })
      .catch((err) => {
        if (!guard.isCurrent(token)) return;
        this.setData({ verifying: false, errorText: errorMessage(err) });
      });
  },

  rememberVerify(res: SmsVerifyResponse) {
    // 暂存验证结果（页面内变量即可，token 与会话不落盘）。
    this.verifyResponse = res;
    this.setData({
      verifyStatus: res.status,
      maskedPhone: res.maskedPhone,
      termsVersion: res.termsVersion,
      privacyVersion: res.privacyVersion,
      needTerms: !this.pairToken && res.status === 'register',
      agreeTerms: false,
      agreePrivacy: false
    });
  },

  /** 第 3 步：确认绑定/注册。 */
  onConfirm() {
    if (this.data.confirming) return;
    if (this.data.needTerms && (!this.data.agreeTerms || !this.data.agreePrivacy)) {
      this.setData({ errorText: '请先勾选同意服务条款与隐私政策' });
      return;
    }
    const verify = this.verifyResponse;
    if (!verify) {
      this.setData({ step: 'phone', errorText: '验证已过期，请重新获取验证码' });
      return;
    }
    this.setData({ confirming: true, errorText: '' });
    const token = guard.next();
    const confirmed = this.pairToken
      ? confirmPairBinding(this.pairToken, verify.maskedPhone)
      : confirmBinding(this.data.agreeTerms && this.data.agreePrivacy, verify, this.checkId || undefined);
    confirmed
      .then(() => {
        if (!guard.isCurrent(token)) return;
        return claimPendingChecks();
      })
      .then(() => {
        if (!guard.isCurrent(token)) return;
        wx.showToast({ title: '登录成功', icon: 'success' });
        this.finishAndBack();
      })
      .catch((err) => {
        if (!guard.isCurrent(token)) return;
        this.setData({ confirming: false, errorText: errorMessage(err) });
      });
  },

  finishAndBack() {
    const from = this.from;
    const checkId = this.checkId;
    setTimeout(() => {
      if (from === 'brand' && checkId) {
        claimQuickCheck(checkId).then(() => {
          wx.redirectTo({ url: '/pages/brand/brand?checkId=' + encodeURIComponent(checkId) });
        }).catch(() => wx.redirectTo({ url: '/pages/result/result?id=' + encodeURIComponent(checkId) }));
      } else if (from === 'save' && checkId) {
        wx.redirectTo({ url: '/pages/result/result?id=' + encodeURIComponent(checkId) });
      } else if (from === 'history') {
        // 历史页是 tab 页，redirectTo 无法跳转，需用 switchTab。
        wx.switchTab({ url: '/pages/history/history' });
      } else {
        wx.navigateBack();
      }
    }, 600);
  },

  verifyResponse: undefined as SmsVerifyResponse | undefined
});
