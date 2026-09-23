# 阅读主题制作

1.0.0 默认内置正文：邮票素笺、银河星系、庭前落英、小猫手账；小手机：简白、深灰、粉白、婴儿蓝。对应 JSON 在 themes/release，运行时无需手动导入。

需要交给 AI 直接制作时，使用 [正文美化框架](../美化制作/正文美化-发给AI.md) 或 [小手机美化框架](../美化制作/小手机美化-发给AI.md)。两份说明均可独立使用，填写风格要求后整份发送即可；[使用说明与可导入示例](../美化制作/使用说明.md) 提供导入步骤。

瞬息的整体界面只有日／夜两种模式。导入主题只改变正文或小手机阅读区，包括独立导出的 HTML，不改变设置页、分类页或酒馆界面。

正文纸面之外透明，阅读 iframe 不再绘制额外的矩形底色和边框。`tokens.background` 只控制纸面本身；票根的圆角或透明缺口外侧透出瞬息日夜背景。独立导出的 HTML 没有瞬息宿主，透明画布由浏览器显示默认页面底色。

在美化页分别选择「正文风格」和「小手机风格」。两个菜单与预设菜单采用相同的动态箭头和左侧圆点单选，整行文字或留白都可点击；手机上保留两个选择框，只显示最近选择的那一类预览。选择后只影响之后新生成／续写的章节；已有章节保持原样，一个番外可以同时含有不同风格的正文与手机章节。

每次生成开始时复制所选主题，存入该节的 `readingTheme`，包含 id、name、mode、tokens 与 css。画面、JSON 备份和分类导出的 HTML 均优先使用这份内容；生成中途切换默认风格也不影响已开始的章节。旧版缺少快照的章节在载入时按保存的 themeId 和当前主题库补齐，以当时仍可读取的样式为准。

「导入」「导出」「删除」位于阅读美化标题的右侧。导出 JSON 含当前选中的正文与手机主题，可修改后重新导入；也兼容下面的单主题 JSON。双主题包格式为 `{"format":"shunxi-reading-themes","version":1,"themes":[正文主题,手机主题]}`。

删除作用于当前预览类型下选中的导入主题。先操作正文或小手机的风格菜单，再点击删除，确认框会显示类型和名称。确认后主题从库中移除并切换为内置简白；取消则保留。内置默认风格不可删除，已有番外继续使用生成时保存的样式快照。删除不会删除电脑上原始导入的 JSON 文件。

## JSON 格式

```json
{
  "name": "我的宣纸",
  "mode": "prose",
  "tokens": {
    "background": "#F4E7CB",
    "color": "#493C2C",
    "fontFamily": "\"京华老宋体\", \"Songti SC\", SimSun, serif",
    "fontSize": "14px",
    "lineHeight": "2.1"
  },
  "css": ".paragraph { text-indent: 2em; margin-bottom: 1.2em; }"
}
```

`mode` 是 `prose` 或 `phone`，必须填写。导入器据此自动放入「正文风格」或「小手机风格」，并立即选中作为之后新章节的默认风格，不依赖文件名或导入时正在预览哪种模式。主题包按每一项的 mode 分别处理，同一类型导入多款时选中最后一款。`name` 为下拉菜单名称。可选 `id` 使用 `custom-` 开头的字母、数字和短横线；同一 ID 再次导入会替换主题库中的旧主题，已有章节的快照保持原样。不写 ID 时会生成新 ID。

`tokens` 支持的字段：

| 字段 | 作用 | 示例 |
| --- | --- | --- |
| background | 正文背景或手机屏幕底色；手机外部始终透出插件日夜底色 | #F9F8F6 |
| color | 正文颜色 | #282724 |
| fontFamily | 本地／已声明外部字体及回退字体 | "PingFang SC", sans-serif |
| fontSize | 正文字号 | 14px |
| lineHeight | 行高 | 2 |
| bubble | 对方消息气泡 | #FFFFFF |
| ownBubble | 我方消息气泡 | #E3E1DB |

## CSS 选择器

| 选择器 | 内容 |
| --- | --- |
| .chapter | 阅读区域（背景、字体优先使用 tokens 设置） |
| .prose-chapter | 一体式正文纸面，包含标题和自然段，不显示章节编号 |
| .prose-title | 纸面内的 h1 番外标题，可修改字体、颜色、字号、对齐和间距 |
| .paragraph | 正文自然段 |
| .paragraph q、.paragraph .prose-quote | 成对引号发言及原始引号 |
| .paragraph strong、.paragraph em、.paragraph del | 加粗、斜体、删除线 |
| .phone、.phone-screen、.phone-header | 手机机身、屏幕、固定顶部标题 |
| .phone-contact | 顶部角色名，来自该篇人物快照；始终相对屏幕居中，超长姓名自动省略，完整内容保留在 title；不要改写布局或添加偏移 |
| .phone-status、.phone-island、.phone-home | 状态栏、顶部岛、底部横条 |
| .messages、.message | 机身内独立滚动的消息列表、单条消息 |
| .message.own | 我方消息 |
| .message-avatar、.own .message-avatar | 对方／我方头像，默认圆形，原图内嵌 |
| .message-content、.message-time | 气泡与可选时间的容器、单条时间 |
| .bubble、.own .bubble | 对方／我方气泡 |
| .voice-bar、.voice-transcript | 语音条与展开的转写文字 |
| .transfer-card、.transfer-main、.transfer-foot | 转账卡片、金额区域、底栏 |
| .image-description、.message-image | 描述图片、图床图片 |
| .sticker-built-in、.sticker-image | 内置表情、图床表情 |
| .location-card、.location-caption、.virtual-map | 位置卡片、地名地址、虚拟地图 |
| .share-card、.share-description、.share-source | 分享标题、简述和缩略图、来源 |
| .call-record | 语音／视频通话发起提示 |
| details、summary | 语音转写的展开文字 |

