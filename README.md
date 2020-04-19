vmix
=======

Executes ffmpeg in order to cut and concatenate multiple video files together, driven by a config file.  Useful for processing cell phone / GoPro videos

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/vmix.svg)](https://npmjs.org/package/vmix)
[![Downloads/week](https://img.shields.io/npm/dw/vmix.svg)](https://npmjs.org/package/vmix)
[![License](https://img.shields.io/npm/l/vmix.svg)](https://github.com/devsign-consulting/vid-mixer/blob/master/package.json)

<!-- toc -->
- [vmix](#vmix)
- [Usage](#usage)
- [.vmix Config File](#vmix-config-file)
- [Requirements: ffmpeg](#requirements-ffmpeg)
- [Why I built this](#why-i-built-this)
- [Background](#background)
<!-- tocstop -->
# Usage
Make sure you install ffmpeg: 
https://www.ffmpeg.org/download.html, and that the executable "ffmpeg" works from the command line.  Then, perform the following install steps
<!-- usage -->
```sh-session
$ npm install -g vid-mixer
$ cd /into-folder-with-mp4-files/

$ vmix --init
initializes .vmix init file
use text editor to edit file (by default, it will transcode all files in the folder to .h264)

$ vmix
transcodes all files in the folder w/ h264, at crf = 24 (medium quality)

```
# .vmix Config File
Here is an example of the .vmix file used as a configuration, for chopping and re-stitching videos
```
0 ; DJI_0069.MP4 ; ["0:00","0:18"] ; ["0:30","0:52"]
0 ; DJI_0070.MP4 ; ["0:00","0:18"] ; ["0:30","0:52"]
```
* The first column is an index key. Videos w/ the same index will generate a single output file
* The second column is the input filename, relative to the current path
* The 3rd and subsequent columns are trim timeframes in minutes:seconds


# Requirements: ffmpeg
This package assumes you have access to **ffmpeg** from your commmand line.

Type **ffmpeg -h** from a terminal, and make sure it exists.  Otherwise, follow instructions to install ffmpeg from google

# Why I built this
I have a lot of .mp4 and .mov files from a lot of devices: **Android**, **iOS**, **GoPro**, **DJI Mavic**, **Osmo**, etc stored on my hard drive.  They take up a lot of space, and also contain a lot of un-usable footage.

I wanted a single utility that achieves the following:
* Transcodes video to h.264 on the command line w/ an easy interface
* At the same time, have the ability to cut clips out of files, and re-stitch them back together to form a single output.

This allows me to rapidly preserve the parts of videos that I like, and significantly reduce file size. I take this "first pass", and then put it into Adobe Premier for further editing if needed.


# Background
Here is an example of an ffmpeg command that takes an input file, chops it up, and re-stitches the segments together, taken from

https://superuser.com/questions/1229945/ffmpeg-split-video-and-merge-back

```
ffmpeg -i DJI_0069.mp4 -filter_complex ^"^
[0:v]trim=0:10,setpts=PTS-STARTPTS[v0]; ^
[0:a]atrim=0:10,asetpts=PTS-STARTPTS[a0]; ^
[0:v]trim=15:20,setpts=PTS-STARTPTS[v1]; ^
[0:a]atrim=15:20,asetpts=PTS-STARTPTS[a1]; ^
[0:v]trim=25:30,setpts=PTS-STARTPTS[v2]; ^
[0:a]atrim=25:30,asetpts=PTS-STARTPTS[a2]; ^
[v0][a0][v1][a1][v2][a2] concat=n=3:v=1:a=1[outv][outa]^" ^
-map "[outv]" -map "[outa]" output.mp4
```

This is for splitting and concatenating **multiple** files
```
ffmpeg -i edv_g24_2.mp4 -i short-video.mp4 -filter_complex "\
[0:v]trim=0:10,setpts=PTS-STARTPTS[v0]; \
[0:a]atrim=0:10,asetpts=PTS-STARTPTS[a0]; \
[1:v]trim=0:5,setpts=PTS-STARTPTS[v1]; \
[1:a]atrim=0:5,asetpts=PTS-STARTPTS[v1]; \
[0:v]trim=15:30,setpts=PTS-STARTPTS[v2]; \
[0:a]atrim=15:30,asetpts=PTS-STARTPTS[a2]; \
[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[outv][outa]" \
-map "[outv]" -map "[outa]" output.mp4
```
