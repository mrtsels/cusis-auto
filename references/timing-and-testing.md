# CUSIS 计时与测试实测数据（2026-08）

本文件记录 enroll.js/validate.js 在真实 CUSIS 环境下的实测数据，供校准参数与
复现测试时参考。

## 时间偏差测量（系统时钟 vs NTP）

用 `sntp -sS <server>` 多次采样（NTP 亚毫秒级精度，比 HTTP Date 头可靠）：

| NTP 源 | 偏差（本地 - NTP） |
|---|---|
| time.apple.com ×3 | +0.068 / +0.069 / +0.067 s |
| time.google.com | +0.046 s |
| time.nist.gov | +0.042 s |
| hk.pool.ntp.org | +0.048 s |

**结论：系统时钟稳定偏快约 40~70ms**，取保守上界 70ms 作为缓冲设计值。

关键点：
- macOS NTP 配置在 `/etc/ntp.conf`（本机为 `server stdtime.gov.hk`，
  香港天文台，与学校同源）
- `sntp -sS` 报 "Operation not permitted" 是正常的——只是不能写时钟，
  偏移值仍有效
- 本机 NTP 流量被透明代理劫持（stdtime.gov.hk 解析到 198.18.0.9 保留段），
  但系统时间仍准——不要因为代理而怀疑系统时间本身

## HTTP Date 头不可用于精确校准

- 服务器 Date 头是**秒级精度**（如 `04:18:59.000Z`），单次采样误差 ±500ms，
  比 NTP 偏差还大
- 可能被 CDN/代理改写（Apple 服务器 Date 头曾显示偏差 198s，实为代理假象）
- 同源 fetch 校准（`fetch(origin).headers.get("date")`）只能粗校，
  多次采样取 min 可逼近，但精度仍受秒级截断限制

## 计时参数推导

```
安全条件：缓冲 > 系统偏差(70ms) + 轮询滞后 + 余量
```

| 配置 | click 最早 | click 最晚 | 余量 |
|---|---|---|---|
| 60ms 轮询 + 100ms 缓冲（原版） | +100ms | +160ms | 30ms |
| **50ms 轮询 + 80ms 缓冲（定稿）** | **+80ms** | **+130ms** | 10ms |
| 10ms 轮询 + 80ms 缓冲 | +80ms | +90ms | 10ms（但 setInterval 后台被节流，名义 10ms 实际 ~50ms） |

**为什么不用 10ms 轮询**：浏览器后台标签页 setInterval 被节流，标称 10ms
实测 avg 49.7ms / max 94.7ms——名义值与 50ms 无差别，还更耗 CPU。

## 实测端到端结果（真实 CUSIS 环境）

设定到点 12:24:30.000（HKT），脚本自动点击 Enroll：

```
实际请求发出：12:24:30.102（+102ms）
误差分解：检测滞后 ~22ms（50ms 轮询）+ 缓冲 80ms ≈ 理论 80~130ms 区间正中
```

验证方法（performance API，无需抓包）：
```js
var ns = performance.timeOrigin;
performance.getEntriesByType("resource")
  .filter(e => e.initiatorType === "xmlhttprequest")
  .slice(-1).map(e => new Date(ns + e.startTime).toISOString())
```

## 测试方法要点

- 选课未开放时点 Enroll，系统返回
  `You do not have a valid enrollment appointment at this time`——这是
  **正常拒绝**，正好用于安全测试完整流程（脚本点击成功 + 系统按计划拒绝）
- 测试前用 `dialogAction` 传一个 30~60s 后的时间，观察等待日志 →
  到点自动点击 → 系统响应，三步全验证
- 2026 CUSIS 购物车页无 `DERIVED_REGFRM1_DETAILS_LINK`（旧版选择器失效），
  课程列表+checkbox+按钮直接显示，脚本需跳过 Details 步骤
- SPA 页（NUI_FRAMEWORK URL）与经典页（SSR_SHOP_CART_FL）元素结构相同，
  仅 URL 不同——脚本 URL 判断需同时兼容两者
