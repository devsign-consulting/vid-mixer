import {Command, flags} from '@oclif/command'

const Bluebird = require('bluebird')
const csv = require('csvtojson')
const _ = require('lodash')
const clc = require('cli-color')
const {spawn} = require('child_process')
const fs = require('fs')

interface ConfigFileRow {
  filename: string;
  index: number;
  timeframes: TimeFrame[];
}

interface TimeFrame {
  start: string;
  end: string;
}

class VMix extends Command {
  static description = 'Reads in a config file, cuts the files, and concats them back together'

  static examples = [
    '$ mp4-cut --init',
  ]

  static flags = {
    help: flags.help({char: 'h'}),
    input: flags.string({char: 'i', description: 'input config file'}),
    init: flags.boolean({description: 'generate config file, with all files in folder', default: false}),
    debugCommand: flags.boolean({description: 'output command logs, do not execute ffmpeg', default: false}),
  }

  public debugCommand = false

  async run() {
    const flags = this.parse(VMix).flags

    this.debugCommand = flags && flags.debugCommand

    if (flags && flags.input) {
      return this.parseAndExecFfmpegAsync(flags.input)
    }

    if (flags && flags.init) {
      return this.initConfigFile()
    }

    // if nothing is passed in, assume the .vmix file will be used
    this.parseAndExecFfmpegAsync('.vmix')
  }

  async parseAndExecFfmpegAsync(input: string) {
    // grabs the csv file and parses it
    try {
      const jsonConfig = await this.configToJsonAsync(input)
      this.log(clc.green('File parse successful'))

      // generate the ffmpeg commands
      const commands = this.generateFfmpegCmd(jsonConfig)
      if (this.debugCommand) this.log('commands', commands)

      // pass the commands into exec
      if (!this.debugCommand) {
        await Bluebird.each(commands, async (command: Array<string[]>) => {
          await this.execFfmpegAsync(command)
        })
      }
    } catch (error) {
      throw new Error(error)
    }
  }

  initConfigFile() {
    this.log(clc.green('Creating .vmix config file'))
    try {
      const existingConfig = fs.readFileSync(`${process.cwd()}/.vmix`, 'utf8')
      this.log('existingConfig', existingConfig)
      if (existingConfig) {
        this.error('.vmix config file already exists')
        return
      }
    } catch (error) {
      // do nothing
    }

    fs.readdir(process.cwd(), (err: Error, files: Array<string>) => {
      if (err) {
        this.error('invalid folder')
      }
      const filteredFiles = this._filterValidFiles(files)
      const lines: Array<string> = []
      _.forEach(filteredFiles, (file: string, idx: number) => {
        lines.push(`${idx} ; ${file} ; ["0:00","0:00"]`)
      })

      fs.writeFile(`${process.cwd()}/.vmix`, lines.join('\n'), (err: Error) => {
        if (err) this.error(err)
        this.log(clc.green('Created init file .vmix with the following files', filteredFiles))
      })
    })
  }

  _filterValidFiles(files: Array<string>): Array<string> {
    const exclude = ['.h264', '.vmix']
    const include = ['.mp4']

    return _.filter(files, (f: string) => {
      let match = false
      _.forEach(include, (i: string) => {
        if (f.toLowerCase().indexOf(i) !== -1) {
          match = true
          return false // exist the forLoop
        }
      })

      _.forEach(exclude, (e: string) => {
        if (f.toLowerCase().indexOf(e) !== -1) {
          match = false
        }
      })
      return match
    })
  }

