"""Build-time Doubao TTS. Credentials stay in memory / caller environment, never in game assets."""
import base64
import getpass
import json
import os
from pathlib import Path
import uuid
import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/game/audio/awakening'
VOICES = [
    ('sword', '一剑，敕雷！', 'zh_female_vv_uranus_bigtts', '请用年轻女剑客的声音，凌厉果断、有爆发力地喊出战斗绝招，前两字略蓄力，后两字利落有力。只念台词，不要旁白，不要背景音。'),
    ('ice', '霜落，雷鸣！', 'zh_female_gaolengyujie_uranus_bigtts', '请用冷静高傲的女弓箭手声音，克制但有压迫感地念出终极技能台词，两段短句干净利落。只念台词，不要旁白，不要背景音。'),
    ('cultivator', '诸天，听令！', 'zh_female_cancan_uranus_bigtts', '请用威严沉稳的女仙尊声音，像向天地下达敕令一样念这句短台词，前半庄重，后半坚定有力。只念台词，不要旁白，不要背景音。'),
]

def main():
    key = os.environ.get('DOUBAO_API_KEY') or getpass.getpass('Doubao API key (not saved): ')
    headers = {'X-Api-Key': key, 'X-Api-Resource-Id': 'seed-tts-2.0', 'Content-Type': 'application/json'}
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for kind, text, speaker, direction in VOICES:
        headers['X-Api-Request-Id'] = str(uuid.uuid4())
        payload = {'user': {'uid': 'frostbound-asset-build'}, 'req_params': {'text': text, 'speaker': speaker,
            'audio_params': {'format': 'mp3', 'sample_rate': 24000, 'bit_rate': 128000, 'speech_rate': 3},
            'additions': json.dumps({'context_texts': [direction]}, ensure_ascii=False)}}
        chunks, success = [], False
        with requests.post('https://openspeech.bytedance.com/api/v3/tts/unidirectional', headers=headers, json=payload, stream=True, timeout=(15, 90)) as response:
            if response.status_code != 200:
                raise RuntimeError(f'Doubao HTTP {response.status_code}: {response.text[:400]}')
            for line in response.iter_lines():
                if not line: continue
                result = json.loads(line)
                if result.get('code') not in (0, 20000000):
                    raise RuntimeError(f'Doubao synthesis failed: {result.get("code")}: {result.get("message")}')
                if result.get('data'): chunks.append(base64.b64decode(result['data']))
                success |= result.get('code') == 20000000
        data = b''.join(chunks)
        if not success or len(data) < 1000: raise RuntimeError('Incomplete audio; no asset written.')
        path = OUT / f'{kind}-v1.mp3'
        path.write_bytes(data)
        manifest.append({'class': kind, 'text': text, 'speaker': speaker, 'direction': direction, 'bytes': len(data), 'path': str(path.relative_to(ROOT))})
        print(f'{kind}: saved {len(data)} bytes', flush=True)
    (ROOT / 'docs/game/awakening-voices.json').write_text(json.dumps({'provider': 'Doubao seed-tts-2.0', 'voices': manifest}, ensure_ascii=False, indent=2)+'\n')

if __name__ == '__main__': main()
