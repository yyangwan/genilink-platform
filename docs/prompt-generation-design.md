# 提示词生成系统设计方案

版本：v1.1
状态：设计稿
适用范围：`genilink-platform` 提示词生成链路、提示词管理页、可见性分析入口
目标：在保留产品上下文的前提下，稳定生成更具体、更有购买意图的提示词，避免泄漏待评估品牌，提升可见性分析数据质量

## 1. 设计目标

这不是一个“多生成一些提示词”的功能，而是一个受控的数据生产系统。

### 1.1 业务目标

- 提升提示词的真实感和决策意图
- 提升品牌自然曝光的概率，但不直接泄漏待评估品牌名称
- 降低提示词泛化导致的低质量可见性数据
- 让后续可见性分析更接近真实用户的搜索和询问行为

### 1.2 技术目标

- 输入标准化，避免依赖零散字段直接拼装
- 生成结果可解释、可回溯
- 输出可校验、可回归
- 规则和生成逻辑解耦，便于后续替换为规则引擎、LLM 或混合模式

## 2. 设计边界

1. **待评估品牌不可见，产品锚点可见**
   - 生成结果中不得包含待评估品牌名、别名或其明显变体。
   - 生成结果可以包含产品名、项目名或类别锚点，只要它们是在描述分析对象，而不是曝光目标品牌本身。

2. **意图优先**
   - 提示词必须表达明确的决策意图，而不是只描述一个产品类别。

3. **产品信号优先于模板**
   - 先理解产品，再生成问题。

4. **质量先于数量**
   - 低质量 prompt 宁可不发，也不要进入分析链路污染结果。

5. **可回归**
   - 每个输出策略都必须能被测试覆盖。

## 3. 现状问题

当前链路主要由以下部分组成：

- [`src/app/api/integration/prompts/generate/route.ts`](../src/app/api/integration/prompts/generate/route.ts)
- [`src/lib/prompts/prompt-generation.ts`](../src/lib/prompts/prompt-generation.ts)

现状的不足：

- 路由层仅做字段转发，没有质量闸门
- 规则层更像“泛化检测”，不是完整的生成器
- `productDescription` 和 `productUrl` 没有进入强生成逻辑
- 缺少统一的输出校验
- 缺少按意图分类的覆盖测试

## 4. 总体架构

建议把提示词生成拆成四个阶段：

```text
Project fields
   ↓
Product Profile Builder
   ↓
Intent Spec Generator
   ↓
Prompt Renderer
   ↓
Prompt Linter / Scorer
   ↓
Persist / Return
```

### 4.1 Product Profile Builder

把输入字段统一抽象成产品画像。

输入：

- `productName`
- `projectName`
- `productKeywords`
- `productDescription`
- `productUrl`
- `industry`

输出示例：

```ts
type ProductProfile = {
  productName?: string;
  projectName?: string;
  industry?: string;
  productKeywords: string[];
  productDescription?: string;
  productUrl?: string;
  productType?: string;
  targetAudience?: string[];
  usageScenarios?: string[];
  buyingStage?: 'awareness' | 'consideration' | 'decision';
  comparisonAngles?: string[];
  riskAngles?: string[];
  queryToneHints?: string[];
};
```

画像构建规则：

- `productDescription` 用于推断用途、场景、目标人群
- `productUrl` 用于补充产品定位和站点上下文
- `productKeywords` 用于补充术语和行业词
- `industry` 用于帮助分类到更具体的意图桶

### 4.2 Intent Spec Generator

根据产品画像生成提示词意图规格，而不是直接生成最终 prompt。

推荐意图桶：

1. 选型 / 购买
2. 对比 / 替代
3. 场景 / 使用
4. 避坑 / 风险
5. 参数 / 性能

每个意图规格应包含：

```ts
type PromptSpec = {
  intent: 'purchase' | 'compare' | 'scenario' | 'risk' | 'performance';
  angle: string;
  audience?: string;
  context: string;
  constraints: string[];
  strength: number;
};
```

生成逻辑：

- 先判断产品是偏 B 端、工具类、消费类还是服务类
- 再判断用户在什么阶段更可能询问该类产品
- 最后选出适合的意图桶和约束

示例：

- 工具类产品更适合“选型 / 对比 / 避坑”
- 复杂服务更适合“场景 / 风险 / 方案比较”
- 消费类产品更适合“购买 / 参数 / 性价比”

### 4.3 Prompt Renderer

将 `PromptSpec` 渲染为最终提示词。

渲染要求：

- 运行时不得输出待评估品牌名、别名或其严重变体
- 可以保留产品名、项目名或类别起点，但必须表达的是观察对象的产品上下文
- 必须出现具体场景词
- 必须出现决策动词或问题式结构
- 必须符合自然语言习惯

输出示例模式：

- `预算有限时，适合新手入门的 XX 类产品怎么选？`
- `XX 场景下，哪些方案更适合小团队长期使用？`
- `如果主要关注稳定性和维护成本，XX 类工具应该优先看什么？`
- `同类产品里，哪种方案更适合先试用再决定采购？`

说明：

- `XX` 代表抽象产品类别，不代表品牌
- 不能使用生硬的关键词堆叠

### 4.4 Prompt Linter / Scorer

生成后必须经过质量校验。

建议至少实现四类检查：

1. **待评估品牌泄漏检查**
   - 任何待评估品牌名、别名或其明显变体都视为泄漏。

2. **泛化检查**
   - 不能出现“通用产品”“示例产品”“placeholder”“xxx”这类词。
   - 不能只剩抽象词，不含场景和意图。

3. **重复检查**
   - 同批次 prompt 不能语义重复。
   - 不同意图桶必须保留差异。

