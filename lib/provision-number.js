import twilio from 'twilio'
import { getSupabaseAdmin } from './supabase-admin'

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

// Buys a real, SMS-capable number from Twilio and drops it into the pool as
// `available`. This is an ADMIN action — run ahead of time (e.g. from the
// admin dashboard, a handful at once), never triggered automatically by a
// customer paying. Toll-free numbers need carrier verification before they
// reliably send/receive SMS, which can take days, so numbers must be bought
// and verified in a batch well before anyone is waiting on one.
export async function buyNumberIntoPool({ tollFree = true } = {}) {
  const supabaseAdmin = getSupabaseAdmin()
  try {
    const searchParams = { smsEnabled: true, voiceEnabled: false, limit: 5 }
    const available = tollFree
      ? await client.availablePhoneNumbers('US').tollFree.list(searchParams)
      : await client.availablePhoneNumbers('US').local.list(searchParams)

    if (available.length === 0) {
      console.error('No available Twilio numbers found to purchase')
      return null
    }

    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: available[0].phoneNumber,
      smsUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/sms`,
      smsMethod: 'POST',
    })

    const { error } = await supabaseAdmin
      .from('phone_number_pool')
      .insert({ phone_number: purchased.phoneNumber, status: 'available' })

    if (error) {
      // The Twilio purchase succeeded even though the DB insert failed —
      // don't lose track of a number you're now paying monthly rent on.
      console.error('Bought a number but failed to save it to the pool — add it manually:', purchased.phoneNumber, error)
      return null
    }

    return purchased.phoneNumber
  } catch (err) {
    console.error('Failed to buy a number:', err)
    return null
  }
}

// Called the moment a customer's payment succeeds. Pulls one already-
// verified number out of the pool instead of buying a fresh one — a
// brand-new toll-free number can't be handed straight to a paying customer
// because it hasn't cleared carrier verification yet.
// Returns the claimed number, or null if the pool is empty.
export async function allocateNumberFromPool(stylistId) {
  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin.rpc('claim_pool_number', { p_stylist_id: stylistId })
  if (error) {
    console.error('Failed to claim a number from the pool:', error)
    return null
  }
  return data || null
}

// Called when a stylist cancels or downgrades — frees their number back up
// for the next paying customer instead of leaving it idle (and still
// costing you monthly rent for nobody).
export async function releaseNumberToPool(phoneNumber) {
  if (!phoneNumber) return
  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin.rpc('release_pool_number', { p_phone_number: phoneNumber })
  if (error) console.error('Failed to release number back to pool:', error)
}
