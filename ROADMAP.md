# Stardew Wrapped · 落地路线图

> 单文件 fan-made 网页，把 SDV 存档变成 Spotify-Wrapped 风格的年度回顾。
> 目标：成为 r/StardewValley / B 站 / 小红书 / Nexus 都有人用的「社区代表作」。
> 总周期：4-6 个月，4 期。前一期不达验收门槛不进下一期。

文档生成日期：2026-05-22
负责人：单人开发

---

## 0. 决策摘要（已拍板，不再讨论）

| 维度 | 决策 | 推导出的硬约束 |
|---|---|---|
| 定位 | 社区代表作 | 必须能被 r/StardewValley 推上 hot |
| 数据来源 | 解析真存档 XML | 全前端 DOMParser；零后端零上传 |
| 存档范围 | SDV 1.6 单机 + 多人 | 1.5 旧档 / mod 档礼貌拒绝 |
| 隐私 | 纯前端零上传 | 分享只能走 ① PNG 海报 ② URL hash 序列化 |
| 渠道 | Reddit + Steam + B 站 + 小红书 + Nexus + GitHub | **英文版 P0**（重写，不是机翻） |
| 性能 | 桌面优先 | 移动端能滑就行，不强制 PWA、不强制拆包 |
| 海报玩家信息 | 默认露名 + 一键打码 toggle | 海报导出时单独读 toggle |
| 多人存档 | 默认 host + 可切换 farmhand | 进入流程时有选择器 |
| 未达成卡片 | 隐藏 + 末尾「学习手册」卡 | 每张卡需 `isApplicable(saveData)` |
| 终末分享物 | 一张总括海报（不做视频不做单卡） | 双尺寸：1080×1920 + 1200×630 |

## 0.1 项目现状速读

- `index.html` 单文件，约 9950 行（2026-05-22），含 14 张轮播卡：
  - data-idx 0-13: cover / gossip / npc / type / family / crop / adventure / fishing / dish / numbers / small / grandpa / card-summary / profession-card
- 装饰层（已实现）：M-A 灯笼/Junimo/小鸡 · M-B 像素鼠标/WebAudio · M-C 季节转场/夜空 · M-D NPC 客串/道具掉落 · M-E 农夫职业 QR 测试
- i18n 框架已就位：`I18N.zh / I18N.en` 字典，`applyLang()` / `tr(key, vars)` (index.html:6066-6083)，82 个 `data-i18n` key
- 海报导出：已引入 html-to-image，导出按钮 `#save-scene-btn` (index.html:4566)，CSS 在 1153-1186 / 3237-3460
- assets：`assets/stardew/` 真实游戏素材（sky/loose/trees/weather/maps/characters/farmer/ui），`assets/audio/*.ogg` 从本地 SDV Wave Bank 转出；主线上线包使用 `dist-full/`，保留这些资源元素
- 部署状态（2026-05-25）：已新增 `node .tools/build-full.mjs`，可生成保留原资源元素的完整静态包；`dist-full/` 是 Cloudflare Pages / GitHub Pages 的主发布目录。`node .tools/build-public.mjs` / `dist-public/` 仅作为不带游戏图片/音频/头像素材的备用包
- 发布验证状态（2026-05-25）：`node .tools/release-check.mjs` 与 `python .tools/release-browser-check.py` 已覆盖 full/public 静态包、final-domain 静态 metadata、landing 非官方/素材归属提示、full 版 CSP 浏览器渲染、海报导出、柔和点击音效、解析器/上传错误态 fixture、删除节日回顾卡、小屏海报布局、匿名导出控件不遮挡、前景草坪/原版树/树根视觉回归；新增 `node .tools/hosted-check.mjs` 用于部署后的线上域名门禁
- 当前上线缺口（2026-05-25）：5+ 份真实 1.6 存档自测、3-5 人朋友真档反馈、Edge/Safari/Firefox 桌面检查、Lighthouse 桌面分数、最终托管环境 headers/CSP 与社交预览链接调试尚未完成；当前 `https://stardew-wrapped.pages.dev/` 从本环境访问失败，hosted final pass 不能勾选
- 工具链：`.tools/` 下 xnbcli/unxwb/vgmstream/ffmpeg + snap.py/probe.py/ascii_preview.py（headless Chrome 截图，因为 Read 不能渲染图）

## 0.2 全程不变的横向原则

