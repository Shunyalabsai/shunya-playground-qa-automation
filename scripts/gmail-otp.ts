/**
 * gmail-otp.ts
 *
 * Fetches the latest Clerk OTP from Gmail via IMAP.
 *
 * Env vars required:
 *   GMAIL_USER         Gmail address (falls back to PLAYGROUND_EMAIL)
 *   GMAIL_APP_PASSWORD Gmail App Password (16-char, spaces optional)
 */

import * as Imap from 'imap';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const GMAIL_USER     = process.env.GMAIL_USER || process.env.PLAYGROUND_EMAIL || '';
const GMAIL_PASSWORD = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g, '');

// How long to poll for a fresh OTP email (ms)
const POLL_TIMEOUT_MS  = 60_000;
const POLL_INTERVAL_MS = 3_000;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Extract a 6-digit OTP from email text/html body.
 */
function extractOtp(text: string): string | null {
  // Match a standalone 6-digit number
  const match = text.match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

/**
 * Fetch the most recent unseen email from Clerk (sent in the last 2 minutes)
 * and return the OTP code.
 *
 * @param sentAfter  Date — only consider emails received after this time
 */
export async function fetchOtpFromGmail(sentAfter: Date): Promise<string> {
  console.log(`📬 Polling Gmail for OTP (sent after ${sentAfter.toISOString()})…`);

  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const otp = await tryFetchOtp(sentAfter);
    if (otp) {
      console.log(`✅ OTP found: ${otp}`);
      return otp;
    }
    console.log(`   No OTP yet — retrying in ${POLL_INTERVAL_MS / 1000}s…`);
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for OTP email after ${POLL_TIMEOUT_MS / 1000}s`);
}

function tryFetchOtp(sentAfter: Date): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user:     GMAIL_USER,
      password: GMAIL_PASSWORD,
      host:     'imap.gmail.com',
      port:     993,
      tls:      true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10_000,
    });

    imap.once('error', (err: Error) => {
      imap.destroy();
      reject(new Error(`IMAP error: ${err.message}`));
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err) => {
        if (err) { imap.end(); return reject(err); }

        // Search for recent emails from Clerk
        const since = new Date(sentAfter.getTime() - 5_000); // 5s buffer
        imap.search(
          [['SINCE', since], ['FROM', 'noreply@clerk.dev']],
          (searchErr, uids) => {
            if (searchErr || !uids || uids.length === 0) {
              imap.end();
              return resolve(null);
            }

            // Fetch the most recent one
            const fetch = imap.fetch([uids[uids.length - 1]], { bodies: '' });
            let found: string | null = null;

            fetch.on('message', (msg) => {
              msg.on('body', (stream) => {
                simpleParser(stream, (parseErr, parsed) => {
                  if (parseErr) return;
                  const text = parsed.text || parsed.html || '';
                  found = extractOtp(String(text));
                });
              });
            });

            fetch.once('end', () => {
              imap.end();
            });

            fetch.once('error', (fetchErr: Error) => {
              imap.end();
              reject(fetchErr);
            });
          }
        );
      });
    });

    imap.once('end', () => resolve(found));
    imap.connect();
  });
}
