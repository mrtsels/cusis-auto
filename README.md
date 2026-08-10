# CUSIS 选课脚本（enroll.js / validate.js）

两个浏览器控制台脚本，用于 CUHK CUSIS 选课系统的购物车操作：

| 脚本 | 用途 | 时机 |
|---|---|---|
| `enroll.js` | 到点**自动点击 Enroll** 提交选课（抢课） | 选课开放那一刻 |
| `validate.js` | **验证**购物车内课程的选课资格（先修课、时间冲突等） | 随时 |

- 零依赖：不需要安装任何东西，复制粘贴即可运行
- 不处理登录：在已登录 CUSIS 的浏览器里运行，天然绕过 2FA
- 兼容 2026+ CUSIS 的两种购物车页面（经典页 / SPA 页）

---

## 一、手动使用（人在浏览器里操作）

### 前置条件

1. 已在浏览器登录 CUSIS
2. 购物车里**已有课程**（空购物车不会渲染任何按钮，脚本无法操作）

### validate.js（验证课程）

1. 进入 CUSIS → Manage Classes → Shopping Cart
2. 打开开发者工具（Mac: `Cmd+Opt+I`，Windows: `F12`）→ Console 标签
3. 把 `validate.js` 的**全部内容**粘贴进去，按回车
4. 观察屏幕底部浮层：
   - `Selected 1 course(s).` —— 已勾选课程
   - `The script clicks the Validate button.` —— 已提交验证
   - 页面返回 `Okay to Add` = 课程可以加入课表；返回错误信息 = 有未满足条件

### enroll.js（到点自动抢课）

1. 进入购物车页（同上）
2. 打开 Console，粘贴 `enroll.js` 全部内容，回车
3. 弹出对话框，输入**选课开放的时间**，格式：`2026-08-10 10:00:00`（本地时间）
   - 也可以直接点确定，接受默认值（当前时间 + 2 分钟）
4. 脚本自动勾选全部课程，然后高频轮询等待：
   - 浮层显示 `Waiting for the registration time. Current time: HH:MM:SS.mmm`
   - 到点瞬间自动点击 Enroll，浮层变为 `The script clicks the Enroll button.`
5. 页面显示选课结果（成功 / 预约未开放 / 冲突等）

> 如果粘贴时**不在购物车页**：脚本会弹窗询问是否跳转，确认后跳转到购物车页，
> **跳转后需要在新页面重新粘贴一次**（页面跳转会清空控制台脚本，浏览器限制）。

---

## 二、喂给 AI agent 使用

如果你用 AI agent（如 Claude Code、Codex、Hermes）操作浏览器，把脚本文件路径
交给 agent，并告诉它下面这句话即可：

> 帮我在 CUSIS 购物车页跑 `~/cuhk-tools/validate.js`，跑完报告浮层日志。
> （或：帮我在购物车页跑 `~/cuhk-tools/enroll.js`，选课时间设为 `2026-08-10 10:00:00`。）

agent 需要具备**接管你已登录浏览器**的能力（例如通过 Chrome DevTools 协议连接
正在运行的 Chrome）。它应该：

1. 确认当前页面是购物车页（标题含 "Shopping Cart" 且有 `.ps-checkbox` 元素）
2. 把脚本作为函数注入页面执行（去掉外层 `(function(){...})()` 包装，改为
   `function run(){...}` 再传给 evaluate）
3. 处理脚本里的 `prompt` 对话框（agent 工具通常支持 `dialogAction` 参数传值）
4. 跑完从浮层（`#log-overlay`）读取日志回报

更详细的 agent 操作说明见同目录 `SKILL.md`。

---

## 三、时间精度说明（enroll.js）

| 参数 | 值 | 说明 |
|---|---|---|
| 轮询间隔 | 50 ms | 检测"是否到点"的频率 |
| 到点缓冲 | 80 ms | 检测到到点后，再多等 80ms 才点击 |

**为什么要有缓冲**：浏览器本地时钟通常比标准时间快几十毫秒（NTP 同步的固有
偏移）。80ms 缓冲确保点击**严格发生在真实到点之后**，不会因为本地时钟偏快而
提前点击（提前点击 = 选课窗口未开，白点一次）。

实测：设定 12:24:30 到点，实际请求发出 12:24:30.102（+102ms，含 50ms 轮询
滞后和 80ms 缓冲），落在理论区间 [80, 130]ms 内，不提前、无多余抖动。

---

## 四、注意事项

- **不要同时开两个浏览器登录 CUSIS**：系统检测到多会话会锁定选课功能
  （"Restricted Multiple Login Error"）。出现后重启浏览器重新登录即可解除。
- **空购物车不工作**：先往购物车加课，再跑脚本。
- **选课未开放时点 Enroll**：系统返回
  `You do not have a valid enrollment appointment at this time`——这是正常的，
  说明脚本点击成功、系统按计划拒绝。等到开放时间运行即可。
- 脚本只做**购物车页内的勾选 + 点击**，不会删除课程、不会改动其他页面。
