#!/bin/sh
# Makes the README media in ../docs from the 16:9 video: the GIF, a still, and the
# 1280 x 640 image for GitHub's social preview. Render the video first.
set -e
V=out/daybow-16x9.mp4
D=../docs
ffmpeg -loglevel error -y -i "$V" -vf "fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" "$D/demo.gif"
ffmpeg -loglevel error -y -ss 6.9 -i "$V" -frames:v 1 "$D/hero.png"
ffmpeg -loglevel error -y -ss 21.2 -i "$V" -frames:v 1 -vf "scale=1280:720,crop=1280:640:0:40" "$D/social-preview.png"
ls -lh "$D"
