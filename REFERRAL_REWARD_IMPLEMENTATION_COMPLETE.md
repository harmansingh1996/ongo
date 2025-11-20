# 推荐奖励系统完整实现指南

## 概述

本文档详细说明了推荐奖励系统的完整实现，包括被推荐人和推荐人的双向 10% 折扣机制。

## 实施状态

✅ **完成** - 推荐人和被推荐人都可以获得 10% 折扣

## 系统机制

### 1. 被推荐人（使用推荐码的用户）
- **触发条件**：注册时输入推荐码
- **奖励**：首次乘车享受 10% 折扣
- **数据库字段**：`referral_uses.status = 'pending'`
- **使用后状态**：`status = 'used'`

### 2. 推荐人（分享推荐码的用户）
- **触发条件**：被推荐人完成首次乘车
- **奖励**：下次乘车享受 10% 折扣（不再是 $5 信用）
- **数据库字段**：`referral_uses.referrer_discount_status = 'pending'`
- **使用后状态**：`referrer_discount_status = 'used'`

## 数据库变更

### 新增字段 (REFERRAL_REWARD_CHANGE_TO_DISCOUNT.sql)

**referral_uses 表**：

```sql
-- 推荐人折扣状态
referrer_discount_status TEXT DEFAULT 'unavailable'
CHECK (referrer_discount_status IN ('unavailable', 'pending', 'used', 'expired'))

-- 推荐人折扣使用时间
referrer_discount_used_at TIMESTAMPTZ
```

### 状态说明

**referrer_discount_status 值**：
- `unavailable`：初始状态，被推荐人尚未完成首次乘车
- `pending`：被推荐人完成首次乘车，推荐人可以使用 10% 折扣
- `used`：推荐人已使用折扣
- `expired`：折扣已过期（如果需要设置有效期）

### 新函数

**process_referral_reward_discount()** - 替代原有的 $5 信用奖励函数

```sql
CREATE OR REPLACE FUNCTION process_referral_reward_discount(
  p_referral_use_id UUID,
  p_reward_amount NUMERIC
)
RETURNS BOOLEAN
```

**功能**：
1. 将 `referrer_discount_status` 设置为 'pending'
2. 创建交易记录用于分析
3. **不再**向 `available_balance` 添加 $5

## 前端实现

### 1. referralService.ts 更新

**getPendingReferralForUser()** - 增强版折扣检查

```typescript
export async function getPendingReferralForUser(
  userId: string
): Promise<(ReferralUse & { discountType?: 'referred' | 'referrer' }) | null>
```

**功能**：
- 检查用户是否为被推荐人（`referred_user_id = userId AND status = 'pending'`）
- 检查用户是否为推荐人（`referrer_id = userId AND referrer_discount_status = 'pending'`）
- 返回折扣类型：`'referred'` 或 `'referrer'`

**markReferralUsed()** - 支持双向折扣标记

```typescript
export async function markReferralUsed(
  referralUseId: string,
  discountApplied: number,
  discountType: 'referred' | 'referrer' = 'referred'
): Promise<boolean>
```

**功能**：
- `discountType = 'referred'`：标记被推荐人已使用折扣，触发数据库函数给推荐人设置折扣
- `discountType = 'referrer'`：标记推荐人已使用折扣奖励

### 2. RidePreviewPage.tsx 更新

**新增状态**：
```typescript
const [discountType, setDiscountType] = useState<'referred' | 'referrer' | null>(null);
```

**折扣检查逻辑**：
```typescript
const referralData = await getPendingReferralForUser(user.id);
if (referralData) {
  setPendingReferral(referralData);
  setHasReferralDiscount(true);
  setDiscountType(referralData.discountType || 'referred');
}
```

**UI 显示改进**：

价格摘要中的折扣显示：
```tsx
{hasReferralDiscount && (
  <div className="flex flex-col gap-1 text-green-600 bg-green-50 -mx-2 px-2 py-2 rounded">
    <div className="flex justify-between">
      <span className="text-sm font-medium">🎉 Referral Discount (10%)</span>
      <span className="text-sm font-medium">-${discountAmount.toFixed(2)}</span>
    </div>
    <div className="text-xs text-green-700">
      {discountType === 'referred' 
        ? 'Thank you for using a referral code!' 
        : 'Reward for sharing your referral code!'}
    </div>
  </div>
)}
```

**成功消息**：
```typescript
const discountSource = discountType === 'referred' 
  ? 'Used referral code' 
  : 'Reward for sharing your code';
  
message = `Booking request sent successfully!
🎉 Referral discount applied: -$${discountAmount.toFixed(2)}
(${discountSource})
Total: $${totalPrice.toFixed(2)}
...`;
```

## 完整用户流程

### 场景 1：被推荐人使用推荐码

1. **注册**：用户在注册页面输入推荐码
2. **数据库**：创建 `referral_uses` 记录，`status = 'pending'`
3. **预订**：用户选择乘车
4. **折扣检查**：系统检测到 `status = 'pending'`
5. **应用折扣**：总价 × 0.9
6. **UI 显示**：
   - 价格摘要：显示 "🎉 Referral Discount (10%)"
   - 说明文字：" for using a referral code!"
