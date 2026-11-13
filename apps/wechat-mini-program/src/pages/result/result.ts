/**
 * 检测结果页。
 *
 * 职责：
 * - 轮询 running 状态直到 completed / failed（指数退避 + 丢弃过期响应）。
 * - failed 且 retryable 时提供「重试」：沿用首页落盘的同一幂等键
 *   重新 POST /quick-checks，服务端返回同一条检测。
 * - completed 时展示证据（finalHost、逐项 checks、优先发现），
 *   并上报一次 POST /quick-checks/{id}/view。
 * - 「保存」：已登录则直接 claim；未登录则排队待认领并引导短信绑定。
 * - 品牌评估入口（需登录）。
 * - 分享仅安全入口（首页），路径不含令牌。
 */

import { getQuickCheck, submitQuickCheck, markQuickCheckViewed, claimQuickCheck, queuePendingClaim, QuickCheckReport, CheckItem } from '../../utils/api';
import { loadActiveCheck, saveActiveCheck } from '../../utils/idempotency';
import { StaleGuard, errorMessage } from '../../utils/request';
import { isSessionValid } from '../../utils/auth';
import { startPolling, PollHandle } from '../../utils/poll';
import { formatTime, shortenUrl } from '../../utils/format';
import { WEB_CONTINUATION_URL } from '../../utils/config';

interface CheckRow extends CheckItem {
  label: string;
  statusText: string;
  statusClass: string;
  expanded: boolean;
}

interface ResultData {
  checkId: string;
  targetUrlShort: string;
  status: 'loading' | 'running' | 'completed' | 'failed';
  statusText: string;
  checkedAt: string;
  finalHost: string;
  ruleVersion: string;
  issueCount: number;
  passCount: number;
  unknownCount: number;
  checks: CheckRow[];
  priorityTitle: string;
  priorityEvidence: string;
  priorityAction: string;
  errorCode: string;
  retryable: boolean;
  saved: boolean;
  signedIn: boolean;
  webUrl: string;
  viewMarked: boolean;
  saving: boolean;
}

const CHECK_LABELS: Record<string, string> = {
  access: '首页访问',
  title: '网页标题',
  content: '公开正文',
  structured_data: '结构化数据'
};

const guard = new StaleGuard();

