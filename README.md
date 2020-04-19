mp4-cut
=======

utility to cut and concat media files, and encodes h264 based on config

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/mp4-cut.svg)](https://npmjs.org/package/mp4-cut)
[![Downloads/week](https://img.shields.io/npm/dw/mp4-cut.svg)](https://npmjs.org/package/mp4-cut)
[![License](https://img.shields.io/npm/l/mp4-cut.svg)](https://github.com/mp4-cut/mp4-cut/blob/master/package.json)

<!-- toc -->
- [mp4-cut](#mp4-cut)
- [Usage](#usage)
- [Commands](#commands)
- [Background](#background)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g mp4-cut
$ mp4-cut COMMAND
running command...
$ mp4-cut (-v|--version|version)
mp4-cut/0.1.0 win32-x64 node-v10.15.0
$ mp4-cut --help [COMMAND]
USAGE
  $ mp4-cut COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->

<!-- commandsstop -->

# Background
Here is an example of a file that takes an input file, chops it up, and re-stitches the segments together, taken from

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

Here is an example of the .csv file used as a configuration
```
DJI_0069.MP4 ; ["0:00","0:18"] ; ["0:30","0:52"]
DJI_0070.MP4 ; ["0:00","0:18"] ; ["0:30","0:52"]
```
