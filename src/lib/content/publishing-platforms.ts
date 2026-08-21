export type PublishingPlatformId =
  | "wechat"
  | "weibo"
  | "douyin"
  | "xiaohongshu"
  | "toutiao"
  | "zhihu";

export type PlatformCredentialKey =
  | "accountName"
  | "appId"
  | "appSecret"
  | "accessToken"
  | "refreshToken";

export interface PlatformFieldDefinition {
  key: PlatformCredentialKey;
  label: string;
  placeholder: string;
  secret?: boolean;
  help?: string;
}

export interface PublishingPlatformDefinition {
  id: PublishingPlatformId;
  name: string;
  iconSrc: string;
  iconBackground?: string;
  description: string;
  contentType: string;
  fields: PlatformFieldDefinition[];
  credentialGuide: {
    intro: string;
    steps: string[];
    consoleUrl: string;
    consoleLabel: string;
    docsUrl?: string;
  };
}

const APP_FIELDS: PlatformFieldDefinition[] = [
  { key: "accountName", label: "账号名称", placeholder: "用于在智创中识别此账号" },
  { key: "appId", label: "App ID", placeholder: "请输入开放平台 App ID" },
  { key: "appSecret", label: "App Secret", placeholder: "请输入开放平台 App Secret", secret: true },
  {
    key: "accessToken",
    label: "Access Token",
    placeholder: "选填；已有长期 Token 时可直接填写",
    secret: true,
  },
  { key: "refreshToken", label: "Refresh Token", placeholder: "选填", secret: true },
];

const TOKEN_FIELDS: PlatformFieldDefinition[] = [
  { key: "accountName", label: "账号名称", placeholder: "用于在智创中识别此账号" },
  {
    key: "accessToken",
    label: "Access Token / 授权凭证",
    placeholder: "请输入平台授权凭证",
    secret: true,
  },
  { key: "refreshToken", label: "Refresh Token", placeholder: "选填；用于自动刷新授权", secret: true },
];

