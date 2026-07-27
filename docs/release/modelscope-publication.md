# 一点 · ModelScope 创空间发布单

## 创建信息

- 英文名称：`yidian`
- 中文名称：`一点`
- 简介：`把工作和学习中 Mark 的重要内容，按 1、2、7、30 天重新带到面前。`
- SDK：`Static`
- 入口文件：`index.html`
- 可见性：`公开`
- 资源：优先选择免费基础资源，不选择付费升级资源
- 许可证：`MIT License`
- 公开地址：<https://www.modelscope.cn/studios/endTree26/yidian>

## 可直接发布的内容

GitHub 发布分支：`codex/12730-modelscope`

该分支根目录严格包含：

- `README.md`：ModelScope Studio Card，声明 `sdk: static` 与 `entry_file: index.html`
- `index.html`、`styles.css`、`app.js`：无外部依赖的互动演示
- `icon.png`
- `12730-extension-unpacked.zip`：Edge 扩展下载包，ZIP 根目录直接包含 `manifest.json`

## 发布方式

1. 将 `studio/` 同步到现有创空间仓库。
2. 推送到创空间默认分支 `master`。
3. 等待 Static 页面自动更新后进行公开验收。

ModelScope 官方说明：<https://www.modelscope.cn/docs/studios/create>

## 上线后验收

1. 首屏标题、宠物和下载按钮可见。
2. 宠物可以真实拖动，松手后停在落点。
3. 连续点击体验按钮，进度为 0%、25%、50%、75%、100%。
4. 390px 手机宽度无横向滚动。
5. 下载链接返回 ZIP；解压后根目录存在 `manifest.json`，版本为 1.0.0。
6. README 能被平台正确解析，页面没有构建错误。
7. 公开网址在未登录状态下可访问。
