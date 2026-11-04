# 考研每日一题 · DSH 插件

给 [DeepSeek Harness](https://github.com/deepseek-ai) 用的每日一题插件：左侧栏一个入口，每个启用科目每天一道题，答案先经过**独立视角校验**才发布，配倒计时、错题本、收藏和按题隔离的追问侧栏。

面向中国大陆硕士研究生招生考试（考研）。内置科目只有这几个：思想政治理论（单项选择、多项选择）、数学一 / 数学二 / 数学三（单项选择、填空、解答）、英语一 / 英语二（英语知识运用（完形填空）、阅读理解、翻译）。其他科目可以自己添加为自定义科目。

## 功能

**每日出题**
- 每个启用科目每天一道固定题目，同一天反复进入、刷新、切换科目都返回同一道；跨自然日自动换题。
- 两道题目来源：**在线出题**（宿主默认模型生成）与**题库出题**（导入 Markdown / 文本型 PDF），可按科目选择，也可设为“自动（优先题库）”。
- 出题与校验是两个独立步骤：先出题，再由另一个视角**先自己解题再看答案**，检查题干条件、可解性、答案唯一性、解析严谨性和判分规则。校验不通过会带反馈重出一次，仍不通过就**不发布**并如实报错。

**答题**
- 选择题：选 → 提交 → 判定 → 公布标准答案与完整解析。
- 主观题：只提供「作答完毕」与「未能作答」；「作答完毕」不会自动算答对，答案区域下方再由你自己判定「作答正确 / 作答错误」，未判定时是「待判定」，不进错题本。
- 每次「看过标准答案」才算一次作答，打开题目不算；重复提交同一 `attemptId`、刷新页面都不会重复计数，主动重新作答才会 +1。
- 作答历史逐条保留（时间、结果、选择），并区分「历史上答错过」与「当前已掌握」。

**四类列表**（每个科目互相隔离）
今日题目 / 全部 / 收藏 / 错题本。四者共享同一题目 ID，收藏或答错后立即同步；删除科目或删除题库都不会删掉历史题目、作答、收藏与追问。

**答案详解固定版本**
首次生成并通过校验后即固定（版本 ID + 首次展示时间），之后无论刷新、切科目、从其他列表进入都复用同一版本，不会重新生成；只有点「修订答案详解」才会产出候选新版本，候选必须重新通过独立校验、再由你确认替换，旧版本进版本历史。

**追问侧栏**
线程按题目 ID 隔离，只喂当前题目的题干、选项、正式答案与该线程历史；生成失败会保留原文并可重试，清空只影响当前题目。

**考研日期**
区分报名年份与实际考试日期：2028 考研 = 2027 年 12 月初试。已公布的用官方日期（不带「约」）；未公布的以上一年同一考试的官方日期推后一年估算，并在三行倒计时里都标「约」；查不到依据就明确写「尚未核实」，不编日期。页面上的「核验日期」会联网只采信 `moe.gov.cn` / `chsi.com.cn` / `neea.edu.cn`。

**渲染**
题干、选项、答案、解析均支持 Markdown：标题、列表、引用、表格、代码块（保留缩进与换行）、图片、行内与独立 LaTeX 公式。公式字体为 **Latin Modern Math**（随包附带）。排版细节按 LaTeX 数学模式处理：变量使用真正的数学斜体码位、数字与 `\sin` 等函数名保持直立、减号用 U+2212（不是连字符）、导数撇号用 U+2032 起的 prime（`'`→′、`''`→″，中文输入法的 `’` 也会归一）；`\text{…}` 里保持普通文本，连字符不会被当成减号。无法渲染的内容会以原文 + 提示保留，不会静默丢弃。

## 安装

需要可用的 DeepSeek Harness，以及一个能用的默认模型（在线出题要用）。三种方式任选其一。

### 1. DSH Desktop（图形界面）

插件面板 → 添加 → 选择本仓库目录（克隆后的本地目录）。装好后**刷新一次页面**，左侧栏会出现「考研每日一题」的图标（在「插件」「日程」旁边）。

### 2. 命令行（`dsh web` 这类 CLI 用法）

profile 名就是你启动 DSH 时用的那个：跑 `dsh web` 就是 `--profile web`，跑 `dsh --profile headless …` 就是 `--profile headless`。下面的命令以 `web` 为例，换成你自己的 profile 名即可。

`dsh plugin` 会把参数原样转发给 pnpm，所以本机需要先有 pnpm（`corepack enable pnpm`，或 `npm i -g pnpm`）。

**从 GitHub 装**（推荐）：

```bash
dsh plugin --profile web add github:Scienmicroit/Daily-Question#v1.0.5
dsh plugin --profile web add github:Scienmicroit/Daily-Question   # 不写 #tag 取默认分支最新提交
```

**从本地目录 / tgz 装**：

```bash
git clone https://github.com/Scienmicroit/Daily-Question
dsh plugin --profile web add ./Daily-Question
dsh plugin --profile web add ./daily-question-1.0.5.tgz
```

装完这条命令会把包里 `dsh.bundle.patch` 声明的那一行自动叠加进 profile（`package.json` 的 `dsh.profile.bundles` 里会出现 `daily-question`），下次启动该 profile 即生效。

> **注意**：DSH Desktop 内置的 `desktop` profile 由应用独占管理，命令行会拒绝（`profile "desktop" is managed exclusively by the Electron application`），请走上面的图形界面方式。

### 3. 让 Agent 装

已经装好 DSH 的话，把仓库路径告诉 Agent，让它调用 `plugin_manager install_bundle <绝对路径>` 即可。

### 升级与卸载

```bash
dsh plugin --profile web add github:Scienmicroit/Daily-Question   # 重新装一次即为升级（可加 #新tag 锁版本）
dsh plugin --profile web remove daily-question                    # 卸载
```

卸载不会删除学习数据（`~/.dsh/daily-question/data.json`）。

### 发新版本（维护者）

```bash
git tag v1.0.3 && git push --tags
```

打了 tag 之后，别人就能用 `github:Scienmicroit/Daily-Question#v1.0.5` 锁定版本；
不打 tag 则安装默认分支的最新提交。

> 本插件不发布到 npm，安装统一走 GitHub 或本地目录。
> 若以后想发 npm，需要把 `package.json` 的 `private` 改为 `false`，再 `npm publish`。

## 首次使用

1. 点左侧栏图标进入，先「科目管理」勾选要考的科目（例如数学一、英语一）。
2. 在右上角年份下拉里选择你参加的考研年份，倒计时与目标日期随之更新。
3. 「今日题目」会为该科目出今天的题；首次在线出题需要几十秒（生成 + 独立校验）。
4. 想用题库：科目管理里把该科目来源切成「题库出题」或「自动」，再到「题库管理」导入 `.md` / `.txt` / 文本型 PDF，先在预览里核对识别结果，再确认入库。

## 数据与隐私

- 学习数据保存在本机：`~/.dsh/daily-question/data.json`（可用环境变量 `DSH_DAILY_QUESTION_DATA_DIR` 改路径）。单文件 JSON，原子写 + 串行队列，写失败会把错误抛给界面而不是静默丢弃。
- 在线出题与追问只走宿主自己配置的模型服务，不额外接入第三方；联网核验考试日期只访问教育部 / 教育考试院 / 研招网域名。
- 导入的题库文件只在本机解析，不上传。

## 目录结构

```
index.js              宿主入口（注册接口、加载数据文件）
client.js             浏览器端：侧栏入口 + 主面板 + Markdown/LaTeX 渲染 + 追问侧栏
lib/service.js        业务逻辑（设置、出题、作答、收藏、错题本、修订、追问、题库）
lib/store.js          JSON 持久化（原子写、事务式更新）
lib/generate.js       在线出题 + 独立答案校验 + 答案修订
lib/tutor.js          追问回复（严格限定当前题目）
lib/bank.js           题库解析（题干 / 选项 / 答案 / 解析 / 知识点 / 难度）
lib/pdf.js            纯 JS 的 PDF 文本提取（文本型 PDF，含 ToUnicode CMap）
lib/exam-dates.js     考研日期口径、估算规则、倒计时、官方日期联网核验
lib/routes.js         同源 HTTP 接口 + 公式字体路由
lib/subjects.js       科目目录、题型、大纲提示
lib/llm-json.js       模型调用与 JSON 容错解析
assets/               Latin Modern Math 字体及其许可文件
test/                 离线单元/集成测试（不需要模型与网络）
```

## 开发与测试

```bash
node test/check.mjs          # 日期口径、倒计时、题库解析、存储（32 项）
node test/service-check.mjs  # 业务状态机：出题/作答/错题/收藏/秒重/题库删除（32 项）
node test/render-check.mjs   # Markdown + LaTeX 解析（28 项）
node test/pdf-check.mjs <某个文本型 PDF 的路径>   # PDF 提取与题库识别（可选）
```

这些测试不联网、不调用模型、不需要 DSH，直接在 Node 20+ 跑。

## 已知限制

- **PDF 只支持文本型**：纯 JS 实现，不 OCR；扫描件、图片型 PDF 与带权限加密的 PDF 会明确拒绝并提示改用 Markdown，不会伪装成导入成功。
- **公式渲染是自写的 LaTeX 子集**：覆盖分式、根式、上下标、求和/积分/极限、矩阵、分段函数、希腊字母等常见结构；生僻宏会以原文保留并高亮提示。
- **导入题库的答案一律标「待核验」**，系统不会自动核验；只有「修订」流程会做独立校验。
- 主观题不做自动判分（按考试要求由你自己判定）。
- 暂未实现按知识点/难度筛选、学习统计与连续天数、题目质量反馈。

## 字体许可

`assets/latinmodern-math.otf` 是 Latin Modern Math 1.959，版权归 B. Jackowski、P. Strzelczyk、P. Pianowski（代表 TeX Users Groups），按 **GUST Font License**（LPPL 的一个实例）发布，允许自由使用与再分发。许可原文见 `assets/LICENSE-latin-modern-math.txt`。

## License

本插件代码以 **MIT** 许可发布，见仓库根目录的 [LICENSE](LICENSE)。

`assets/latinmodern-math.otf` 不适用 MIT：它按 GUST Font License（LPPL 的一个实例）发布，许可原文见 `assets/LICENSE-latin-modern-math.txt`。
