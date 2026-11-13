/**
 * 报告历史：登录后可见，游标分页 + 下拉刷新 + 触底加载。
 * 未登录时引导去短信绑定（匿名期报告可在结果页「保存」后出现在这里）。
 */

import { listMyQuickChecks, QuickCheckReport } from '../../utils/api';
import { StaleGuard, errorMessage } from '../../utils/request';
import { isSessionValid } from '../../utils/auth';
import { formatTime, shortenUrl } from '../../utils/format';

export interface HistoryRow {
  id: string;
  urlShort: string;
  status: 'running' | 'completed' | 'failed';
  statusText: string;
  statusClass: string;
  issueCount: number;
  checkedAt: string;
}

interface HistoryData {
  signedIn: boolean;
  loading: boolean;
  loadingMore: boolean;
  items: HistoryRow[];
  nextCursor: string;
  errorText: string;
}

const guard = new StaleGuard();

function toRow(report: QuickCheckReport): HistoryRow {
  const issues = report.result ? report.result.checks.filter((c) => c.status === 'issue').length : 0;
  return {
    id: report.id,
    urlShort: shortenUrl(report.targetUrl),
    status: report.status,
    statusText:
      report.status === 'running' ? '检测中' : report.status === 'failed' ? '失败' : issues > 0 ? issues + ' 项可改进' : '已检查',
    statusClass: report.status === 'completed' ? (issues > 0 ? 'tag-issue' : 'tag-pass') : 'tag-unknown',
    issueCount: issues,
    checkedAt: report.result ? formatTime(report.result.checkedAt) : formatTime(undefined)
  };
}

Page<HistoryData>({
  data: {
    signedIn: false,
    loading: false,
    loadingMore: false,
    items: [],
    nextCursor: '',
    errorText: ''
  },

  onShow() {
    const signedIn = isSessionValid();
    this.setData({ signedIn });
    if (signedIn && this.data.items.length === 0) this.reload();
  },

  onPullDownRefresh() {
    if (!this.data.signedIn) {
      wx.stopPullDownRefresh();
      return;
    }
    this.reload().then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (!this.data.signedIn || !this.data.nextCursor || this.data.loadingMore) return;
    this.loadMore();
  },

  reload(): Promise<void> {
    const token = guard.next();
    this.setData({ loading: true, errorText: '' });
    return listMyQuickChecks()
      .then((res) => {
        if (!guard.isCurrent(token)) return;
        this.setData({
          loading: false,
          items: res.items.map(toRow),
          nextCursor: res.nextCursor || ''
        });
      })
      .catch((err) => {
        if (!guard.isCurrent(token)) return;
        this.setData({ loading: false, errorText: errorMessage(err) });
      });
  },

  loadMore() {
    const token = guard.next();
    this.setData({ loadingMore: true });
    listMyQuickChecks(this.data.nextCursor)
      .then((res) => {
        if (!guard.isCurrent(token)) return;
        const merged = this.data.items.concat(res.items.map(toRow));
        this.setData({ loadingMore: false, items: merged, nextCursor: res.nextCursor || '' });
      })
      .catch((err) => {
        if (!guard.isCurrent(token)) return;
        this.setData({ loadingMore: false });
        wx.showToast({ title: errorMessage(err), icon: 'none' });
      });
  },

  onOpenItem(e: { currentTarget: { dataset: { id: string } } }) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: '/pages/result/result?id=' + encodeURIComponent(id) });
  },

  onGoLogin() {
    wx.navigateTo({ url: '/pages/login/login?from=history' });
  },

  onRetryLoad() {
    this.reload();
  },

  onShareAppMessage() {
    return { title: '智链官网快检 · 免费查看首页修改建议', path: '/pages/home/home?channel=share' };
  }
});
