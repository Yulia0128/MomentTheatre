# 瞬息 · 小手机美化制作提示词

请为「瞬息 · 番外小剧场」制作一份可以直接导入的小手机阅读主题 JSON，适用于插件 1.0.0（主题格式兼容 0.8.0 起的版本）。请依照下面的真实格式和组件制作。

我的风格要求：【在这里填写想要的风格；可描述手机外壳、屏幕底色、双方气泡、头像形状、卡片和字体等。未指定的细节请自行搭配。】

## 交付内容

只输出一个完整、合法的 JSON 对象，不输出 Markdown 代码围栏、解释、HTML 页面或聊天记录。能生成文件时，请提供 UTF-8 编码的 `.json` 文件。

这是手机阅读皮肤，包含手机外壳和已有消息组件的外观。主题 JSON 不是包含 `messages` 的聊天内容 JSON。手机只展示故事内容，不实现发送消息、真实通话、真实转账或地图服务。

## JSON 格式

请修改这份可导入的基础框架来实现我的风格，最终文件不要保留占位要求：

```json
{
  "id": "custom-phone-starter",
  "name": "小手机框架 · 灰白",
  "mode": "phone",
  "tokens": {
    "background": "#F3F2EE",
    "color": "#292A27",
    "fontFamily": "'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
    "fontSize": "15px",
    "lineHeight": "1.65",
    "bubble": "#FFFFFF",
    "ownBubble": "#DDE3D8"
  },
  "css": ".phone { --avatar-size: 32px; --message-gap: 8px; background: #D5D6D1; border-color: #ACAEA6; box-shadow: inset 0 0 0 3px #ffffff80, 0 8px 22px #00000010; } .phone .message-avatar { border-radius: 50%; border: 1px solid #292a271a; } .phone .phone-header { font-family: inherit; border-bottom-color: #292a271f; } .phone .bubble { font-size: 14px; line-height: 1.7; } .phone .message[data-type=text] .bubble { border-radius: 12px 12px 12px 4px; } .phone .message.own[data-type=text] .bubble { border-radius: 12px 12px 4px 12px; } .phone .message-time { color: #6F736A; opacity: 1; } .phone .transfer-card { background: #B97842; color: #FFFFFF; } .phone .messages { scrollbar-color: #A5AA9D transparent; } .phone .messages::-webkit-scrollbar-thumb { background: #A5AA9D; border-radius: 8px; }"
}
```

| 字段 | 要求 |
| --- | --- |
| `id` | 为新作品起独立 ID，格式为 `custom-phone-英文风格名`；`custom-` 后只用小写英文字母、数字、短横线，长度 1–80 字符。同款修改可以沿用 ID，新款使用新 ID。 |
| `name` | 风格名称，非空，最多 60 字符。 |
| `mode` | 必须固定为 `phone`，插件据此自动放入小手机分类。 |
| `tokens` | 必须是对象，只支持示例中的 7 个字段，所有值均为字符串。 |
| `css` | 一个 CSS 字符串，用于外壳、气泡和各类卡片的具体样式；最多 30,000 字符。无需额外包裹标签或作用域。 |

`background` 是手机屏幕底色，`color` 是继承的文字色，`fontFamily` 是本地字体及后备字体，`fontSize` 是基础字号，`lineHeight` 是基础行高；`bubble` 是对方气泡背景，`ownBubble` 是我方气泡背景。

部分消息组件有自己的字号、行高和颜色，单改 tokens 不会覆盖全部组件。需要调整时使用下列组件选择器，例如 `.phone .bubble`、`.phone .voice-transcript`。转账卡片默认是橙色，需通过 `.phone .transfer-card` 单独改色。

## 已有结构

每节手机内容位于 `.phone-chapter`，里面有一台 `.phone`。手机的 `.phone-screen` 内，从上到下依次是状态栏 `.phone-status`、角色名标题栏 `.phone-header`、消息列表 `.messages`、装饰输入栏 `.phone-footer`、底部横条 `.phone-home`。

