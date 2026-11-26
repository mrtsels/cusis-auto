# CUSIS 选课脚本（enroll.js / validate.js）

两个浏览器控制台脚本，用于 CUHK CUSIS 选课系统的购物车操作：

| 脚本 | 用途 | 时机 |
|---|---|---|
| `scripts/enroll.js` | 到点**自动点击 Enroll** 提交选课（抢课） | 选课开放那一刻 |
| `scripts/validate.js` | **验证**购物车内课程的选课资格（先修课、时间冲突等） | 随时 |

- 零依赖：不需要安装任何东西，复制粘贴即可运行
- 在已正常登录 CUSIS 的浏览器里运行
- 兼容 2026+ CUSIS 的两种购物车页面（经典页 / SPA 页）

---

## 一、手动使用（人在浏览器里操作）

### 前置条件

1. 已在浏览器登录 CUSIS
2. 购物车里**已有课程**（空购物车不会渲染任何按钮，脚本无法操作）

### validate.js（验证课程）

1. 进入 CUSIS → Manage Classes → Shopping Cart
2. 打开开发者工具（Mac: `Cmd+Opt+I`，Windows: `F12`）→ Console 标签
3. 把 `scripts/validate.js` 的**全部内容**粘贴进去，按回车
4. 观察屏幕底部浮层：
   - `Selected 1 course(s). Newly selected: 1.` —— 已勾选课程
   - `The script clicks the Validate button. The page returns the result.` —— 已提交验证
   - 页面返回 `Okay to Add` = 课程可以加入课表；返回错误信息 = 有未满足条件

### enroll.js（到点自动抢课）

1. 进入购物车页（同上）
2. 打开 Console，粘贴 `scripts/enroll.js` 全部内容，回车
3. 输入 CUSIS 显示的**选课预约开放时间**，例如 `2026-08-10 10:00:00`。输入和浮层都用香港时间（UTC+08:00）。确认前把预填的示例时间换成实际预约时间。取消对话框会结束排程。
4. 脚本勾选可用课程。按钮就绪后，浮层显示 `Scheduled to click Enroll at … HKT.`。保持购物车页在前台，脚本到点点击一次 Enroll。
5. 点击后，浮层和 Console 显示实际点击的香港时间（到毫秒），以及比预约开放时间和排程时间各晚了多少。选课结果以 CUSIS 页面为准。

同一标签页只保留一个排程。切到后台或离开购物车页会撤销排程。要更改时间，可先切到其他标签页，再回购物车重新运行脚本。

如果点击后会跳转页面，可提前在 Console 设置中开启 **Preserve log**，以便跳转后查看点击日志。 [Chrome Console 指南](https://developer.chrome.com/docs/devtools/console/reference#persist)

> 如果粘贴时**不在购物车页**：脚本会弹窗询问是否跳转，确认后跳转到购物车页，
> **跳转后需要在新页面重新粘贴一次**（页面跳转会清空控制台脚本，浏览器限制）。

---

## 二、喂给 AI agent 使用

如果你用 AI agent（如 Claude Code、Codex、Hermes）操作浏览器，把脚本文件路径
交给 agent，并告诉它下面这句话即可：

> 帮我在 CUSIS 购物车页跑 `scripts/validate.js`，跑完报告浮层日志。
> （或：帮我在购物车页跑 `scripts/enroll.js`，选课时间设为 `2026-08-10 10:00:00`。）

agent 需要具备**接管你已登录浏览器**的能力（例如通过 Chrome DevTools 协议连接
正在运行的 Chrome）。它应该：

1. 确认当前页面是购物车页（标题含 「Shopping Cart」 且有 `.ps-checkbox` 元素）
2. 把脚本作为函数注入页面执行（去掉外层 `(function(){...})()` 包装，改为
   `function run(){...}` 再传给 evaluate）
3. 处理脚本里的 `prompt` 对话框（agent 工具通常支持 `dialogAction` 参数传值）
4. 跑完从浮层（`#log-overlay`）读取日志回报

更详细的 agent 操作说明见同目录 `SKILL.md`。

---

## 三、时间精度说明（enroll.js）

本机与 CUSIS 共用香港天文台授时，脚本按**预约时间 + 1 ms** 定时。购物车提前准备完毕，点击前再检查系统时间、课程勾选状态和按钮。浏览器主线程繁忙时，点击可能晚于计划时间。

校时方法、校园网观察项和本地对照结果见 [计时与测试](references/timing-and-testing.md)。

---

## 四、注意事项

- **不要同时开两个浏览器登录 CUSIS**：系统检测到多会话会锁定选课功能
  （「Restricted Multiple Login Error」）。出现后重启浏览器重新登录即可解除。
- **空购物车不工作**：先往购物车加课，再跑脚本。
- **选课未开放时点 Enroll**：系统返回
  `You do not have a valid enrollment appointment at this time`——这是正常的，
  说明脚本点击成功、系统按计划拒绝。等到开放时间运行即可。
- 脚本只做**购物车页内的勾选 + 点击**，不会删除课程、不会改动其他页面。

---

## 五、Credits

- **enroll.js** 派生自 [AnsonCheng03/CUSIS-Auto-Reg](https://github.com/AnsonCheng03/CUSIS-Auto-Reg)
  （2022，`script.js`）。本仓库在其基础上做了兼容性与可靠性修复：
  - 移除对已不存在的 Details 链接的依赖（2026+ CUSIS 页面结构变化）
  - Enroll 点击增加元素检查与异常处理（原版可能静默失败）
  - 兼容 SPA 购物车页（`NUI_FRAMEWORK` URL），原版仅支持经典页
  - 用单次定时触发 Enroll，浮层显示香港时间和排程状态
- **validate.js** 为原创实现，无外部代码引用。
