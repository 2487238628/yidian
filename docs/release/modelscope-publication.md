# 12730 · ModelScope 创空间发布单

## 创建信息

- 英文名称：`12730-document-revisit-pet`
- 中文名称：`12730 · 文档回访伙伴`
- 简介：`一只会在 1、2、7、30 天把重要文档带回来的网页宠物。Mark 一下，先完成 25%。`
- SDK：`Static`
- 入口文件：`index.html`
- 可见性：`公开`
- 资源：优先选择免费基础资源，不选择付费升级资源
- 许可证：由项目所有者在发布前明确选择，仓库当前未擅自添加许可证

## 可直接发布的内容

GitHub 发布分支：`codex/12730-modelscope`

该分支根目录严格包含：

- `README.md`：ModelScope Studio Card，声明 `sdk: static` 与 `entry_file: index.html`
- `index.html`、`styles.css`、`app.js`：无外部依赖的互动演示
- `icon.png`
- `12730-extension-unpacked.zip`：Edge 扩展下载包，ZIP 根目录直接包含 `manifest.json`

## 发布方式

1. 在 ModelScope 创空间页面创建 Static 空间。
2. 取得创空间 Git 地址。
3. 将 `codex/12730-modelscope` 分支推送为创空间仓库的默认分支。
4. 在创空间页面点击发布/上线。

ModelScope 官方说明：<https://www.modelscope.cn/docs/studios/create>

## 上线后验收

1. 首屏标题、宠物和下载按钮可见。
2. 宠物可以真实拖动，松手后停在落点。
3. 连续点击体验按钮，进度为 0%、25%、50%、75%、100%。
4. 390px 手机宽度无横向滚动。
5. 下载链接返回 ZIP；解压后根目录存在 `manifest.json`，版本为 0.4.0。
6. README 能被平台正确解析，页面没有构建错误。
7. 公开网址在未登录状态下可访问。