  /**
   * This function takes the ConfigFileRow, and outputs the commands
   * to be accepted by execFfmpeg function
   * @param {Array.<object>} configs - Config File Row
   * @returns {Array.string[]} - command params
   */
  generateFfmpegCmd(configs: ConfigFileRow[]) {
    const commands: Array<string[]> = []

    // group the configs by index
    const configByIndex = _.groupBy(configs, 'index')

    // now loop through each group, which can contain multiple files
    _.forEach(configByIndex, (configs: ConfigFileRow[]) => {
      // we want the inputs to be concatenated -- generate inputs
      const inputParams: string[] = []
      _.forEach(configs, (row: ConfigFileRow) => {
        inputParams.push(`-i ${row.filename}`)
      })

      // this starts the LOOP inside the "GROUP", which can be multiple inputs
      // stitched together, each with filename and timeframes.
      // Currently only supports sequential stitching
      /*
        configs: [
          1: [
            {
              filename: 'file1',
              timeframes: { start, end }
            },
            {
              filename: 'file2',
              timeframes: { start, end }
            }
          ]
        ]
      */
      // constants
      const encodingParam = '-x265-params crf=25'

      // variables to be generated inside the loop
      let outputFilename = ''
      let complexFilterTrims = ''
      let complexFilterSuffix = ''
      let filterIndex = 0
      let inputFileIndex = 0
      _.forEach(configs, (row: ConfigFileRow) => {
        const fileExt = _.last(row.filename.split('.'))

        // remove file ext
        const filename = row.filename.replace(fileExt, '')
        outputFilename += `${filename}`

        // generate the splits
        _.forEach(row.timeframes, (timeframe: TimeFrame) => {
          const startSeconds = this._minToSeconds(timeframe.start)
          const endSeconds = this._minToSeconds(timeframe.end)
          if (startSeconds === 0 && endSeconds === 0) {
            complexFilterTrims += `[${inputFileIndex}:v]trim=start=0,setpts=PTS-STARTPTS[v${filterIndex}];[${inputFileIndex}:a]atrim=start=0,asetpts=PTS-STARTPTS[a${filterIndex}];`
          } else {
            complexFilterTrims += `[${inputFileIndex}:v]trim=${startSeconds}:${endSeconds},setpts=PTS-STARTPTS[v${filterIndex}];[${inputFileIndex}:a]atrim=${startSeconds}:${endSeconds},asetpts=PTS-STARTPTS[a${filterIndex}];`
          }
          complexFilterSuffix += `[v${filterIndex}][a${filterIndex}]`
          filterIndex++
        })
        inputFileIndex++
      })

      // split and transcode
      const finalFilterStr = `${complexFilterTrims}${complexFilterSuffix} concat=n=${filterIndex}:v=1:a=1[outv][outa]`
      outputFilename += 'cut.h264.mp4'

      // assemble the final command string
      const commandDao = [...inputParams, `-filter_complex "${finalFilterStr}"`, '-map "[outv]"', '-map "[outa]"', `"${outputFilename}"`, `${encodingParam}`]

      const fileExistPath = `${outputFilename}`
      if (fs.existsSync(`${fileExistPath}`)) {
        this.warn(clc.red(`Skipping file ${outputFilename}, because it already exists`))
      } else {
        commands.push(commandDao)
      }
    })

    return commands
  }

  async execFfmpegAsync(command: Array<string[]>): Promise<void> {
    return new Bluebird((resolve: any) => {
      this.log(clc.green('Executing command', command))
      const proc = spawn('ffmpeg', command, {
        shell: true,
      })

      proc.stderr.on('data', (data: string) => {
        this.log(`${data}`)
      })

      proc.on('error', (code: string) => {
        this.log(`spawn error: ${code}`)
        resolve(code)
      })

      proc.on('close', (code: string) => {
        this.log(`spawn child process closed with code ${code}`)
        resolve(code)
      })

      proc.on('exit', (code: string) => {
        this.log(`spawn child process exited with code ${code}`)
        resolve(code)
      })
    })
  }

  _minToSeconds(input: string): number {
    const minSplit = input.split(':')
    const min = (parseInt(minSplit[0], 10) * 60)
    const seconds = parseInt(minSplit[1], 10)
    if (_.isNaN(min) || _.isNaN(seconds)) throw new Error(`${input} is invalid time string`)
    return min + seconds
  }

  /**
   * @param {string} inputFileName - filename relative to script execution
   * @returns {ConfigFileRow[]} - config file
   */
  async configToJsonAsync(inputFileName: string): Promise<ConfigFileRow[]> {
    const currentDir = process.cwd()
    const filePath = `${currentDir}/${inputFileName}`

    let jsonArray = []
    try {
      jsonArray = await csv({
        noheader: true,
        delimiter: ';',
      }).fromFile(filePath)
    } catch (error) {
      this.log(clc.red(`${inputFileName} config not found. Try running vmix --init to generate a config`))
    }

    // flatten the array
    jsonArray = _.map(jsonArray, (r: any) => _.values(r))

    if (this.debugCommand) {
      this.log(clc.green('raw json array', JSON.stringify(jsonArray, null, 4)))
    }

    // parses the raw jsonArray to key/value Json
    const output = [] as ConfigFileRow[]
    _.forEach(jsonArray, (row: any) => {
      const dao: ConfigFileRow = {
        filename: '',
        index: 0,
        timeframes: [],
      }
      _.forEach(row, (col: string, idx: number) => {
        if (idx === 0) {
          dao.index = parseInt(col, 10)
          if (_.isNaN(dao.index)) throw new Error('parse file error: your first column is a valid integer index (e.g. 0, 1, etc)')
        }

        if (idx === 1) dao.filename = col

        if (idx > 1) {
          try {
            const timeFrameSplit = JSON.parse(col)
            dao.timeframes.push({
              start: _.trim(timeFrameSplit[0]),
              end: _.trim(timeFrameSplit[1]),
            })
          } catch (error) {
            throw new Error('parse file error: make sure your time codes are quoted individually, e.g. ["0", "0:30"]')
          }
        }
      })
      output.push(dao)
    })

    if (this.debugCommand) {
      this.log(clc.green('JSON Parsed'), clc.green(JSON.stringify(output, null, 4)))
    }
    return output
  }
}

export = VMix
