# 瞬息 · 正文美化制作提示词

请为「瞬息 · 番外小剧场」制作一份可以直接导入的正文阅读主题 JSON，适用于插件 1.0.0（主题格式兼容 0.8.0 起的版本）。请依照下面的真实格式和组件制作。

我的风格要求：【在这里填写想要的风格；可描述配色、字体、纸张质感、留白、缩进等。未指定的细节请自行搭配。】

## 交付内容

只输出一个完整、合法的 JSON 对象，不输出 Markdown 代码围栏、解释、HTML 页面或番外正文。能生成文件时，请提供 UTF-8 编码的 `.json` 文件。

主题只作用于正文阅读区域；插件导航、按钮、设置页及整体日／夜模式不属于这个主题。

## JSON 格式

请修改这份可导入的基础框架来实现我的风格，最终文件不要保留占位要求：

```json
{
  "id": "custom-prose-starter",
  "name": "正文框架 · 素纸",
  "mode": "prose",
  "tokens": {
    "background": "#F6F2EA",
    "color": "#302E29",
    "fontFamily": "'Songti SC', SimSun, Georgia, serif",
    "fontSize": "14px",
    "lineHeight": "2"
  },
  "css": ".prose-chapter { padding: clamp(18px, 4vw, 36px); } .prose-title { margin: 0 0 1.2em; padding: 0; font-family: inherit; font-size: 26px; line-height: 1.5; font-weight: 600; color: var(--reader-ink); text-align: center; text-indent: 0; overflow-wrap: anywhere; } .paragraph { text-indent: 2em; margin: 0 0 1.2em; } .paragraph q { color: #8A563D; } .paragraph strong { color: #302E29; font-weight: 700; } .paragraph em { color: #6C7275; font-style: italic; } .paragraph del { color: #8B857C; text-decoration: line-through; }"
}
```

| 字段 | 要求 |
| --- | --- |
| `id` | 为新作品起独立 ID，格式为 `custom-prose-英文风格名`；`custom-` 后只用小写英文字母、数字、短横线，长度 1–80 字符。同款修改可以沿用 ID，新款使用新 ID。 |
| `name` | 风格名称，非空，最多 60 字符。 |
| `mode` | 必须固定为 `prose`，插件据此自动放入正文分类。 |
| `tokens` | 必须是对象；本正文框架使用表中示例的 5 个字段，所有值均为字符串。 |
| `css` | 一个 CSS 字符串，用于补充排版、边线、渐变等；最多 30,000 字符。无需额外包裹标签或作用域。 |

`background` 是纸面容器的底色，不是整块阅读窗口的底色；纸面之外始终透明，直接透出瞬息日夜背景。`color` 是文字色，`fontFamily` 是字体名称及后备字体（可使用下面声明的外部字体），`fontSize` 是字号，`lineHeight` 是行高。字号和行高也必须写成字符串，例如 `"14px"`、`"2"`。

## 已有结构与可用选择器

阅读区只显示番外标题和正文，不自动显示“第 1 节／第 2 节”。正文采用一体纸面：`.prose-chapter` 容器内先放 `h1.prose-title` 番外标题，再放若干 `p.paragraph` 自然段；标题与正文共用容器的背景、边框、圆角、内边距及字体。不要把标题另做成纸面外的卡片。正文按空行分段，支持下表的行内格式，原始 HTML 仍显示为文字。不要用伪元素或 CSS 计数器补回章节编号。

单节阅读及美化预览均显示标题；整篇多节导出仅在首个正文节内显示一次番外标题，后续节保留各自保存的主题，不重复标题。标题为动态作品名称，不要写死标题或伪造标题内容。

| 选择器 | 可以调整的内容 |
| --- | --- |
| `.prose-chapter` | 包含标题和正文的完整纸面：内边距、背景渐变、边框、圆角等 |
| `.prose-title` 或 `.prose-chapter h1` | 纸面内部的番外标题，可调整字体、字号、字重、颜色、对齐、间距和装饰 |
| `.paragraph` | 自然段的段距、缩进、字间距、文字对齐 |
| `.paragraph:first-of-type` | 首段的特殊排版，如取消首段缩进 |
| `.paragraph::first-letter` | 可选的首字装饰；不要妨碍阅读 |
| `.paragraph q` 或 `.paragraph .prose-quote` | 成对引号内的发言，包括引号本身；识别中文弯引号、英文双引号和直角引号 |
| `.paragraph strong` | `**加粗**`，可单独设置颜色与字重 |
| `.paragraph em` | `*斜体*`，可单独设置颜色与斜体 |
| `.paragraph del` | `~~删除线~~`，保留划线，可单独设置颜色 |
| `.paragraph code` | 反引号内的字面文本，不处理其中的强调符号或引号 |

