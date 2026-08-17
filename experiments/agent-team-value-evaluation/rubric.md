# 统一盲评 Rubric

评审者不得看到 D0/D1/D2/D3 分组、Provider 名称或模型名称。

## 评分顺序

1. 先检查确定性验证结果。
2. 再阅读最终产物，不阅读模型思考过程。
3. 记录具体证据后再给严重度。
4. 不因文字风格、模型品牌或篇幅本身加减分。

## 严重度

### 阻断

- 核心结果错误或无法使用。
- 违反明确约束、权限或安全边界。
- 编造关键事实、引用或测试结果。
- 可能造成数据损坏或不可逆副作用。
- 缺少任务明确要求的核心交付物。

### 警告

- 边界条件、错误处理或证据覆盖存在明显缺口。
- 产物基本可用，但需要实质性修正。
- 计划或实现偏离要求，但未导致核心失败。

### 建议

- 不影响正确性的可读性、表达或维护性改进。
- 未要求但可能有价值的后续优化。

## 维度与分值

每项 0–4 分，总分 24 分。

| 维度 | 0 分 | 2 分 | 4 分 |
|---|---|---|---|
| 正确性 | 核心错误 | 基本正确但有明显缺口 | 关键结果正确且边界合理 |
| 完整性 | 核心交付缺失 | 大部分完成 | 全部必需产物完整 |
| 约束遵循 | 明显越界 | 有轻微偏离 | 权限、范围、格式全部遵守 |
| 可验证性 | 无证据或编造 | 有部分验证 | 验证充分且结果可复现 |
| 风险控制 | 忽略重大风险 | 识别部分风险 | 风险、失败与降级处理清楚 |
| 可维护/可用性 | 难以使用 | 基本可用 | 结构清晰、可继续维护或决策 |

## 评审记录模板

```yaml
case_id: string
artifact_id: string
rubric_score:
  correctness: 0
  completeness: 0
  constraint_adherence: 0
  verifiability: 0
  risk_control: 0
  maintainability_or_usability: 0
findings:
  - severity: blocker | warning | suggestion
    evidence: string
    impact: string
    recommended_change: string
overall: string
```