1. **单文件先不拆**。第 1-3 期 index.html 保持单文件，只把 `src/parser/sdv-save.js` 拆出去（要测试、要社区贡献）。"打开 index.html 就能玩"对 SDV 社区有亲和力，是传播卖点。
2. **不做账号 / 不做服务器 / 不做云端**。分享靠 PNG 海报 + URL hash 序列化（脱敏数据 gzip + base64，≤30KB）。
3. **不做 PWA**。桌面优先 = 不需要离线安装，把那 10-15h 省下来打磨海报和文案。
4. **i18n 不是翻译是写作**。英文圈的梗 ≠ 中文圈的梗，机翻必死。这是能不能进 Reddit hot 的分水岭。
5. **承诺只做 1.6**。1.5 老档 + mod 档礼貌拒绝并写进 FAQ。
6. **学习手册卡是长期差异化亮点**。Spotify Wrapped 只回顾，我们能"驱动玩家回到游戏"——在 Reddit 帖子里专门讲。

---

## 第 1 期 · "真存档"内核（4 周，60-80h）

**目标**：上传 SDV 1.6 单机/多人存档 → 14 张原卡自动填真实数据。完成后已可发"私域版"（朋友圈 / SDV Q 群）小范围测试。

> 状态（2026-05-23）：A/B/C/D 全部落地，剩 1.2 验收门槛里的 5 份真存档自测 + 朋友邀请测试。
> - A 解析器：抽到 `src/parser/sdv-save.js`，新增 `SaveError` + `MAX_SAVE_BYTES` + `listFarmers(xmlText)`，`parseStardewSave(xml, {playerUniqueId})` 支持 farmhand 切换，版本闸门拒绝 1.5 / >=1.7
> - B 隐私 toggle 已就位（之前已做）
> - C `CARD_REGISTRY` + `computeVisibleCards` + `computeHiddenCards` + 第 15 张学习手册卡 `data-idx="14"`（在职业卡 13 前 / 海报 12 前）
> - D demo / 上传双轨已就位
> - 错误页：5 条独立文案（NOT_MAIN_SAVE / OLD_VERSION / FUTURE_VERSION / PARSE_FAILED / TOO_LARGE / UNKNOWN 兜底），每条带"用 demo 看"+"换一个文件"按钮，i18n zh/en
> - farmhand 多人选择器：多人存档时弹模态选 host / farmhand
> - 烟雾测试脚本：`.tools/smoke_phase1.py`

### 1.1 任务拆解

#### A. 存档解析器（核心，30h）
- 抽出 `src/parser/sdv-save.js`（独立 ES module，但 index.html 仍单文件，用 `<script type="module">` 引入）。**这是唯一该拆的模块**——后面 e2e 测试、社区 PR 都靠它。
- 解析 1.6 schema 关键字段：
  - `player.farmName` / `name` / `farmingLevel` 等 5 项技能
  - `friendshipData`（NPC heart points）
  - `professions`（10 级 / 5 级技能职业）
  - `mailReceived`（节庆 / 任务标记）
  - `stats.*`（步数、击杀、钓鱼数、收成、做菜数）
  - `gameVersion`（rejection 检查）
- 多人：从 `farmhands` 数组提取列表 → UI host + farmhand 选择器
- 错误兜底，每条独立文案：
  - 1.5 旧档 / 未来版本（gameVersion mismatch）
  - 不是 main save（用户传了 SaveGameInfo / _old）
  - 文件 > 10MB（防恶意）
  - XML 解析失败
  - 全部错误页都带"用预设角色看 demo"按钮
- **决策**：1.6 modded 存档（SVE / Ridgeside）不做特殊处理，按 vanilla 读，mod NPC 走 fallback 头像 + "Pelican Town local" hint。README 写明"已知 mod 限制"。

#### B. 隐私 / 打码（5h）
- 默认露名（已选）；右上角加 "🔒 隐私模式" toggle
- 开启后：所有 NPC / 玩家 / 农场 / 孩子名替换为「某 NPC / 某农场 / 某玩家 / 孩子A」
- 海报导出时**单独**读这个 toggle 的值（用户可以"看的时候露、保存时隐"）

#### C. 未达成卡的隐藏 + 学习手册（10h）
- 每张卡注册 `isApplicable(saveData)`，返回 false 的卡不进 carousel
- 末尾新增**第 15 张卡 = 学习手册**，列出被隐藏的卡 + 对应解锁提示
  - 例："想看年度爱人卡？去找一个心仪的 NPC 送 ta 喜欢的礼物到 8 颗心"
