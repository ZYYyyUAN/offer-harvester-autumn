# 网申岗位链接读取修复

日期：2026-11-09（Asia/Shanghai）。基线：线上版本 40 / `bd036b2`。

## 原因与修改

用户提供的是企业网申岗位详情页，域名属于该企业使用的招聘系统，并不需要连接本应用的飞书同步功能。原链路只依赖千问网页抓取；抓取没有取得正文，却返回了“成功任务＋所有字段为空＋长警告”。这不能证明原岗位已下线或要求登录。

实际核查发现该站点前端使用公开 GET 接口 `/api/v1/job/posts/:positionId` 加载岗位，`/api/v1/tenant/info` 提供公司主体。无账号、Cookie 或令牌的请求可获得原岗位数据。

- `lib/job-source-contracts.ts`、`lib/job-source.ts`：已核实的 HTTPS `*.jobs.feishu.cn/:site/position/:id/detail` 使用公开接口解析。固定站点域名和路径，拒绝自定义端口、凭据、伪装后缀域名及私有主机；不跟随重定向，不绕过登录、验证码或 403。核对返回岗位 ID，不能替换成其他职位。
- 公司、岗位、地点和 JD 直接取自接口字段；不根据网页标题推断公司，薪资与截止日期未提供时为空。结果保留来源接口与获取时间。任务中心如实标记 `public-ats-parser`，不将这类读取伪装成模型调用。
- 其他网页继续用千问。按百炼 Responses 的 `text.format.json_schema` 结构发送约束，并在提示词提供 Schema。没有获得任何岗位正文/名称/公司时返回 `PAGE_CONTENT_UNAVAILABLE`，不再显示提取完成。
- `app/api/job-captures/route.ts`：修复截图上传字段 `screenshotFileId` 未映射到执行器 `fileId` 的问题。
- 收藏窗口显示可恢复的失败说明，保留已填写内容，可直接选择截图或聚焦粘贴 JD；新一次提取解除上一次任务绑定，避免保存时关联旧任务结果。

## 已执行的验证

- 35/35 单元测试；类型检查、Lint、生产构建通过。
- 桌面 1440px 与移动 390px，共 22/22 E2E 通过；含无法读取时保留手填信息并完成收藏、正常链接预览后确认、截图 ID 到达 OCR、所有权隔离，以及原 JD 归档主流程。
- 真实运行记录见 `job-capture-smoke.json`，仅使用公共招聘数据和合成截图，不读取个人简历、事实或面试资料。
  - 用户原网申链接：HTTP 201，公司“北京趣拿软件科技有限公司”，岗位“AI应用开发工程师（Java开发）”，北京，原文 JD 594 字，执行器 `public-ats-parser`。
  - 公开 Cloudflare 职位：千问真实网页提取通过。
  - 合成岗位截图：真实 OCR 与结构化提取通过。
- 测试运行在隔离本地 D1/R2，合成账号结束后清理。未自动收藏用户原岗位，仍需用户核对确认。

本修复并不承诺所有网申网站均可读取。未核实的站点仍使用网页抓取；访问受限、岗位下线或接口变化会明确提示采用截图或原文，不自动绕过限制。

协议依据：[百炼 Responses API](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-responses)、[网页抓取说明](https://help.aliyun.com/zh/model-studio/web-extractor)。
