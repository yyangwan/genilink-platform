/**
 * 我的：账号状态、网页配对入口、环境切换（开发用）、登出。
 *
 * 登出动作：POST /auth/logout → 清空本地私有缓存（访客令牌、会话、
 * 报告缓存、品牌评估回执）→ 重建全新匿名访客，回到首页。
 */

import { logout, isSessionValid } from '../../utils/auth';
import { clearPrivateCache, readString, StorageKeys } from '../../utils/storage';
import { API_ORIGINS, currentApiOrigin, isDevelopmentBuild, setApiOriginKey, WEB_CONTINUATION_URL } from '../../utils/config';

interface MeData {
  signedIn: boolean;
  maskedPhone: string;
  webUrl: string;
  originOptions: Array<{ key: string; label: string; selected: boolean }>;
  currentOriginLabel: string;
  loggingOut: boolean;
  showEnvironment: boolean;
}

Page<MeData>({
  data: {
    signedIn: false,
    maskedPhone: '',
    webUrl: WEB_CONTINUATION_URL,
    originOptions: [],
    currentOriginLabel: '',
    loggingOut: false,
    showEnvironment: false
  },

  onShow() {
    this.refreshState();
  },

  refreshState() {
    const current = currentApiOrigin();
    this.setData({
      signedIn: isSessionValid(),
      maskedPhone: readString(StorageKeys.boundPhoneMasked) || '',
      currentOriginLabel: current.label,
      showEnvironment: isDevelopmentBuild(),
      originOptions: API_ORIGINS.map((item) => ({
        key: item.key,
        label: item.label,
        selected: item.key === current.key
      }))
    });
  },

  onGoLogin() {
    wx.navigateTo({ url: '/pages/login/login?from=me' });
  },

  onGoPair() {
    wx.navigateTo({ url: '/pages/pair/pair' });
  },

  /** 开发联调：切换 API origin（仅登记过的域名）。 */
  onPickOrigin() {
    if (!isDevelopmentBuild()) return;
    const labels = this.data.originOptions.map((item, index) => (index + 1) + '. ' + item.label + (item.selected ? '（当前）' : ''));
    wx.showModal({
      title: '选择接口环境',
      content: labels.join('\n'),
      confirmText: '切换到开发',
      cancelText: '保持正式',
      success: (res) => {
        const next = res.confirm ? 'dev' : 'release';
        if (currentApiOrigin().key === next) return;
        clearPrivateCache();
        if (res.confirm) {
          setApiOriginKey('dev');
        } else {
          setApiOriginKey('release');
        }
        this.refreshState();
        wx.showToast({ title: '已切换，重进页面生效', icon: 'none' });
      }
    });
  },

  onLogout() {
    if (this.data.loggingOut) return;
    wx.showModal({
      title: '退出登录',
      content: '将清除本机保存的登录信息、历史报告缓存与访客身份，匿名检测不受影响。',
      confirmText: '退出',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ loggingOut: true });
        logout().then(() => {
          this.setData({ loggingOut: false });
          wx.showToast({ title: '已退出', icon: 'success' });
          wx.switchTab({ url: '/pages/home/home' });
        });
      }
    });
  },

  onShareAppMessage() {
    return { title: '智链官网快检 · 免费查看首页修改建议', path: '/pages/home/home?channel=share' };
  }
});
