/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/logger";

export const POST = withApiLogging(async () => {
  try {
    // Step 1: Get Token
    const formData = new URLSearchParams({
      username: "",
      password: "",
    });

    const tokenResponse = await fetch("https://10.10.20.110:9095/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    if (!tokenResponse.ok) {
      return NextResponse.json(
        { error: "Unable to get Token from Server" },
        { status: tokenResponse.status }
      );
    }

    const tokenData = await tokenResponse.json();
    const token = tokenData?.access_token; // adjust based on actual response

    if (!token) {
      return NextResponse.json(
        { error: "Token not found in response" },
        { status: 500 }
      );
    }

    // Step 2: Call Send SMS with Token
    const smsResponse = await fetch("https://10.10.20.110:9095/sendsms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        phoneNo: "",
        textMessage: "",
        username:""
      }),
    });

    if (!smsResponse.ok) {
      return NextResponse.json(
        { error: "Failed to send SMS" },
        { status: smsResponse.status }
      );
    }

    const smsResult = await smsResponse.json();

    return NextResponse.json({
      success: true,
      smsResult,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}, "verify:GetTokenAndSendSms");
