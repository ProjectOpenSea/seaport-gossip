import { createLogger, format, transports } from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

import type { LoggerOptions } from 'winston'

const { combine, timestamp, label, printf, colorize } = format

export enum Color {
  RESET = '\x1b[0m',
  BRIGHT = '\x1b[1m',
  DIM = '\x1b[2m',
  UNDERSCORE = '\x1b[4m',
  BLINK = '\x1b[5m',
  REVERSE = '\x1b[7m',
  HIDDEN = '\x1b[8m',

  FG_BLACK = '\x1b[30m',
  FG_RED = '\x1b[31m',
  FG_GREEN = '\x1b[32m',
  FG_YELLOW = '\x1b[33m',
  FG_BLUE = '\x1b[34m',
  FG_MAGENTA = '\x1b[35m',
  FG_CYAN = '\x1b[36m',
  FG_WHITE = '\x1b[37m',

  BG_BLACK = '\x1b[40m',
  BG_RED = '\x1b[41m',
  BG_GREEN = '\x1b[42m',
  BG_YELLOW = '\x1b[43m',
  BG_BLUE = '\x1b[44m',
  BG_MAGENTA = '\x1b[45m',
  BG_CYAN = '\x1b[46m',
  BG_WHITE = '\x1b[47m',
}

export const colorString = (string: string, color?: Color) => {
  if (color === undefined) return string
  return `${color}${string}${Color.RESET}`
}

const logFormat = (color?: Color) =>
  /* eslint-disable @typescript-eslint/no-shadow */
  printf(({ level, message, label, timestamp }) => {
    label = label !== undefined ? ` ${colorString(label, color)}` : ''
    message = colorString(message, color)
    return `${timestamp}${label} ${level} ${message}`
  })

const timestampFormat = { format: 'YYYY-MM-DD HH:mm:ss' }

const shortPeerId = (peerId?: string) => {
  if (peerId === undefined) return
  return `${peerId.slice(0, 6)}…${peerId.slice(46, 52)}`
}

export const createWinstonLogger = (
  options: LoggerOptions = { level: 'warn' },
  peerId?: string,
  logColor = Color.FG_YELLOW
) => {
  peerId = shortPeerId(peerId)

  const winstonTransports = []
  // Log to the console (with colors enabled)
  winstonTransports.push(
    new transports.Console({
      format: combine(
        label({ label: peerId }),
        timestamp(timestampFormat),
        colorize(),
        logFormat(logColor)
      ),
    })
  )

  // If we're in production additionally log
  // to a rotating file (without colors)
  if (process.env.NODE_ENV === 'production') {
    winstonTransports.push(
      new DailyRotateFile({
        filename: 'node-%DATE%.log',
        datePattern: 'YYYY-MM-DD-HH',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d',
        format: combine(
          label({ label: peerId }),
          timestamp(timestampFormat),
          logFormat()
        ),
      })
    )
  }

  const logger = createLogger({
    transports: winstonTransports,
    ...options,
  })

  return logger
}
