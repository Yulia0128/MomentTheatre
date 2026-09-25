# 酒馆原生接口与兼容范围

核对基线：SillyTavern 官方仓库 **1.18.0 tag**，2026-09-20 再次读取版本源码核对。使用 `SillyTavern.getContext()`，没有引入 Tavern Helper API。

| 功能 | 原生接口 | 源码 |
| --- | --- | --- |
| 初始化与账号命名空间 | APP_READY、accountStorage | [st-context.js](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/scripts/st-context.js)、[events.js](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/scripts/events.js) |
| 角色资料 | characters、characterId、unshallowCharacter | [script.js](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/script.js) |
| Persona | powerUserSettings.personas、persona_descriptions、persona_description | [personas.js](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/scripts/personas.js) |
| 世界书 | getWorldInfoNames、loadWorldInfo | [world-info.js](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/scripts/world-info.js) |
| 预设 | getPresetManager('openai') | [preset-manager.js](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/scripts/preset-manager.js) |
| 生成与流式响应 | ChatCompletionService.sendRequest、presetToGeneratePayload | [custom-request.js](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/scripts/custom-request.js) |
| 自定义连接 | chat_completion_source: custom、custom_url、custom_include_headers | [chat-completions.js](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/src/endpoints/backends/chat-completions.js) |
| 安装与更新检查 | manifest、/api/extensions/version | [extensions.js](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/scripts/extensions.js)、[服务端 extensions.js](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/src/endpoints/extensions.js) |

## 请求隔离

0.2.0 条目选择接口核对记录：

| symbol | surface / applies_to | provenance | confidence / runtime_check |
| --- | --- | --- | --- |
| getPresetManager('openai').getAllPresets() | SillyTavern core / 1.18.0 | preset-manager.js:376，返回该类型全部预设名 string[] | high / 源码及模拟适配测试，真实酒馆待验收 |
| getCompletionPresetByName(name) | SillyTavern core / 1.18.0 | preset-manager.js:750；从 prompts 和 prompt_order 读取子提示词与启用顺序 | high / 同上 |
| getWorldInfoNames() | SillyTavern core / 1.18.0 | st-context.js:282；返回 world_names 的副本 | high / 同上 |
| loadWorldInfo(name) | SillyTavern core / 1.18.0 | world-info.js:2036；返回包含 entries 的书数据 | high / 同上 |

原生世界书列表在此接口中是扁平书名列表，没有另一个文件夹层。瞬息按「世界书 → 条目」两层展示全部书和可展开条目。预设范围为全部 Chat Completion 预设；Text Completion 指令模板不混入该列表。自定义勾选和文本放在瞬息设置中，仅应用到首次生成的资料快照。

插件自己构造 messages，直接使用原生请求服务，不调用正文的 Generate，不把消息写入 chat，也不切换酒馆全局连接、Persona 或预设。角色资料补全可能使用酒馆已有的角色缓存。

跟随模式读取 Chat Completion 配置，监听正文生成事件：正文忙时拒绝发起；本次请求期间正文启动则中止番外。独立模式始终指定 custom source、独立地址、模型和 Authorization 头，不借用主 custom key。请求经酒馆后端转发；后台／供应商限流仍可能影响并发。

独立模式只提供 OpenAI Chat Completions 兼容接口，不直接适配原生 Claude Messages 或 Gemini REST 地址。

## 资料快照与提示词

