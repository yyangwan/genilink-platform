export const SCENARIOS = { awareness: '认知了解', selection: '方案与品类选型', features: '功能比较', cost: '价格与成本', implementation: '实施适配', proof: '案例与验证', risk: '风险限制', service: '售后服务' } as const;
export type Scenario = keyof typeof SCENARIOS;
