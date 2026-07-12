import type { Answers, Locale, LocalizedText, WorkType } from "./domain";

export interface ArtworkTemplate {
  id: string;
  type: WorkType;
  previewImage: string;
  title: LocalizedText;
  answers: Record<string, LocalizedText>;
}

const text = (zhHans: string, zhHant: string, en: string, ja: string): LocalizedText => ({
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
  en,
  ja,
});

const painting = (
  id: string,
  title: LocalizedText,
  subject: LocalizedText,
  format: LocalizedText,
  brushwork: LocalizedText,
  palette: LocalizedText,
  mood: LocalizedText,
): ArtworkTemplate => ({
  id,
  type: "painting",
  previewImage: `/previews/templates/${id}.webp`,
  title,
  answers: {
    painting_subject: subject,
    painting_format: format,
    painting_brushwork: brushwork,
    painting_palette: palette,
    painting_mood: mood,
  },
});

const calligraphy = (
  id: string,
  title: LocalizedText,
  script: LocalizedText,
  spirit: LocalizedText,
  layout: LocalizedText,
  material: LocalizedText,
): ArtworkTemplate => ({
  id,
  type: "calligraphy",
  previewImage: `/previews/templates/${id}.webp`,
  title,
  answers: {
    calligraphy_script: script,
    calligraphy_spirit: spirit,
    calligraphy_layout: layout,
    calligraphy_material: material,
  },
});

const SUBJECT = {
  landscape: text("山水", "山水", "Landscape", "山水"),
  flowers: text("花鸟", "花鳥", "Birds and Flowers", "花鳥"),
  figures: text("人物", "人物", "Figures", "人物"),
  animals: text("走兽游鱼", "走獸游魚", "Animals and Fish", "動物と魚"),
};
const FORMAT = {
  horizontal: text("横幅", "橫幅", "Horizontal", "横長"),
  hanging: text("立轴", "立軸", "Hanging Scroll", "掛軸"),
  square: text("斗方", "斗方", "Square", "方形"),
  handscroll: text("手卷", "手卷", "Handscroll", "手巻"),
  fan: text("扇面", "扇面", "Fan", "扇面"),
};
const BRUSHWORK = {
  gongbi: text("工笔", "工筆", "Gongbi", "工筆"),
  xieyi: text("写意", "寫意", "Freehand", "写意"),
  baimiao: text("白描", "白描", "Plain Outline", "白描"),
  mogu: text("没骨", "沒骨", "Boneless", "没骨"),
};
const PALETTE = {
  ink: text("水墨", "水墨", "Ink Wash", "水墨"),
  blueGreen: text("青绿", "青綠", "Blue-Green", "青緑"),
  umber: text("浅绛", "淺絳", "Light Umber", "浅絳"),
  color: text("重彩", "重彩", "Rich Color", "重彩"),
};
const MOOD = {
  refined: text("清雅", "清雅", "Refined", "清雅"),
  ethereal: text("空灵", "空靈", "Ethereal", "空霊"),
  grand: text("雄浑", "雄渾", "Grand", "雄渾"),
  archaic: text("古拙", "古拙", "Archaic", "古拙"),
  luminous: text("明丽", "明麗", "Luminous", "明麗"),
};

