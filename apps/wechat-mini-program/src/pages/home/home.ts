/**
 * 首页：匿名链接体检入口。
 *
 * - 无需登录即可提交检测（走访客令牌）。
 * - 提交前生成持久化幂等键；提交后跳结果页等待。
 * - 若存在「进行中/失败待重试」的检测（小程序被杀掉后重进），
 *   显示恢复卡片，沿用同一个幂等键，不重复建任务。
 */

import { beginCheck, clearActiveCheck, saveActiveCheck, loadActiveCheck, ActiveCheckRecord } from '../../utils/idempotency';
import { submitQuickCheck } from '../../utils/api';
import { StaleGuard, errorMessage } from '../../utils/request';
import { ensureVisitor } from '../../utils/visitor';
import { isSessionValid } from '../../utils/auth';
import { normalizeUrlInput, looksLikeUrl, shortenUrl } from '../../utils/format';

interface HomeData {
  urlInput: string;
  submitting: boolean;
  restoreRecord: ActiveCheckRecord | null;
  restoreUrlShort: string;
  signedIn: boolean;
}

const guard = new StaleGuard();
let entryChannel = 'direct';

Page<HomeData>({
  data: {
    urlInput: '',
    submitting: false,
    restoreRecord: null,
    restoreUrlShort: '',
    signedIn: false
  },

  onLoad(query) {
    const channel = query.channel || '';
    if (['share', 'community', 'official_account'].includes(channel)) entryChannel = channel;
  },

  onShow() {
    const record = loadActiveCheck();
    // 最近 24 小时内创建的检测提供恢复（含已拿到 id、仍在等待中的）。
    const fresh =
      record && Date.now() - new Date(record.createdAt).getTime() < 24 * 3600 * 1000;
    this.setData({
      restoreRecord: fresh ? record : null,
      restoreUrlShort: fresh ? shortenUrl(record!.url) : '',
      signedIn: isSessionValid()
    });
  },

  onUnload() {
    guard.invalidate();
  },

  onUrlInput(e: { detail: { value: string } }) {
    this.setData({ urlInput: e.detail.value });
  },

  onSubmit() {
    if (this.data.submitting) return;
    const url = normalizeUrlInput(this.data.urlInput);
    if (!looksLikeUrl(url)) {
      wx.showToast({ title: '请输入公开官网地址', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    const record = beginCheck(url);
    const token = guard.next();

    ensureVisitor(entryChannel)
      .then(() => submitQuickCheck(url, record.idempotencyKey))
      .then((report) => {
        if (!guard.isCurrent(token)) return;
        record.checkId = report.id;
        // 持久化 checkId，结果页/恢复流程可直接查询。
        saveActiveCheck(record);
        this.setData({ submitting: false, restoreRecord: null });
        wx.navigateTo({ url: '/pages/result/result?id=' + encodeURIComponent(report.id) });
      })
      .catch((err) => {
        if (!guard.isCurrent(token)) return;
        this.setData({ submitting: false });
        wx.showModal({
          title: '提交失败',
          content: errorMessage(err),
          confirmText: '重试',
          cancelText: '取消',
          success: (res) => {
            // 重试沿用同一幂等键（记录已落盘）。
            if (res.confirm) this.retryPending(record);
          }
        });
      });
  },

  /** 恢复入口：已有检测单则回结果页等待；否则用同一幂等键重新提交。 */
  onResume() {
    const record = this.data.restoreRecord;
    if (!record || this.data.submitting) return;
    if (record.checkId) {
      wx.navigateTo({ url: '/pages/result/result?id=' + encodeURIComponent(record.checkId) });
      return;
    }
    this.retryPending(record);
  },

  onDiscardRestore() {
    clearActiveCheck();
    this.setData({ restoreRecord: null });
  },

  retryPending(record: ActiveCheckRecord) {
    this.setData({ submitting: true });
    const token = guard.next();
    submitQuickCheck(record.url, record.idempotencyKey)
      .then((report) => {
        if (!guard.isCurrent(token)) return;
        record.checkId = report.id;
        saveActiveCheck(record);
        this.setData({ submitting: false, restoreRecord: null });
        wx.navigateTo({ url: '/pages/result/result?id=' + encodeURIComponent(report.id) });
      })
      .catch((err) => {
        if (!guard.isCurrent(token)) return;
        this.setData({ submitting: false });
        this.setData({ restoreRecord: record, restoreUrlShort: shortenUrl(record.url) });
        wx.showToast({ title: errorMessage(err), icon: 'none' });
      });
  },

  onGoHistory() {
    wx.switchTab({ url: '/pages/history/history' });
  },

  onShareAppMessage() {
    // 安全分享：仅分享首页入口，路径中不携带任何令牌或检测数据。
    return { title: '智链官网快检 · 免费查看首页修改建议', path: '/pages/home/home?channel=share' };
  }
});
