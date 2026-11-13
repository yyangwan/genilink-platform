/**
 * 网页扫码配对。
 *
 * 流程：电脑端 genilink.cn 显示登录二维码（内含明文 pairToken）→
 * 本页 wx.scanCode 识别 → 校验格式 → 携 pairToken 进入手机号验证
 * （pages/login/login）→ 验证通过后由 login 页调用
 * POST /auth/binding/pair/confirm 完成配对。
 *
 * 说明：不假设摄像头以外的任何设备能力；扫码取消/失败均静默返回。
 */

const PAIR_PREFIX = 'pair:';

Page({
  data: {
    busy: false
  },

  onLoad(query) {
    this.returnFrom = query.from || 'pair';
    this.checkId = query.checkId || '';
    // 进入即拉起扫码，减少一步点击。
    this.startScan();
  },

  startScan() {
    if (this.data.busy) return;
    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['qrCode'],
      success: (res) => {
        this.handleScanResult(res.result);
      },
      fail: () => {
        // 用户取消或无权限：留在本页，提供手动重扫按钮。
      }
    });
  },

  onScanAgain() {
    this.startScan();
  },

  handleScanResult(raw: string) {
    const text = (raw || '').trim();
    if (!text) {
      this.invalid('二维码内容为空');
      return;
    }
    // 网页二维码内为明文 pairToken；兼容「pair:」前缀写法。
    const pairToken = text.indexOf(PAIR_PREFIX) === 0 ? text.slice(PAIR_PREFIX.length) : text;
    if (pairToken.length < 8 || /\s/.test(pairToken)) {
      this.invalid('这不是 GeniLink 网页端的登录二维码');
      return;
    }
    this.setData({ busy: true });
    wx.navigateTo({
      url:
        '/pages/login/login?from=' + encodeURIComponent(this.returnFrom) +
        '&checkId=' + encodeURIComponent(this.checkId) + '&pairToken=' + encodeURIComponent(pairToken)
    });
  },

  invalid(message: string) {
    wx.showModal({
      title: '无法配对',
      content: message + '，请在电脑端打开 genilink.cn/quick-checks 并使用页面上的登录二维码。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  onShow() {
    // 从 login 页返回后允许再次扫码。
    this.setData({ busy: false });
  }
});