export const ARTWORK_TEMPLATES: ArtworkTemplate[] = [
  painting("ink-landscape", text("水墨山水", "水墨山水", "Ink Landscape", "水墨山水"), SUBJECT.landscape, FORMAT.hanging, BRUSHWORK.xieyi, PALETTE.ink, MOOD.refined),
  painting("blue-green-landscape", text("青绿山水", "青綠山水", "Blue-Green Landscape", "青緑山水"), SUBJECT.landscape, FORMAT.horizontal, BRUSHWORK.gongbi, PALETTE.blueGreen, MOOD.luminous),
  painting("light-umber-landscape", text("浅绛山水", "淺絳山水", "Light Umber Landscape", "浅絳山水"), SUBJECT.landscape, FORMAT.hanging, BRUSHWORK.xieyi, PALETTE.umber, MOOD.refined),
  painting("golden-landscape", text("金碧山水", "金碧山水", "Golden Landscape", "金碧山水"), SUBJECT.landscape, FORMAT.horizontal, BRUSHWORK.gongbi, PALETTE.color, MOOD.grand),
  painting("misty-jiangnan", text("江南烟雨", "江南煙雨", "Misty Jiangnan", "江南の雨景"), SUBJECT.landscape, FORMAT.horizontal, BRUSHWORK.xieyi, PALETTE.ink, MOOD.ethereal),
  painting("winter-forest", text("雪景寒林", "雪景寒林", "Winter Forest", "雪景寒林"), SUBJECT.landscape, FORMAT.hanging, BRUSHWORK.xieyi, PALETTE.ink, MOOD.archaic),
  painting("gongbi-flowers-birds", text("工笔花鸟", "工筆花鳥", "Gongbi Flowers and Birds", "工筆花鳥"), SUBJECT.flowers, FORMAT.hanging, BRUSHWORK.gongbi, PALETTE.color, MOOD.luminous),
  painting("freehand-flowers-birds", text("写意花鸟", "寫意花鳥", "Freehand Flowers and Birds", "写意花鳥"), SUBJECT.flowers, FORMAT.square, BRUSHWORK.xieyi, PALETTE.ink, MOOD.refined),
  painting("boneless-flowers", text("没骨花卉", "沒骨花卉", "Boneless Flowers", "没骨花卉"), SUBJECT.flowers, FORMAT.square, BRUSHWORK.mogu, PALETTE.color, MOOD.luminous),
  painting("lotus-sketch", text("荷花小品", "荷花小品", "Lotus Sketch", "蓮の小品"), SUBJECT.flowers, FORMAT.square, BRUSHWORK.xieyi, PALETTE.ink, MOOD.refined),
  painting("four-gentlemen", text("梅兰竹菊", "梅蘭竹菊", "Four Gentlemen", "四君子"), SUBJECT.flowers, FORMAT.handscroll, BRUSHWORK.xieyi, PALETTE.ink, MOOD.archaic),
  painting("pine-crane-longevity", text("松鹤延年", "松鶴延年", "Pines and Cranes", "松鶴延年"), SUBJECT.flowers, FORMAT.hanging, BRUSHWORK.gongbi, PALETTE.color, MOOD.grand),
  painting("nine-fish", text("九鱼吉庆", "九魚吉慶", "Nine Auspicious Fish", "九魚吉祥"), SUBJECT.animals, FORMAT.horizontal, BRUSHWORK.mogu, PALETTE.color, MOOD.luminous),
  painting("phoenix-and-birds", text("百鸟朝凤", "百鳥朝鳳", "Phoenix and Birds", "百鳥朝鳳"), SUBJECT.flowers, FORMAT.horizontal, BRUSHWORK.gongbi, PALETTE.color, MOOD.grand),
  painting("gongbi-figures", text("工笔人物", "工筆人物", "Gongbi Figures", "工筆人物"), SUBJECT.figures, FORMAT.hanging, BRUSHWORK.gongbi, PALETTE.color, MOOD.refined),
  painting("freehand-figures", text("写意人物", "寫意人物", "Freehand Figures", "写意人物"), SUBJECT.figures, FORMAT.hanging, BRUSHWORK.xieyi, PALETTE.umber, MOOD.archaic),
  painting("elegant-ladies", text("仕女雅集", "仕女雅集", "Elegant Ladies", "仕女雅集"), SUBJECT.figures, FORMAT.handscroll, BRUSHWORK.gongbi, PALETTE.color, MOOD.refined),
  painting("arhat-zen", text("罗汉禅意", "羅漢禪意", "Arhat Zen", "羅漢の禅意"), SUBJECT.figures, FORMAT.hanging, BRUSHWORK.baimiao, PALETTE.ink, MOOD.archaic),
  calligraphy("running-script-verse", text("行书雅句", "行書雅句", "Running-Script Verse", "行書の雅句"), text("行书", "行書", "Running", "行書"), text("俊逸", "俊逸", "Graceful", "俊逸"), text("横幅", "橫幅", "Horizontal", "横長"), text("素宣", "素宣", "Plain Xuan", "白宣紙")),
  calligraphy("regular-script-family-motto", text("楷书家训", "楷書家訓", "Regular-Script Family Motto", "楷書の家訓"), text("楷书", "楷書", "Regular", "楷書"), text("端庄", "端莊", "Dignified", "端庄"), text("立轴", "立軸", "Hanging Scroll", "掛軸"), text("仿古", "仿古", "Antique Paper", "古色紙")),
];

export function localizedTemplateText(value: LocalizedText, locale: Locale): string {
  return value[locale] ?? value["zh-Hans"] ?? Object.values(value)[0] ?? "";
}

export function answersForArtworkTemplate(template: ArtworkTemplate, locale: Locale): Answers {
  return {
    work_type: template.type,
    creation_mode: "template",
    template_id: template.id,
    template_title: localizedTemplateText(template.title, locale),
    ...Object.fromEntries(Object.entries(template.answers).map(([key, value]) => [key, localizedTemplateText(value, locale)])),
  };
}