export const PUBLISHING_PLATFORMS: PublishingPlatformDefinition[] = [
  {
    id: "wechat",
    name: "微信公众号",
    iconSrc: "/platform-icons/wechat.svg",
    iconBackground: "#07c160",
    description: "发布图文消息与草稿",
    contentType: "图文",
    fields: APP_FIELDS,
    credentialGuide: {
      intro: "需要使用公众号管理员账号获取开发者凭证。服务号与订阅号可用接口权限可能不同。",
      steps: [
        "登录微信公众平台，选择需要绑定的公众号。",
        "进入“设置与开发 → 基本配置”，复制开发者 ID（AppID），并生成或重置开发者密码（AppSecret）。",
        "按微信提示配置服务器 IP 白名单，再将 AppID 和 AppSecret 填入下方。重置密钥会使旧密钥失效。",
      ],
      consoleUrl: "https://mp.weixin.qq.com/",
      consoleLabel: "打开微信公众平台",
      docsUrl: "https://developers.weixin.qq.com/doc/offiaccount/Basic_Information/Access_Overview.html",
    },
  },
  {
    id: "xiaohongshu",
    name: "小红书",
    iconSrc: "/platform-icons/xiaohongshu.png",
    description: "发布图文笔记与内容种草",
    contentType: "笔记",
    fields: TOKEN_FIELDS,
    credentialGuide: {
      intro: "小红书发布/分享能力需要应用审核和对应权限，不建议使用账号密码或浏览器 Cookie 接入。",
      steps: [
        "进入小红书分享开放平台，注册开发者并创建应用。",
        "根据使用场景申请分享或发布能力，提交应用资料并等待平台审核。",
        "审核通过后按官方授权流程取得 Access Token；如平台同时签发 Refresh Token，也一并填写。",
      ],
      consoleUrl: "https://agora.xiaohongshu.com/",
      consoleLabel: "打开小红书分享开放平台",
      docsUrl: "https://agora.xiaohongshu.com/",
    },
  },
  {
    id: "douyin",
    name: "抖音",
    iconSrc: "/platform-icons/douyin.png",
    description: "发布短视频与作品描述",
    contentType: "短视频",
    fields: APP_FIELDS.map((field) =>
      field.key === "appId"
        ? { ...field, label: "Client Key", placeholder: "请输入抖音开放平台 Client Key" }
        : field.key === "appSecret"
          ? { ...field, label: "Client Secret", placeholder: "请输入 Client Secret" }
          : field,
    ),
    credentialGuide: {
      intro: "需先创建并通过审核的网站应用，发布能力还需要申请相应 Scope。",
      steps: [
        "登录抖音开放平台，进入“控制台 → 我的应用 → 网站应用”，创建或选择应用。",
        "在“应用信息”中复制 Client Key 和 Client Secret，并在“授权回调”中配置回调地址。",
        "申请内容发布相关权限；完成用户授权后，可将取得的 Access Token 和 Refresh Token 一并保存。",
      ],
      consoleUrl: "https://developer.open-douyin.com/console",
      consoleLabel: "打开抖音开放平台控制台",
      docsUrl: "https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/sdk/web-app/web/permission/",
    },
  },
  {
    id: "weibo",
    name: "微博",
    iconSrc: "/platform-icons/weibo.png",
    description: "发布微博与长文内容",
    contentType: "微博",
    fields: APP_FIELDS,
    credentialGuide: {
      intro: "需要在微博开放平台创建应用，并为应用申请发布内容所需权限。",
      steps: [
        "登录微博开放平台，进入“我的应用”并创建网站应用。",
        "在应用的基本信息中复制 App Key 和 App Secret；在智创中分别填写到 App ID 和 App Secret。",
        "配置 OAuth2 回调地址并完成账号授权，再填写平台返回的 Access Token。",
      ],
      consoleUrl: "https://open.weibo.com/apps",
      consoleLabel: "打开微博开放平台",
      docsUrl: "https://open.weibo.com/wiki/授权机制说明",
    },
  },
  {
    id: "toutiao",
    name: "今日头条",
    iconSrc: "/platform-icons/toutiao.png",
    description: "发布头条文章与资讯",
    contentType: "文章",
    fields: APP_FIELDS,
    credentialGuide: {
      intro: "头条号接口权限取决于账号主体、应用审核和平台开放范围，部分账号无法自助获取发布凭证。",
      steps: [
        "使用需发布内容的主体账号登录头条号后台，并完成实名或企业认证。",
        "在账号的开放能力、开发者服务或服务商接入入口申请内容发布权限；若没有入口，请联系平台运营。",
        "平台审核通过并签发应用标识或授权 Token 后，再填写下方对应字段。请勿填写头条号登录密码。",
      ],
      consoleUrl: "https://mp.toutiao.com/",
      consoleLabel: "打开头条号后台",
    },
  },
  {
    id: "zhihu",
    name: "知乎",
    iconSrc: "/platform-icons/zhihu.png",
    description: "发布文章与回答",
    contentType: "文章 / 回答",
    fields: TOKEN_FIELDS,
    credentialGuide: {
      intro: "知乎开放能力处于申请制，不同接口权限需单独开通；数据 Access Secret 不等同于内容发布权限。",
      steps: [
        "进入知乎开放平台并登录，在个人中心查看可申请的 API 能力。",
        "按实际场景申请权限；获批后在个人中心获取 Access Secret，并作为 Access Token 填写。",
        "如需自动发布文章或回答，请确认账号已单独获得写入权限。不要使用知乎登录 Cookie 代替凭证。",
      ],
      consoleUrl: "https://developer.zhihu.com/",
      consoleLabel: "打开知乎开放平台",
      docsUrl: "https://developer.zhihu.com/docs",
    },
  },
];

export const PUBLISHING_PLATFORM_IDS: ReadonlySet<string> = new Set(PUBLISHING_PLATFORMS.map((platform) => platform.id));

export function isPublishingPlatformId(value: string): value is PublishingPlatformId {
  return PUBLISHING_PLATFORM_IDS.has(value);
}
