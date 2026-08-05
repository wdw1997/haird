import { sendEmail } from './resend-client'

// channel: 'sms' 或 'voice'
export function getEffectiveLimit(stylist, channel) {
  const baseLimit = channel === 'sms' ? stylist.sms_limit : stylist.voice_limit
  const bonus = channel === 'sms' ? (stylist.bonus_sms || 0) : (stylist.bonus_voice || 0)
  return (baseLimit || 0) + bonus
}

export function isQuotaExceeded(stylist, channel) {
  const used = channel === 'sms' ? stylist.sms_used : stylist.voice_used
  return (used || 0) >= getEffectiveLimit(stylist, channel)
}

// 在"用量+1"之后调用,判断是否新跨过80%/100%门槛,跨过就发一次邮件并记录标记
// (避免同一周期内每条短信都重复发预警邮件)
export async function checkAndNotifyQuota(supabaseAdmin, stylist, channel, newUsedCount) {
  const label = channel === 'sms' ? '短信自动回复' : '语音配方识别'
  const effectiveLimit = getEffectiveLimit(stylist, channel)
  if (effectiveLimit <= 0) return

  const percent = (newUsedCount / effectiveLimit) * 100
  const flag80 = channel === 'sms' ? 'sms_80_notified' : 'voice_80_notified'
  const flag100 = channel === 'sms' ? 'sms_100_notified' : 'voice_100_notified'

  const updates = {}

  if (percent >= 100 && !stylist[flag100]) {
    updates[flag100] = true
    await sendEmail({
      to: stylist.email || stylist.contact_email,
      subject: `⚠️ 您的${label}额度已用完`,
      html: `<p>您好 ${stylist.name || ''},</p>
        <p>您本月的<strong>${label}</strong>额度已经用完,AI 助理已暂停自动回复这部分功能。</p>
        <p>请登录后台购买 $9.90 加油包,或升级套餐以恢复服务:</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL}">前往后台</a></p>`,
    })
  } else if (percent >= 80 && !stylist[flag80]) {
    updates[flag80] = true
    await sendEmail({
      to: stylist.email || stylist.contact_email,
      subject: `您的${label}额度已使用80%`,
      html: `<p>您好 ${stylist.name || ''},</p>
        <p>您本月的<strong>${label}</strong>额度已使用超过80%,建议提前购买加油包或升级套餐,避免服务中断。</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL}">前往后台</a></p>`,
    })
  }

  if (Object.keys(updates).length > 0) {
    await supabaseAdmin.from('stylists').update(updates).eq('id', stylist.id)
  }
}
