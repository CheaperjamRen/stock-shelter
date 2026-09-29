# Theme Name: 研报标尺（Research Ledger）

## Vibe
- 瑞士网格金融研报风（Swiss editorial × 财经研究报告）：晨星/券商研报式的克制编辑排版，网格严谨，等宽数字为视觉主角

## Color
- Primary: #1D4E89（深蓝，金融研究主色）
- On Primary: #FFFFFF
- Accent: #0C8A5F（翠绿，通过态/强调点缀）
- On Accent: #FFFFFF
- Background: #F6F7F9（浅色中性）
- Foreground: #1A2333
- Muted: #EBEEF2
- Border: #D9DEE6
- Secondary: #3E6FA8（深蓝浅阶）
- 语义色：涨/超阈值红 #C93A3A、跌/低于阈值绿 #0E9F6E、数据缺失灰 #8A94A6 + 斜纹
- 规则：大面积中性底；深蓝只落导航、主按钮、表头、激活态；翠绿只落通过标签、强调链接、开关激活；禁大色块渐变铺底

## Typography
- Heading: Noto Serif SC (family: 'Noto Serif SC', serif, weight: 600, url: https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@500;600;700&display=swap)
- Body: Noto Sans SC (family: 'Noto Sans SC', sans-serif, weight: 400;500, url: https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap)
- 数字列：'IBM Plex Mono' 等宽 + tabular-nums，url: https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap

## Visual Language
- 核心视觉签名：研报口径脚注系统——所有指标名带上标序号（如「PE-TTM¹」），序号锚定悬浮口径卡片（定义/统计时点/数据来源/单位四要素），全站关键数字可追溯；表格为 hairline 细线研报表（1px 边线、表头浅蓝灰底、行 hover 淡蓝）
- 材质与深度：纯色平面卡 + 1px 中性边线，仅一层极浅投影（y 方向 2px）；无渐变、无毛玻璃、无 CRT
- 容器与按钮：卡片微圆角（radius 6px）；主按钮深蓝实底白字、次按钮 Muted 底深字、禁白底细描边；启停开关翠绿激活/灰禁用
- 布局节奏：桌面左侧固定锚点导航（240px），主区单列纵向工作流（意图输入→条件→结果→分析面板）；密集表格与说明文字交替，说明段落 65ch 限宽

## Animation
- 入场：条件卡片/结果行 80ms 依次淡入上移（160ms ease-out）
- 交互：阈值输入与 What-if 滑块拖动时变动行背景闪烁高亮（600ms 后消退）；抽屉 200ms ease-out 滑入
- 无装饰性循环动效

## Forbidden
- 禁 CRT/荧光绿/暗黑终端风，禁渐变大色块与毛玻璃
- 禁无等宽数字的表格；禁涨跌色反转（必须涨红跌绿）
- 禁给缺失数据静默赋默认值并用正常色展示