4. **意图检查**
   - 必须能归入明确意图桶。
   - 必须有可解释的选择理由。

可以为每条 prompt 打一个质量分：

```ts
type PromptQuality = {
  brandLeak: boolean;
  genericRisk: boolean;
  duplicateRisk: boolean;
  intentCoverage: boolean;
  score: number; // 0-100
};
```

建议阈值：

- `score < 70`：丢弃或重生成
- `score >= 70`：可入库
- `score >= 85`：优先保留为主样本

## 5. 接口设计

### 5.1 路由层职责

现有路由：

- [`src/app/api/integration/prompts/generate/route.ts`](../src/app/api/integration/prompts/generate/route.ts)

建议职责扩展为：

1. 读取项目字段
2. 构建产品画像
3. 调用提示词生成器
4. 接收生成结果
5. 通过质量校验
6. 返回合格提示词

### 5.2 内部模块划分

建议新增三个核心模块：

```text
src/lib/prompts/
  prompt-profile.ts
  prompt-specs.ts
  prompt-renderer.ts
  prompt-lint.ts
```

职责说明：

- `prompt-profile.ts`
  - 从项目字段构建产品画像
- `prompt-specs.ts`
  - 根据画像生成意图规格
- `prompt-renderer.ts`
  - 将规格渲染成最终 prompt
- `prompt-lint.ts`
  - 校验 prompt 质量并打分

现有 [`src/lib/prompts/prompt-generation.ts`](../src/lib/prompts/prompt-generation.ts) 可以保留为兼容层，逐步收敛到新模块。

## 6. 生成策略设计

### 6.1 产品画像推断规则

#### 产品类型

从 `productDescription` 和 `productKeywords` 推断：

- 工具
- SaaS
- 服务
- 硬件
- 内容 / 媒体
- 消费品

#### 目标人群

可从描述中识别：

- 新手
- 小团队
- 独立开发者
- 中大型团队
- 预算敏感用户

#### 场景

可从描述中识别：

- 日常使用
- 选型比较
- 试用验证
- 成本控制
- 稳定性优先

### 6.2 意图桶权重

建议不同产品类型使用不同权重：

- 工具类：对比、避坑、场景权重更高
- 消费类：购买、参数、性价比权重更高
- 服务类：场景、风险、方案权重更高

权重不是固定模板，而是控制生成分布，避免所有 prompt 看起来一样。

### 6.3 多样性约束

同一批次 prompt 需要满足：

- 至少覆盖 3 个意图桶
- 同一意图桶内不要只换词不换结构
- 场景词和决策词不能全部重复

## 7. 数据模型建议

### 7.1 PromptSet

```ts
type PromptSet = {
  id?: string;
  projectId: string;
  profile: ProductProfile;
  prompts: GeneratedPrompt[];
  version: string;
  generatedAt: string;
};
```

### 7.2 GeneratedPrompt

```ts
type GeneratedPrompt = {
  text: string;
  intent: PromptSpec['intent'];
  score: number;
  reasons: string[];
  rejected?: boolean;
  rejectionReason?: string;
};
```

这样做的好处是：

- 后续分析可以知道 prompt 为什么被选中
- 生成质量可以被追踪
- 回归问题可以定位到具体步骤

## 8. 失败处理

### 8.1 质量不达标

如果生成结果被校验层拒绝：

1. 先重试同意图桶的另一种表达
2. 再切换到相邻意图桶
3. 如果仍不合格，回退到最保守的高意图模板

### 8.2 品牌泄漏

一旦检测到待评估品牌泄漏：

- 直接丢弃
- 不进入保存逻辑
- 重新生成

### 8.3 输入过弱

如果项目只提供很弱的上下文，例如只有行业名：

- 优先生成场景型和避坑型 prompt
- 避免输出过度空泛的“通用问题”

## 9. 回归测试设计

### 9.1 路由测试

验证：

- 项目字段是否正确进入生成层
- `productDescription` 和 `productUrl` 是否被传递
- 路由是否能处理缺失字段

### 9.2 生成单测

验证：

- 待评估品牌名不会出现在结果中
- 结果不是纯模板重复
- 不同输入会生成不同意图桶的 prompt
- 输入越具体，输出越具体

### 9.3 质量校验测试

验证：

- 重复样本会被拦截
- 泛化样本会被拦截
- 品牌别名会被拦截
- 低分样本会被重生成

### 9.4 回归样例库

建议建立固定样例库：

- 工具类 SaaS
- 消费类产品
- 服务类项目
- 只有行业信息的弱输入
- 品牌别名很多的复杂输入

## 10. 迁移方案

### Phase 1：补画像和校验

- 引入 `ProductProfile`
- 增加 `PromptLinter`
- 保持旧接口不变

### Phase 2：引入意图桶

- 增加 `PromptSpec`
- 按意图桶生成 prompt
- 上线回归测试

### Phase 3：收敛旧逻辑

- 逐步减少旧 heuristic 的职责
- 把生成入口统一到新模块
- 保留兼容层一段时间

### Phase 4：质量监控

- 统计生成成功率
- 统计品牌泄漏率
- 统计重复率
- 统计 prompt 的最终分析表现

## 11. 验收标准

方案上线后，应满足以下标准：

- 生成结果中待评估品牌泄漏率为 0
- 单批 prompt 重复率显著下降
- prompt 的意图分类覆盖至少 3 类
- 输入越丰富，输出越具体
- 可见性分析的低质量样本明显减少

## 12. 结论

这套方案的核心不是“更会写 prompt”，而是“把 prompt 当成受控的产品数据生产流程”。

如果按这个方向落地，平台的提示词会更接近真实用户决策问题，同时保留待评估品牌不可见这一前提，从源头提升可见性分析的可信度。