请分别设计普通正文、引号发言、加粗、斜体和删除线，让它们在同一风格下可区分。格式可以嵌套，例如 `“请**等我**。”`、`***加粗斜体***`。引号已经包含在正文文本中，不要使用 `q::before`、`q::after` 再加一层引号。不要去掉加粗的字重、斜体或删除线本身，也不要伪造发言文字。

插件已经把 CSS 限定在当前章节内部，标题也在此作用域内。请直接使用以上选择器，不要自己包裹 `@scope`；不要使用 `body`、`html`、`:root` 或 `main` 来设置纸面样式。统一背景、边框和留白放在 `.prose-chapter`，标题默认继承正文容器字体，也可通过 `.prose-title` 单独设计。避免给标题和段落各套一层背景或边框，保持一片式阅读效果。

## 纸面外侧必须透明

主题只画一张完整的纸面或票根，不在它后面铺额外的白色／灰色矩形背景，也不加包住整张纸面的第二层外框。容器圆角、缺口或异形边缘之外应透出瞬息背景，不能用固定白色圆块假装挖空。

普通纸张可直接用 `tokens.background`；需要透明缺口、镂空或不规则边缘时，将其设为 `transparent`，再在 `.prose-chapter` 用渐变或 CSS mask 绘制实际纸形与纸色。标题和正文仍放在同一张纸面内，裁切不能遮挡文字；手机窄屏也要可读。外侧透明由插件提供，不要尝试给外层页面设置底色。

基础配色、字体、字号、行高请优先填写在 `tokens`。CSS 可用 `var(--reader-bg)`、`var(--reader-ink)`、`var(--reader-font)`、`var(--reader-size)`、`var(--reader-leading)` 引用这些值。不要通过重设这些变量替代填写 tokens。

## 外部字体与背景图片

### 贴图不要随正文拉伸

正文高度由内容决定，贴图的比例由 CSS 决定。不要给装饰图使用 `background-size: 100% 100%` 或同时指定不匹配原图比例的宽和高。

- 顶部／底部横幅分两层绘制，均使用 `background-size: 100% auto`、`no-repeat`，分别锚定顶部／底部；中间只增加纸面或底色。也可以用具有原图 `aspect-ratio` 的伪元素装饰。
- 纵向单张装饰采用固定或响应式宽度，高度按原比例自动计算；例如一张 1:4 的图片，装饰容器可设 `width: 72px; aspect-ratio: 1 / 4; background-size: contain; background-repeat: no-repeat`，贴在侧边，不给它设置整篇文章的高度。
- 能无缝拼接的纵向纹理，可设 `background-size: 72px auto; background-repeat: repeat-y; background-position: left top`，页面越长只是重复次数增加。复杂人物、花枝和星球图不能随意当无缝纹理重复。
- `cover` 保持比例但会裁切，`contain` 保留完整图但可能留白。任意长文章不可能同时做到一张图完整铺满、不裁切、不重复又不变形；按设计选择留白、分段装饰或可重复纹理。

侧边图需在正文内边距中留足空间，窄屏缩小或隐藏装饰。长文和短文都要检查；不能只用短篇测试图像比例。

0.8.0 支持外部资源 URL。外部字体用顶层 `@font-face` 声明，`src` 填字体文件直链（如 `.woff2`、`.woff`、`.ttf`、`.otf`），再在 `tokens.fontFamily` 中填写同一个字体名和后备字体。例如将下面 CSS 合入最终 `css` 字符串，并把 `tokens.fontFamily` 设为 `'ThemeFont', 'Songti SC', serif`：

```css
@font-face {
  font-family: 'ThemeFont';
  src: url('https://你的图床或字体站/字体文件.woff2');
  font-display: swap;
}
.prose-chapter {
  background-image: url('https://你的图床/宣纸.jpg');
  background-size: cover;
}
```

