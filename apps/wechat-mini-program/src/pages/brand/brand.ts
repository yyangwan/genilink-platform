/**
 * 品牌评估（品牌方提交线索）。
 *
 * - 表单：品牌名、场景描述、联系方式；必须显式勾选「同意被联系」
 *   （contactConsent=true）才能提交，privacyVersion 随请求上送。
 * - 提交使用独立幂等键（按 checkId+表单指纹持久化）：网络失败后
 *   重试不会重复建线索。
 * - 提交成功本地保存回执 {leadId, withdrawalToken}，再次进入展示
 *   已提交状态，并提供「撤回」：DELETE /quick-checks/{id}/brand-assessment/{leadId}。
 */

import { submitBrandAssessment, withdrawBrandAssessment } from '../../utils/api';
import { brandIdempotencyKey, loadBrandLead, saveBrandLead, removeBrandLead, BrandLeadReceipt } from '../../utils/idempotency';
import { StaleGuard, errorMessage } from '../../utils/request';
import { PRIVACY_VERSION } from '../../utils/config';
import { formatTime } from '../../utils/format';

interface BrandData {
  checkId: string;
  brand: string;
  scenario: string;
  contact: string;
  consent: boolean;
  submitting: boolean;
  withdrawing: boolean;
  submitted: boolean;
  leadBrand: string;
  leadTime: string;
  errorText: string;
  privacyVersion: string;
}

const guard = new StaleGuard();

function formFingerprint(brand: string, scenario: string, contact: string): string {
  // 简单折叠指纹：内容变化即换新幂等键。
  const raw = brand + '|' + scenario + '|' + contact;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

Page<BrandData>({
  data: {
    checkId: '',
    brand: '',
    scenario: '',
    contact: '',
    consent: false,
    submitting: false,
    withdrawing: false,
    submitted: false,
    leadBrand: '',
    leadTime: '',
    errorText: '',
    privacyVersion: PRIVACY_VERSION
  },

  onLoad(query) {
    const checkId = query.checkId ? decodeURIComponent(query.checkId) : '';
    this.setData({ checkId });
    const receipt = loadBrandLead(checkId);
    if (receipt) {
      this.setData({
        submitted: true,
        leadBrand: receipt.brand,
        leadTime: formatTime(receipt.submittedAt)
      });
    }
  },

  onUnload() {
    guard.invalidate();
  },

  onBrandInput(e: { detail: { value: string } }) {
    this.setData({ brand: e.detail.value });
  },

  onScenarioInput(e: { detail: { value: string } }) {
    this.setData({ scenario: e.detail.value });
  },

  onContactInput(e: { detail: { value: string } }) {
    this.setData({ contact: e.detail.value });
  },

  onToggleConsent() {
    this.setData({ consent: !this.data.consent });
  },

  onSubmit() {
    if (this.data.submitting) return;
    const brand = (this.data.brand || '').trim();
    const scenario = (this.data.scenario || '').trim();
    const contact = (this.data.contact || '').trim();
    if (!brand) {
      this.setData({ errorText: '请填写品牌名称' });
      return;
    }
    if (scenario.length < 5) {
      this.setData({ errorText: '请填写想验证的买家场景，例如连锁门店如何选择排班工具' });
      return;
    }
    if (!contact) {
      this.setData({ errorText: '请填写联系方式，便于我们回访核实' });
      return;
    }
    if (!this.data.consent) {
      this.setData({ errorText: '请确认同意智链就本次申请联系你' });
      return;
    }

    const checkId = this.data.checkId;
    const idem = brandIdempotencyKey(checkId, formFingerprint(brand, scenario, contact));
    this.setData({ submitting: true, errorText: '' });
    const token = guard.next();

    submitBrandAssessment(
      checkId,
      { brand, scenario, contact, contactConsent: true, privacyVersion: PRIVACY_VERSION },
      idem
    )
      .then((res) => {
        if (!guard.isCurrent(token)) return;
        const receipt: BrandLeadReceipt = {
          leadId: res.leadId,
          withdrawalToken: res.withdrawalToken,
          brand,
          scenario,
          submittedAt: new Date().toISOString()
        };
        saveBrandLead(checkId, receipt);
        this.setData({
          submitting: false,
          submitted: true,
          leadBrand: brand,
          leadTime: formatTime(receipt.submittedAt)
        });
        wx.showToast({ title: '已提交，我们会尽快回访', icon: 'success' });
      })
      .catch((err) => {
        if (!guard.isCurrent(token)) return;
        this.setData({ submitting: false, errorText: errorMessage(err) });
      });
  },

  onWithdraw() {
    if (this.data.withdrawing) return;
    const receipt = loadBrandLead(this.data.checkId);
    if (!receipt) {
      this.setData({ submitted: false });
      return;
    }
    wx.showModal({
      title: '撤回品牌评估',
      content: '撤回后我们将删除该线索并停止回访，此操作不可恢复。',
      confirmText: '确认撤回',
      cancelText: '再想想',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ withdrawing: true });
        const token = guard.next();
        withdrawBrandAssessment(this.data.checkId, receipt.leadId, receipt.withdrawalToken)
          .then(() => {
            if (!guard.isCurrent(token)) return;
            removeBrandLead(this.data.checkId);
            this.setData({
              withdrawing: false,
              submitted: false,
              brand: '',
              scenario: '',
              contact: '',
              consent: false
            });
            wx.showToast({ title: '已撤回', icon: 'success' });
          })
          .catch((err) => {
            if (!guard.isCurrent(token)) return;
            this.setData({ withdrawing: false });
            wx.showToast({ title: errorMessage(err), icon: 'none' });
          });
      }
    });
  }
});
