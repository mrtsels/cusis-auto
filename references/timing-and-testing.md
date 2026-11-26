# CUSIS 计时与测试

## 调度与校时

本机与 CUSIS 共用香港天文台授时，`enroll.js` 将**预约开放时间 + 1 ms** 换算成单调时钟上的截止点。单调时钟用于计时，系统改时间时它会继续向前运行。计划点击前 **100 ms** 复核购物车并缓存 Enroll 按钮。期间购物车发生变化时更新缓存。到点时核对时间和缓存控件是否仍有效，直接调用按钮，清理与日志放到点击之后。

Console 中 `Enroll timing` 的 `Timer delay` 是计划时刻到定时回调入口的差值，`Callback to click` 是从回调入口到调用按钮的差值。两项都用 `performance.now()` 计时。

macOS 可用 `sntp stdtime.gov.hk` 只读复核本机时钟偏差。记录采样时间、原始输出及工具提供的往返延迟和测量不确定度。比较历史读数时，统一用「本机减参考时钟」表示偏差，正数表示本机快。 [香港天文台授时服务](https://www.hko.gov.hk/en/nts/ntime.htm) · [NTPv4 规范](https://www.rfc-editor.org/rfc/rfc5905.html#section-8)

## 本地测试

在仓库根目录用 Node.js 运行回归测试。测试使用模拟页面和时钟，覆盖经典页、SPA、异步准备、无效输入、重复粘贴、切到后台、时钟跳变和控件失效。

```sh
node --test tests/enroll.test.js
```

### 3 ms 缓冲的历史对照

本机 Chrome 158 无头模式对比 20 ms 和 3 ms，每组 100 次，经典页和 SPA 各半。模拟开放到点击的中位数从 22.4 ms 降到 5.5 ms，P99 从 23.5 ms 降到 6.7 ms。3 ms 组最早在模拟开放后 4.0 ms 点击，每次均产生一次点击和一次本机回环请求。

### 20 ms 缓冲的历史对照

本机 Chrome 158 无头模式用同一套单次定时逻辑对比 80 ms 和 20 ms。每组 100 次，经典页和 SPA 各半。开放到点击的中位数从 82.4 ms 降到 22.6 ms，P99 从 86.4 ms 降到 23.4 ms。20 ms 组最早在模拟开放后 21.3 ms 点击。每个样本均产生一次点击和一次本机回环请求。

### 80 ms 缓冲的历史对照

本机 Chrome 158 无头模式对比 `be6f86d` 和初版单次定时。两版各跑 100 次，经典页和 SPA 各半，预约时间与模拟时钟一致，缓冲同为 80 ms。模拟 Enroll 按钮向本机回环地址发送带唯一标记的 XHR，按该请求的 `requestStart` 计时。

| 指标 | 旧版中位数 | 新版中位数 | 旧版 P99 | 新版 P99 |
| --- | ---: | ---: | ---: | ---: |
| 预约时间到点击 | 106.8 ms | 82.1 ms | 133.0 ms | 84.1 ms |
| 点击到浏览器发起请求 | 0.7 ms | 0.6 ms | 1.4 ms | 1.8 ms |

初版单次定时最早在模拟开放后 80.7 ms 点击。200 个样本均触发一次浏览器点击和一次本机请求。

## 校园网观察

宿舍有有线 ResNet 时优先使用。在同一购物车标签页完成常规 Validate，等页面稳定。观察正常 Enroll 操作时，用 Chrome Network 面板按发起者找到对应请求，查看浏览器排队、DNS、连接和 TLS 握手。只有新建连接反复出现在提交路径上，才值得比较同源 `preconnect`。首字节时间还受网络往返和服务端处理影响。服务端的预约判定时间需要服务端记录。 [CUHK ResNet 建议](https://www.itsc.cuhk.edu.hk/sc/all-it/wifi-and-network/resnet/best-prac-resnet/) · [Chrome 网络计时](https://developer.chrome.com/docs/devtools/network/reference#timing-explanation)

## 2026 年 8 月历史记录

历史记录将这些 NTP 读数标为「本机减参考时钟」。原始输出和估计误差未留档，读数方向与当时连接路径待核实。

| NTP 源 | 当时记录的读数 |
| --- | --- |
| `time.apple.com` ×3 | +0.068 / +0.069 / +0.067 s |
| `time.google.com` | +0.046 s |
| `time.nist.gov` | +0.042 s |
| `hk.pool.ntp.org` | +0.048 s |

一次真实 CUSIS 测试将脚本目标时间设为 `12:24:30.000 HKT`，最后一条 XHR 的浏览器资源起点为 `12:24:30.102 HKT`。该样本用的是 50 ms 轮询加 80 ms 缓冲。记录未将这条 XHR 与点击关联，也未记录服务端接收时间。
