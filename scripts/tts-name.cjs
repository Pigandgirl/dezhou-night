const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const fs = require('fs');
const path = require('path');
const PROFILES = {
  female_warm: ['zh-CN-XiaoxiaoNeural', '+0%', '+0Hz'],
  female_bright: ['zh-CN-XiaoyiNeural', '+3%', '+10Hz'],
  female_sweet: ['zh-CN-XiaoyiNeural', '+6%', '+20Hz'],
  female_mature: ['zh-CN-XiaoxiaoNeural', '-6%', '-10Hz'],
  male_deep: ['zh-CN-YunyangNeural', '-5%', '-20Hz'],
  male_warm: ['zh-CN-YunxiNeural', '+0%', '+0Hz'],
  male_clear: ['zh-CN-YunyangNeural', '+2%', '+5Hz'],
  male_uncle: ['zh-CN-YunjianNeural', '-10%', '-30Hz'],
};
async function main() {
  const [profile, text, outDir] = process.argv.slice(2);
  const p = PROFILES[profile];
  if (!p) throw new Error('bad profile');
  const clean = String(text || '').replace(/[<>&"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!clean) throw new Error('bad name');
  fs.mkdirSync(outDir, { recursive: true });
  const tts = new MsEdgeTTS({ connectionTimeoutMs: 12000, synthesisTimeoutMs: 20000 });
  try {
    await tts.setMetadata(p[0], OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const result = await tts.toFile(outDir, clean, { rate: p[1], pitch: p[2] });
    console.log(result.audioFilePath);
  } finally {
    tts.close();
  }
}
main().catch((error) => { console.error(error.message || error); process.exit(1); });
