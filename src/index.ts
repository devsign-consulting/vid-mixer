import {Command, flags} from '@oclif/command'

// todo: incorporate fprobe to check video for audio stream: fprobe -i DJI_0111.cut.h264.mp4 -show_streams -select_streams a -loglevel error
// returns nothing if no streams

const Bluebird = require('bluebird')
const csv = require('csvtojson')
const _ = require('lodash')
const clc = require('cli-color')
const {spawn} = require('child_process')
const fs = require('fs')

interface ConfigFileRow {
  filename: string;
  audioStream?: boolean;
  outputFilename?: string;
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
    group: flags.string({description: 'pass in a group number (e.g. 1, 2, 3, etc) to only process that group'}),
    debugCommand: flags.boolean({description: 'output command logs, do not execute ffmpeg', default: false}),
    copyOnly: flags.boolean({description: 'do not re-encode, only copy the streams (lossless)', default: false}),
  }

  public outputFileSuffix = '.cut.h264.mp4'

  public fileOverridePlaceholder = '[delete me to override with your own filename (including brackets)]'

  public debugCommand = false

  public group = -1

  public copyOnly = false

  async run() {
    const flags = this.parse(VMix).flags

    this.debugCommand = flags && flags.debugCommand

    if (flags && flags.input) {
      return this.parseAndExecFfmpegAsync(flags.input)
    }

    if (flags && flags.init) {
      return this.initConfigFile()
    }

    if (flags && flags.group) this.group = parseInt(flags.group, 10)
    if (flags && flags.copyOnly) this.copyOnly = flags.copyOnly

    // if nothing is passed in, assume the .vmix file will be used
    this.parseAndExecFfmpegAsync('.vmix')
  }

  async parseAndExecFfmpegAsync(input: string) {
    // grabs the csv file and parses it
    try {
      const jsonConfig = await this.configToJsonAsync(input)
      this.log(clc.green('File parse successful'))

      // check which streams have audio, and decorates config with audioStream: true
      await this.checkAudioStream(jsonConfig)

      // generate the ffmpeg commands
      const [ffmpegCommands, exifCommands] = this.generateExecCommands(jsonConfig)
      if (this.debugCommand) this.log('commands', {ffmpegCommands, exifCommands})

      // pass the commands into exec
      if (!this.debugCommand) {
        // generate iterator
        const iterator = []
        for (let i = 0; i < ffmpegCommands.length; i++) iterator.push(i)

        await Bluebird.each(iterator, async (i: number) => {
          await this.execAsync('ffmpeg', ffmpegCommands[i])
          await this.execAsync('exiftool', exifCommands[i])
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

      if (existingConfig) {
        this.log(clc.red('.vmix config file already exists'))
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
      const timecodes: Array<string> = [':timecodes']
      const groupFilenames: Array<string> = [':groupFilenames']

      _.forEach(filteredFiles, (file: string, idx: number) => {
        timecodes.push(`${idx} ; ${file} ; 0:00,0:00 ; 0:00,0:00 ; 0:00,0:00`)
        groupFilenames.push(`${idx} ; ${this.fileOverridePlaceholder}`)
      })

      const lines = [...timecodes, ...groupFilenames]

      fs.writeFile(`${process.cwd()}/.vmix`, lines.join('\n'), (err: Error) => {
        if (err) {
          this.error(err)
        } else {
          this.log(clc.green('Created init file .vmix with the following files', filteredFiles))
        }
      })
    })
  }

  _filterValidFiles(files: Array<string>): Array<string> {
    const exclude = ['.vmix']
    const include = ['.mp4', '.mov', '.avi']

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
  generateExecCommands(configs: ConfigFileRow[]) {
    // init variables
    const commands: Array<string[]> = []
    const exifCommands: Array<string[]> = []

    let encodingParam = '-x265-params crf=25'
    if (this.copyOnly) encodingParam = '-c:v copy'

    // group the configs by index
    const configByIndex = _.groupBy(configs, 'index')

    // now loop through each group, which can contain multiple files
    _.forEach(configByIndex, (configs: ConfigFileRow[], groupIndex: string) => {
      // if group is defined, and does not equal the current group index, skip to the next loop

      if (this.group !== -1 && this.group !== parseInt(groupIndex, 10)) {
        return true // skip this and go to the next loop
      }
      // we want the inputs to be concatenated -- generate inputs
      const inputParams = this._getInputParams(configs)

      const [finalFilterStr, outputFilename] = this._getComplexFilterStrings(configs)

      // see if there's an override filename defined on the group level
      const overrideFilename = _.get(configs[0], 'outputFilename')
      const finalOutputFilename = overrideFilename ? `${overrideFilename}.mp4` : `${outputFilename}${this.outputFileSuffix}`

      // assemble the final command string
      const commandDao = [...inputParams, `-filter_complex "${finalFilterStr}"`, '-map "[outv]"', '-map "[outa]"', `"${finalOutputFilename}"`, `${encodingParam}`]

      const fileExistPath = `${finalOutputFilename}`
      if (fs.existsSync(`${fileExistPath}`)) {
        this.warn(clc.red(`Skipping file ${finalOutputFilename}, because it already exists`))
      } else {
        commands.push(commandDao)
        exifCommands.push([`-tagsFromFile "${configs[0].filename}"`, `-CreateDate "${finalOutputFilename}"`, '-overwrite_original'])
      }
    })

    return [commands, exifCommands]
  }

  async execAsync(command: string, params: string[], silent = false): Promise<string> {
    return new Bluebird((resolve: any, reject: any) => {
      if (!silent) this.log(clc.green('Executing command', `${command} ${params.join(' ')}`))
      const proc = spawn(command, params, {
        shell: true,
      })

      proc.stdout.on('data', (data: string) => {
        resolve(data)
      })

      proc.stderr.on('data', (data: string) => {
        if (!silent) this.log(`${data}`)
        resolve(data)
      })

      proc.on('error', (code: string) => {
        if (!silent) this.log(`spawn error: ${code}`)
        resolve(code)
      })

      proc.on('close', (code: string) => {
        if (!silent) this.log(`spawn child process closed with code ${code}`)
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
    let parseType = ''

    _.forEach(jsonArray, (row: any) => {
      const timecodeDao: ConfigFileRow = {
        filename: '',
        index: 0,
        timeframes: [],
      }

      _.forEach(row, (col: string, idx: number) => {
        // for each row, looping through each column
        col = _.trim(col)
        if (idx === 0) {
          // check for the parseType :timecodes or :groupFilenames,
          // and set the parseType accordingly
          if (col === ':timecodes') {
            parseType = 'timecodes'
            return true // continue to next line
          }
          if (col === ':groupFilenames') {
            parseType = 'groupFilenames'
            return true // continue to next line
          }
        }

        // based on the parseType, pass it into the appropriate parser
        if (parseType === 'timecodes') {
          this._parseTimecodes(col, idx, timecodeDao)
        }

        if (parseType === 'groupFilenames') this._parseGroupFilenames(row, col, idx, output)
      })

      if (!_.isEmpty(timecodeDao.filename) && parseType === 'timecodes') {
        output.push(timecodeDao)
      }
    })

    if (this.debugCommand) {
      this.log(clc.green('JSON Parsed'), clc.green(JSON.stringify(output, null, 4)))
    }
    return output
  }

  _parseTimecodes(col: string, idx: number, configRow: ConfigFileRow) {
    if (idx === 0) configRow.index = parseInt(col, 10)
    if (idx === 1) configRow.filename = col

    if (idx > 1) {
      try {
        const timeFrameSplit = _.split(col, ',')
        configRow.timeframes.push({
          start: _.trim(timeFrameSplit[0]),
          end: _.trim(timeFrameSplit[1]),
        })
      } catch (error) {
        throw new Error('parse file error: make sure your time codes are quoted individually, e.g. ["0", "0:30"]')
      }
    }
  }

  /**
   * If available, grab the file name per the group index, and apply it to the
   * correct index on the ConfigFileRow[] array
   * @param {object} row - th efull row object
   * @param {string} col - col value
   * @param {object} idx - col index
   * @param {ConfigFileRow[]} configRows full config array
   * @returns {void}
   */
  _parseGroupFilenames(row: string[], col: string, idx: number, configRows: ConfigFileRow[]) {
    if (idx === 0) {
      // the 0th column index is the "index" value.  Use that index to find the cooresponding
      // record on the ConfigFileRow[] array, and add the outputFilename key;
      // The outputFilename is defined as the second column in the row
      const configIndexMatches = _.filter(configRows, {index: parseInt(col, 10)})
      if (configIndexMatches.length > 0) {
        const groupFilename = _.trim(row[1])
        if (groupFilename !== this.fileOverridePlaceholder)
        configIndexMatches[0].outputFilename = groupFilename
      }
    }
  }

  _getInputParams(configs: ConfigFileRow[]): string[] {
    const inputParams: string[] = []
    _.forEach(configs, (row: ConfigFileRow) => {
      inputParams.push(`-i ${row.filename}`)
    })
    return inputParams
  }

  _getComplexFilterStrings(configs: ConfigFileRow[]) {
    // variables to be generated inside the loop
    let outputFilename = ''
    let complexFilterTrims = ''
    let complexFilterSuffix = ''
    let filterIndex = 0
    let inputFileIndex = 0

    // this starts the LOOP inside the "GROUP", which can be multiple inputs
    // stitched together, each with filename and timeframes.
    // Currently only supports sequential stitching
    /*
        configs: [
          1: [
            {
              filename: 'file1',
              timeframes: [{ start, end }]
            },
            {
              filename: 'file2',
              timeframes: [{ start, end }]
            }
          ]
        ]
      */
    _.forEach(configs, (row: ConfigFileRow) => {
      const fileExt = _.last(row.filename.split('.'))

      // remove file ext
      const filename = row.filename.replace(`.${fileExt}`, '')
      outputFilename += `${filename}`

      // generate the trim syntax
      _.forEach(row.timeframes, (timeframe: TimeFrame) => {
        const startSeconds = this._minToSeconds(timeframe.start)
        const endSeconds = this._minToSeconds(timeframe.end)

        // if the first timeframe is 0,0 set the trim=start=0, and exit out of this loop
        if (startSeconds === 0 && endSeconds === 0) {
          complexFilterTrims += `[${inputFileIndex}:v]trim=start=0,setpts=PTS-STARTPTS[v${filterIndex}];[${inputFileIndex}:a]atrim=start=0,asetpts=PTS-STARTPTS[a${filterIndex}];`
          complexFilterSuffix += `[v${filterIndex}][a${filterIndex}]`
          filterIndex++
          return false // this is to break the for loop
        // eslint-disable-next-line no-else-return
        } else {
          complexFilterTrims += `[${inputFileIndex}:v]trim=${startSeconds}:${endSeconds},setpts=PTS-STARTPTS[v${filterIndex}];[${inputFileIndex}:a]atrim=${startSeconds}:${endSeconds},asetpts=PTS-STARTPTS[a${filterIndex}];`
          complexFilterSuffix += `[v${filterIndex}][a${filterIndex}]`
          filterIndex++
        }
      })
      inputFileIndex++
    })

    const finalFilterStr = `${complexFilterTrims}${complexFilterSuffix} concat=n=${filterIndex}:v=1:a=1[outv][outa]`
    return [finalFilterStr, outputFilename]
  }

  async checkAudioStream(config: ConfigFileRow[]): Promise<void> {
    return Bluebird.each(config, async (row: ConfigFileRow) => {
      const inputFile = row.filename
      try {
        const response: string = await this.execAsync('ffprobe', [`-i ${inputFile}`, '-show_streams', '-select_streams a', '-loglevel error'], true)
        if (response && response.indexOf('STREAM') !== -1) {
          row.audioStream = true
        } else {
          row.audioStream = false
        }
      } catch (error) {
        this.log('error', error)
      }
    })
  }
}

export = VMix