0.4.0 面具读取继续使用 `getContext().name1` 与 `powerUserSettings.persona_description`，依据官方 1.18.0 的 [st-context.js](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/scripts/st-context.js) 和 [personas.js](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/scripts/personas.js#L580)。适用 SillyTavern core 1.18.0，源码可信度 high；模拟测试已覆盖当前面具切换后的重读，真实运行仍待验收。只读取宿主值，编辑保存到瞬息设置；不写宿主 Persona。

0.6.0 删除输入 token 的设置与估算上限检查，旧备份中的 `maxInputTokens`／`maxInputChars` 不再生效。仍保留一百万字符的异常请求保护。模型实际上下文限制由供应商检查，返回的错误进入报错记录。

流式开关核对于 2026-09-21，依据官方 1.18.0 的 [custom-request.js](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/scripts/custom-request.js)：

| symbol | surface / applies_to | provenance | confidence / runtime_check |
| --- | --- | --- | --- |
| ChatCompletionService.sendRequest(data, extractData = true, signal = null) | SillyTavern core / 1.18.0 | 上述文件 ChatCompletionService.sendRequest；data.stream 为 true 时返回异步生成器工厂，false 时返回含 content 的完整对象；第二个参数是提取数据，不是流式开关 | high / 已核对官方版本源码；两种连接、两种传输的模拟请求及取消检查通过；真实 API 待验收 |
| presetToGeneratePayload(preset, overridePreset, overridePayload) | SillyTavern core / 1.18.0 | 同文件；通过 overridePayload.stream 和 max_tokens 覆盖本次请求参数 | high / 同上 |

`settings.stream` 默认 true，仅控制瞬息发出的请求，不修改酒馆主设置。独立连接直接设置 payload.stream，跟随连接通过 overridePayload 传递。非流式等待完整 content 返回后更新阅读内容，空回和取消仍走现有错误／停止流程；不暴露 reasoning。续写、补写、剧情总结及连接测试均沿用开关。最大回复token 映射到 max_tokens，剧情总结固定为 1200，连接测试为 32。

每篇首次生成保存角色、Persona、所选世界书、预设提示词及所选正文参考的快照。续写依据快照和参考章节构造 messages，不运行正文的变量脚本与世界书副作用。

每篇的累计总结存于该篇 `story.summaries`，内容为 `{ through: 总结截至的节数, content: 总结文本 }`。它和 chapters 一起保存到 IndexedDB `shunxi-library` 的 `accounts` 中，按当前酒馆账号的 scope 隔离。续写取最近一份有效总结，再附上 `chapters.slice(summary.through)`；10 节总结供第 11 节使用，第 12 节追加第 11 节原文。总结和原文均进入全量 JSON 备份。设置中的提醒删除不影响这一流程。

当前支持：

- 基础人物字段和 `{{char}}`、`{{user}}`、`{{description}}`、`{{personality}}`、`{{scenario}}`、`{{persona}}`、`{{mesExamples}}` 等基础替换。
- 世界书常驻、主关键词、四种次关键词组合、大小写／完整单词匹配、关键词正则。
- 世界书角色前／角色后／聊天深度位置和基础角色类型；按条目顺序排列。
- Chat Completion 预设的顺序提示词与人物、世界书、聊天历史标记；新生成／续写触发条件，以及相对番外前文的深度注入。
- 预设的 temperature、top_p、frequency_penalty、presence_penalty；输出上限由瞬息设置覆盖。

支持世界书概率与生成类型筛选；复杂递归、sticky/cooldown/delay、分组竞争、向量检索和单条扫描深度采用独立番外的常驻／关键词匹配，兼容差异记载于本文件，不再直接阻断生成。作者注释位置映射到番外前文深度，扩展插槽映射到角色后资料。未实现完整脚本运行、正文变量继承、酒馆 token 预算、示例对话转换和供应商工具调用配置，不应把复杂动态角色卡当作完整兼容。

**源码接口核对与模拟请求测试不等同于实机验收。** 官方接口后续版本、第三方分支、特殊供应商响应都需在真实环境验证。

## 1.0.0 安装与更新核对

2026-09-23 再次核对 SillyTavern 1.18.0 的 src/endpoints/extensions.js：POST /api/extensions/version 接收 extensionName、global，返回 isUpToDate、remoteUrl 等；当前适配器按账号／全局目录检查。原位更新使用酒馆扩展管理，服务端 /update 拉取当前 Git 分支。没有硬编码 GitHub 用户名。

来源：https://github.com/SillyTavern/SillyTavern/blob/1.18.0/src/endpoints/extensions.js 。置信度：源码高；实机 Git 安装与远程更新尚待仓库发布后验收。


## 1.0.2 原生接口核对（2026-09-23）

- `isGenerating()`：SillyTavern core 1.18.0 `public/script.js` 导出，返回发送中／群聊生成状态。通过扩展入口相对路径加载核心模块；`GENERATION_STARTED(type, options, dryRun)` 在试算也触发，现忽略第三参数为真的事件。源码置信度高；本地模拟宿主验证不替代用户云端实机验证。
- `#extensions_settings`：1.18.0 `public/index.html` 原生扩展设置容器；1.0.3 起改用原生 inline-drawer 结构与宿主箭头，不依赖酒馆助手。
- `POST /api/backends/chat-completions/status`：1.18.0 `src/endpoints/backends/chat-completions.js`，custom_url 指定独立连接；custom_include_headers 显式传递独立 Authorization，secret_id 不引用主密钥，返回 data 数组中的 id 为模型。失败时酒馆可能不透传服务商原始状态，界面不虚构状态码。
- 宏语法依据 1.18.0 `public/scripts/macros.js` 和 `variables.js`。独立 Map 仅实现当前支持的取值／赋值格式，不调用正文变量接口。不支持的宏或 EJS 按原文交给模型，不声称执行其动态逻辑。1.0.3 的深度和条件处理见下。
- 数据：IndexedDB 完整资料库 + localStorage 即时输入恢复记录，按原 scope 隔离，带 revision/writer/sequence 防止旧保存覆盖较新的输入。API 密钥另存浏览器账号命名空间，不进入状态备份。

## 1.0.3 提示词与原生抽屉核对（2026-09-24）

| symbol | surface / applies_to | provenance | confidence / runtime_check |
| --- | --- | --- | --- |
| inline-drawer / inline-drawer-toggle / inline-drawer-content、fa-circle-chevron-down | SillyTavern core 1.18.0 | [index.html](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/index.html)、[script.js](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/script.js) 的 delegated click handler | high / 使用宿主原生展开事件与样式；本地浏览器模拟检查，用户实际主题待验收 |
| injection_position、injection_depth、injection_order、injection_trigger | SillyTavern core 1.18.0 | [PromptManager.js](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/scripts/PromptManager.js) 的 INJECTION_POSITION、shouldTrigger；[openai.js](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/scripts/openai.js) 的 populateInjections | high / 位置 0 顺序、1 深度；normal 新生成、continue 续写；无触发条件始终启用。单元测试与模拟请求覆盖 |
| world_info_position、triggers、useProbability | SillyTavern core 1.18.0 | [world-info.js](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/scripts/world-info.js) | high / 0/1 角色前后、4 深度、5/6 示例前后；2/3/7 按上述映射处理，复杂激活规则不冒充完整宿主执行 |

深度按独立番外参考消息倒数计算，过深时放在参考开头；同位置按 order 从高到低排列，保留消息角色。不会插入或修改正文聊天。最后仍追加本次番外格式与续写要求。未知的空标记略过，不阻断请求。以上通过本地模拟宿主验证，尚未连接用户云端真实 API。

## 1.0.4 生成与阅读行为

首轮要求正文输出独立标题标记、小手机顶层 title、HTML 的 title；缺少标题时使用小请求根据作品拟题，不截取用户指令。标题不计入字数。补写按当前章节实际字数／条数推进，成功达到目标才标记完整；空回与可识别的传输故障最多连续重试两次，HTTP 429 等真实接口错误保留并暂停。无进展或单次 50 次请求保护时暂停，支持刷新后继续补足同一节。

未点击保存的作品依然写入本地草稿与备份，但不进入分类或按分类导出。生成和美化页面切换后保留已连接的阅读 iframe；公共图片／字体按需无凭据读取并缓存在独立 IndexedDB，不进入作品备份。缓存最多约 64 MB，有效期 7 天。跨域失败等情况仍使用原资源地址，不绕过资源服务器的访问控制。

## 1.0.5 正则过滤核实（历史记录，接入见 1.0.8）

原生前端扩展可以用 JavaScript 正则处理自己收到的文本，不需要 Tavern Helper。官方 Regex 文档也说明了匹配替换、AI Response／Reasoning 范围和仅显示／出站提示词等选项：https://docs.sillytavern.app/extensions/regex/ 。

瞬息通过自己的生成与隔离阅读流程运行，因此不能假定酒馆聊天显示正则会自动处理瞬息的 API 回复或 iframe。若后续启用 think 过滤，应在瞬息自己的响应处理层接入；明确仅隐藏显示还是也从保存、统计、续写上下文中排除，并处理流式未闭合标签。本轮只验证可行性，不调用或修改宿主正则，不新增过滤开关。此结论不等于已在用户 1.18.0 云端实测宿主 regex 内部函数。

## 1.0.6 小手机独立匹配框架

使用本扩展内置 JavaScript 标签匹配与消息解析，不导入或修改酒馆正则设置，也不需要酒馆助手。优先提取 <小手机>...</小手机>；外部 think/cot 即使未闭合也不占用手机框架。缺失手机闭合标签时读取至后续 think/cot 开始或回复结尾。旧无标签格式仍兼容，完整 think/cot 和末尾未闭合思考块排除。只影响小手机读取，正文／HTML 不开启通用思维链过滤。

清理后的有效消息用于渲染、计数、续写和总结；sourceContent 保留原始回复。失败草稿可能保留原始片段，继续补足时重新解析消息；不执行模型提供的 HTML/JS。匹配结果通过转义的固定组件渲染。

## 1.0.7 预设正则只读核实（历史记录，接入见下节）

目标版本为用户提供的 SillyTavern 1.18.0，使用原生扩展上下文，无 Tavern Helper 依赖。

| symbol | surface / applies_to | provenance | confidence / runtime_check |
| --- | --- | --- | --- |
| getScriptsByType(SCRIPT_TYPES.PRESET, { allowedOnly: true }) | core Regex extension 1.18.0 | [regex/engine.js](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/scripts/extensions/regex/engine.js) | high：读取当前预设的 regex_scripts，并可检查该预设启用授权；本轮只读源码，未调用用户运行环境 |
| getPresetManager('openai').readPresetExtensionField({ name, path: 'regex_scripts' }) | core preset manager 1.18.0 | [preset-manager.js](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/scripts/preset-manager.js) | high：可按指定名称读取预设附带正则，不必切换当前预设；当前预设读取设置对象，其他预设读取保存的扩展字段。用户云端能力探测仍待实施 |
| getRegexedString(rawString, placement, { isMarkdown, isPrompt, isEdit, depth }) | core Regex extension 1.18.0 | [regex/engine.js](https://github.com/SillyTavern/SillyTavern/blob/1.18.0/public/scripts/extensions/regex/engine.js) | high：会读取当前宿主全局、当前预设及角色规则，并按 placement、markdownOnly、promptOnly、disabled、深度等条件处理；不能直接当作“瞬息选定预设的过滤器” |

结论：能读取预设内实际附带的正则，包括用户额外配置的草稿／作家对话匹配规则，但预设文本只有“输出草稿”等要求时，无法凭空推导对应过滤规则。读取、允许使用、实际匹配成功是三件不同的事。后续若接入，应只在瞬息的阅读副本上运行选定范围内的规则，尊重禁用与适用范围；不能清理覆盖保存文本，不写回宿主规则，也不能假定酒馆当前预设与瞬息选定预设相同。本轮未增加任何宿主正则调用或修改。

现有过滤范围：小手机优先读取 `<小手机>` 块，外部内容不参与消息显示；无该块时兼容旧消息格式并排除 think／cot。区块内仍只识别约定的消息类型，语音转文字会去掉括号／星号动作标记。未实现任意命名的草稿／作家对话规则，正文／HTML 也没有通用思考过滤。

编辑界面只显示一个完整文本框。生成回复原文可编辑；旧无标签的分轮回复增加小手机边界以便与后续标签格式合并。保存编辑不重新序列化或删掉其他文本，原文进入持久化与备份，消息解析用于阅读、计数及现有的手机续写／总结引用。导入阅读主题只改变 CSS，不改变这条保存规则。

## 1.0.8 所选预设正则与正文阅读副本

用户已明确要求接入。通过 `getPresetManager('openai').readPresetExtensionField({name, path: 'regex_scripts'})` 读取瞬息所选预设；选“使用当前已保存预设”才采用宿主当前名称，选“不采用预设”返回空列表。不混入全局或角色正则，不调用会汇总这些规则的 `getRegexedString`，不切换预设、不写回宿主。接口缺失时仅兼容读取该预设的 `extensions.regex_scripts` 字段。

多选列表按预设保存选择与本地编辑。首次默认选择源数据中启用、适用于 AI 回复且非仅提示词的规则；用户可主动勾选其他条目，只作为瞬息正文显示规则使用。源 placement、markdownOnly、promptOnly、runOnEdit、深度等在详情里保留为来源信息，不复刻宿主聊天楼层、提示词处理及全局启用授权逻辑。选择规则不会改变发给模型的消息。

正文阅读先移除大小写不敏感的 think／thinking／cot 标签块和多行 HTML 注释，再顺序匹配所选正则。未闭合的默认思考／注释块隐藏至结尾。支持裸表达式和 /pattern/flags、编号与命名捕获、$0、$&、{{match}}、trimStrings；宏只支持 char、user、newline、noop，并处理 substituteRegex 的替换／转义模式。不执行 EJS、变量脚本或其他未知宏；不声称完整兼容复杂预设生态。无效规则只记录并显示错误，其他规则与原文保留。

正则替换产生的 HTML 用 sanitize-html 白名单清理，CSS 经 css-tree 检查并限定到各自 `.preset-markup[data-regex-block]`；支持常见文首卡片、图片、字体和布局，不执行 JavaScript、事件处理器、iframe、表单或外部 CSS 导入。模型未经过规则转换的 HTML 仍转义成文字。阅读 iframe 和独立正文导出均使用相同的无脚本内容安全策略。第三方依赖已内置，不需酒馆服务器安装 npm 包；本地重建依赖需 Node 22.12 及以上。

正文 sourceContent 保留完整生成回复（含标题标签、草稿与思考），正文编辑保存后 content 直接保存完整输入，显示由规则派生，过滤不改持久化或备份。现有生成字数／续写／总结逻辑未改为“过滤后内容”。章节保存 readingRegex 快照，后续改规则不重写旧作品；升级前已丢失的原文无法补回。

小手机不应用正文预设正则；存在 <小手机> 区块时只解析区块内消息，外部任意 XML 不显示。旧无包裹行／JSON 兼容，但外围 XML 区块不当成消息；消息字段里的字面标签保留为转义文字。HTML 模式维持原隔离运行方式，不加入正文默认过滤。

验证：单元测试覆盖原生读取接口参数、规则选择／修改、HTML 清理、捕获替换、默认过滤、原文／快照／备份及模式隔离；本地浏览器模拟宿主覆盖原生入口和生成。未连接用户云端真实预设或供应商，不能将模拟验证当作云端 API 验收。
