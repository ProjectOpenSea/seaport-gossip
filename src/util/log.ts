/* eslint-disable @typescript-eslint/no-shadow */
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

export const colorString = (color: Color, string: string) => {
  return `${color}${string}${Color.RESET}`
}

const myFormat = (color?: Color) =>
  printf(
    ({ level, message, label, timestamp }) =>
      `${timestamp} ${
        label !== undefined
          ? `[${color !== undefined ? colorString(color, label) : label}]`
          : ''
      } ${level}: ${
        color !== undefined ? colorString(color, message) : message
      }`
  )

export const createWinstonLogger = (
  options: LoggerOptions = { level: 'warn' },
  peerId?: string,
  logColor = Color.FG_YELLOW
) => {
  const peerIdLabel =
    peerId !== undefined
      ? `${peerId.toString().slice(0, 6)}…${peerId.toString().slice(46, 52)}`
      : undefined

  const winstonTransports = []

  if (process.env.NODE_ENV === 'production') {
    // If we're in production log to a rotating file (without colors)
    winstonTransports.push(
      new DailyRotateFile({
        filename: 'node-%DATE%.log',
        datePattern: 'YYYY-MM-DD-HH',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d',
        format: combine(
          label({ label: peerIdLabel }),
          timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          myFormat()
        ),
      })
    )
  } else {
    // Otherwise log to the `console` (with colors enabled)
    winstonTransports.push(
      new transports.Console({
        format: combine(
          label({ label: peerIdLabel }),
          timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          colorize(),
          myFormat(logColor)
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
