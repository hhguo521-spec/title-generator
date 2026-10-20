# 标题生成器

面向中小电商商家的商品卖点与标题生成工具。静态页面由 GitHub Pages 托管，DeepSeek API Key 只在独立后端的 Secret 环境变量中保存。

## 使用

打开 GitHub Pages 网站，填写商品名称、类目、目标顾客和已确认的商品资料，再点击「DeepSeek AI 生成」。商品图片仅在浏览器本地用于主图排版，不会上传给 AI。

## 后端配置

后端需要设置 `DEEPSEEK_API_KEY` Secret、`DEEPSEEK_MODEL`、`DEEPSEEK_BASE_URL` 和 `ALLOWED_ORIGIN`。未设置密钥时，网站会提示生成服务尚未配置。不要把密钥写入仓库、网页代码、Issues 或提交记录。

## 本地预览

运行 `python3 local_server.py` 后访问 `http://127.0.0.1:4173/`。本地 API 配置文件位于 `.local/deepseek.json`，已由 `.gitignore` 忽略。