上面的地址只是位置示意，必须换成用户提供或已核实可用的链接；没有资源链接时使用本地字体和渐变，不编造地址。最终交付仍是 JSON，不是 CSS 文件；引号与换行按 JSON 规则转义。字体链接放在 `css` 的 `src` 中，不能把链接当作 `fontFamily`。

资源使用完整 HTTP(S) 直链，推荐 HTTPS；也支持指定字体／图片 MIME 的 Base64 数据 URL（仍受 CSS 长度限制）。不接受本地文件路径或脚本地址。字体服务器需要允许跨域访问；外链失效或断网时使用后备字体和底色。HTTPS 酒馆页面上的 HTTP 资源可能被浏览器拦截。

`url(...)` 内只能写实际资源地址，不能写 Markdown 链接。正确示例：`url('https://example.com/font.woff2')`；错误示例：`url('[字体](https://example.com/font.woff2)')`。如果用户提供的是 `[名称](地址)`，先取括号内的地址，再放入 CSS；不要将整段链接语法写进 JSON。

把 `@font-face` 放在 CSS 最外层，不要自己放进 `@scope` 或 `@media`。插件负责把字体声明放到可加载的位置，并隔离不同章节的同名字体。`@import` 导入整份外部 CSS 暂不支持，字体站的 CSS 页面地址应换成其中的字体文件直链。

## 必须遵守的导入约束

- 顶层只输出示例中的 `id`、`name`、`mode`、`tokens`、`css`。不要发明 `html`、`script`、`assets`、`layout` 等字段，也不要加入正文内容。
- 每个 token 值最多 200 字符，不能包含分号、花括号、尖括号、反斜杠或 `expression(...)`。背景可写资源 URL，较长链接优先放在 CSS 中。字体名的引号须按 JSON 规则转义，如示例；解析后字体值中不应含有反斜杠。
- CSS 不能含有任何 `<` 或 `>` 字符，包括注释中的字符；子代选择器请改用空格后代选择器。可以写 `.prose-chapter .paragraph`，不要写使用大于号的选择器。
- 可以使用合规的 `url(...)`、顶层 `@font-face`、背景图、渐变、阴影和边线。不使用 `@import`、`expression(...)`、`javascript:` 或 JavaScript，不要加入 style 标签。
- 字体必须给出后备字体。现代可用 PingFang SC、Microsoft YaHei、system-ui；古风可用京华老宋体、Songti SC、SimSun、serif。仅写入字体名不会自动安装该字体；外部字体按上节方式声明。
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

## 排版要求

请兼顾电脑和手机的长文阅读。容器宽度自适应，不设大幅固定宽度或最小宽度，不制造横向滚动；保持清晰的文字对比度。需要响应式时可使用 `@media (max-width: 400px)`，不要使用带尖括号的媒体查询语法。

不要隐藏正文，不要使用固定定位遮挡文字，不要假设存在封面、插图、章节编号、Markdown 标题、引言或其他尚未提供的 HTML 节点。仅对已有结构进行美化。

输出前自行检查：合法 JSON、`mode` 为 `prose`、字段和值符合约束、CSS 选择器能匹配以上结构、没有被禁止的内容。然后只返回最终 JSON。

## 正文主题的固定要求

- 正文采用固定 14px，标题固定 26px，不得随 PC 窗口拉宽而放大。普通正文 font-weight: 400，加粗 strong 为 700，必须能明显区分；不要给普通段落套加粗。
- 标题使用实际 .prose-title，不从正文首段猜测标题。标题与顶部贴图分开，标题位于贴图下方。不得添加“阅读预览”等固定副标题或章节编号。
- 所有正文主题预览统一使用 以下示例：标题“这是标题。”；正文依次为“这是引号文字。”、加粗的“这是加粗文字。”、斜体的“这是斜体文字。”、删除线的“这是删除文字。”、普通无格式的“这是一大段正文正文正文正文正文正文”。不要添加格式名称标签、主题名标题或额外故事。
- 修改既有主题保留原有装饰；邮票素笺的灰色虚线固定在实际标题下方，不能依赖第一段加粗文本。