- 引导玩家回到游戏，是相对 Spotify Wrapped 的核心差异

#### D. demo / 上传双轨（5h）
- 首页双入口："用 demo 数据看" + "上传我的存档"
- demo 路径保持不变（现有 mock 数据继续用）

#### E. 回归测试（10h）
- 所有原有装饰层（M-A/M-B/M-C/M-D/M-E）在真数据驱动下不崩
- 重点：本命 NPC 卡的客串头像在 Krobus / Dwarf / Leo 等非可婚 NPC 下不挂

### 1.2 验收门槛（不达标不进第 2 期）

- 当前自动化证据（2026-05-25）：release gate 已证明 demo/full 资源路径、public-safe fallback、landing 非官方/素材归属提示、海报导出、点击音效、解析器/上传错误态 fixture、小屏摘要布局、前景草坪/原版树/树根回归；这些不能替代真实存档和跨浏览器验收。
- [ ] 5 份不同 1.6 存档自测（自己造各种）+ 邀请 3-5 个朋友提交真存档（中文/英文/单机/多人/早期/后期各 1）
- [ ] 14 原卡 + 学习手册卡都能正确生成
- [ ] 隐藏逻辑准确（没结婚就没"家"卡）
- [ ] Chrome / Edge / Safari / Firefox 桌面端通过
- [ ] 解析失败页文案清晰可读

### 1.3 风险与退路

- **风险**：1.6 字段比 1.5 多很多新东西（金桃、Ginger Island、电影院等），部分未文档化
- **退路**：所有字段读取走 `safeGet(xml, path, fallback)`，缺失返回 0 / 空字符串，绝不抛错

---

## 第 2 期 · 海报传播物 + 6 张新卡（5 周，70-90h）

**目标**：拿出能让 Reddit 用户截图主动转发的总括海报；新增 6 张能产出"哇哦"瞬间的 scene 卡。结束 = 中文公测节点。

> 状态（2026-05-25）：6 张新卡中 c/e/f 已落地到 `index.html`，并纳入 `.tools/smoke_phase1.py` 烟雾测试；d 节庆回顾因大多数玩家都会参与、区分度低，已从当前轮播移除，parser 字段保留给未来更有信息量的节日玩法。
> - c 探险足迹 stat：`data-idx="15"` 冒险者档案，6 行 RPG sheet（步数/矿洞/骷髅洞/击杀/晶球/累瘫）+ rank stamp
> - d 节庆回顾：已移出当前轮播；不再注册 `data-idx="18"`，保留 `festivals/eventsSeen` 解析字段
> - e 社区中心 / Joja 进度：`data-idx="17"`，6 房间格栏，读取 parser 的 `ccRooms/ccPath`
> - f 技能雷达图：`data-idx="16"`，已补齐为 6 轴（farming/fishing/foraging/mining/combat/luck），luck 由 `dailyLuck` 映射到 0..10
> - 待确认：a 年度财富 timeline、b 年度天气历在 vanilla save XML 里尚未发现逐日历史字段；当前只有 `money/totalMoneyEarned` 聚合值、当前日期/季节与实时天气 UI。继续前必须用真存档确认是否能从 XML 读到每日收入/天气历史，不能伪造数据。

### 2.1 6 张新卡（40h，严格按拍板的来）

| 卡 | 实现要点 |
|---|---|
| **a. 年度财富 timeline** | 4×84 全年日历，每格按 `moneyEarned` 渐变；hover 显示"7月14日 +64,000g · 哈兰夜卖松露"；峰值 3 天打 sparkle 标记。海报上简化为"年度总收入 + 最暴富的一天" |
| **b. 年度天气历** | 4×28 热力图，雨/雪/雷/雾各一种 SDV 像素图标。直接复用 `assets/stardew/weather/` |
| **c. 探险足迹 stat** | 复古 RPG 角色面板风：步数 / 击杀总数 / 矿洞最深 / 火山最深 / 沉船次数。每个数字配 NPC 吐槽（"克林特：你给我矿石的速度比我打的还快"） |
| **d. 节庆回顾** | 当前版本移除：参与率过高导致信息价值低；仅在后续能读出比赛名次、特殊奖励等强差异数据时再考虑回归 |
| **e. 社区中心 / Joja 进度** | 6 个 Junimo 房间 UI，每个进度条；Joja 路线显示为撕坏的票券形态。asset 缺则用 emoji 临时顶 |
| **f. 技能雷达图** | 6 边形（farming/fishing/foraging/mining/combat/luck）SVG 雷达，外圈贴 SDV 工具像素图标 |

