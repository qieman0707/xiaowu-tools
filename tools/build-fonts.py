"""把海报字体裁成 GB2312 常用字子集（woff2），放进 docs/fonts/。
用法：python3 -I tools/build-fonts.py <MaShanZheng.ttf> <NotoSerifSC[wght].ttf> <ZhiMangXing.ttf>
国内打不开 Google Fonts，所以字体自己托管；裁到 6763 个常用字 + 标点，手机首开也扛得住。"""
import sys, pathlib
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

out = pathlib.Path(__file__).resolve().parent.parent / "docs" / "fonts"
chars = set()
for hi in range(0xB0, 0xF8):
    for lo in range(0xA1, 0xFF):
        try:
            chars.add(bytes([hi, lo]).decode("gb2312"))
        except UnicodeDecodeError:
            pass
chars |= {chr(c) for c in range(0x20, 0x7F)}
chars |= set("·、。，！？：；「」『』《》〈〉—…（）【】〔〕～“”‘’￥％＋－＝×÷°℃№ⅠⅡⅢⅣⅤ０１２３４５６７８９　•●○◎☆★♪♫")
text = "".join(sorted(chars))
# 毛笔字笔画复杂、体积大，只留一级常用字 3755 个（标题够用，缺字回落到宋体）
level1 = "".join(sorted(c for c in chars if len(c.encode("gb2312", "ignore")) < 2 or c.encode("gb2312", "ignore")[0] < 0xD8))

def build(src, name, wght=None, text=text):
    f = TTFont(src)
    if wght is not None:
        f = instancer.instantiateVariableFont(f, {"wght": wght})
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    s = subset.Subsetter(opts)
    s.populate(text=text)
    s.subset(f)
    p = out / name
    f.flavor = "woff2"
    f.save(p)
    print(p.name, round(p.stat().st_size / 1e6, 2), "MB")

build(sys.argv[1], "brush.woff2", text=level1)
build(sys.argv[2], "serif.woff2", wght=600)
# 志莽行书：细笔行书，写日期、副标这类点缀
build(sys.argv[3], "xing.woff2", text=level1)
