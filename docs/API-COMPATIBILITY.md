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
