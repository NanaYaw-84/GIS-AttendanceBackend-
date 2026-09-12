import { withApiLogging } from "@/lib/logger";
import { NextResponse } from "next/server";

export const GET = withApiLogging(async (request: Request) => {
  try {    
    return NextResponse.json({
      success: true,
      // Geofence radius in metres. Widened to 100 km for field testing so
      // clock-in/out works away from a registered branch — tighten this
      // back down (e.g. 10000) before real deployment.
      allowedDistance: 100000,
    });
  } catch (error) {
    console.error("Error fetching user location:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch allowed distance" },
      // { status: 500 }
    );
  }
}, "user/location:GET")