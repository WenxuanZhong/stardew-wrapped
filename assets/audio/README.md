# 星露谷音频接入说明

`assets/audio/` 里的 ogg 是从你本地 `D:\stardew valley\Stardew Valley\Content\XACT\Wave Bank.xwb`
解出来再用 vgmstream + ffmpeg 编码的（ADPCM → libvorbis q=3/4，44.1kHz）。

## 文件作用

| 文件 | 触发场景 | 状态 |
|------|---------|------|
| bgm_title.ogg   | landing 模式 BGM | 多半正确（title_night.wav，2:06 循环）|
| bgm_spring.ogg  | cards 模式 + 春天 | spring_day_ambient（约 8 分钟，长度合理）|
| bgm_summer.ogg  | 夏 | summer2.wav（11MB 大文件，应该是 summer2 主题）|
| bgm_fall.ogg    | 秋 | ocean.wav 占位 — 听起来像海洋环境音，需要换 |
| bgm_winter.ogg  | 冬 | Majestic.wav 占位 — 大文件但不确定，需要听一下 |
| amb_rain.ogg    | rain-mode | rainsound.wav 17 秒循环，正确 |
| amb_thunder.ogg | thunder-mode 雷声轮播 | 大概率正确（5.5 秒响雷）|
| amb_night.ogg   | 夜晚 | cricketsAmbient.wav 蟋蟀环境音，正确 |
| amb_water.ogg   | 备选 | waterfall.wav，没接入默认场景 |
| amb_wind.ogg    | snow-mode | wind.wav 8 秒循环（之前 13KB 那个是 SFX 错位，已修）|
| sfx_click.ogg   | UI 点击 | bigSelect.wav，降到 75% 音量并加短淡出，作为柔和点击声 |

## 为什么名字不可信

XSB（Sound Bank）的 cue 名字到 wave bank track 索引的映射在 unxwb -b
里是按"cue name 在字符串表里的顺序对应 wave bank 的 track 顺序"的简单
假设。Stardew 的真实排序里，许多 cue 复用同一 track，且 cue 数量
（433）比 track 数量（437）多，所以位置对不齐。

## 如何替换不准的文件

1. 在浏览器里跑站点 → 切到对应天气/季节，听一下不对劲就替换
2. 候选 wav 全部解在 `.tools/unxwb/wave_named/`（最大的几个 wav 多半就是
   BGM）
3. 用 `python .tools/encode_audio.py` 修改 `CANDIDATES` 列表后重跑
4. 或者用 `vgmstream-cli + ffmpeg`：
   ```
   .tools\vgm\vgmstream-cli.exe -o tmp.wav .tools\unxwb\wave_named\<name>.wav
   .tools\ffmpeg\ffmpeg-8.1.1-essentials_build\bin\ffmpeg.exe -i tmp.wav -c:a libvorbis -q:a 3 -ar 44100 assets/audio/bgm_xxx.ogg
   ```

## 静音

页面右上角 🔊/🔇 按钮存到 localStorage（`sdv_audio = 0/1`）。
