"""Edit the four actual-game captures and deliver a verified 20 MB maximum MP4."""
from pathlib import Path
import json
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'output/reel-source'
OUT=ROOT/'output/frostbound-gameplay-20s-1080p60.mp4'
SHOTS=['ice','sword','cultivator','awakening']

def run(args):
    subprocess.run(args,check=True)

def main():
    audits=[json.loads((SOURCE/(s+'.json')).read_text()) for s in SHOTS]
    assert sum(a['frames'] for a in audits)==1200
    assert all(a['fps']==60 and a['width']==1920 and a['height']==1080 and a['shaderFailures']==0 for a in audits)
    master=SOURCE/'sequence.h264'
    with master.open('wb') as out:
        for shot in SHOTS:
            with (SOURCE/(shot+'.h264')).open('rb') as source:shutil.copyfileobj(source,out)
    audio=SOURCE/'mix.wav'
    audio_args=['ffmpeg','-hide_banner','-loglevel','warning','-y']
    for s in SHOTS:audio_args+=['-i',str(SOURCE/(s+'.wav'))]
    audio_args+=['-ss','8','-i',str(ROOT/'public/game/audio/lotus-pond-loop.mp3')]
    graph=('[0:a][1:a][2:a][3:a]concat=n=4:v=0:a=1,volume=2.0[sfx];'
           "[4:a]atrim=duration=20,asetpts=PTS-STARTPTS,volume='if(between(t,15.1,17.3),0.10,0.28)':eval=frame,afade=t=in:d=0.35,afade=t=out:st=19.35:d=0.65[music];"
           '[sfx][music]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-18:TP=-1.5:LRA=11,afade=t=out:st=19.65:d=0.35[out]')
    run(audio_args+['-filter_complex',graph,'-map','[out]','-ar','48000','-c:a','pcm_s16le',str(audio)])
    base=['ffmpeg','-hide_banner','-loglevel','warning','-y','-r','60','-f','h264','-i',str(master)]
    codec=['-c:v','libx264','-preset','slow','-b:v','6800k','-maxrate','8500k','-bufsize','17000k',
           '-pix_fmt','yuv420p','-profile:v','high','-level:v','4.2','-r','60','-frames:v','1200',
           '-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv',
           '-passlogfile',str(SOURCE/'delivery-pass')]
    run(base+codec+['-pass','1','-an','-f','null','/dev/null'])
    run(base+['-i',str(audio)]+codec+['-pass','2','-map','0:v:0','-map','1:a:0','-c:a','aac','-b:a','160k','-t','20','-movflags','+faststart',str(OUT)])
    metadata=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(OUT)]))
    video=next(s for s in metadata['streams'] if s['codec_type']=='video')
    assert video['nb_read_frames']=='1200' and video['avg_frame_rate']=='60/1'
    assert (video['width'],video['height'])==(1920,1080)
    assert abs(float(metadata['format']['duration'])-20)<.05
    assert OUT.stat().st_size<20_000_000, 'Delivery exceeds the requested 20 MB cap'
    run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(OUT),'-f','null','-'])
    report={'file':str(OUT.relative_to(ROOT)),'bytes':OUT.stat().st_size,'duration':float(metadata['format']['duration']),
            'resolution':'1920x1080','fps':60,'frames':1200,'videoCodec':video['codec_name'],
            'audio':'AAC 48 kHz stereo / 160 kbps','shots':[{'shot':a['shot'],'duration':a['duration'],'hits':sum(e['type']=='hit' for e in a['events'])} for a in audits],
            'source':'Real Three.js game simulation, deterministic 1/60 s capture. Scripted level-30 combat, no player save access.',
            'music':'BiteMe Games — Lotus Pond (the existing licensed local game soundtrack)'}
    (ROOT/'docs/game/gameplay-reel.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
