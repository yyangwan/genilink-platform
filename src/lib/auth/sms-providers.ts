import 'server-only';

import AlibabaSms, { SendSmsRequest } from '@alicloud/dysmsapi20170525';
import { Config as AlibabaOpenApiConfig } from '@alicloud/openapi-client';
import { sms as tencentSms } from 'tencentcloud-sdk-nodejs-sms';
import { displayPhone } from '@/lib/auth/phone';

export type SmsProvider = 'tencent' | 'aliyun';

type TemplateValue = 'code' | 'ttl';

export type SmsDeliveryReceipt = {
  providerMessageId: string | null;
  requestId: string | null;
};

const CODE_TTL_MINUTES = 5;

function requiredConfig<T extends Record<string, string | undefined>>(
  provider: string,
  config: T
): Record<keyof T, string> {
  if (Object.values(config).some((value) => !value)) {
    throw new Error(`${provider} SMS configuration is incomplete`);
  }
  return config as Record<keyof T, string>;
}

function templateValues(raw: string | undefined): TemplateValue[] {
  return (raw || 'code')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      if (value === 'code' || value === 'ttl') return value;
      throw new Error(`Unsupported SMS template parameter: ${value}`);
    });
}

function templateValue(name: TemplateValue, code: string): string {
  return name === 'code' ? code : String(CODE_TTL_MINUTES);
}

export function getSmsProvider(): SmsProvider {
  const value = (process.env.SMS_PROVIDER || 'aliyun').trim().toLowerCase();
  if (value === 'tencent' || value === 'aliyun') return value;
  throw new Error(`Unsupported SMS provider: ${value}`);
}

async function sendWithTencent(phone: string, code: string): Promise<void> {
  const config = requiredConfig('Tencent Cloud', {
    secretId: process.env.TENCENTCLOUD_SECRET_ID,
    secretKey: process.env.TENCENTCLOUD_SECRET_KEY,
    sdkAppId: process.env.TENCENTCLOUD_SMS_SDK_APP_ID,
    signName: process.env.TENCENTCLOUD_SMS_SIGN_NAME,
    templateId: process.env.TENCENTCLOUD_SMS_TEMPLATE_ID,
  });
  const params = templateValues(process.env.TENCENTCLOUD_SMS_TEMPLATE_PARAMS)
    .map((name) => templateValue(name, code));
  const Client = tencentSms.v20210111.Client;
  const client = new Client({
    credential: {
      secretId: config.secretId,
      secretKey: config.secretKey,
    },
    region: process.env.TENCENTCLOUD_SMS_REGION || 'ap-guangzhou',
    profile: {
      httpProfile: {
        endpoint: 'sms.tencentcloudapi.com',
        reqMethod: 'POST',
        reqTimeout: 10,
      },
    },
  });

  const response = await client.SendSms({
    PhoneNumberSet: [phone],
    SmsSdkAppId: config.sdkAppId,
    SignName: config.signName,
    TemplateId: config.templateId,
    TemplateParamSet: params,
  });
  const status = response.SendStatusSet?.[0];
  if (!status || status.Code !== 'Ok') {
    throw new Error(`Tencent Cloud SMS rejected request: ${status?.Code ?? 'UNKNOWN'}`);
  }
}

function aliyunClientConfig() {
  const config = requiredConfig('Alibaba Cloud', {
    accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    signName: process.env.ALIBABA_CLOUD_SMS_SIGN_NAME,
  });
  const client = new AlibabaSms(new AlibabaOpenApiConfig({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    endpoint: process.env.ALIBABA_CLOUD_SMS_ENDPOINT || 'dysmsapi.aliyuncs.com',
  }));
  return { client, signName: config.signName };
}

export async function deliverAliyunSmsTemplate(
  phone: string,
  templateCode: string,
  params: Record<string, string>,
): Promise<SmsDeliveryReceipt> {
  if (!templateCode.trim()) throw new Error('Alibaba Cloud SMS template code is missing');
  const { client, signName } = aliyunClientConfig();
  const response = await client.sendSms(new SendSmsRequest({
    phoneNumbers: displayPhone(phone),
    signName,
    templateCode,
    templateParam: JSON.stringify(params),
  }));

  if (response.body?.code !== 'OK') {
    throw new Error(`Alibaba Cloud SMS rejected request: ${response.body?.code ?? 'UNKNOWN'}`);
  }
  return {
    providerMessageId: response.body?.bizId ?? null,
    requestId: response.body?.requestId ?? null,
  };
}

async function sendWithAliyun(phone: string, code: string): Promise<void> {
  const templateCode = process.env.ALIBABA_CLOUD_SMS_TEMPLATE_CODE;
  if (!templateCode) throw new Error('Alibaba Cloud SMS configuration is incomplete');
  const params = Object.fromEntries(
    templateValues(process.env.ALIBABA_CLOUD_SMS_TEMPLATE_PARAMS)
      .map((name) => [name, templateValue(name, code)])
  );
  await deliverAliyunSmsTemplate(phone, templateCode, params);
}

export async function deliverSmsCode(
  provider: SmsProvider,
  phone: string,
  code: string
): Promise<void> {
  if (provider === 'aliyun') {
    await sendWithAliyun(phone, code);
    return;
  }
  await sendWithTencent(phone, code);
}
