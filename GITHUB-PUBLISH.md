# 首次发布到 GitHub

建议仓库名称：`momenttheatre`；显示名称：瞬息 · 番外小剧场（Moment Theatre）。只需创建一次，后续版本继续提交到同一个仓库与同一默认分支。

1. GitHub → New repository，Repository name 填 `momenttheatre`，Visibility 选 **Public**，默认分支使用 `main`。
2. 创建空仓库即可；本发布包已有 README，不需要 GitHub 另生成。
3. 解压 `momenttheatre-1.0.3.zip`，或者打开同名发布目录；上传**里面的文件和文件夹**，不要上传 ZIP，也不要上传外面的 momenttheatre-1.0.3 文件夹。
4. 首页应直接显示 `manifest.json`、`index.js`、`style.css`、`src/`、`themes/`、README 等文件。
5. 完成提交后，把该仓库真实的 HTTPS 地址发给用户。格式为 `https://github.com/你的用户名/momenttheatre`，把占位用户名替换为真实账号。
6. 用户在酒馆的「扩展 → 安装扩展」粘贴这个仓库地址，安装后刷新。

无需开启 GitHub Pages；酒馆安装的是 Git 仓库，不是托管网页。可以额外创建 `v1.0.3` Release 展示更新说明，安装和更新依然来自默认分支中的扩展文件。

后续版本更新同一仓库的文件，保持入口和目录结构，提升 manifest 版本号并更新 CHANGELOG。用户在酒馆扩展管理中更新并刷新，不必卸载。

本次只准备本地更新文件，尚未上传。已有仓库为 https://github.com/Yulia0128/MomentTheatre，请在原仓库更新；「检查更新」从酒馆当前 Git 安装目录读取真实远程仓库，无需预填账号。

HTML 预览单独交付，不必上传到扩展仓库；项目工作区的 node_modules、.artifacts、设计过程文件、旧版 ZIP 与个人数据都不应混入发布目录。

依据：[酒馆扩展安装说明](https://docs.sillytavern.app/extensions/)、[GitHub 创建仓库](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)。
