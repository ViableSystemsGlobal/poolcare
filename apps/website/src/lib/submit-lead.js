// Posts a website lead to the CRM public intake endpoint (apps/api crm module).
// Used by the Quote, Assessment (Booking) and Contact forms. Sends multipart so
// the quote form can attach pool photos.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export async function submitLead(fields, photos) {
  const fd = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") fd.append(key, value);
  });
  (photos || []).forEach((file) => fd.append("photos", file));

  const res = await fetch(`${API_BASE}/public/leads`, { method: "POST", body: fd });
  if (!res.ok) {
    let message = "Something went wrong. Please try again, or call us.";
    try {
      const data = await res.json();
      if (data && data.message) {
        message = Array.isArray(data.message) ? data.message.join(", ") : data.message;
      }
    } catch (_) {
      // non-JSON error response — keep the generic message
    }
    throw new Error(message);
  }
  return res.json();
}
