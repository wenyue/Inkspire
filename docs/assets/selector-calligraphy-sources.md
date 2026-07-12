# 选择器书法素材溯源

本文档仅用于仓库内部资产溯源。项目已获相关使用授权，产品 UI 不展示署名或许可证文案。

## 生产方法

本批书法图片不再直接使用馆藏原作像素。馆藏原作只用于核验书体、结体、用笔、墨色和章法；最终可见书迹均为 AI 参考重绘，再由 Sharp 从五张已核对文字的主稿中提取字形，确定性地重排到选项、形制和主视觉纸面。这样可以保持同组视觉一致，同时避免二次生成造成错字。

五张 AI 主稿及固定文字为：

- 端庄：`敬慎无怠`
- 俊逸：`清风入怀`
- 雄强：`浩然正气`
- 古拙：`守拙归真`
- 温润：`和光同尘`

所有主稿均已逐字核对为简体中文，产品图不包含署名、题跋、水印或可读印章文字。

## 风格参考

以下官方馆藏页仅作风格参考，原作像素不进入生产资产：

- 端庄：梁巘《行书临十七帖轴》，故宫博物院：<https://www.dpm.org.cn/collection/handwriting/261947.html>
- 俊逸：陈继儒《行书七律诗轴》，故宫博物院：<https://www.dpm.org.cn/collection/handwriting/229042.html>
- 雄强：张瑞图《行书五绝诗轴》，故宫博物院：<https://www.dpm.org.cn/collection/handwriting/229616.html>
- 古拙：康有为《行书录语轴》，故宫博物院：<https://www.dpm.org.cn/collection/handwriting/228232.html>
- 温润：米万钟《行书七言诗句轴》，故宫博物院：<https://www.dpm.org.cn/collection/handwriting/229611.html>
- 行书章法：王羲之《兰亭序》神龙本，故宫博物院：<https://www.dpm.org.cn/collection/handwriting/228279.html>
- 隶书与拓片质感：明初拓东汉《曹全碑》，故宫博物院：<https://www.dpm.org.cn/collection/impres/228534.html>
- 楷书结构：唐人《多宝塔碑》拓本，故宫博物院馆藏图，仅作内部结构参考。
- 草书章法：孙过庭《书谱》，国立故宫博物院：<https://theme.npm.edu.tw/selection/Article.aspx?sNo=04001002>
- 篆书结构：秦《泰山刻石》，故宫博物院：<https://www.dpm.org.cn/collection/impres/234107.html>

## 生产资产映射

五张主稿被确定性复用于以下 20 张书法相关资产：

- 创作方向：`options/work-type-1-calligraphy.webp`、`questions/work-type.webp`
- 书法步骤主视觉：`questions/calligraphy-text.webp`、`questions/calligraphy-spirit.webp`、`questions/calligraphy-layout.webp`、`questions/calligraphy-material.webp`
- 气息选项：`options/calligraphy-spirit-0-dignified.webp` 至 `options/calligraphy-spirit-4-warm.webp`
- 形制选项：`options/calligraphy-layout-0-hanging-scroll.webp` 至 `options/calligraphy-layout-4-album.webp`
- 材质选项：`options/calligraphy-material-0-plain-xuan.webp` 至 `options/calligraphy-material-3-rubbing.webp`

除“形制”组选项保留立轴、横披、斗方、手卷和册页的完整外形，其余选项均以作品铺满卡片，不保留墙面、桌案或装裱边框。

## 热门模板

- `previews/templates/running-script-verse.webp`：由已核对的俊逸主稿 `清风入怀` 确定性横向重排。
- `previews/templates/regular-script-family-motto.webp`：以唐楷和碑刻结构为参考进行 AI 重绘，固定文字为 `家和业兴`，已核对使用简体 `业`。

两张模板与 18 张国画模板统一输出为独立的 `960×720` WebP 大图。
