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
    console.log('   [DEBUG] tryFetchOtp called with sentAfter:', sentAfter.toISOString());
    console.log('   [DEBUG] GMAIL_USER:', GMAIL_USER);
    console.log('   [DEBUG] GMAIL_PASSWORD length:', GMAIL_PASSWORD.length);
    
    const imap = new Imap({
      user:        GMAIL_USER,
      password:    GMAIL_PASSWORD,
      host:        'imap.gmail.com',
      port:        993,
      tls:         true,
      tlsOptions:  { rejectUnauthorized: false },
      authTimeout: 15_000,
    });

    let found: string | null = null;
    let resolved = false;

    const safeResolve = (value: string | null) => {
      if (!resolved) {
        resolved = true;
        resolve(value);
      }
    };

    const safeReject = (err: Error) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    };

    imap.once('error', (err: Error) => {
      console.error('   [DEBUG] IMAP error event:', err.message);
      imap.destroy();
      safeReject(new Error(`IMAP error: ${err.message}`));
    });

    imap.once('end', () => {
      console.log('   [DEBUG] IMAP end event, found:', found);
      safeResolve(found);
    });

    imap.once('ready', () => {
      console.log('   [DEBUG] IMAP ready event');
      imap.openBox('INBOX', false, (openErr: Error | null) => {
        if (openErr) {
          console.error('   [DEBUG] openBox error:', openErr.message);
          imap.end();
          return safeReject(openErr);
        }
        console.log('   [DEBUG] INBOX opened');

        // IMAP SINCE is date-only, so search from start of today
        const since = new Date(sentAfter);
        since.setHours(0, 0, 0, 0);
        console.log(`   [DEBUG] Searching for emails since: ${since.toISOString()}`);

        imap.search(
          [['SINCE', since], ['FROM', 'notifications@shunyalabs.ai']],
          (searchErr: Error | null, uids: number[]) => {
            if (searchErr) {
              console.error('   [DEBUG] Search error:', searchErr.message);
              imap.end();
              return safeReject(new Error(`IMAP search error: ${searchErr.message}`));
            }
            if (!uids || uids.length === 0) {
              console.log('   [DEBUG] No emails found matching criteria (SINCE + FROM), trying broader search...');
              // Try without FROM filter
              imap.search(
                [['SINCE', since]],
                (searchErr2: Error | null, uids2: number[]) => {
                  if (searchErr2 || !uids2 || uids2.length === 0) {
                    console.log('   [DEBUG] No emails found even with broad search');
                    imap.end();
                    return safeResolve(null);
                  }
                  console.log(`   [DEBUG] Found ${uids2.length} emails with broad search, checking senders...`);
                  fetchAndFilterEmails(imap, uids2, sentAfter, safeResolve);
                }
              );
              return;
            }
            console.log(`   [DEBUG] Found ${uids.length} emails with strict filter`);
            fetchAndFilterEmails(imap, uids, sentAfter, safeResolve);
          }
        );
      });
    });

    imap.connect();
  });
}

function fetchAndFilterEmails(imap: any, uids: number[], sentAfter: Date, resolve: (value: string | null) => void): void {
  const f = imap.fetch(uids, { bodies: '' });
  const candidates: { date: Date; otp: string }[] = [];
  let messageCount = 0;
  const parsePromises: Promise<void>[] = [];  // ← ADD THIS

  f.on('message', (msg: any) => {
    messageCount++;
    console.log(`   [DEBUG] Processing message ${messageCount}`);
    msg.on('body', (stream: any) => {
      const p = new Promise<void>((res) => {   // ← WRAP in promise
        simpleParser(stream, (_parseErr: Error | null, parsed: any) => {
          if (_parseErr) {
            console.error('   [DEBUG] Parse error:', _parseErr.message);
            res(); return;
          }
          const fromText = parsed.from?.text || 'unknown';
          const subject = parsed.subject || 'no subject';
          console.log(`   [DEBUG] Email from: ${fromText} | subject: ${subject}`);

          const emailDate = parsed.date ? new Date(parsed.date) : new Date(0);
          if (emailDate < sentAfter) {
            console.log(`   [DEBUG] Skipping email from ${emailDate.toISOString()} (before ${sentAfter.toISOString()})`);
            res(); return;
          }

          const text = (parsed.subject || '') + '\n' + (parsed.text || parsed.html || '');
          const otp = extractOtp(String(text));
          if (otp) {
            console.log(`   [DEBUG] ✅ Found OTP: ${otp} in email from ${emailDate.toISOString()}`);
            candidates.push({ date: emailDate, otp });
          } else {
            console.log('   [DEBUG] No OTP pattern found in this email');
          }
          res();
        });
      });
      parsePromises.push(p);  // ← TRACK the promise
    });
  });

  f.once('end', async () => {   // ← make async
    await Promise.all(parsePromises);  // ← WAIT for all parsers
    console.log(`   [DEBUG] Fetch end, processed ${messageCount} messages, found ${candidates.length} OTPs`);
    imap.end();
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.date.getTime() - a.date.getTime());
      resolve(candidates[0].otp);
    } else {
      resolve(null);
    }
  });

  f.once('error', (fetchErr: Error) => {
    console.error('   [DEBUG] Fetch error:', fetchErr.message);
    imap.end();
    resolve(null);
  });
}
