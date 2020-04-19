vmix
=======

Trims and concatenates multiple video files together, using **ffmpeg** and an easy to use config file. Tested on Windows so far only.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/vid-mixer.svg)](https://npmjs.org/package/vid-mixer)
[![Downloads/week](https://img.shields.io/npm/dw/vid-mixer.svg)](https://npmjs.org/package/vid-mixer)
[![License](https://img.shields.io/npm/l/vid-mixer.svg)](https://github.com/devsign-consulting/vid-mixer/blob/master/package.json)

<!-- toc -->
* [Why I built this](#why-i-built-this)
* [Background](#background)
* [Prerequisites](#prerequisites)
* [Installation and Usage](#installation-and-usage)
* [.vmix Config File](#vmix-config-file)
* [Requirements: ffmpeg](#requirements-ffmpeg)
<!-- tocstop -->

# Why I built this
I have a lot of .mp4 and .mov files from a lot of devices: **Android**, **iOS**, **GoPro**, **DJI Mavic**, **Osmo**, etc stored on my hard drive.  They take up a lot of space, and also contain a lot of un-usable footage.

I wanted a single utility that achieves the following:
* Transcodes video to h.264 on the command line w/o having to go into Premier
* At the same time, have the ability to cut clips out of files, and re-stitch them back together to form a single output.

This allows me to preserve the parts of videos that I like, and significantly reduce file size easily via configuration from the command line without having to touch Adobe Premier. I take this "first pass", and then put it into Adobe Premier for further editing if needed.

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

This utility simply generates the above syntax, from a simple configuration file format


# Prerequisites
Make sure you install **ffmpeg** and **exiftool**:
* https://www.ffmpeg.org/download.html - executable "ffmpeg" should work from the command line.
* https://exiftool.org/ - executable "exiftool" should work from the command line.  This is used to restore the EXIF created date of the media file upon conversion

# Installation and Usage
```sh-session
$ npm install -g vid-mixer
$ cd /into-folder-with-mp4-files/

$ vmix --init
creates **.vmix** config file in the working folder
use text editor to edit file

$ vmix
Cuts and concatenates video files based on the .vmix config (see below)
````

# .vmix Config File
Here is an example of the .vmix file used as a configuration, for chopping and re-stitching videos
```
:timecodes
1 ; DJI_0111.MP4 ; 0:00,0:00 ; 0:00,0:00 ; 0:00,0:00
1 ; DJI_0112.MP4 ; 0:00,0:00 ; 0:00,0:00 ; 0:00,0:00
// the "1" is a group key, which groups both files to a single output

2 ; DJI_0113.MP4 ; 0:00,0:00 ; 0:00,0:00 ; 0:00,0:00

:groupFilenames
1 ; My custom filename
2 ; [delete me to override with your own filename (including brackets)]
```
**:timecodes**
* The first column is a **GROUP KEY**. Videos w/ the same index will be combined to generate a single output file
* The second column is the input filename, relative to the current path
* The 3rd and subsequent columns are trim timeframes in **minutes** : **seconds**

**:groupFilenames**
* Set custom filename output for each group.

# Requirements: ffmpeg
This package assumes you have access to **ffmpeg** from your commmand line.

Type **ffmpeg -h** from a terminal, and make sure it exists.  Otherwise, follow instructions to install ffmpeg from google