Page<ResultData>({
  data: {
    checkId: '',
    targetUrlShort: '',
    status: 'loading',
    statusText: '正在获取检测结果…',
    checkedAt: '',
    finalHost: '',
    ruleVersion: '',
    issueCount: 0,
    passCount: 0,
    unknownCount: 0,
    checks: [],
    priorityTitle: '',
    priorityEvidence: '',
    priorityAction: '',
    errorCode: '',
    retryable: false,
    saved: false,
    signedIn: false,
    webUrl: WEB_CONTINUATION_URL,
    viewMarked: false,
    saving: false
  },

  poller: undefined as PollHandle | undefined,

  onLoad(query) {
    const id = query.id ? decodeURIComponent(query.id) : '';
    if (!id) {
      wx.showToast({ title: '缺少检测编号', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({ checkId: id });
    this.refresh();
  },

  onShow() {
    this.setData({ signedIn: isSessionValid() });
  },

  onUnload() {
    if (this.poller) this.poller.stop();
    guard.invalidate();
  },

  refresh() {
    if (this.poller) {
      this.poller.stop();
      this.poller = undefined;
    }
    const token = guard.next();
    const auth = isSessionValid() ? 'session' : 'visitor';
    getQuickCheck(this.data.checkId, auth)
      .then((report) => {
        if (!guard.isCurrent(token)) return;
        this.applyReport(report);
      })
      .catch((err) => {
        if (!guard.isCurrent(token)) return;
        this.setData({ status: 'failed', statusText: errorMessage(err), retryable: true, errorCode: 'load_failed' });
      });
  },

  applyReport(report: QuickCheckReport) {
    if (report.status === 'running') {
      this.setData({
        status: 'running',
        statusText: '检测进行中，通常需要几十秒…',
        targetUrlShort: shortenUrl(report.targetUrl),
        saved: report.saved
      });
      this.startWaiting();
      return;
    }
    if (report.status === 'failed') {
      this.setData({
        status: 'failed',
        statusText: '本次检测未能完成',
        errorCode: report.errorCode || 'unknown',
        retryable: report.retryable !== false,
        targetUrlShort: shortenUrl(report.targetUrl),
        saved: report.saved
      });
      return;
    }

    const checks: CheckRow[] = (report.result?.checks || []).map((item) => ({
      ...item,
      label: CHECK_LABELS[item.key] || item.key,
      statusText: item.status === 'pass' ? '已检查' : item.status === 'issue' ? '可改进' : '暂无法判断',
      statusClass: 'tag-' + item.status,
      expanded: false
    }));
    const issueCount = checks.filter((c) => c.status === 'issue').length;
    const passCount = checks.filter((c) => c.status === 'pass').length;
    const unknownCount = checks.filter((c) => c.status === 'unknown').length;

    this.setData({
      status: 'completed',
      statusText: unknownCount === checks.length ? '本次证据不足' : '官网快检结果',
      targetUrlShort: shortenUrl(report.targetUrl),
      checkedAt: formatTime(report.result?.checkedAt),
      finalHost: report.result?.finalHost || '—',
      ruleVersion: report.result?.ruleVersion || '—',
      checks,
      issueCount,
      passCount,
      unknownCount,
      priorityTitle: report.result?.priorityFinding?.title || '',
      priorityEvidence: report.result?.priorityFinding?.evidence || '',
      priorityAction: report.result?.priorityFinding?.action || '',
      saved: report.saved
    });

    // 证据已展示：上报一次 view（幂等，仅标记）。
    if (!this.data.viewMarked) {
      this.setData({ viewMarked: true });
      markQuickCheckViewed(report.id, isSessionValid() ? 'session' : 'visitor').catch(() => {
        if (this.data.checkId === report.id) this.setData({ viewMarked: false });
      });
    }
  },

  startWaiting() {
    const auth = isSessionValid() ? 'session' : 'visitor';
    this.poller = startPolling(guard, {
      fetch: () => getQuickCheck(this.data.checkId, auth),
      isDone: (report) => report.status !== 'running' || report.retryable === true,
      maxAttempts: 12,
      onUpdate: () => undefined,
      onFinish: (report, exhausted) => {
        if (report && report.status !== 'running') this.applyReport(report);
        else if (exhausted || report?.retryable) {
          this.setData({ status: 'failed', statusText: '等待超时，可稍后回来刷新', retryable: true, errorCode: 'wait_timeout' });
        }
      },
      onError: () => undefined
    });
  },

  onManualRefresh() {
    this.refresh();
  },

  /** 失败重试：沿用同一持久化幂等键，服务端不重复建任务。 */
  onRetry() {
    const record = loadActiveCheck();
    if (!record || record.checkId !== this.data.checkId) {
      wx.showToast({ title: '原提交记录已过期，请返回首页重新提交', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '正在重新检测', mask: true });
    const token = guard.next();
    submitQuickCheck(record.url, record.idempotencyKey)
      .then((report) => {
        wx.hideLoading();
        if (!guard.isCurrent(token)) return;
        record.checkId = report.id;
        saveActiveCheck(record);
        this.setData({ checkId: report.id });
        this.applyReport(report);
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: errorMessage(err), icon: 'none' });
      });
  },

  onToggleCheck(e: { currentTarget: { dataset: { index: number } } }) {
    const index = e.currentTarget.dataset.index as number;
    const key = 'checks[' + index + '].expanded';
    this.setData({ [key]: !this.data.checks[index].expanded });
  },

  /** 保存到账号：已登录直接认领；未登录排队后进入短信绑定。 */
  onSave() {
    if (this.data.saving) return;
    if (this.data.saved) {
      wx.showToast({ title: '已保存到你的账号', icon: 'success' });
      return;
    }
    if (isSessionValid()) {
      this.setData({ saving: true });
      claimQuickCheck(this.data.checkId)
        .then((report) => {
          this.setData({ saving: false, saved: report.saved !== false });
          wx.showToast({ title: '已保存', icon: 'success' });
        })
        .catch((err) => {
          this.setData({ saving: false });
          wx.showToast({ title: errorMessage(err), icon: 'none' });
        });
      return;
    }
    queuePendingClaim(this.data.checkId);
    wx.navigateTo({ url: '/pages/login/login?from=save&checkId=' + encodeURIComponent(this.data.checkId) });
  },

  onGoBrand() {
    const id = this.data.checkId;
    if (!isSessionValid()) {
      queuePendingClaim(id);
      wx.navigateTo({ url: '/pages/login/login?from=brand&checkId=' + encodeURIComponent(id) });
      return;
    }
    const save = this.data.saved ? Promise.resolve() : claimQuickCheck(id).then(() => {
      this.setData({ saved: true });
    });
    save.then(() => wx.navigateTo({ url: '/pages/brand/brand?checkId=' + encodeURIComponent(id) }))
      .catch((error) => wx.showToast({ title: errorMessage(error), icon: 'none' }));
  },

  onShareAppMessage() {
    // 安全分享：只分享首页入口；检测 id 不外发，令牌永不进入分享路径。
    return { title: '智链官网快检 · 免费查看首页修改建议', path: '/pages/home/home?channel=share' };
  }
});