阅读区域处于独立、无脚本的 iframe 中。0.8.0 起允许 `url()` 加载 HTTP(S) 字体和图片（优先 HTTPS），也支持字体／图片 Base64 数据 URL。CSS 顶层 `@font-face` 声明字体，`src` 使用字体文件直链，再用相同的字体名设置 `tokens.fontFamily` 或组件的 `font-family`。插件将字体声明放在章节作用域之外，并按章节改写字体名以避免混合主题冲突；普通样式仍限制在各自章节内。

CSS 不接受 `@import` 整份外部样式表、HTML、脚本或 `<`、`>` 字符；使用后代选择器。`@font-face` 不要放进 `@media` 或 `@scope`。字体服务器需允许跨域访问，加载失败时用后备字体；主题和导出保存的是资源 URL，未自动打包远程文件。JSON 最大 1 MB，CSS 最多 30,000 字符。

正文支持 `**加粗**`、`*斜体*`、`~~删除线~~`、`***加粗斜体***` 以及中文弯引号、英文双引号、直角引号内的发言。格式可嵌套，原始 HTML 保持文本展示；反引号内保留字面内容。q 元素不会自动补引号，样式中也不要重复添加。美化预览已经包含全部四种格式，可通过上述选择器分别设置颜色、字重和字体。这些写法与 [酒馆的 Markdown 编辑功能](https://docs.sillytavern.app/usage/hotkeys/) 对应。

自定义 CSS 由插件限定在各章节的作用域内，直接写以上组件选择器即可。0.9.3 起正文标题 `h1.prose-title` 位于 `.prose-chapter` 内，与正文共享纸面及主题作用域；`body`、`html` 和 `main` 仍在作用域外。单节阅读显示标题，整篇导出只在首个正文节内显示一次，后续节保留各自主题。正文容器不生成章节编号或 `h2` 节点；制作主题时不要用伪元素补回编号。

例如把头像改为小圆角方形，可在手机主题的 css 中写 `.message-avatar { border-radius: 8px; }`。头像通过背景图呈现，不包含显示姓名的节点；单条 `time` 字段显示在气泡下方。头像图像本身为插件内嵌资源，用户主题可修改形状和边框。调整大小与间距时请使用 `.phone { --avatar-size: 30px; --message-gap: 8px; }`，消息最大宽度会同步预留左右两列头像，避免仅改变头像宽度后挤满屏幕。

可以把这一段交给 AI：

> 请为「瞬息 0.8.0」生成一个可直接导入的阅读主题 JSON。我的风格要求是：【填写要求】。mode 为 prose（正文）或 phone（手机）。只包含 id、name、mode、tokens、css；tokens 只能使用 background、color、fontFamily、fontSize、lineHeight、bubble、ownBubble。正文分别美化引号发言、加粗、斜体、删除线。允许 HTTP(S) 图片 URL 和顶层 @font-face 字体直链；使用用户给定资源，不编造 URL。不使用 HTML、JavaScript、@import 或大于号选择器，不改变整体插件 UI。最后只输出合法 JSON。

## 小手机内容格式

生成时会要求 AI 输出以下结构；编辑功能也直接编辑这份 JSON。格式错误时仍保留原文，方便修正。

```json
{
  "messages": [
    { "type": "text", "sender": "char", "time": "23:48", "text": "到家了吗？" },
    { "type": "text", "sender": "user", "time": "23:48", "text": "到了。" },
    { "type": "voice", "sender": "char", "time": "23:49", "duration": "12″", "text": "这是语音的转写文字。" },
    { "type": "transfer", "sender": "char", "time": "23:50", "amount": "¥ 52.00", "status": "待收款", "text": "咖啡钱" }
  ]
}
```

sender 为 `char`、`user`、`system`。type 支持 `text`、`voice`、`transfer`、`image`、`sticker`、`location`、`share`、`call`、`video`，每个消息对象有且只有一个 type。上述示例为 4 条消息；转写、金额和时间都是该条消息的字段，不额外计数。解析合法 JSON 后统计 messages 内有效消息对象的数量，不扫描正文中的「type」字样。金额、时长等字段都用字符串。所有事件均为故事内容展示。

新生成不输出独立的 time 消息。旧内容中的 `{"type":"time","sender":"system","text":"23:48"}` 会在读取时转换为后续消息的时间字段，保留旧原文且不增加条数。旧版直接使用数组或用 Markdown 代码围栏包裹 JSON 的内容仍可读取。缺少 type／sender 或类型无效时显示格式问题并保留原文供编辑，不将坏格式估算成消息数。

- image：`url` 是 HTTPS 图片或 PNG/JPEG/GIF/WebP data URL；没有素材时填写 `text` 描述。
- sticker：可用 `url`，或 `sticker` 填内置的 `happy`、`hug`、`blush`、`goodnight`。未来表情映射预留在 `src/phone-assets.js` 的 `STICKER_URLS`；未知表情显示文字，不请求编造的链接。
- location：`title` 填虚拟地名，`address` 填虚拟地址；自动显示简化地图和定位标志，不请求真实地图。
- share：`title` 填原帖标题，`description` 填简洁信息，`source` 填来源；可选 `thumbnail` 为安全图片地址。
- call／video：只显示「发起语音／视频通话」。voice 的 `text` 是展开后显示的转写文字，不需要音频文件。

1.0.2 起阅读器统一将正文设为 14px、标题设为 26px，预览、旧作品与导出阅读文件一致；只覆盖字号，不覆盖字体、颜色或装饰。
