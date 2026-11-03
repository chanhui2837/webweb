import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http.js';

let transporter = null;
function getTransporter() {
  if (!env.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export const emailEnabled = () => Boolean(env.smtp.host && env.smtp.from);
export const smsEnabled = () => Boolean(env.twilio.accountSid && env.twilio.authToken && env.twilio.from);

export function channelAvailable(channel) {
  if (channel === 'email') return emailEnabled() || env.devLogCodes;
  if (channel === 'phone') return smsEnabled() || env.devLogCodes;
  return false;
}

function toE164Kr(phone) {
  // 01012345678 → +821012345678
  return phone.startsWith('0') ? `+82${phone.slice(1)}` : `+${phone}`;
}

/** 인증번호 발송. 실제 발송 서비스가 없으면(개발 환경 한정) 서버 콘솔에 출력. */
export async function sendVerificationCode(channel, target, code, purposeLabel) {
  const text = `[웹웹] ${purposeLabel} 인증번호는 ${code} 입니다. 10분 안에 입력해 주세요. 본인이 요청하지 않았다면 무시하세요.`;

  if (channel === 'email' && emailEnabled()) {
    await getTransporter().sendMail({
      from: env.smtp.from,
      to: target,
      subject: `[웹웹] ${purposeLabel} 인증번호`,
      text,
      html: `<div style="font-family:sans-serif;padding:24px"><h2 style="margin:0 0 12px">웹웹 ${purposeLabel}</h2><p>아래 인증번호를 10분 안에 입력해 주세요.</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p style="color:#888">본인이 요청하지 않았다면 이 메일을 무시하세요.</p></div>`,
    });
    return 'sent';
  }

  if (channel === 'phone' && smsEnabled()) {
    const auth = Buffer.from(`${env.twilio.accountSid}:${env.twilio.authToken}`).toString('base64');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.twilio.accountSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: toE164Kr(target), From: env.twilio.from, Body: text }),
    });
    if (!res.ok) {
      console.error('[sms] 발송 실패', res.status, await res.text().catch(() => ''));
      throw new HttpError(502, '문자 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
    return 'sent';
  }

  if (env.devLogCodes) {
    console.log(`\n[DEV 인증번호] ${channel}=${target} purpose=${purposeLabel} code=${code}\n`);
    return 'dev-logged';
  }
  throw new HttpError(503, channel === 'email'
    ? '이메일 발송 서비스가 설정되지 않아 이메일 인증을 사용할 수 없습니다. 관리자에게 문의해 주세요.'
    : '문자 발송 서비스가 설정되지 않아 휴대폰 인증을 사용할 수 없습니다. 이메일 인증을 이용해 주세요.');
}