每张新卡都要：① 走第 1 期的 `isApplicable()` 协议 ② 接 i18n ③ 隐藏时合进学习手册卡

### 2.2 总括海报重做（20h）

- **双尺寸**：1080×1920（IG/小红书/B 站头图） + 1200×630（Twitter/Reddit OG / GitHub social preview）
- **固定 5 块内容**：
  1. 农场名 + 年数 + 头像
  2. 本命 NPC 头像 + 心数
  3. 年度数字（赚多少金、走多少步、钓多少鱼）
  4. 一句"年度标签"（来自人格卡：矿洞狂魔/恋爱脑/...）
  5. 域名水印 + 二维码（扫码进入网站首页，**不带任何用户数据**——守住零上传承诺）
- **导出注意**：装饰层（灯笼/Junimo/小鸡/飘云）必须显式隐藏，或让海报区域是独立 sandbox（z-index 高于装饰层）
- **字体子集**：海报只用 ~200 个汉字 + 数字字母，运行时检测后给 html-to-image 一个内联 woff2（避免远程字体导出失败）

### 2.3 分享体验细节（5h）

- 保存后弹"复制到剪贴板 / 直接打开微信分享"二选一
- 海报右下二维码扫开 = 跳网站首页

### 2.4 「Wrapped 名场面」微动画（10h）

5-7 个：
- 收入峰值那天放金币雨
- 第一次进矿洞触发"矿洞回声"音效
- 本命 NPC 出场时屏幕暗一下 + 头像 zoom-in
- 其余 2-4 个按手感加

### 2.5 验收门槛

- [ ] 一个朋友看到海报后**主动**问"这个怎么做的"
- [ ] 海报在微博/小红书/B 站动态尺寸下不糊不溢
- [ ] 6 张新卡每张都接好"未达成→隐藏→进学习手册"链路

### 2.6 风险与退路

- **风险**：html-to-image 在 Safari 下经常掉字体/掉 image
- **退路**：保留"右键截图"备份提示，最坏让用户手动截

---

## 第 3 期 · 中文公测 + 英文版（4 周，60-80h）

**目标**：中文公测拿一波真实反馈修 bug；同时英文版做到"r/StardewValley 母语者不觉得违和"。

### 3.1 中文公测（10h，主要是组织成本）

- 在 SDV 中文吧 + 小红书 + B 站发"测试招募"
- GitHub Issues 当公开 bug 板，配 issue template
- 准备 3 篇内容：
  - B 站 60 秒预告视频（屏录完整流程 + BGM）
  - 小红书图文九宫格（每张卡截一张漂亮的）
  - 贴吧文字版

### 3.2 英文版翻译 + 文案校对（30h，比想象的多）

- **重点：不是 i18n 翻译，是文案重写**
  - 中文圈的梗（"老婆是真的"）≠ 英文圈的 deadpan humor
  - 每条 NPC quote / 人格描述 / 镇民小报都要重写
- 请英语母语者校对（Fiverr 50-100 刀，8000 字以内）
- 字体 fallback 链：英文版 'Press Start 2P' 优先 / 中文版 'Cubic 11' 优先
- 现有 82 个 `data-i18n` key + 动态生成的 `tr()` 调用全数检查

### 3.3 修中文公测 bug（15h，预留）

### 3.4 基础 SEO + 社交卡（10h）

- OG / Twitter card meta（标题、描述、1200×630 海报作 og:image）
- sitemap.xml + robots.txt + 一个静态 about / how-it-works 页
- GitHub README：英文为主，截图 GIF / 视频嵌入，**"How to find your save file"** 段（Win/Mac/Linux 三平台路径）
- LICENSE（建议 MIT）、CONTRIBUTING.md（说明怎么提 mod 兼容 PR）、CHANGELOG.md

### 3.5 域名 + 部署（5h）

- GitHub Pages 或 Cloudflare Pages（免费、纯静态、CDN）
- 域名建议 `.app` 或 `.fun`，避开 `.io`（贵）

### 3.6 验收门槛

- [ ] 中文版收到 30+ 真实使用反馈，关键 bug 全修
- [ ] 一个英语母语者读完英文版反馈 "reads natural"
- [ ] Lighthouse 桌面跑分 ≥ 90

