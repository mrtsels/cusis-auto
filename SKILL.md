---
name: cusis-enroll-scripts
description: >-
  在 CUSIS 购物车页执行 enroll.js / validate.js：接管已登录 Chrome、注入脚本、
  处理 prompt 对话框、验证点击结果。触发词：跑enroll、跑validate、选课脚本、抢课。
---

# CUSIS 购物车脚本执行（enroll.js / validate.js）

在用户已登录 CUSIS 的浏览器里执行购物车脚本。脚本本身零依赖、不碰登录，
agent 的职责是：**进入正确的页面 → 注入脚本 → 处理对话框 → 验证结果**。

## 脚本文件

| 文件 | 作用 | 对话框 |
|---|---|---|
| `~/cuhk-tools/enroll.js` | 到点自动点击 Enroll（抢课） | `prompt` 要选课时间 |
| `~/cuhk-tools/validate.js` | 验证购物车课程资格 | 无（可能 `confirm` 跳转） |

两者都渲染一个贴地浮层（`#log-overlay` / `#validate-log-overlay`），单行显示
最新状态，日志同时打到 console。

## 前置检查（必须）

1. **工具链就绪**（全新机器先做这步）：
   - 检查 `mcporter` 是否存在：`which mcporter`。没有则装（npm 全局）：
     ```bash
     npm install -g mcporter
     ```
   - 检查 chrome-devtools 服务器已注册：`mcporter list` 应看到
     `chrome-devtools`。没有则注册：
     ```bash
     mcporter config add chrome-devtools --command npx --arg -y --arg chrome-devtools-mcp@latest --arg --autoConnect --scope home
     ```
   - 首次连接会 `npx -y chrome-devtools-mcp@latest` 自动下载服务器包，
     可能耗时 10~30s，`mcporter call` 首次超时是正常的，重试即可
2. **用户 Chrome 已开启调试**：`chrome://inspect/#remote-debugging` → Enable
   （成功标志：`~/Library/Application Support/Google/Chrome/DevToolsActivePort`
   存在且含端口 + ws 路径）。若卡 "starting..."：Cmd+Q 完全退出 Chrome 重开
3. **页面必须是购物车页**：
   ```js
   document.title.indexOf("Shopping Cart") > -1 &&
   document.querySelectorAll(".ps-checkbox").length > 0
   ```
   - 经典页 URL 含 `SSR_SHOP_CART_FL`；SPA 页 URL 是 `NUI_FRAMEWORK`（2026+），
     判断**看 title + DOM，别看 URL**
   - **空购物车没有 checkbox/按钮**——先让用户加课，别跑脚本
4. **单会话**：确认没有第二个浏览器登录 CUSIS（多会话会锁定选课功能，
   报 "Restricted Multiple Login Error"）。若用户之前出过此错误，提示重启
   浏览器重新登录。
5. 若未登录：走 CUSIS 登录（ADFS → Duo 2FA 需用户手机批准），**只能用一个
   浏览器会话**。

## 执行步骤

### 方式 A：chrome-devtools-mcp（首选，接管用户真实 Chrome）

前提：用户 Chrome 已开 `chrome://inspect/#remote-debugging` → Enable，
mcporter 已注册 chrome-devtools。

```bash
# 1. 找购物车页
mcporter call chrome-devtools.list_pages
mcporter call chrome-devtools.select_page pageId=N   # 选 Shopping Cart 页

# 2. 注入脚本 —— 关键：去掉 IIFE 包装，改为函数声明
python3 - <<'EOF'
import json, os, subprocess, shlex
js = open(os.path.expanduser('~/cuhk-tools/enroll.js')).read()
body = js.strip()
assert body.startswith('(function () {') and body.endswith('})();')
inner = body[len('(function () {'):-len('})();')]
fn = 'function runScript() {' + inner + '\n}'
payload = json.dumps({"function": fn, "dialogAction": "2026-08-10 10:00:00"})
cmd = "mcporter call chrome-devtools.evaluate_script --args " + shlex.quote(payload)
subprocess.run(cmd, shell=True, check=True)
EOF
```

**坑**：
- `evaluate_script` 参数名是 `function`，mcporter key=value 传参报 -32602，
  必须 `--args '{"function": "..."}'` JSON 形式
- `dialogAction` 传字符串 = `window.prompt` 的返回值（enroll.js 必填选课时间）；
  validate.js 无 prompt，可省略
- 脚本是 IIFE，直接传给 evaluate_script 会报 `Unexpected token ';'`——
  必须转成 `function ...() {...}` 声明

### 方式 B：AppleScript（fallback，无 MCP）

Chrome 菜单 View → Developer → Allow JavaScript from Apple Events（一次性）。

```bash
osascript <<'EOF'
tell application "Google Chrome"
    set js to "(function(){...})()"   -- 完整脚本内容
    execute active tab of front window javascript js
end tell
EOF
```

prompt 对话框在 AppleScript 下会阻塞——需要用户手动输入时间。

## 验证（必须做，别只汇报"已注入"）

1. **读取浮层日志**：
   ```js
   document.getElementById("log-overlay").innerText
   ```
   期望序列：`The script starts.` → `Waiting for the registration time.
   Current time: HH:MM:SS.mmm`（循环）→ `The script clicks the Enroll button.`
2. **enroll.js 到点后**，页面应出现系统响应（成功提示或错误如
   `You do not have a valid enrollment appointment`——后者=点击成功但选课
   未开放，正常）。
3. **精确核对实际请求时间**（可选，用户要求时）：
   ```js
   var ns = performance.timeOrigin;
   performance.getEntriesByType("resource")
     .filter(e => e.initiatorType === "xmlhttprequest")
     .slice(-1).map(e => new Date(ns + e.startTime).toISOString())
   ```
   与设定时间对比，预期晚 80~130ms（缓冲 80 + 轮询滞后 ≤50）。

## 时间策略（enroll.js 内置，agent 不要改）

- 轮询 50ms + 缓冲 80ms。缓冲覆盖本地时钟 NTP 偏移（实测 ~70ms），
  保证点击严格晚于真实到点
- 选课时间由用户提供或对话框默认值（当前 +2min）——agent 替用户决定时
  用用户明确的开放时间，不要自己猜

## 陷阱速查

- **跳转后脚本失效**：脚本在非购物车页会 confirm 跳转，跳转销毁脚本上下文，
  需在新页面重注入。SPA 页正常情况不会跳转
- **evaluate_script 返回 undefined 是正常的**——脚本无返回值，副作用在 DOM
- **别用 Hermes browser 工具**（云端浏览器，用户看不到窗口，登录态不在）
- **别 killall 用户 Chrome**——用 AppleScript quit 保留标签页
- **多会话红线**：任何测试/操作只用当前这一个浏览器，绝不另开实例登录同账号
