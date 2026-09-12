import axios from "axios";

export interface SmsResponse {
  success: boolean;
  message: string;
  providerResponse?: any;
}

const WIREPICK_SMS_URL = "https://api.wirepick.com/httpsms/send";

/**
 * Send SMS via Wirepick HTTPSMS
 * @param to
 * @param message
 */
export async function sendText(
  to: string,
  message: string
): Promise<SmsResponse> {
  try {
    if (!to || !message) {
      throw new Error("Phone number and message are required");
    }

    const phone = normalizePhoneNumber(to);

    const response = await axios.get(WIREPICK_SMS_URL, {
      params: {
        client: process.env.WIREPICK_CLIENT,
        password: process.env.WIREPICK_PASSWORD,
        phone,
        text: message,
        from: process.env.WIREPICK_SENDER_ID,
      },
      timeout: 15000,
    });

    /**
     * Wirepick usually returns plain text like:
     * OK: Message Sent
     * or an error string
     */
    const providerText =
      typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);

    const isSuccess =
      response.status === 200 &&
      providerText.toLowerCase().includes("ok");

    return {
      success: isSuccess,
      message: isSuccess ? "SMS sent successfully" : "SMS sending failed",
      providerResponse: providerText,
    };
  } catch (error: any) {
    console.error(
      "Wirepick SMS Error:",
      error?.response?.data || error.message
    );

    return {
      success: false,
      message: "Failed to send SMS",
      providerResponse: error?.response?.data,
    };
  }
}

/**
 * Normalize phone number (Ghana)
 */
function normalizePhoneNumber(phone: string): string {
  let normalized = phone.replace(/\s+/g, "");

  if (normalized.startsWith("+")) {
    normalized = normalized.substring(1);
  }

  if (normalized.startsWith("0")) {
    normalized = "233" + normalized.substring(1);
  }

  return normalized;
}
