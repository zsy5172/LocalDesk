# Charter System

Charter 是 ValeDesk 的会话范围定义系统，用于明确一个会话的目标、边界和约束条件。

## 概述

每个 Session 可以关联一个 Charter，定义:
- **Goal**: 会话要完成的核心目标
- **Non-Goals**: 明确排除在范围外的内容
- **Definition of Done**: 完成标准
- **Constraints**: 软性约束（建议遵守）
- **Invariants**: 硬性不变量（必须遵守）
- **Glossary**: 术语表

## 快速开始

### 1. 创建带 Charter 的会话

在 "New Session" 对话框中选择 Charter 模板:

| 模板 | 用途 |
|------|------|
| None | 不使用 Charter |
| Blank | 空白模板，自定义填写 |
| Code Review | 代码审查任务 |
| Documentation | 文档编写任务 |
| Bug Fix | Bug 修复任务 |
| Feature | 功能开发任务 |

### 2. 通过工具管理 Charter

Agent 可以使用 `manage_charter` 工具:

```
# 初始化 Charter
manage_charter init

# 查看当前 Charter
manage_charter get

# 更新 Charter（自动创建 ADR 记录变更）
manage_charter update goal "新的目标描述"
manage_charter update constraints add "新增约束"
manage_charter update dod remove "dod-xxx"
```

## Charter 数据结构

```typescript
interface CharterData {
  goal: CharterItem;                    // 必填：核心目标
  nonGoals?: CharterItem[];             // 可选：非目标
  definitionOfDone: CharterItem[];      // 必填：完成标准
  constraints?: CharterItem[];          // 可选：软性约束
  invariants?: CharterItem[];           // 可选：硬性不变量
  glossary?: Record<string, string>;    // 可选：术语表
}

interface CharterItem {
  id: string;      // 唯一标识，如 "goal-abc123"
  content: string; // 内容描述
}
```

## 校验规则

Charter 在会话启动时自动校验:

### 错误 (Error)
- Goal 为空
- Definition of Done 为空

### 警告 (Warning)
- 没有定义 Constraints
- 没有定义 Invariants

## 合规门禁

工具执行前会检查是否符合 Charter:

### 硬性失败 (Hard Fail)
- 违反 Invariants（包含 "never"/"do not"/"must not" 等关键词的操作）
- 阻止执行并提示用户

### 软性失败 (Soft Fail)
- 无法推断与 Charter 的关联
- 记录警告但允许执行

## Charter 变更追踪

当 Charter 被修改时，系统自动:
1. 计算变更前后的 hash
2. 创建 `charter-change` 类型的 ADR
3. 记录变更的字段和内容

参见 [ADR Guide](./adr-guide.md) 了解更多。

## UI 组件

### CharterPanel

在会话详情右侧显示 Charter 内容:
- 折叠/展开各个部分
- 显示 Goal、Non-Goals、DoD、Constraints、Invariants
- 术语表悬停提示

## 最佳实践

1. **Goal 要具体**: 避免模糊的目标如"改进代码"
2. **DoD 可验证**: 每个完成标准应该是可检验的
3. **Invariants 谨慎使用**: 只用于真正不可违反的规则
4. **及时更新**: 范围变更时更新 Charter，留下 ADR 记录

## 示例

### Bug 修复 Charter

```yaml
Goal: 修复用户登录时的 500 错误

Non-Goals:
- 重构认证模块
- 添加新的登录方式

Definition of Done:
- 错误不再复现
- 添加回归测试
- 更新相关文档

Constraints:
- 尽量减少代码改动
- 保持向后兼容

Invariants:
- 不能修改数据库 schema
- 不能影响其他 API 端点
```

### 功能开发 Charter

```yaml
Goal: 实现用户头像上传功能

Non-Goals:
- 图片编辑功能
- 批量上传

Definition of Done:
- 支持 JPG/PNG 格式
- 文件大小限制 2MB
- 上传后立即显示
- 单元测试覆盖

Constraints:
- 使用现有的文件存储服务
- 遵循现有的 API 设计风格

Invariants:
- 不存储原始文件名（安全考虑）
- 必须验证文件类型
```