### 3.7 风险与退路

- **风险**：找不到合适的英语母语校对
- **退路**：Claude 重写 + ChatGPT 二次润色，至少不会"中式英语"露馅

---

## 第 4 期 · Reddit 发布 + 长尾（3 周，40-60h）

**目标**：r/StardewValley 发首帖；接住流量；做后续运营。

### 4.1 发布素材打磨（15h）

- Reddit 帖子标题：克制不浮夸
  - 参考："I made a website that turns your Stardew save into a Spotify-Wrapped-style recap"
  - 先在 r/SampleSize 或小号试两轮
- 配图：3-4 张精选截图 + 1 个 30 秒 .mp4
- 备稿：r/InternetIsBeautiful / r/sideproject / HN Show

### 4.2 Nexus Mods 上架（10h）

- 分类：Tools（companion tool）
- 截图 5-8 张、英文描述（Nexus Markdown 子集）、changelog 链回 GitHub

### 4.3 应对反馈的 v1.1（15h，预留）

- 前 72 小时反馈接小 bug + "能不能加 X"，开 Issue 评估
- 第一波热度过后做 1-2 个高呼声小功能快速上线，制造二次热度

### 4.4 数据观察（5h）

- 加 Plausible / Umami（隐私友好的轻量统计，不上 GA）
- 关注指标：
  - 上传成功率
  - 各卡退出率（哪张卡用户最容易跳出）
  - 海报保存率
  - language toggle 使用率

### 4.5 B 站长视频（5h，可选但强烈推荐）

录 5-8 分钟"我是怎么做这个网站的"幕后视频
- 讲存档解析、像素美术、字体子集等技术细节
- 技术圈 + SDV 圈双触达

### 4.6 验收门槛

- [ ] Reddit 首帖 ≥ 200 upvote（小爆款）或 ≥ 1k（代表作）
- [ ] Nexus 上架后 1 月内 ≥ 5k 下载
- [ ] GitHub ≥ 100 star

### 4.7 风险与退路

- **风险**：发出去石沉大海
- **退路**：发布前在小圈子（朋友 + SDV 中文社群）做"种子用户"——10-20 个真实自来水帖比一个孤立 Reddit 链接强 10 倍

---

## 待解决的悬挂问题

发布前必须想清楚但今天还没拍板的：

1. **支持哪一年**？SDV 无限循环。默认最近一年（Year N），还是用户选？
   - 倾向：默认 Year N，提供下拉选历史年份
2. **第 4 期"分享我的年报链接"是否做**？纯前端方案是把脱敏数据 gzip + base64 进 URL hash（~30KB 内）。优点：完全符合零上传承诺。缺点：URL 巨长，微信预览可能失败
3. **NPC 客串头像在海报里露脸？还是只在卡里露**？影响海报美学一致性

## 下一步立刻可做的事

如果下一次会话直接开第 1 期，从这两件事开始：
1. 新建 `src/parser/sdv-save.js`，写 1.6 schema 解析器骨架（先解析 farmName / farmerName / friendshipData，跑通从文件 → JS object 的链路）
2. 在 index.html 首页加"上传存档"入口 UI（和现有 demo 入口并列），文件 input → FileReader → DOMParser → parser

## 文件 / 路径速查

| 关注点 | 位置 |
|---|---|
| 入口 | `index.html`（单文件，~9950 行） |
| i18n 字典 | `index.html` 内联，`I18N.zh / I18N.en`，`applyLang()` 在 6066 行 |
| 海报 CSS | `index.html` 3237-3460 |
| 海报保存按钮 | `index.html:4566` (`#save-scene-btn`) |
| 卡片结构 | `index.html:4724` 起，`data-idx="0..13"` |
| NPC 头像 | `portraits/*.png`（base64 内联在 index.html 的 PORTRAIT_DATA） |
| 真实素材 | `assets/stardew/` (sky/loose/trees/weather/maps/characters/farmer/ui) |
| 音频 | `assets/audio/*.ogg`（从本地 SDV Wave Bank 转出） |
| 截图工具 | `.tools/snap.py` + `.tools/ascii_preview.py`（headless Chrome） |
| 音频重做 | `.tools/encode_audio.py`（改 CANDIDATES 后跑） |

下次接手第一件事：`Read ROADMAP.md` + `Read MEMORY.md` 里的 stardew-wrapped 条目 → 直接进第 1 期 A 任务。