每条消息 `.message` 内有头像 `.message-avatar` 和内容容器 `.message-content`；内容容器内有 `.bubble`，有时间数据时还会有 `.message-time`。

对方在左边，我方消息使用 `.message.own` 在右边。每条只显示头像、气泡和可选时间，不显示姓名。顶部 `.phone-contact` 自动显示角色名，始终相对手机屏幕水平居中；左侧保留返回装饰，右侧没有三个点或其他图标。请保留动态内容，不要用伪元素覆盖成固定名称或补回省略号图标。

标题栏采用左右等宽留白的三列布局，居中所需的布局由插件固定。主题可修改标题颜色、字体、字号、字重及标题栏背景和边框；不要修改 `.phone-header` 的 display、grid-template-columns、左右留白，也不要给 `.phone-contact` 加偏移、transform、左右定位或不对称边距。长角色名保留单行省略，不能挤占左侧返回装饰。

CSS 已被插件限制在当前章节内部。请直接写下面的选择器，不要自己包裹 `@scope`，也不要使用 `body`、`html`、`:root` 或 `main`。建议为具体组件加 `.phone` 前缀。

## 外壳、头像与消息列表

| 选择器 | 对应元素 |
| --- | --- |
| `.phone` | 手机外壳、边框、阴影；可设置头像尺寸变量 |
| `.phone-screen` | 屏幕背景和内侧圆角 |
| `.phone-status`、`.phone-island`、`.phone-battery` | 状态栏、顶部岛、电池图标；没有信号格 |
| `.phone-header`、`.phone-contact`、`.phone-back` | 标题栏、角色名、返回装饰 |
| `.messages` | 手机屏幕内独立滚动的消息列表 |
| `.message`、`.message.own` | 对方／我方消息行 |
| `.message-avatar`、`.own .message-avatar` | 对方／我方头像，默认圆形 |
| `.message-content`、`.message-time` | 气泡和时间的容器、气泡下方时间 |
| `.bubble`、`.own .bubble` | 气泡容器；图片及卡片类型有专门样式 |
| `.phone-footer`、`.phone-input`、`.phone-home` | 装饰输入栏、输入槽、底部横条 |

可在 `.phone` 设置 `--avatar-size` 和 `--message-gap`，例如 `--avatar-size: 32px; --message-gap: 8px;`。头像与消息宽度会按这两个值同步计算。改变头像形状请用 `.phone .message-avatar { border-radius: 8px; }` 等规则。

头像图像默认由插件提供，以背景图方式呈现。可以修改圆角、边框和阴影；用户明确提供替换头像时，可用 `.phone .message-avatar`、`.phone .own .message-avatar` 分别设置 `background-image: url(...)`。不要无意中用 `background` 简写清空已有头像。

## 各种消息类型

每条 `.message` 有一个 `data-type` 属性。请按类型修改，避免给所有气泡统一加边框、背景或内边距而破坏卡片。

| 类型 | 现有选择器 | 呈现方式与制作要点 |
| --- | --- | --- |
| `text` | `.message[data-type=text] .bubble` | 普通文字气泡；我方用 `.message.own[data-type=text] .bubble` 区分 |
| `voice` | `.voice`、`.voice-bar`、`.voice-wave i`、`.voice-hint`、`.voice-transcript` | 语音条、时长和“转文字”；点击原生 details 展开转写，保留展开机制 |
| `transfer` | `.transfer-card`、`.transfer-main`、`.transfer-main strong`、`.transfer-note`、`.transfer-foot` | 转账卡片、金额与状态、备注、底部标识；配色须单独设置 |
| `image` | `.image-description`、`.message-image` | 没有图片链接时展示文字描述占位；有链接时展示图片 |
| `sticker` | `.sticker-built-in`、`.sticker-image`、`.sticker-fallback` | 内置表情、图片表情或文字占位；保留图像比例与透明区域 |
| `location` | `.location-card`、`.location-caption`、`.location-caption strong`、`.location-caption small`、`.virtual-map` | 虚拟地点、地址、虚拟地图与定位标志；不请求真实地图 |
| `share` | `.share-card`、`.share-card strong`、`.share-description`、`.share-thumbnail`、`.share-source` | 原帖标题、简述、缩略图或占位、来源 |
| `call`、`video` | `.call-record`；也可通过 `.message[data-type=call]`、`.message[data-type=video]` 区分 | 发起语音／视频通话的记录，只展示提示 |

