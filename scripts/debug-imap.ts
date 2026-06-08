/**
 * debug-imap.ts
 * Run this to test Gmail IMAP connection and see what emails are in the inbox.
 * Usage: npx ts-node scripts/debug-imap.ts
 */

const Imap = require('imap');
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const GMAIL_USER     = process.env.PLAYGROUND_EMAIL || '';
const GMAIL_PASSWORD = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g, '');

console.log(`📧 Connecting to Gmail IMAP as: ${GMAIL_USER}`);
console.log(`🔑 App password length: ${GMAIL_PASSWORD.length} chars`);

const imap = new Imap({
  user:        GMAIL_USER,
  password:    GMAIL_PASSWORD,
  host:        'imap.gmail.com',
  port:        993,
  tls:         true,
  tlsOptions:  { rejectUnauthorized: false },
  authTimeout: 15_000,
});

imap.once('error', (err: Error) => {
  console.error('❌ IMAP connection error:', err.message);
  process.exit(1);
});

imap.once('ready', () => {
  console.log('✅ Connected to Gmail IMAP!');

  imap.openBox('INBOX', true, (err: Error | null) => {
    if (err) {
      console.error('❌ Could not open INBOX:', err.message);
      imap.end();
      return;
    }

    console.log('📂 INBOX opened — searching last 10 emails…\n');

    // Search ALL recent emails (last 1 day)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    imap.search([['SINCE', since]], (searchErr: Error | null, uids: number[]) => {
      if (searchErr) {
        console.error('❌ Search error:', searchErr.message);
        imap.end();
        return;
      }

      if (!uids || uids.length === 0) {
        console.log('📭 No emails found in the last 24 hours.');
        imap.end();
        return;
      }

      console.log(`📬 Found ${uids.length} email(s) in last 24h. Fetching last 5…\n`);
      const recent = uids.slice(-5);

      const f = imap.fetch(recent, { bodies: '' });

      f.on('message', (msg: any, seqno: number) => {
        msg.on('body', (stream: any) => {
          simpleParser(stream, (_err: any, parsed: any) => {
            console.log(`--- Email #${seqno} ---`);
            console.log(`  From   : ${parsed.from?.text}`);
            console.log(`  Subject: ${parsed.subject}`);
            console.log(`  Date   : ${parsed.date}`);
            // Look for 6-digit OTP in body
            const body = parsed.text || parsed.html || '';
            const otp = String(body).match(/\b(\d{6})\b/);
            if (otp) {
              console.log(`  ✅ OTP found: ${otp[1]}`);
            } else {
              console.log(`  ℹ️  No 6-digit code found in body`);
            }
            console.log('');
          });
        });
      });

      f.once('end', () => {
        console.log('Done.');
        imap.end();
      });

      f.once('error', (fetchErr: Error) => {
        console.error('❌ Fetch error:', fetchErr.message);
        imap.end();
      });
    });
  });
});

imap.connect();
