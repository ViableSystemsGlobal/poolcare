const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

/**
 * Opens a receipt's printable page in a new tab. The API needs the bearer token,
 * so the tab can't load the URL itself: open it synchronously (keeps the click's
 * popup permission), then fetch the HTML and point the tab at a blob of it.
 */
export async function openReceipt(receiptId: string, win: Window | null = window.open("", "_blank")) {
  try {
    const res = await fetch(`${API_URL}/receipts/${receiptId}/html`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
    });
    if (!res.ok) throw new Error(`Receipt request failed (${res.status})`);
    const blob = new Blob([await res.text()], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    if (win) win.location.href = url;
    else window.location.href = url;
  } catch (error) {
    win?.close();
    throw error;
  }
}