语音的 `.voice-closed` 和 `.voice-open` 已由 `.voice[open]` 控制显隐，不要改成始终隐藏或始终显示；保留可点击的 `.voice-bar`，不要用伪元素遮挡它。

转账、图片、表情、定位和分享类型的 `.bubble` 已设为透明背景、零内边距，以便容纳卡片。要给文字或语音气泡设置背景、内边距、圆角，请使用相应的 `data-type` 选择器；卡片本身通过各自类名修改。可以统一调整 `.phone .bubble` 的字体，但不要把所有消息重新画成同一种文字框。

基础配色可引用 `var(--reader-bg)`、`var(--reader-ink)`、`var(--bubble)`、`var(--own-bubble)`；继承字体可引用 `var(--reader-font)`。地图和内置表情为 SVG 图形，避免统一覆盖所有 SVG 的尺寸或填色。

## 必须保留的布局

- 手机外壳之外保持透明，透出插件日／夜背景。不要给 `.phone-chapter`、其伪元素或外侧容器加满幅背景；屏幕底色在 tokens 中设置，机身颜色可设置在 `.phone`。
- 保留机身自适应宽度 `width: min(320px, 100%)` 及现有高度规则，不要用固定大宽度、最小宽度、横向放大或固定定位把手机挤出页面。
- `.phone-screen` 保持纵向 flex、`height: 100%`、`min-height: 0`、`overflow: hidden`；标题与底栏留在原位。
- `.messages` 保持 `flex: 1`、`min-height: 0`、`overflow-y: auto`，使消息在手机内部滚动。不要把滚动移到整台手机或外层页面。
- 保留消息左右方向和头像列。`.message-content` 的 `max-width` 为 `calc(100% - 2 * (var(--avatar-size) + var(--message-gap)))`，`min-width` 为 `0`。不要覆盖这一限制。
- 气泡及卡片保持 `max-width: 100%`；消息不可伸入对侧头像所在列。长文字自动换行，图片等比缩放，长卡片不能撑宽手机。
- 时间放在气泡下方，不增加姓名行。保留标题栏对长角色名的省略处理。

以上布局已由插件提供，通常只需不覆盖它们，无须把全部规则抄进 CSS。用配色、字体、圆角、边线、留白和适度阴影表达风格即可。

## 外部字体与图片

0.8.0 支持外部资源 URL。外部字体在 CSS 最外层用 `@font-face` 声明，字体名与 `tokens.fontFamily` 保持一致；手机消息和标题栏需要时显式应用该字体。例如：

```css
@font-face {
  font-family: 'PhoneFont';
  src: url('https://你的字体站/字体文件.woff2');
  font-display: swap;
}
.phone .bubble, .phone .phone-header {
  font-family: 'PhoneFont', 'PingFang SC', system-ui, sans-serif;
}
.phone .phone-screen {
  background-image: url('https://你的图床/聊天背景.jpg');
  background-size: cover;
}
```

以上地址只是位置示意，必须换成用户提供或已核实可用的字体／图片直链；没有资源时使用本地字体和渐变，不编造地址。将 CSS 合入最终 JSON 的 `css` 字符串并正确转义。外壳之外仍须透明，背景图只放在手机内部。

