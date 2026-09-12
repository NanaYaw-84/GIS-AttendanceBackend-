import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/logger";

export const GET = withApiLogging(async () => {
  try {
    return NextResponse.json({
      success: true,
      data:  [
        {
            "id": 20,
            "name": "HEAD OFFICE",
            "lat": 5.554944,
            "lng": -0.201333
        },
        {
            "id": 23,
            "name": " ADB HOUSE",
            "lat": 6.6884,
            "lng": -1.6244
        },
        {
            "id": 24,
            "name": "GULF HOUSE",
            "lat": 4.8969,
            "lng": -1.7583
        }
    ],
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch branches" },
      { status: 500 }
    );
  }
}, "branches/locations:GET");