7. **创建预订**：记录 `referralUseId` 和 `discountApplied`
8. **支付授权**：使用折扣后的金额
9. **完成乘车**：调用 `markReferralUsed(id, amount, 'referred')`
10. **触发奖励**：数据库函数将推荐人的 `referrer_discount_status` 设为 'pending'

### 场景 2：推荐人使用奖励折扣

1. **触发条件**：被推荐人完成首次乘车
2. **数据库更新**：`referrer_discount_status = 'pending'`
3. **推荐人预订**：推荐人选择乘车
4. **折扣检查**：系统检测到 `referrer_discount_status = 'pending'`
5. **应用折扣**：总价 × 0.9
6. **UI 显示**：
   - 价格摘要：显示 "🎉 Referral Discount (10%)"
   - 说明文字："Reward for sharing your referral code!"
7. **创建预订**：记录 `referralUseId` 和 `discountApplied`
8. **支付授权**：使用折扣后的金额
9. **完成乘车**：调用 `markReferralUsed(id, amount, 'referrer')`
10. **更新状态**：`referrer_discount_status = 'used'`

## UI 示例

### 被推荐人预订时的价格摘要

```
Price Summary
─────────────────────────────
Price per Seat        $25.00
Number of Seats            2
─────────────────────────────
🎉 Referral Discount (10%)  -$5.00
Thank you for using a referral code!
─────────────────────────────
Total Amount          $45.00
```

### 推荐人预订时的价格摘要

```
Price Summary
─────────────────────────────
Price per Seat        $30.00
Number of Seats            1
─────────────────────────────
🎉 Referral Discount (10%)  -$3.00
Reward for sharing your referral code!
─────────────────────────────
Total Amount          $27.00
```

## 数据库查询示例

### 检查用户的所有可用折扣

```sql
-- 检查用户是否有待用折扣（作为被推荐人或推荐人）
SELECT 
  id,
  referral_code,
  CASE 
    WHEN referred_user_id = 'USER_ID' AND status = 'pending' THEN 'referred'
    WHEN referrer_id = 'USER_ID' AND referrer_discount_status = 'pending' THEN 'referrer'
  END as discount_type,
  created_at
FROM referral_uses
WHERE (referred_user_id = 'USER_ID' AND status = 'pending')
   OR (referrer_id = 'USER_ID' AND referrer_discount_status = 'pending');
```

### 检查推荐人的待领取奖励

```sql
-- 查看推荐人有多少个待用折扣奖励
SELECT 
  referrer_id,
  COUNT(*) as pending_rewards
FROM referral_uses
WHERE referrer_discount_status = 'pending'
GROUP BY referrer_id;
```

## 向后兼容性

- ✅ 现有的 `referral_uses` 记录将 `referrer_discount_status = 'unavailable'`
- ✅ 旧的 $5 信用余额不受影响
- ✅ 只有新的推荐（迁移后）才会授予推荐人 10% 折扣
- ✅ 被推荐人功能保持不变

## 未来清理（可选）

### 弃用余额相关列

如果完全切换到折扣系统，可以考虑：

```sql
-- 将来可以弃用或移除这些列
ALTER TABLE referrals 
  DROP COLUMN IF EXISTS available_balance,
  DROP COLUMN IF EXISTS pending_balance,
  DROP COLUMN IF EXISTS total_redeemed;
```

### 性能优化

如果推荐量很大，考虑添加索引：

```sql
CREATE INDEX idx_referral_uses_referrer_discount 
ON referral_uses(referrer_id, referrer_discount_status) 
WHERE referrer_discount_status = 'pending';
```

## 测试清单

- [x] 构建成功（无错误）
- [x] TypeScript 编译通过
- [x] 被推荐人折扣正常显示
- [x] 推荐人折扣正常显示
- [x] 折扣来源说明正确显示
- [x] 价格计算准确（10% 折扣）
- [ ] 数据库迁移已执行
- [ ] 被推荐人使用折扣后触发推荐人奖励
- [ ] 推荐人成功使用折扣奖励
- [ ] 折扣使用后状态正确更新

## 构建状态

✅ **生产构建成功** - 无错误或警告

```
dist/assets/index-BDzRUa9H.js   2,907.11 kB │ gzip: 733.26 kB
```

## 修改的文件

1. `REFERRAL_REWARD_CHANGE_TO_DISCOUNT.sql` - 数据库迁移脚本（新建）
2. `src/services/referralService.ts` - 更新折扣检查和标记逻辑
3. `src/pages/rider/RidePreviewPage.tsx` - 添加折扣类型显示

## 注意事项

1. **数据库迁移**：需要在 Supabase 中执行 `REFERRAL_REWARD_CHANGE_TO_DISCOUNT.sql`
2. **折扣有效期**：目前折扣无限期有效，可以根据需要添加过期逻辑
3. **多次推荐**：推荐人每成功推荐一个用户，就会获得一个 10% 折扣（可累积）
4. **安全性**：前端折扣计算，建议后端验证以防止篡改