资源可使用完整 HTTP(S) 直链，推荐 HTTPS，也支持指定字体／图片 MIME 的 Base64 数据 URL（仍受 CSS 长度限制）。不支持本地文件路径或脚本地址。字体需允许跨域加载，并提供后备字体；HTTPS 酒馆页面上的 HTTP 资源可能被浏览器拦截。

`url(...)` 内只能写实际资源地址，不能写 Markdown 链接。正确示例：`url('https://example.com/font.woff2')`；错误示例：`url('[字体](https://example.com/font.woff2)')`。如果用户提供的是 `[名称](地址)`，先取括号内的地址，再放入 CSS；不要将整段链接语法写进 JSON。

`@font-face` 放在最外层，不嵌套在 `@scope`、`@media` 或选择器内；插件负责加载位置和章节间的字体隔离。`@import` 整份外部 CSS 暂不支持；请使用 `.woff2`、`.woff`、`.ttf`、`.otf` 等字体文件直链，不把字体站的 CSS 页面地址当成字体文件。

## 必须遵守的导入约束

- 顶层只输出示例中的 `id`、`name`、`mode`、`tokens`、`css`。不要发明 `html`、`script`、`assets`、`messages`、`avatars`、`stickerMap` 等字段。
- 每个 token 值最多 200 字符，不能包含分号、花括号、尖括号、反斜杠或 `expression(...)`。背景可写资源 URL，长链接优先放在 CSS 中。字体名的引号须按 JSON 规则转义，如示例；解析后字体值中不应含有反斜杠。
- CSS 不能含有任何 `<` 或 `>` 字符，包括注释中的字符。使用空格后代选择器，例如 `.phone .phone-header`，不要使用大于号子代选择器。
- 支持合规的 `url(...)`、顶层 `@font-face` 和外部图片；不使用 `@import`、`expression(...)`、`javascript:` 或 JavaScript，不要加入 style 标签。主题可以设置背景及替换头像，但不新增消息数据或表情包映射。
- 字体可使用已安装字体或按上节声明的外部字体，并指定后备字体。状态栏及部分组件有自己的字体，需要时用对应选择器显式调整。
- 可使用渐变、阴影、边框和 `@media (max-width: 300px)` 等常规 CSS；保持文字可读性，不制造横向滚动，不隐藏消息。
- JSON 字符串中的双引号、换行必须正确转义；不使用注释、尾随逗号或省略号。文件最大 1 MB。


## JSON 输出检查（请务必遵守）

- JSON 外层的键名和值仍用英文双引号。字体名、CSS 的 content 和 url 内部优先使用英文单引号，避免双引号嵌套出错。例如：

```json
{"fontFamily": "'Source Han Serif SC', '思源宋体', 'Songti SC', SimSun, serif"}
```

- 上面只是字体字段的局部示例，交付时仍使用前面的完整主题结构。CSS 例如写成 `content: ''; font-family: 'ThemeFont';`；若确实要在 JSON 字符串内使用双引号，必须正确转义。
- 不要在每行末尾加反斜杠，JSON 不使用反斜杠续行。对象可以自然换行；css 字符串优先输出在一行中，不能直接在引号内插入未经转义的换行。
- 不要把整个对象再包成一个 JSON 字符串，不要二次转义。不要输出全角引号、注释、尾随逗号、代码围栏或说明文字。
- 若具备代码执行能力，请先构建对象，再用 JSON.stringify 或 json.dumps 输出 UTF-8 文件，并重新解析最终文件验证。没有执行能力时逐项检查，不要声称已经运行校验。
- 检查实际交付文件，而非仅检查生成前的对象。文件应可直接由 JSON.parse 解析，再符合本框架的主题约束。

输出前自行检查：合法 JSON、`mode` 为 `phone`、字段和值符合约束、所有消息类型仍能正常显示、语音转写能展开、消息仍在机身内部滚动、外部背景透明。然后只返回最终 JSON。
