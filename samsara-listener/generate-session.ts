/**
 * generate-session.ts
 *
 * One-time interactive script to obtain a GramJS StringSession for Rebeca's
 * Telegram account. Run this locally (NOT in Docker / Railway):
 *
 *   npx tsx generate-session.ts
 *
 * It will prompt for phone number, verification code, and 2FA password (if set).
 * Copy the printed session string into your Railway environment as TG_SESSION_STRING.
 *
 * IMPORTANT: Keep TG_SESSION_STRING secret — it gives full account access.
 */

import * as readline from 'readline'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import * as dotenv from 'dotenv'

dotenv.config()

const API_ID   = parseInt(process.env.TG_API_ID   ?? '', 10)
const API_HASH = process.env.TG_API_HASH ?? ''

if (!API_ID || !API_HASH) {
  console.error(
    'Error: TG_API_ID and TG_API_HASH must be set in your .env file.\n' +
    'Get them at https://my.telegram.org → API development tools.'
  )
  process.exit(1)
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())))
}

async function main() {
  console.log('\n=== SATORI Telegram Session Generator ===\n')
  console.log(`Using API_ID: ${API_ID}`)
  console.log(`Using API_HASH: ${API_HASH.slice(0, 6)}${'*'.repeat(API_HASH.length - 6)}\n`)

  const client = new TelegramClient(
    new StringSession(''),
    API_ID,
    API_HASH,
    { connectionRetries: 5 }
  )

  await client.start({
    phoneNumber: async () => {
      const phone = await ask('Enter Rebeca\'s phone number (with country code, e.g. +15551234567): ')
      return phone
    },
    phoneCode: async () => {
      const code = await ask('Enter the verification code sent to the device: ')
      return code
    },
    password: async () => {
      const pw = await ask('Enter 2FA password (leave blank if not set): ')
      return pw
    },
    onError: (err) => {
      console.error('Auth error:', err)
    },
  })

  const sessionString = client.session.save() as unknown as string
  await client.disconnect()
  rl.close()

  console.log('\n✅ Authentication successful!\n')
  console.log('='.repeat(60))
  console.log('TG_SESSION_STRING (copy this to Railway env vars):')
  console.log('='.repeat(60))
  console.log(sessionString)
  console.log('='.repeat(60))
  console.log('\n⚠️  Keep this string SECRET — it grants full account access.')
  console.log('Add it to Railway as: TG_SESSION_STRING')
}

main().catch((e) => {
  console.error('Fatal:', e)
  rl.close()
  process.exit(1)
})
