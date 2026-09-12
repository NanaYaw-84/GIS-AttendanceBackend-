import { NextRequest, NextResponse } from "next/server";
import { transporter } from "@/lib/mailer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { to, subject, message } = body;

    if (!to || !message) {
      return NextResponse.json(
        { error: "Missing required fields: to, message" },
        { status: 400 }
      );
    }

    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to,
      subject: subject || "Message from SendMessage",
      text: message,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Email send error:", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}



