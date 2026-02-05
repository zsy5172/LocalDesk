# ADR (Architecture Decision Records) Guide

ADR 是 ValeDesk 的架构决策记录系统，用于追踪会话中的重要决策和变更。

## 概述

ADR 记录:
- 技术和架构决策
- Charter 变更
- 约束覆盖
- 用户显式的决策

## ADR 结构

```typescript
interface ADRItem {
  id: string;           // 格式: adr-YYYY-MM-DD-xxxxxxxx
  type: ADRType;        // 决策类型
  status: ADRStatus;    // 当前状态
  title: string;        // 简短标题
  context: string;      // 背景说明
  decision: string;     // 决策内容
  consequences: string; // 影响和后果
  createdAt: string;    // 创建时间
  updatedAt: string;    // 更新时间
  supersedes?: string;  // 替代的 ADR ID
  
  // Charter 变更专用字段
  charterHashBefore?: string;
  charterHashAfter?: string;
  changedFields?: string[];
}
```

## ADR 类型

| 类型 | 说明 | 自动创建 |
|------|------|----------|
| `architectural` | 架构层面的决策 | 否 |
| `technical` | 技术实现决策 | 否 |
| `process` | 流程相关决策 | 否 |
| `charter-change` | Charter 变更记录 | ✅ |
| `constraint-override` | 约束覆盖决策 | 否 |
| `user-override` | 用户显式覆盖 | 否 |

## ADR 状态

```
proposed → accepted
         → rejected
         → deprecated
         → superseded (by another ADR)
```

## 使用方式

### 通过工具创建 ADR

```
# 创建新 ADR
manage_adr create \
  --type technical \
  --title "使用 PostgreSQL 而非 MySQL" \
  --context "需要选择数据库" \
  --decision "选择 PostgreSQL" \
  --consequences "需要配置连接池"

# 更新 ADR 状态
manage_adr update_status <adr-id> accepted

# 列出所有 ADR
manage_adr list

# 查看单个 ADR
manage_adr get <adr-id>
```

### 自动创建的 ADR

当 Charter 被修改时，系统自动创建 `charter-change` 类型的 ADR:

```json
{
  "id": "adr-2024-01-15-a1b2c3d4",
  "type": "charter-change",
  "status": "accepted",
  "title": "Charter updated: goal, constraints",
  "context": "Charter was modified during session",
  "decision": "Updated fields: goal, constraints",
  "consequences": "Session scope has been adjusted",
  "charterHashBefore": "abc123",
  "charterHashAfter": "def456",
  "changedFields": ["goal", "constraints"]
}
```

## 校验规则

ADR 链在会话启动时校验:

### 错误 (Error)
- `supersedes` 引用不存在的 ADR
- 检测到循环引用

### 警告 (Warning)
- 存在超过 7 天未处理的 `proposed` 状态 ADR

## UI 组件

### ADRPanel

在会话详情中显示 ADR 列表:
- 按状态分组显示
- 展开查看详情
- 显示 Context/Decision/Consequences
- Charter 变更显示 hash 和变更字段

## 最佳实践

### 何时创建 ADR

✅ 应该创建:
- 选择了某个技术方案而非其他
- 改变了原有的实现方式
- 覆盖了 Charter 中的约束
- 做出了影响后续开发的决策

❌ 不需要创建:
- 日常的代码修改
- 小的 bug 修复
- 格式化/重构

### ADR 标题

好的标题:
- "Use Redis for session storage"
- "Adopt TypeScript strict mode"
- "Replace REST with GraphQL for user API"

不好的标题:
- "Decision" 
- "Change"
- "Update code"

### ADR 内容

**Context**: 说明背景和问题
```
当前系统使用文件存储会话数据，随着用户增长，
读写性能下降，需要选择新的存储方案。
```

**Decision**: 明确的决策
```
使用 Redis 作为会话存储，原因:
1. 高性能读写
2. 内置过期机制
3. 团队熟悉
```

**Consequences**: 影响和后果
```
- 需要部署 Redis 实例
- 需要处理 Redis 故障时的降级
- 会话数据大小受限于内存
```

## 示例

### 技术决策 ADR

```yaml
ID: adr-2024-01-15-tech001
Type: technical
Status: accepted
Title: Use Vitest instead of Jest for testing

Context: |
  项目需要选择测试框架。当前使用 Vite 构建，
  需要与构建工具良好集成的测试方案。

Decision: |
  选择 Vitest 作为测试框架:
  - 与 Vite 原生集成
  - 兼容 Jest API
  - 更快的执行速度

Consequences: |
  - 测试配置简化
  - 可以复用 Vite 配置
  - 部分 Jest 插件可能不兼容
```

### 约束覆盖 ADR

```yaml
ID: adr-2024-01-16-override001
Type: constraint-override
Status: proposed
Title: Override "no external API calls" constraint

Context: |
  Charter 约束禁止调用外部 API，但实现功能需要
  调用第三方地图服务。

Decision: |
  临时覆盖约束，允许调用 Google Maps API:
  - 仅限地理编码功能
  - 添加缓存减少调用次数
  - 添加降级处理

Consequences: |
  - 引入外部依赖
  - 需要处理 API 限流
  - 需要在 CI 中 mock 外部调用
```

## 与 Charter 的关系

```
Charter (定义范围和约束)
    ↓
ADR (记录决策和变更)
    ↓
Compliance Gate (执行检查)
```

- Charter 变更自动产生 ADR
- ADR 可以记录对 Charter 约束的覆盖
- Compliance Gate 检查操作是否符合 Charter，并参考 ADR
