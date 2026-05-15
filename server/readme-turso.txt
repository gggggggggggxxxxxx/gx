Turso（libSQL）对接说明
====================

1. 安装 Node.js 后在本目录执行：npm install

2. 复制 .env.example 为 .env，填写：
   - TURSO_DATABASE_URL（控制台里的 libsql://...）
   - TURSO_AUTH_TOKEN（数据库 token）
   - ADMIN_TOKEN 须与前端 js/storage.js 里的 ADMIN_PASSWORD 一致（默认 xrx101）

3. 可选：在 .env 中设置 WRITE_TOKEN，则保存考核记录时须携带相同口令：
   - 学员在步骤 3「考场保存口令」输入框填写后，再点「生成智能评分」（推荐），或
   - 浏览器控制台设置 window.__PPAIS_WRITE_TOKEN__
   未设置 WRITE_TOKEN 时，任意人均可 POST 写入（公网强烈不建议）。

4. 启动：npm start
   浏览器打开 http://127.0.0.1:3847/ （本站与 API 同端口，前端会自动走数据库）

5. 若仍用「启动本地服务.bat」的 Python 8765 端口打开页面，请在 index.html 的 <head> 里
   其它脚本之前增加一行，把 API 指到 Node：
   <script>window.__PPAIS_API__="http://127.0.0.1:3847";</script>
   并同时运行本 server（3847）。

安全：切勿把 Turso token 写进前端 JS 或提交到 git；聊天里发过的 token 应在 Turso 控制台轮换。

6. 启动成功后的验证（建议按顺序做一遍）
   - 终端出现「PPAIS + Turso: http://127.0.0.1:3847/」且不要关窗口（关了就停服）。
   - 浏览器只打开 http://127.0.0.1:3847/（不要用 8765 的 Python 服务，除非已按上文配置 __PPAIS_API__）。
   - 页眉下应出现一行蓝字提示：当前为服务端模式…（表示前端会走 /api/records）。
   - 完整走一遍考核流程，点「生成智能评分」后应自动入库；再打开「管理员入口」，密码与 ADMIN_TOKEN 一致，应能看到记录。
   - 若设置了 WRITE_TOKEN：学员须在步骤 3 填口令后再点「生成智能评分」，否则存档会失败。

7. 日常关闭
   - 在运行 npm start 的终端按 Ctrl+C 停止服务。

8. 表 assessment_records（Turso SQL 里可查）
   - id, payload（完整 JSON）, created_at
   - teacher_name, teacher_city, score_total：与 payload 同步写入，便于直接 SELECT / 排序筛选，无需解析 JSON。
   - 服务启动时会自动检测并追加缺失列（已有库升级无需手工迁移）。
   - 若这三列曾为 NULL（加列前的旧数据），启动时会用 SQL json_extract(payload, ...) 从 payload 自动回填一行。
