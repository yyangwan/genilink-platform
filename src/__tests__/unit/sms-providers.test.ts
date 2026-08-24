import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  aliyunConfig: vi.fn(),
  aliyunSendSms: vi.fn(),
  tencentConfig: vi.fn(),
  tencentSendSms: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@alicloud/openapi-client', () => ({
  Config: class Config {
    constructor(values: Record<string, unknown>) {
      Object.assign(this, values);
      mocks.aliyunConfig(values);
    }
  },
}));

vi.mock('@alicloud/dysmsapi20170525', () => ({
  default: class AlibabaSms {
    constructor() {}
    sendSms = mocks.aliyunSendSms;
  },
  SendSmsRequest: class SendSmsRequest {
    constructor(values: Record<string, unknown>) {
      Object.assign(this, values);
    }
  },
}));

vi.mock('tencentcloud-sdk-nodejs-sms', () => ({
  sms: {
    v20210111: {
      Client: class TencentSms {
        constructor(config: Record<string, unknown>) {
          mocks.tencentConfig(config);
        }
        SendSms = mocks.tencentSendSms;
      },
    },
  },
}));

import {
  deliverAliyunSmsTemplate,
  deliverSmsCode,
  getSmsProvider,
} from '@/lib/auth/sms-providers';

describe('SMS providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to Tencent and accepts an explicit Aliyun provider', () => {
    expect(getSmsProvider()).toBe('aliyun');
    vi.stubEnv('SMS_PROVIDER', 'tencent');
    expect(getSmsProvider()).toBe('tencent');
  });

  it('rejects unknown provider names', () => {
    vi.stubEnv('SMS_PROVIDER', 'unknown');
    expect(() => getSmsProvider()).toThrow('Unsupported SMS provider');
  });

  it('sends positional code and ttl values through Tencent Cloud', async () => {
    vi.stubEnv('TENCENTCLOUD_SECRET_ID', 'secret-id');
    vi.stubEnv('TENCENTCLOUD_SECRET_KEY', 'secret-key');
    vi.stubEnv('TENCENTCLOUD_SMS_SDK_APP_ID', '1400000000');
    vi.stubEnv('TENCENTCLOUD_SMS_SIGN_NAME', '智链');
    vi.stubEnv('TENCENTCLOUD_SMS_TEMPLATE_ID', '123456');
    vi.stubEnv('TENCENTCLOUD_SMS_TEMPLATE_PARAMS', 'code,ttl');
    mocks.tencentSendSms.mockResolvedValue({ SendStatusSet: [{ Code: 'Ok' }] });

    await deliverSmsCode('tencent', '+8613800138000', '123456');

    expect(mocks.tencentSendSms).toHaveBeenCalledWith(expect.objectContaining({
      PhoneNumberSet: ['+8613800138000'],
      TemplateParamSet: ['123456', '5'],
    }));
  });

  it('sends named code and ttl values through Alibaba Cloud', async () => {
    vi.stubEnv('ALIBABA_CLOUD_ACCESS_KEY_ID', 'access-key-id');
    vi.stubEnv('ALIBABA_CLOUD_ACCESS_KEY_SECRET', 'access-key-secret');
    vi.stubEnv('ALIBABA_CLOUD_SMS_SIGN_NAME', '智链');
    vi.stubEnv('ALIBABA_CLOUD_SMS_TEMPLATE_CODE', 'SMS_123456789');
    vi.stubEnv('ALIBABA_CLOUD_SMS_TEMPLATE_PARAMS', 'code,ttl');
    mocks.aliyunSendSms.mockResolvedValue({ body: { code: 'OK' } });

    await deliverSmsCode('aliyun', '+8613800138000', '654321');

    expect(mocks.aliyunSendSms).toHaveBeenCalledWith(expect.objectContaining({
      phoneNumbers: '13800138000',
      signName: '智链',
      templateCode: 'SMS_123456789',
      templateParam: JSON.stringify({ code: '654321', ttl: '5' }),
    }));
  });

  it('surfaces provider rejection without trying another channel', async () => {
    vi.stubEnv('ALIBABA_CLOUD_ACCESS_KEY_ID', 'access-key-id');
    vi.stubEnv('ALIBABA_CLOUD_ACCESS_KEY_SECRET', 'access-key-secret');
    vi.stubEnv('ALIBABA_CLOUD_SMS_SIGN_NAME', '智链');
    vi.stubEnv('ALIBABA_CLOUD_SMS_TEMPLATE_CODE', 'SMS_123456789');
    mocks.aliyunSendSms.mockResolvedValue({ body: { code: 'isv.SMS_SIGNATURE_ILLEGAL' } });

    await expect(deliverSmsCode('aliyun', '+8613800138000', '654321'))
      .rejects.toThrow('isv.SMS_SIGNATURE_ILLEGAL');
    expect(mocks.tencentSendSms).not.toHaveBeenCalled();
  });

  it('sends an approved Alibaba Cloud notification template with named values', async () => {
    vi.stubEnv('ALIBABA_CLOUD_ACCESS_KEY_ID', 'access-key-id');
    vi.stubEnv('ALIBABA_CLOUD_ACCESS_KEY_SECRET', 'access-key-secret');
    vi.stubEnv('ALIBABA_CLOUD_SMS_SIGN_NAME', '智链');
    mocks.aliyunSendSms.mockResolvedValue({
      body: { code: 'OK', bizId: 'message-1', requestId: 'request-1' },
    });

    const receipt = await deliverAliyunSmsTemplate(
      '+8613800138000',
      'SMS_511735358',
      { plan: '专业版', endDate: '2026-09-24' },
    );

    expect(mocks.aliyunSendSms).toHaveBeenCalledWith(expect.objectContaining({
      phoneNumbers: '13800138000',
      templateCode: 'SMS_511735358',
      templateParam: JSON.stringify({ plan: '专业版', endDate: '2026-09-24' }),
    }));
    expect(receipt).toEqual({ providerMessageId: 'message-1', requestId: 'request-1' });
  });
});
