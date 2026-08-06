#!/bin/sh
set -eu

smoke_dir="$(mktemp -d)"
trap 'rm -rf "$smoke_dir"' EXIT

font="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
test -x "$(command -v ffmpeg)"
test -x "$(command -v ffprobe)"
test -f "$font"

printf '%s\n' 'APOLLOS MEDIA PREFLIGHT' > "$smoke_dir/title.txt"
cat > "$smoke_dir/captions.srt" <<'EOF'
1
00:00:00,000 --> 00:00:01,800
Runtime media verification
EOF

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "color=c=0x0D2B45:s=1280x720:d=2:r=30" \
  -frames:v 1 "$smoke_dir/frame.png"

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi \
  -i 'aevalsrc=0.075*(sin(2*PI*329.63*t)*between(mod(t\,4)\,0.00\,0.42)+sin(2*PI*392.00*t)*between(mod(t\,4)\,0.50\,0.92)+sin(2*PI*523.25*t)*between(mod(t\,4)\,1.00\,1.42))+0.018*sin(2*PI*130.81*t):s=44100:d=2' \
  -af "aecho=0.8:0.45:55:0.15,highpass=f=90,lowpass=f=4200" \
  -c:a pcm_s16le "$smoke_dir/jingle.wav"

ffmpeg -hide_banner -loglevel error -y \
  -loop 1 -i "$smoke_dir/frame.png" -i "$smoke_dir/jingle.wav" \
  -vf "drawtext=fontfile=$font:textfile=$smoke_dir/title.txt:fontcolor=white:fontsize=42:x=(w-text_w)/2:y=80,subtitles=$smoke_dir/captions.srt:force_style='FontName=DejaVu Sans,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=3',format=yuv420p" \
  -map 0:v:0 -map 1:a:0 -t 2 \
  -c:v libx264 -preset veryfast -crf 24 \
  -c:a aac -b:a 128k -movflags +faststart \
  "$smoke_dir/preflight.mp4"

duration="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$smoke_dir/preflight.mp4")"
bytes="$(wc -c < "$smoke_dir/preflight.mp4" | tr -d ' ')"

test "$bytes" -gt 1000
awk -v duration="$duration" 'BEGIN { exit !(duration >= 1.8 && duration <= 2.2) }'

printf 'APOLLOS_MEDIA_PREFLIGHT_OK duration=%s bytes=%s\n' "$duration" "$bytes"
