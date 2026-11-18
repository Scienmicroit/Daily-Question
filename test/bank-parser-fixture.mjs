import { parseBankText } from '../lib/bank.js'

// These service tests exercise storage and scheduling, with existing fixture banks.
export const recognizeFixtureBank = (_ctx, text, { filename }) => parseBankText(text, { filename })
