// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { processEnv } from './env'

describe('environment of the Python processes', () => {
  it('drops what could change which code runs or where downloads come from, and turns usage reports off', () => {
    const env = processEnv({ PATH: '/usr/bin', PYTHONPATH: '/evil', HF_ENDPOINT: 'https://mirror', HF_TOKEN: 'x', HOME: '/Users/a' })
    expect(env.PATH).toBe('/usr/bin')
    expect(env.HOME).toBe('/Users/a')
    expect(env.PYTHONPATH).toBeUndefined()
    expect(env.HF_ENDPOINT).toBeUndefined()
    expect(env.HF_TOKEN).toBeUndefined()
    expect(env).toMatchObject({ HF_HUB_DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1', HF_HUB_DISABLE_IMPLICIT_TOKEN: '1' })
  })
})
