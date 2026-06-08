const Imap = require('imap');
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const GMAIL_USER     = process.env.GMAIL_USER || process.env.PLAYGROUND_EMAIL || '';
const GMAIL_PASSWORD = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g, '');

const POLL_TIMEOUT_MS  = 60_000;
const POLL_INTERVAL_MS = 3_000;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function extractOtp(text: string): string | null {
  const match = text.match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

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
      user:        GMAIL_USER,
      password:    GMAIL_PASSWORD,
      host:        'imap.gmail.com',
      port:        993,
      tls:         true,
      tlsOptions:  { rejectUnauthorized: false },
      authTimeout: 10_000,
    });

    let found: string | null = null;

    imap.once('error', (err: Error) => {
      imap.destroy();
      reject(new Error(`IMAP error: ${err.message}`));
    });

    imap.once('end', () => resolve(found));

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (openErr: Error | null) => {
        if (openErr) { imap.end(); return reject(openErr); }

        // IMAP SINCE is date-only, so search from start of today
        const since = new Date(sentAfter);
        since.setHours(0, 0, 0, 0);

        imap.search(
          [['SINCE', since], ['FROM', 'notifications@shunyalabs.ai']],
          (searchErr: Error | null, uids: number[]) => {
            if (searchErr || !uids || uids.length === 0) {
              imap.end();
              return;
            }

            // Fetch ALL matching emails and filter by actual time
            const f = imap.fetch(uids, { bodies: '' });
            const candidates: { date: Date; otp: string }[] = [];

            f.on('message', (msg: any) => {
              msg.on('body', (stream: any) => {
                simpleParser(stream, (_parseErr: Error | null, parsed: any) => {
                  if (_parseErr) return;
                  // Only consider emails received AFTER sentAfter
                  const emailDate = parsed.date ? new Date(parsed.date) : new Date(0);
                  if (emailDate < sentAfter) return;

                  const text = parsed.text || parsed.html || '';
                  const otp = extractOtp(String(text));
                  if (otp) candidates.push({ date: emailDate, otp });
                });
              });
            });

            f.once('end', () => {
              imap.end();
              if (candidates.length > 0) {
                // Pick the most recent OTP
                candidates.sort((a, b) => b.date.getTime() - a.date.getTime());
                found = candidates[0].otp;
                console.log(`   📨 ${candidates.length} OTP email(s) found, using latest from ${candidates[0].date.toISOString()}`);
              }
            });

            f.once('error', (fetchErr: Error) => { imap.end(); reject(fetchErr); });
          }
        );
      });
    });

    imap.connect();
  });
}